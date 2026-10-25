import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// 生产模式无 JSON 豁免：本用例必须连接真实 MySQL（未配置时明确 skip）。
const mysqlConfigured = Boolean(
  process.env.MYSQL_URL || (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE),
)
const SKIP_REASON = '未配置 MySQL 环境（MYSQL_URL / MYSQL_HOST+USER+DATABASE），生产演示数据边界未实测'

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function waitUp(baseUrl) {
  const deadline = Date.now() + 12000
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return true
    } catch {}
    await sleep(100)
  }
  return false
}

test('production users cannot read fixed demo evaluation/path/workflow payloads', { skip: mysqlConfigured ? false : SKIP_REASON }, async () => {
  const suffix = `${process.pid}-${Date.now()}`
  const dataFile = path.join(os.tmpdir(), `edumind-demo-boundary-${suffix}.json`)
  const identityFile = path.join(os.tmpdir(), `edumind-demo-boundary-${suffix}.identities.json`)
  const port = 27000 + (process.pid % 1000)
  const baseUrl = `http://127.0.0.1:${port}`
  const env = {
    ...process.env,
    ZHIXUE_ENV: 'production',
    // 生产模式无 JSON 豁免：继承 MYSQL_*，使用真实 MySQL fixture；
    // 生产缺少 MySQL 的拒绝行为由生产安全测试覆盖。
    PORT: String(port),
    ZHIXUE_DATA_FILE: dataFile,
    ZHIXUE_CHAT_STORE_FILE: dataFile,
    ZHIXUE_TRACE_FILE: `${dataFile}.traces.json`,
    ZHIXUE_SESSION_FILE: `${dataFile}.sessions.json`,
    ZHIXUE_IDENTITY_FILE: identityFile,
  }
  const { createIdentity } = await import('./identity.js')
  const account = `production-demo-boundary-${suffix}`
  // 测试进程与服务器共用同一 MySQL 身份表（账号按运行唯一，避免共库重跑冲突）
  await createIdentity({ account, password: 'strong-boundary-password-123', role: 'student', displayName: 'Boundary User' })
  const child = spawn(process.execPath, ['server/index.js'], { cwd: projectRoot, env, stdio: 'ignore' })
  try {
    assert.ok(await waitUp(baseUrl))
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, password: 'strong-boundary-password-123', role: 'student' }),
    })
    assert.equal(login.status, 200)
    const { token } = await login.json()
    for (const endpoint of ['/api/evaluation', '/api/learning-path', '/api/agent/workflow']) {
      const response = await fetch(`${baseUrl}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } })
      assert.equal(response.status, 503, endpoint)
      assert.equal((await response.json()).code, 'demo-data-disabled', endpoint)
    }
  } finally {
    child.kill()
    await Promise.race([new Promise(resolve => child.on('exit', resolve)), sleep(1000)])
    for (const file of [dataFile, identityFile, `${dataFile}.traces.json`, `${dataFile}.sessions.json`]) {
      try { fs.rmSync(file, { force: true }) } catch {}
    }
  }
})

after(async () => {
  try {
    const { closeMySqlPool } = await import('./store/mysql.js')
    await closeMySqlPool()
  } catch {
    /* ignore */
  }
})
