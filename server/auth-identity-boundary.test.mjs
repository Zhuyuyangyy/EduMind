import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * P4-1B 认证边界补测（复核发现 · 先于修复编写，预期当前版本失败）。
 *
 * 门禁：
 * 1. 生产模式：正式身份被删除 → 名下旧会话立即失效（401）
 * 2. 生产模式：角色降级（admin→student，不递增凭据版本）→
 *    旧会话中的 role 实时变为 student（越权面关闭）
 * 3. 演示模式：无正式身份记录的演示账号不受生产规则影响
 *    （兼容竞赛回归）
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))

// 测试进程的身份文件隔离（默认路径会落到 server/identities.json）
const IDENTITY_FILE = path.join(os.tmpdir(), `edumind-boundary-identities-${process.pid}.json`)
process.env.ZHIXUE_IDENTITY_FILE = IDENTITY_FILE
process.env.ZHIXUE_SESSION_FILE = path.join(os.tmpdir(), `edumind-boundary-sessions-${process.pid}.json`)

// 边界逻辑与存储无关：JSON 身份存储（默认）与 MySQL identities 表
// 走同一契约，本文件在两种存储下都应成立。

function startServer(port, extraEnv = {}) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      MYSQL_URL: '', MYSQL_HOST: '', MYSQL_PORT: '', MYSQL_USER: '', MYSQL_PASSWORD: '', MYSQL_DATABASE: '',
      ZHIXUE_IDENTITY_FILE: IDENTITY_FILE,
      ZHIXUE_SESSION_FILE: process.env.ZHIXUE_SESSION_FILE,
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
  await sleep(200)
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

async function login(baseUrl, account, password) {
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

test('生产模式：正式身份被删除后旧会话立即失效', async () => {
  const port = 27400 + (process.pid % 20000)
  const base = `http://127.0.0.1:${port}`
  const account = `p41b-del-${Date.now()}`
  const password = 'delete-identity-password-123'

  // 测试进程同样剥离 MySQL（identity 操作走同一存储）
  for (const key of ['MYSQL_URL', 'MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']) {
    delete process.env[key]
  }
  const { createIdentity, deleteIdentity } = await import('../server/identity.js')
  await createIdentity({ account, password, role: 'student', displayName: '待删除账号' })

  let api = startServer(port, { ZHIXUE_ENV: 'production' })
  try {
    assert.ok(await waitUp(base), '服务应启动')
    const { token } = await login(base, account, password)
    assert.equal((await probeSession(base, token)).status, 200, '删除前会话应有效')

    // 管理员删除该正式身份
    await deleteIdentity(account)

    const afterDelete = await probeSession(base, token)
    assert.equal(afterDelete.status, 401, `身份删除后旧会话必须 401，实际=${afterDelete.status}`)
  } finally {
    await stopServer(api)
  }
})

test('生产模式：角色降级不递增凭据版本也立即生效', async () => {
  const port = 27500 + (process.pid % 20000)
  const base = `http://127.0.0.1:${port}`
  const account = `p41b-demote-${Date.now()}`
  const password = 'demote-role-password-123'

  for (const key of ['MYSQL_URL', 'MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']) {
    delete process.env[key]
  }
  const { createIdentity, setIdentityRole } = await import('../server/identity.js')
  await createIdentity({ account, password, role: 'admin', displayName: '待降级管理员' })

  let api = startServer(port, { ZHIXUE_ENV: 'production' })
  try {
    assert.ok(await waitUp(base), '服务应启动')
    const { token } = await login(base, account, password)
    const before = await probeSession(base, token)
    assert.equal(before.body?.role, 'admin', '登录时应为 admin')

    // 降级为 student（不 bumpCredentialVersion——这正是复核指出的场景）
    await setIdentityRole(account, 'student')

    const after = await probeSession(base, token)
    assert.equal(after.status, 200, '会话本身应仍有效（未被撤销）')
    assert.equal(after.body?.role, 'student', `降级后 role 必须实时变为 student，实际=${after.body?.role}`)
  } finally {
    await stopServer(api)
  }
})

test('演示模式：无正式身份的演示账号不受生产规则影响', async () => {
  const port = 27600 + (process.pid % 20000)
  const base = `http://127.0.0.1:${port}`

  for (const key of ['MYSQL_URL', 'MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']) {
    delete process.env[key]
  }
  let api = startServer(port, { ZHIXUE_ENV: 'demo' })
  try {
    assert.ok(await waitUp(base), '服务应启动')
    const { token } = await login(base, 'reviewer', 'Zhixue2026!')
    const probe = await probeSession(base, token)
    assert.equal(probe.status, 200, '演示账号（无正式身份记录）在 demo 模式应保持可用')
    assert.equal(probe.body?.role, 'student')
  } finally {
    await stopServer(api)
  }
})

after(async () => {
  try {
    const { closeMySqlPool } = await import('../server/store/mysql.js')
    await closeMySqlPool()
  } catch {
    /* ignore */
  }
  for (const file of [IDENTITY_FILE, process.env.ZHIXUE_SESSION_FILE]) {
    try { fs.rmSync(file, { force: true }) } catch { /* ignore */ }
  }
})
