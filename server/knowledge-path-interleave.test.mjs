import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * P4-2B-2b 双进程交错门禁（MySQL 真实库）。
 *
 * 复审要求：必须覆盖「prepare 之后、commit 之前版本被并发改变」的精确
 * 交错时序——单进程内的顺序模拟抓不到该场景。本测试以真实子进程
 * （独立 Node 进程、独立 MySQL 连接、真实行锁与事务）复现：
 *
 *   1. A 进程基于 v5 准备候选对象（v6）
 *   2. B 进程抢先提交（v5→v6，修改 topic-beta）
 *   3. A 进程拿旧候选 + 「提交前最新读」(v6) 提交 → 必须被拒
 *      （修复前：CAS 放行，B 的更新被静默覆盖）
 *   4. A 进程重新基于 v6 准备 → 提交成功（v6→v7）
 *   5. 双方更新都保留
 */

// 0.1 测试隔离（P4-2B-3b）：测试进程直接 import repository 时，data.js
// 的 storePath 在模块加载时读 ZHIXUE_CHAT_STORE_FILE——必须在 import
// 之前设置，否则 JSON 分支写到默认 server/store.json（实测复现）。
const ISOLATED_CHAT_STORE = path.join(os.tmpdir(), `edumind-b3b-iso-${process.pid}.json`)
process.env.ZHIXUE_CHAT_STORE_FILE = ISOLATED_CHAT_STORE

const repository = await import('../server/study/repository.js')
const { isMySqlConfigured } = await import('../server/store/mysql.js')

const mysqlConfigured = isMySqlConfigured()
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const worker = path.join(root, 'scripts', 'knowledge-path-interleave-worker.mjs')

function tmpFile(name) {
  return path.join(os.tmpdir(), `edumind-interleave-${process.pid}-${Date.now()}-${name}.json`)
}

function runWorker(mode, { account, input, out, topic, mastery }) {
  return new Promise((resolve, reject) => {
    const childArgs = [worker, mode, '--account', account]
    if (input) childArgs.push('--input', input)
    if (out) childArgs.push('--out', out)
    if (topic) childArgs.push('--topic', topic)
    if (mastery !== undefined) childArgs.push('--mastery', String(mastery))
    const child = spawn(process.execPath, childArgs, {
      cwd: root,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env },
    })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.on('error', reject)
    child.on('exit', code => {
      if (code !== 0) {
        reject(new Error(`worker ${mode} exit ${code}: ${stderr.slice(0, 400)}`))
        return
      }
      resolve(out ? JSON.parse(fs.readFileSync(out, 'utf8')) : null)
    })
  })
}

test('双进程交错：prepare 后版本被改 → 旧对象被拒、双方更新都保留', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，双进程交错门禁未实测' }, async () => {
  const account = `interleave-${Date.now()}`
  const files = []
  const track = (name) => { const f = tmpFile(name); files.push(f); return f }

  try {
    // 初始路径 v5
    await repository.saveKnowledgePathResult(account, {
      version: 5,
      basedOn: 4,
      phases: [{
        id: 'phase-1',
        title: '阶段一',
        topics: [
          { id: 'topic-alpha', title: '知识点甲', mastery: 0.4 },
          { id: 'topic-beta', title: '知识点乙', mastery: 0.6 },
        ],
      }],
      updatedAt: new Date().toISOString(),
    })

    // 1. A 进程基于 v5 准备（候选 v6，将作用于 alpha）
    const aPrepareOut = track('a-prepare')
    const preparedA = await runWorker('prepare', { account, out: aPrepareOut })
    assert.equal(preparedA.basedOn, 5, 'A 的准备必须基于 v5')
    assert.equal(preparedA.nextPath.version, 6)

    // 2. B 进程抢先提交（v5→v6，beta 0.6→0.75）
    const bOut = track('b-commit')
    const bResult = await runWorker('commit-bump', { account, topic: 'topic-beta', mastery: 0.75, out: bOut })
    assert.equal(bResult.ok, true, `B 的提交应成功: ${JSON.stringify(bResult)}`)

    // 3. A 进程复现旧调用层行为：旧候选对象 + 提交前最新读（v6）→ 必须被拒
    const staleOut = track('a-stale')
    const staleResult = await runWorker('commit-stale', { account, input: aPrepareOut, out: staleOut })
    assert.equal(staleResult.ok, false, '旧对象以新 expectedVersion 提交必须被拒（修复前会覆盖 B 的更新）')
    assert.equal(staleResult.code, 'version-mismatch', `应命中版本错配校验，实际=${staleResult.code}`)

    // 4. A 进程重新基于最新（v6）准备并正确提交
    const aReprepareOut = track('a-reprepare')
    const preparedA2 = await runWorker('prepare', { account, out: aReprepareOut })
    assert.equal(preparedA2.basedOn, 6, '重新准备必须基于最新 v6')
    const aCommitOut = track('a-commit')
    const aResult = await runWorker('commit-correct', { account, input: aReprepareOut, out: aCommitOut })
    assert.equal(aResult.ok, true, `A 基于最新重算的提交应成功: ${JSON.stringify(aResult)}`)

    // 5. 双方更新都保留（v7），B 的 beta 不被覆盖
    const final = await repository.getLatestKnowledgePath(account)
    assert.equal(final.version, 7)
    assert.equal(final.phases[0].topics.find(t => t.id === 'topic-beta').mastery, 0.75, 'B 的更新不得被覆盖丢失')
  } finally {
    for (const file of files) {
      try { fs.rmSync(file, { force: true }) } catch { /* ignore */ }
    }
  }
})

after(async () => {
  try {
    fs.rmSync(ISOLATED_CHAT_STORE, { force: true })
  } catch {
    /* ignore */
  }
  try {
    const { closeMySqlPool } = await import('../server/store/mysql.js')
    await closeMySqlPool()
  } catch {
    /* ignore */
  }
})
