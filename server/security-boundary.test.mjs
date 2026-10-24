import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildCsrfCookie, buildSessionCookie } from './auth.js'
import { withTestServer } from './test-server.mjs'

test('注册接口创建正式学生账号，重复账号和管理员角色请求被拒绝', async () => {
  await withTestServer(async ({ post, get }) => {
    const body = {
      account: `student-${process.pid}-${Date.now()}`,
      password: 'strong-password-123',
      displayName: '新学习者',
      role: 'admin',
    }
    const created = await post('/api/auth/register', body)
    assert.equal(created.status, 201)
    assert.deepEqual((await created.json()).role, 'student')

    const duplicate = await post('/api/auth/register', body)
    assert.equal(duplicate.status, 409)

    const login = await post('/api/auth/login', { account: body.account, password: body.password, role: 'admin' })
    assert.equal(login.status, 200)
    const loginPayload = await login.json()
    assert.equal(loginPayload.role, 'student')
    const session = await get('/api/auth/session', { headers: { Authorization: `Bearer ${loginPayload.token}` } })
    assert.equal(session.status, 200)
  })
})

test('生产模式强制要求共享 MySQL，未配置时健康检查明确失败', async () => {
  const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
  const dataFile = path.join(os.tmpdir(), `edumind-security-prod-${process.pid}-${Date.now()}.json`)
  const port = 27000 + (process.pid % 1000)
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ZHIXUE_ENV: 'production',
      ZHIXUE_ALLOW_JSON_PRODUCTION: '0',
      MYSQL_URL: '', MYSQL_HOST: '', MYSQL_PORT: '', MYSQL_USER: '', MYSQL_PASSWORD: '', MYSQL_DATABASE: '',
      PORT: String(port),
      ZHIXUE_DATA_FILE: dataFile,
      ZHIXUE_IDENTITY_FILE: `${dataFile}.identities.json`,
      ZHIXUE_SESSION_FILE: `${dataFile}.sessions.json`,
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  try {
    let response
    const deadline = Date.now() + 8000
    while (Date.now() < deadline) {
      try {
        response = await fetch(`http://127.0.0.1:${port}/api/health`)
        break
      } catch {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    assert.ok(response, '生产服务应能返回配置状态')
    assert.equal(response.status, 503)
    assert.equal((await response.json()).code, 'production-storage-not-configured')
  } finally {
    child.kill()
    for (const file of [dataFile, `${dataFile}.identities.json`, `${dataFile}.sessions.json`]) {
      try { fs.rmSync(file, { force: true }) } catch { /* ignore */ }
    }
  }
})

test('生产模式会话和 CSRF Cookie 强制带 Secure', () => {
  const previous = process.env.ZHIXUE_ENV
  process.env.ZHIXUE_ENV = 'production'
  try {
    assert.match(buildSessionCookie('token', 60_000), /; Secure/)
    assert.match(buildCsrfCookie('csrf'), /; Secure/)
  } finally {
    if (previous === undefined) delete process.env.ZHIXUE_ENV
    else process.env.ZHIXUE_ENV = previous
  }
})
