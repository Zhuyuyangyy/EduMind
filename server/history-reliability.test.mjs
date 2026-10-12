import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import process from 'node:process'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'

/**
 * P4-2B-3a 阶段 0 门禁（先于修复编写）：
 *
 * 0.1 测试隔离：JSON 专项在测试进程内也清除 MYSQL_*（否则 repository
 *     的 useMysql() 会让「JSON 测试」实际走 MySQL 分支）；显式隔离
 *     ZHIXUE_CHAT_STORE_FILE；默认 store.json 运行后不得被修改。
 * 0.2 可靠性：追踪写入失败不得把已成功的聊天事务变成业务 500；
 *     聊天幂等键重复请求不得产生重复记录。
 * 0.4 多模态体积上限按 UTF-8 字节计（中文/emoji 的字符串长度 ≠ 字节数）。
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 0.1 测试隔离：必须在 import repository（→ data.js）**之前**设置——
 * data.js 的 storePath 在模块加载时读取 ZHIXUE_CHAT_STORE_FILE，事后
 * 设置无效（JSON 写入会落到默认 server/store.json，实测复现）。
 * 默认（JSON 专项）清除 MYSQL_*；MySQL 专项在用例内临时恢复。
 */
const ISOLATED_CHAT_STORE = path.join(os.tmpdir(), `edumind-b3a-isolated-chat-${process.pid}.json`)
process.env.ZHIXUE_CHAT_STORE_FILE = ISOLATED_CHAT_STORE

const repository = await import('../server/study/repository.js')
const { isMySqlConfigured } = await import('../server/store/mysql.js')

const MYSQL_ENV_KEYS = ['MYSQL_URL', 'MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']
const MYSQL_ENV_SNAPSHOT = Object.fromEntries(MYSQL_ENV_KEYS.map(key => [key, process.env[key]]))
// skip 判定必须在清除环境之前求值（test() 的 skip 选项在注册时固化）
const mysqlConfigured = isMySqlConfigured()

