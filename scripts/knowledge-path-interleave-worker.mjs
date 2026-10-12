/**
 * P4-2B-2b 双进程交错测试的 worker（知识路径 CAS）。
 *
 * 父进程（knowledge-path-interleave.test.mjs）按精确时序 spawn 本脚本，
 * 每次操作都是独立进程、独立 MySQL 连接——用于复现并守住「prepare 与
 * commit 之间版本被并发修改」的交错场景：
 *
 * - prepare         读取当前版本，产出 basedOn=current / version=current+1
 *                   的候选对象（写 JSON 到 --out）
 * - commit-stale    复现旧调用层行为：拿旧候选对象 + 「提交前最新读到的
 *                   版本」作 expectedVersion 提交（必须被拒）
 * - commit-correct  正确行为：以候选对象自带的 basedOn 提交
 * - commit-bump     直接基于当前版本提交指定掌握度更新（构造并发写入方）
 *
 * 用法：node scripts/knowledge-path-interleave-worker.mjs <mode> --account <id>
 *         [--input <file>] [--out <file>] [--topic <id>] [--mastery <n>]
 */

import fs from 'node:fs'
import process from 'node:process'

const args = process.argv.slice(2)
const mode = args[0]
function argOf(name) {
  const index = args.indexOf(name)
  return index === -1 ? null : args[index + 1]
}

const account = argOf('--account')
const inputFile = argOf('--input')
const outFile = argOf('--out')
const topic = argOf('--topic')
const mastery = Number(argOf('--mastery'))

const repository = await import('../server/study/repository.js')

function writeOut(payload) {
  if (!outFile) return
  fs.writeFileSync(outFile, JSON.stringify(payload), 'utf8')
}

function seedLike(overrides = {}) {
  return {
    version: 1,
    basedOn: 0,
    phases: [
      {
        id: 'phase-1',
        title: '阶段一',
        topics: [
          { id: 'topic-alpha', title: '知识点甲', mastery: 0.4 },
          { id: 'topic-beta', title: '知识点乙', mastery: 0.6 },
        ],
      },
    ],
    ...overrides,
  }
}

async function main() {
  if (mode === 'prepare') {
    const current = await repository.getLatestKnowledgePath(account)
    const baseVersion = current ? Number(current.version) || 1 : 0
    const candidate = seedLike({
      version: baseVersion + 1,
      basedOn: baseVersion,
      phases: current?.phases || seedLike().phases,
      updatedAt: new Date().toISOString(),
    })
    writeOut({ basedOn: candidate.basedOn, nextPath: candidate })
    return
  }

  if (mode === 'commit-stale' || mode === 'commit-correct') {
    const payload = JSON.parse(fs.readFileSync(inputFile, 'utf8'))
    let expectedVersion
    if (mode === 'commit-stale') {
      // 旧调用层行为：expectedVersion 取提交前最新读到的版本
      const latest = await repository.getLatestKnowledgePath(account)
      expectedVersion = latest ? Number(latest.version) || 1 : 1
    } else {
      // 正确行为：expectedVersion 取候选对象基于的版本
      expectedVersion = payload.basedOn
    }
    const result = await repository.commitPathUpdateCAS(account, payload.nextPath, {
      expectedVersion,
      sessionId: `interleave-${mode}`,
    })
    writeOut(result)
    return
  }

  if (mode === 'commit-bump') {
    // 并发写入方：把指定 topic 的掌握度改为指定值（版本+1）
    const current = await repository.getLatestKnowledgePath(account)
    if (!current) {
      writeOut({ ok: false, code: 'no-path' })
      return
    }
    const nextPath = {
      ...current,
      version: (Number(current.version) || 1) + 1,
      basedOn: Number(current.version) || 1,
      phases: current.phases.map(p => ({
        ...p,
        topics: p.topics.map(t => (t.id === topic ? { ...t, mastery } : t)),
      })),
      updatedAt: new Date().toISOString(),
    }
    const result = await repository.commitPathUpdateCAS(account, nextPath, {
      expectedVersion: nextPath.basedOn,
      sessionId: `interleave-bump-${topic}-${mastery}`,
    })
    writeOut(result)
    return
  }

  throw new Error(`unknown mode: ${mode}`)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
