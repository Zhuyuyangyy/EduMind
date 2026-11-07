import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * P4-2B-3b 并发幂等门禁（先于修复编写）：
 *
 * 1. 两个独立进程、同账号、同幂等键精确并发：必须只写入一次，
 *    两个请求都成功且拿到一致结果。（旧实现 SELECT 查 + INSERT 之
 *    间存在窗口：双方都查无记录 → 都 INSERT → 后者撞唯一约束
 *    ER_DUP_ENTRY → 500，用户重试再产生第三份记录。）
 * 2. 同键不同内容：必须明确报冲突，不得静默返回首次结果——
 *    否则客户端无法区分「重试」与「键复用错误」。
 * 3. 前端契约：首次发送生成稳定消息 ID，重试复用（api.ts 单测）。
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// 0.1 测试隔离（P4-2B-3b）：测试进程直接 import repository 时，data.js
// 的 storePath 在模块加载时读 ZHIXUE_CHAT_STORE_FILE——必须在 import
// 之前设置，否则 JSON 分支写到默认 server/store.json（实测复现）。
const ISOLATED_CHAT_STORE = path.join(os.tmpdir(), `edumind-b3b-iso-${process.pid}.json`)
process.env.ZHIXUE_CHAT_STORE_FILE = ISOLATED_CHAT_STORE

const repository = await import('../server/study/repository.js')
const { isMySqlConfigured } = await import('../server/store/mysql.js')

const mysqlConfigured = isMySqlConfigured()
const worker = path.join(root, 'scripts', 'history-idempotency-worker.mjs')

function tmpFile(name) {
  return path.join(os.tmpdir(), `edumind-b3b-${process.pid}-${Date.now()}-${name}.json`)
}

function runWorker({ account, key, message, content, out }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      worker, '--account', account, '--key', key, '--out', out,
      ...(message ? ['--message', message] : []),
      ...(content ? ['--content', content] : []),
    ], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env } })
    let stderr = ''
    child.stderr.on('data', c => { stderr += String(c) })
    child.on('error', reject)
    child.on('exit', code => {
      if (code !== 0) {
        reject(new Error(`worker exit ${code}: ${stderr.slice(0, 300)}`))
        return
      }
      resolve(JSON.parse(fs.readFileSync(out, 'utf8')))
    })
  })
}

/* ============ 1. 两进程同键精确并发 ============ */

test('B-3b 并发：两进程同账号同幂等键 → 只写一次、双方一致成功', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，并发幂等门禁未实测' }, async () => {
  const account = `b3b-conc-${Date.now()}`
  const key = `conc-key-${Date.now()}`
  const outA = tmpFile('a')
  const outB = tmpFile('b')

  try {
    // 两个独立进程同时发起（Promise.all 精确并发）
    const [resultA, resultB] = await Promise.all([
      runWorker({ account, key, message: '并发问题', content: '并发回复', out: outA }),
      runWorker({ account, key, message: '并发问题', content: '并发回复', out: outB }),
    ])

    // 双方都必须成功（修复前：后者 ER_DUP_ENTRY → ok:false）
    assert.equal(resultA.ok, true, `进程 A 必须成功: ${JSON.stringify(resultA)}`)
    assert.equal(resultB.ok, true, `进程 B 必须成功: ${JSON.stringify(resultB)}`)

    // 恰好一个写入、一个识别为重复
    const duplicates = [resultA, resultB].filter(r => r.duplicate === true)
    assert.equal(duplicates.length, 1, `恰有一个请求应识别为重复，实际=${duplicates.length}`)

    // 双方结果一致（内容相同）
    assert.equal(resultA.reply?.content, '并发回复')
    assert.equal(resultB.reply?.content, '并发回复')

    // 库内只写入一次（2 条消息）
    const items = await repository.getChatHistory(account)
    assert.equal(items.length, 2, `同键并发只允许落库 2 条，实际=${items.length}`)
  } finally {
    for (const f of [outA, outB]) {
      try { fs.rmSync(f, { force: true }) } catch { /* ignore */ }
    }
  }
})

/* ============ 2. 同键不同内容 → 明确冲突 ============ */

