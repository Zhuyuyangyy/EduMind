import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * P4-1A 生产身份边界。
 *
 * 门禁：
 * 1. production 模式：内置演示账号/默认密码一律拒绝登录（统一 401，
 *    不区分账号存在与否）
 * 2. production 模式：正式身份可登录，role 以服务端记录为准
 * 3. demo 模式：演示账号仍可登录（竞赛回归不受影响）
 * 4. 客户端提交的 role 不是授权依据（真实角色来自服务端账号记录）
 *
 * 生产模式没有 JSON 存储豁免：production 用例必须连接真实 MySQL
 * （未配置时明确 skip），demo 回归用例保持 JSON 隔离。
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const mysqlConfigured = Boolean(
  process.env.MYSQL_URL || (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE),
)
const SKIP_REASON = '未配置 MySQL 环境（MYSQL_URL / MYSQL_HOST+USER+DATABASE），生产身份契约未实测'

const sleep = ms => new Promise(r => setTimeout(r, ms))

function startServer(port, dataFile, extraEnv = {}) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      // production 用例：继承 MYSQL_*（生产模式 fail-closed，无 JSON 豁免）；
      // demo 用例通过 extraEnv 显式剥离 MySQL 保持 JSON 隔离。
      ZHIXUE_DATA_FILE: dataFile,
      ZHIXUE_CHAT_STORE_FILE: dataFile,
      ZHIXUE_TRACE_FILE: `${dataFile}.traces.json`,
      ZHIXUE_SESSION_FILE: `${dataFile}.sessions.json`,
      ZHIXUE_IDENTITY_FILE: `${dataFile}.identities.json`,
      ...extraEnv,
    },
    stdio: 'ignore',
  })
  child.unref()
  return child
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return
  child.kill()
  await Promise.race([
    new Promise(resolve => child.on('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 2000)),
  ])
}

async function waitUp(baseUrl, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`)
      if (res.ok) return true
    } catch {}
    await sleep(120)
  }
  return false
}

async function attemptLogin(baseUrl, body) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  let payload = null
  try {
    payload = await res.json()
  } catch {
    payload = null
  }
  return { status: res.status, payload }
}

test('production 模式拒绝演示账号与默认密码', { skip: mysqlConfigured ? false : SKIP_REASON }, async () => {
  const dataFile = path.join(os.tmpdir(), `edumind-auth-prod-${process.pid}-${Date.now()}.json`)
  const port = 26000 + (process.pid % 20000)
  const baseUrl = `http://127.0.0.1:${port}`

  let api = startServer(port, dataFile, { ZHIXUE_ENV: 'production' })
  try {
    assert.ok(await waitUp(baseUrl), '服务应启动')

    // 内置演示账号 + 默认密码
    const demo = await attemptLogin(baseUrl, { account: 'reviewer', password: 'Zhixue2026!', role: 'student' })
    assert.equal(demo.status, 401, `production 必须拒绝演示账号，实际=${demo.status}`)
    assert.ok(!demo.payload?.token, '不得签发 token')

    // 另一组演示账号
    const demo2 = await attemptLogin(baseUrl, { account: 'student', password: 'student123', role: 'student' })
    assert.equal(demo2.status, 401, `production 必须拒绝第二组演示账号，实际=${demo2.status}`)

    // 统一错误响应：不因账号是否存在而区分
    const unknown = await attemptLogin(baseUrl, { account: 'no-such-user-xyz', password: 'whatever', role: 'student' })
    assert.equal(unknown.status, 401)
    assert.equal(
      demo.payload?.message, unknown.payload?.message,
      '存在与不存在的账号必须返回同一错误文案（防账号枚举）',
    )
  } finally {
    await stopServer(api)
    try { fs.rmSync(dataFile, { force: true }); fs.rmSync(`${dataFile}.traces.json`, { force: true }) } catch { /* ignore */ }
  }
})

test('production 模式提供正式身份存储后可登录，role 以服务端记录为准', { skip: mysqlConfigured ? false : SKIP_REASON }, async () => {
  const dataFile = path.join(os.tmpdir(), `edumind-auth-prod2-${process.pid}-${Date.now()}.json`)
  const account = `real-user-${process.pid}-${Date.now()}`
  const password = 'a-very-strong-production-password-991'
  const port = 26100 + (process.pid % 20000)
  const baseUrl = `http://127.0.0.1:${port}`

  let api = startServer(port, dataFile, { ZHIXUE_ENV: 'production' })
  try {
    assert.ok(await waitUp(baseUrl), '服务应启动')

    // 测试进程与服务器共用同一 MySQL 身份表（账号按运行唯一，避免共库重跑冲突）
    const { createIdentity, verifyIdentityPassword } = await import('../server/identity.js')
    const created = await createIdentity({
      account,
      password,
      role: 'student',
      displayName: '正式用户',
    })
    assert.ok(created.accountId, '应返回稳定 accountId')
    assert.ok(await verifyIdentityPassword(account, password), '密码校验应通过')
    assert.equal(await verifyIdentityPassword(account, 'wrong-password'), false, '错误密码应拒绝')

    // 正式账号可登录
    const ok = await attemptLogin(baseUrl, { account, password, role: 'student' })
    assert.equal(ok.status, 200, `正式账号应可登录，实际=${ok.status} ${JSON.stringify(ok.payload)}`)
    assert.ok(ok.payload?.token, '应签发 token')
    assert.equal(ok.payload?.account, account)

    // 客户端自称 admin 不能获得管理员角色
    const escalation = await attemptLogin(baseUrl, { account, password, role: 'admin' })
    assert.equal(escalation.status, 200)
    assert.equal(escalation.payload?.role, 'student', 'role 必须来自服务端账号记录，客户端自报无效')

    // 错误密码拒绝
    const bad = await attemptLogin(baseUrl, { account, password: 'nope', role: 'student' })
    assert.equal(bad.status, 401)
  } finally {
    await stopServer(api)
    for (const file of [dataFile, `${dataFile}.traces.json`]) {
      try { fs.rmSync(file, { force: true }) } catch { /* ignore */ }
    }
  }
})

test('demo 模式演示账号仍可登录（竞赛回归不受影响）', async () => {
  const dataFile = path.join(os.tmpdir(), `edumind-auth-demo-${process.pid}-${Date.now()}.json`)
  const port = 26200 + (process.pid % 20000)
  const baseUrl = `http://127.0.0.1:${port}`

  // demo 回归保持 JSON 隔离：显式剥离 MySQL，验证到的是 JSON 演示行为
  let api = startServer(port, dataFile, {
    ZHIXUE_ENV: 'demo',
    MYSQL_URL: '', MYSQL_HOST: '', MYSQL_PORT: '', MYSQL_USER: '', MYSQL_PASSWORD: '', MYSQL_DATABASE: '',
  })
  try {
    assert.ok(await waitUp(baseUrl), '服务应启动')
    const ok = await attemptLogin(baseUrl, { account: 'reviewer', password: 'Zhixue2026!', role: 'student' })
    assert.equal(ok.status, 200, `demo 模式演示账号应可登录，实际=${ok.status}`)
    assert.ok(ok.payload?.token)
  } finally {
    await stopServer(api)
    try { fs.rmSync(dataFile, { force: true }); fs.rmSync(`${dataFile}.traces.json`, { force: true }) } catch { /* ignore */ }
  }
})

after(async () => {
  try {
    const { closeMySqlPool } = await import('../server/store/mysql.js')
    await closeMySqlPool()
  } catch {
    /* ignore */
  }
})
