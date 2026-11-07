import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

// 测试结束关闭测试进程内的 mysql2 连接池（正确清理）
after(async () => {
  try {
    const { closeMySqlPool } = await import('../server/store/mysql.js')
    await closeMySqlPool()
  } catch {
    /* ignore */
  }
})

/**
 * P4-1B MySQL 持久化会话验收（真实数据库）。
 *
 * 门禁：
 * 1. 进程 A 登录 → 停止 A → 启动 B：B 校验 A 签发且未过期的会话
 * 2. A、B 并行：共享认证状态（B 退出后 A 立即 401）
 * 3. 过期会话不可用
 * 4. 禁用账号的会话立即失效
 * 5. 数据库不可达：fail-closed（401，不放行、不崩溃）
 * 6. 进程被 SIGKILL 后重启：会话仍在（写前已落库）
 *
 * 无 MySQL 环境时全部 SKIP 并标注未实测。
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))

const mysqlConfigured = Boolean(
  process.env.MYSQL_URL || (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE),
)
const SKIP_REASON = '未配置 MySQL 环境（MYSQL_URL / MYSQL_HOST+USER+DATABASE），P4-1B 会话持久化未实测'

function startServer(port, extraEnv = {}) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      ZHIXUE_ENV: 'demo',
      ...extraEnv,
    },
    stdio: 'ignore',
  })
  child.unref()
  return child
}

async function stopServer(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null) return
  child.kill(signal)
  await Promise.race([
    new Promise(resolve => child.on('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 2500)),
  ])
  await sleep(300)
}

async function waitUp(baseUrl, timeout = 20000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`)
      if (res.ok) return true
    } catch {}
    await sleep(150)
  }
  return false
}

async function login(baseUrl, account = 'reviewer', password = 'Zhixue2026!') {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password, role: 'student' }),
  })
  assert.equal(res.status, 200, `登录失败: ${res.status}`)
  return res.json()
}

async function probeSession(baseUrl, token) {
  const res = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return { status: res.status, body: res.status === 200 ? await res.json() : null }
}

async function createTestIdentity(account, password) {
  // MySQL 模式下身份存储即 MySQL identities 表（与服务器同一存储）
  const { createIdentity } = await import('../server/identity.js')
  return createIdentity({ account, password, role: 'student', displayName: '持久化测试账号' })
}

test('P4-1B：A 登录 → 停止 A → B 启动后会话仍有效（重启恢复）', { skip: mysqlConfigured ? false : SKIP_REASON }, async () => {
  const port = 27000 + (process.pid % 20000)
  const base = `http://127.0.0.1:${port}`
  const account = `p41b-restart-${Date.now()}`
  await createTestIdentity(account, 'restart-recovery-password-123')

  let api = startServer(port, { ZHIXUE_ENV: 'demo' })
  try {
    assert.ok(await waitUp(base), 'A 应启动')
    const { token } = await login(base, account, 'restart-recovery-password-123')
    const before = await probeSession(base, token)
    assert.equal(before.status, 200, 'A 中会话应有效')

    // 停止 A（SIGKILL 模拟真实崩溃），启动 B（同库）
    await stopServer(api, 'SIGKILL')
    api = startServer(port, { ZHIXUE_ENV: 'demo' })
    assert.ok(await waitUp(base), 'B 应启动')

    const after = await probeSession(base, token)
    assert.equal(after.status, 200, 'B 必须接受 A 签发且未过期的会话（重启恢复）')
    assert.equal(after.body?.account, account)
  } finally {
    await stopServer(api)
  }
})

test('P4-1B：双进程共享认证状态，B 退出后 A 立即 401', { skip: mysqlConfigured ? false : SKIP_REASON }, async () => {
  const portA = 27100 + (process.pid % 20000)
  const portB = portA + 1
  const baseA = `http://127.0.0.1:${portA}`
  const baseB = `http://127.0.0.1:${portB}`
  const account = `p41b-dual-${Date.now()}`
  await createTestIdentity(account, 'dual-process-password-123')

  let apiA = startServer(portA, { ZHIXUE_ENV: 'demo' })
  let apiB = startServer(portB, { ZHIXUE_ENV: 'demo' })
  try {
    assert.ok(await waitUp(baseA) && await waitUp(baseB), '两个进程都应启动')

    // 在 A 登录
    const { token } = await login(baseA, account, 'dual-process-password-123')
    // B 能校验 A 的会话（共享状态）
    const fromB = await probeSession(baseB, token)
    assert.equal(fromB.status, 200, 'B 应接受 A 签发的会话')

    // 在 B 退出（撤销）
    const logoutRes = await fetch(`${baseB}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(logoutRes.status, 200)

    // A 立即 401（撤销跨进程生效）
    const fromAAfter = await probeSession(baseA, token)
    assert.equal(fromAAfter.status, 401, 'B 撤销后 A 必须立即 401')
  } finally {
    await stopServer(apiA)
    await stopServer(apiB)
  }
})

test('P4-1B：禁用账号后会话立即失效', { skip: mysqlConfigured ? false : SKIP_REASON }, async () => {
  const port = 27200 + (process.pid % 20000)
  const base = `http://127.0.0.1:${port}`
  const account = `p41b-disabled-${Date.now()}`
  await createTestIdentity(account, 'disabled-account-password-123')

  let api = startServer(port, { ZHIXUE_ENV: 'demo' })
  try {
    assert.ok(await waitUp(base), '服务应启动')
    const { token } = await login(base, account, 'disabled-account-password-123')
    assert.equal((await probeSession(base, token)).status, 200)

    // 禁用账号（管理员操作）
    const { setIdentityEnabled, bumpCredentialVersion } = await import('../server/identity.js')
    await setIdentityEnabled(account, false)

    const afterDisable = await probeSession(base, token)
    assert.equal(afterDisable.status, 401, '禁用账号后会话必须立即失效')

    // 重新启用 + 凭据版本 +1 → 旧会话仍不得复活
    await setIdentityEnabled(account, true)
    await bumpCredentialVersion(account)
    const afterBump = await probeSession(base, token)
    assert.equal(afterBump.status, 401, '凭据版本升级后旧会话不得复活')
  } finally {
    await stopServer(api)
  }
})

test('P4-1B：数据库不可达时 fail-closed（401，不放行不崩溃）', { skip: mysqlConfigured ? false : SKIP_REASON }, async () => {
  const port = 27300 + (process.pid % 20000)
  const base = `http://127.0.0.1:${port}`

  // 指向一个不存在的数据库端口
  let api = startServer(port, {
    MYSQL_HOST: '127.0.0.1',
    MYSQL_PORT: '3999',
    MYSQL_USER: process.env.MYSQL_USER || 'root',
    MYSQL_PASSWORD: process.env.MYSQL_PASSWORD || '',
    MYSQL_DATABASE: 'edumind_p4test',
  })
  try {
    assert.ok(await waitUp(base), '服务应启动（DB 故障不影响 HTTP 监听）')
    // 任意 token 都不得通过认证
    const probe = await probeSession(base, 'forged-token-from-attacker')
    assert.equal(probe.status, 401, 'DB 不可达时必须 401（fail-closed）')
    // 登录返回明确错误而非崩溃
    const loginRes = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: 'reviewer', password: 'Zhixue2026!', role: 'student' }),
    })
    assert.ok([401, 503].includes(loginRes.status), `登录应返回 401/503，实际=${loginRes.status}`)
  } finally {
    await stopServer(api)
  }
})