test('B-3b 冲突：同幂等键不同内容 → 明确报冲突（不静默返回首次结果）', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，同键冲突门禁未实测' }, async () => {
  const account = `b3b-conflict-${Date.now()}`
  const key = `conflict-key-${Date.now()}`

  // 首次：正常写入
  const first = await repository.appendChatInteraction(account, {
    userMessage: '原始问题',
    reply: { content: '原始回复', resources: [], suggestions: [] },
    idempotencyKey: key,
  })
  assert.equal(first.duplicate, false)

  // 同键但内容不同：必须明确报冲突
  await assert.rejects(
    () => repository.appendChatInteraction(account, {
      userMessage: '不同的问题',
      reply: { content: '不同回复', resources: [], suggestions: [] },
      idempotencyKey: key,
    }),
    /幂等键|冲突|不一致/,
    '同键不同内容必须明确报冲突',
  )

  // 同键同内容：仍识别为重复（重试安全）
  const retry = await repository.appendChatInteraction(account, {
    userMessage: '原始问题',
    reply: { content: '不同回复', resources: [], suggestions: [] },
    idempotencyKey: key,
  })
  // 注意：userMessage 相同即视为同一请求的重试（reply 内容不参与判定——
  // 重试时模型可能重新生成不同回复，返回首次结果正是幂等语义）
  assert.equal(retry.duplicate, true, '同键同 userMessage 应识别为重试')

  const items = await repository.getChatHistory(account)
  assert.equal(items.length, 2, '冲突被拒后不得产生新记录')
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

/* ============ 3. HTTP 层：409 冲突映射 ============ */

test('B-3b HTTP：同键不同内容 → 409（statusCode 映射），同键同内容 → 幂等重试', async () => {
  const TEST_PORT = 18911
  const dataFile = path.join(os.tmpdir(), `edumind-b3b-http-${process.pid}.json`)
  const traceFile = path.join(os.tmpdir(), `edumind-b3b-http-trace-${process.pid}.json`)
  const api = spawn(process.execPath, [path.join(root, 'server', 'index.js')], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      ZHIXUE_DATA_FILE: dataFile,
      ZHIXUE_CHAT_STORE_FILE: dataFile,
      ZHIXUE_TRACE_FILE: traceFile,
      ZHIXUE_SESSION_FILE: path.join(os.tmpdir(), `edumind-b3b-http-sess-${process.pid}.json`),
      ZHIXUE_IDENTITY_FILE: path.join(os.tmpdir(), `edumind-b3b-http-id-${process.pid}.json`),
      MYSQL_URL: '', MYSQL_HOST: '', MYSQL_PORT: '', MYSQL_USER: '', MYSQL_PASSWORD: '', MYSQL_DATABASE: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const base = `http://127.0.0.1:${TEST_PORT}`
  try {
    for (let i = 0; i < 60; i += 1) {
      try { if ((await fetch(`${base}/api/health`)).ok) break } catch { /* wait */ }
      await new Promise(r => setTimeout(r, 250))
    }
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: 'reviewer', password: 'Zhixue2026!', role: 'student' }),
    })
    const cookies = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
    const csrf = decodeURIComponent(cookies.split('; ').map(p => p.split('=')).find(([n]) => n === 'edumind_csrf')?.[1] || '')
    const auth = { Cookie: cookies, 'X-CSRF-Token': csrf }
    const send = (message, key) => fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ message, idempotencyKey: key }),
    })

    const key = `http-key-${Date.now()}`
    const first = await send('HTTP 幂等问题', key)
    assert.equal(first.status, 200, '首次发送应成功')

    // 同键同内容：幂等重试
    const retry = await send('HTTP 幂等问题', key)
    assert.equal(retry.status, 200, '同键同内容重试应成功')
    assert.equal((await retry.json()).idempotent, true, '重试应标记幂等命中')

    // 同键不同内容：409 冲突
    const conflict = await send('不同内容', key)
    assert.equal(conflict.status, 409, `同键不同内容应返回 409，实际=${conflict.status}`)

    // 历史只落库一次
    const history = await (await fetch(`${base}/api/chat/history`, { headers: { Cookie: cookies } })).json()
    assert.equal(history.items.length, 2, '同键重试与冲突拒绝都不得产生新记录')
  } finally {
    api.kill()
    for (const f of [dataFile, traceFile]) {
      try { fs.rmSync(f, { force: true }) } catch { /* ignore */ }
    }
  }
})