/** JSON 专项：运行时清除 MYSQL_*（repository 的 useMysql() 每次调用读 env） */
function forceJsonMode() {
  for (const key of MYSQL_ENV_KEYS) delete process.env[key]
}
/** MySQL 专项：恢复调用方的真实 MYSQL_* */
function restoreMySqlMode() {
  for (const [key, value] of Object.entries(MYSQL_ENV_SNAPSHOT)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}
forceJsonMode()

/** 默认路径文件快照（0.1：运行后不得被修改） */
function snapshotDefaultStores() {
  const files = [
    path.join(root, 'server', 'store.json'),      // data.js 默认（ZHIXUE_CHAT_STORE_FILE）
    path.join(root, 'store.json'),                // store/mysql.js fallback 默认（ZHIXUE_DATA_FILE）
  ]
  const snapshot = {}
  for (const file of files) {
    snapshot[file] = fs.existsSync(file)
      ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
      : null
  }
  return snapshot
}

let defaultStoresBefore = null

after(() => {
  // 0.1：默认 store 文件不得被测试改动（JSON 测试隔离的验证）
  if (!defaultStoresBefore) return
  for (const [file, hash] of Object.entries(defaultStoresBefore)) {
    const now = fs.existsSync(file)
      ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
      : null
    assert.equal(now, hash, `测试不得修改默认存储文件 ${file}`)
  }
})

/* ============ HTTP 脚手架（支持故障注入） ============ */

const TEST_PORT = 18901

function tmpFile(name) {
  return path.join(os.tmpdir(), `edumind-b3a-${process.pid}-${Date.now()}-${name}.json`)
}

async function withApiServer(fn, { extraEnv = {}, mysql = false } = {}) {
  const env = {
    ...process.env,
    PORT: String(TEST_PORT),
    ZHIXUE_DATA_FILE: tmpFile('data'),
    ZHIXUE_CHAT_STORE_FILE: tmpFile('chat'),
    ZHIXUE_TRACE_FILE: tmpFile('trace'),
    ZHIXUE_SESSION_FILE: tmpFile('session'),
    ZHIXUE_IDENTITY_FILE: tmpFile('identity'),
    ...extraEnv,
  }
  if (!mysql) {
    for (const key of MYSQL_ENV_KEYS) env[key] = ''
  }
  const api = spawn(process.execPath, [path.join(root, 'server', 'index.js')], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  api.stderr.on('data', chunk => { stderr += chunk.toString() })
  const baseUrl = `http://127.0.0.1:${TEST_PORT}`
  try {
    await waitForServer(api)
    await fn({ baseUrl, stderr: () => stderr })
  } finally {
    if (api.exitCode === null) {
      api.kill()
      await once(api, 'exit')
    }
  }
}

async function waitForServer(api) {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/health`)
      if (res.ok) return
    } catch { /* not up yet */ }
    if (api.exitCode !== null) throw new Error(`server exited early: ${api.exitCode}`)
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error('server did not start')
}

async function login(baseUrl) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: 'reviewer', password: 'Zhixue2026!', role: 'student' }),
  })
  assert.equal(res.status, 200)
  const cookies = res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
  const csrf = cookies.split('; ')
    .map(pair => pair.split('='))
    .find(([name]) => name === 'edumind_csrf')?.[1] || ''
  return { cookie: cookies, csrf: decodeURIComponent(csrf) }
}

/* ============ 0.4 多模态 UTF-8 字节上限 ============ */

test('0.4 多模态上限按 UTF-8 字节计：中文字符串长度低于阈值但字节超限 → 拒绝', async () => {
  defaultStoresBefore = snapshotDefaultStores()
  forceJsonMode()
  const account = `b3a-bytes-${Date.now()}`
  try {
    // 512KB / 3 字节每汉字 ≈ 17.4 万汉字：字符串长度（17.4万）远小于
    // 524288，但 UTF-8 字节数（≈52.3万）超过上限——旧实现按 length
    // 计数会放行
    const chinese = '中'.repeat(175_000)
    const multimodal = [{ type: 'text', data: chinese }]
    await assert.rejects(
      () => repository.appendChatInteraction(account, {
        userMessage: '中文多模态',
        reply: { content: '回复', resources: [], suggestions: [] },
        multimodalContents: multimodal,
      }),
      /多模态|体积|上限/,
      'UTF-8 字节超限必须拒绝（按字符串长度计数会漏放）',
    )

    // emoji 边界：4 字节字符
    const emoji = '😀'.repeat(140_000) // 140000×4 = 560KB > 512KB
    await assert.rejects(
      () => repository.appendTutoringHistory(account, {
        question: 'emoji 问题', answer: '回复', mode: 'qa', scenario: 'preview',
        multimodalContents: [{ type: 'text', data: emoji }],
      }),
      /多模态|体积|上限/,
      'emoji（4 字节）超限同样必须拒绝',
    )

    // 边界内：正常中文内容放行
    await repository.appendChatInteraction(account, {
      userMessage: '你好世界',
      reply: { content: '回复', resources: [], suggestions: [] },
      multimodalContents: [{ type: 'text', data: '正'.repeat(1000) }],
    })
    assert.equal((await repository.getChatHistory(account)).length, 2, '边界内的中文多模态应正常写入')
  } finally {
    // 仅清理本用例数据（保留文件供后续用例；文件级清理在 after）
    const store = JSON.parse(fs.readFileSync(ISOLATED_CHAT_STORE, 'utf8'))
    delete store.chatHistory[account]
    fs.writeFileSync(ISOLATED_CHAT_STORE, JSON.stringify(store), 'utf8')
  }
})

/* ============ 0.1 JSON 高频连续写入唯一 ID ============ */

test('0.1 JSON 高频连续写入：同毫秒多次交互的消息 ID 不碰撞', async () => {
  defaultStoresBefore = snapshotDefaultStores()
  forceJsonMode()
  const account = `b3a-burst-${Date.now()}`
  try {
    // 50 次连续交互：JSON 模式同步写入，极可能全部停在同一毫秒，
    // 旧实现 id=Date.now()/+1 必然碰撞。data.js 写入时即按 30 条
    // 截断（keepLast），故验证窗口内唯一——同毫秒碰撞必落在窗口内。
    for (let i = 0; i < 50; i += 1) {
      await repository.appendChatInteraction(account, {
        userMessage: `问题 ${i}`,
        reply: { content: `回复 ${i}`, resources: [], suggestions: [] },
      })
    }
    const items = await repository.getChatHistory(account)
    assert.equal(items.length, 30, '聊天历史窗口为最近 30 条')
    const ids = items.map(i => i.id)
    assert.equal(new Set(ids).size, ids.length, `高频写入下窗口内 ID 必须唯一，实际重复 ${ids.length - new Set(ids).size} 个`)
  } finally {
    const store = JSON.parse(fs.readFileSync(ISOLATED_CHAT_STORE, 'utf8'))
    delete store.chatHistory[account]
    fs.writeFileSync(ISOLATED_CHAT_STORE, JSON.stringify(store), 'utf8')
  }
})

/* ============ 0.2 追踪失败不得让已成功的聊天变 500 ============ */

test('0.2 追踪写入失败（故障注入）：聊天仍返回 200 且历史已落库', async () => {
  defaultStoresBefore = snapshotDefaultStores()
  await withApiServer(async ({ baseUrl }) => {
    const { cookie, csrf } = await login(baseUrl)
    const auth = { Cookie: cookie, 'X-CSRF-Token': csrf }

    const send = (idempotencyKey) => fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ message: '追踪失败时的问题', idempotencyKey }),
    })

    const res = await send()
    assert.equal(res.status, 200, `追踪失败不得把已成功的聊天变成业务失败，实际=${res.status}`)

    const history = await (await fetch(`${baseUrl}/api/chat/history`, { headers: { Cookie: cookie } })).json()
    assert.equal(history.items.length, 2, '聊天记录必须已落库')
  }, { extraEnv: { ZHIXUE_FAULT_INJECT: 'trace-write' } })
})

/* ============ 0.2 聊天幂等键 ============ */

test('0.2 聊天幂等键：同一键重复请求不得产生重复记录（JSON 模式）', async () => {
  defaultStoresBefore = snapshotDefaultStores()
  await withApiServer(async ({ baseUrl }) => {
    const { cookie, csrf } = await login(baseUrl)
    const auth = { Cookie: cookie, 'X-CSRF-Token': csrf }

    const send = () => fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ message: '幂等键问题', idempotencyKey: 'stable-key-001' }),
    })

    const first = await send()
    assert.equal(first.status, 200)
    const firstBody = await first.json()

    const second = await send()
    assert.equal(second.status, 200, '同键重试应正常返回')
    const secondBody = await second.json()

    const history = await (await fetch(`${baseUrl}/api/chat/history`, { headers: { Cookie: cookie } })).json()
    assert.equal(history.items.length, 2, `同幂等键重试不得产生重复记录，实际=${history.items.length}`)
    assert.equal(secondBody.idempotent, true, '重试响应应标记幂等命中')
    assert.equal(secondBody.content, firstBody.content, '幂等重试应返回第一次的结果')
  })
})

/* ============ MySQL 专项：幂等键唯一约束 ============ */

test('0.2 MySQL：幂等键唯一约束——同键第二次写入被拒且不落库', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，幂等约束门禁未实测' }, async () => {
  restoreMySqlMode()
  try {
  const account = `b3a-idem-${Date.now()}`
  const first = await repository.appendChatInteraction(account, {
    userMessage: '第一次',
    reply: { content: '回复一', resources: [], suggestions: [] },
    idempotencyKey: 'idem-key-mysql-1',
  })
  assert.equal(first.duplicate, false)

  const second = await repository.appendChatInteraction(account, {
    userMessage: '第二次（同键）',
    reply: { content: '回复二', resources: [], suggestions: [] },
    idempotencyKey: 'idem-key-mysql-1',
  })
  assert.equal(second.duplicate, true, '同键第二次必须识别为重复')
  assert.equal(second.reply.content, '回复一', '重复请求应返回第一次的结果')

  // 不同键正常写入
  const third = await repository.appendChatInteraction(account, {
    userMessage: '第三次',
    reply: { content: '回复三', resources: [], suggestions: [] },
    idempotencyKey: 'idem-key-mysql-2',
  })
  assert.equal(third.duplicate, false)

  const items = await repository.getChatHistory(account)
  assert.equal(items.length, 4, '两次交互应共 4 条消息（重复请求未落库）')
  } finally {
    forceJsonMode()
  }
})

test('0.2 MySQL：追踪失败时聊天 200 且历史落库', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，MySQL 追踪失败门禁未实测' }, async () => {
  await withApiServer(async ({ baseUrl }) => {
    const { cookie, csrf } = await login(baseUrl)
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf },
      body: JSON.stringify({ message: 'MySQL 追踪失败问题' }),
    })
    assert.equal(res.status, 200, 'MySQL 模式下追踪失败同样不得影响聊天业务')
    const history = await (await fetch(`${baseUrl}/api/chat/history`, { headers: { Cookie: cookie } })).json()
    assert.equal(history.items.length, 2)
  }, { mysql: true, extraEnv: { ZHIXUE_FAULT_INJECT: 'trace-write' } })
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
