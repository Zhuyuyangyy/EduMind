import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

/**
 * P0 认证改造测试（feat/mobile-v1）
 * 覆盖：登录签发会话、未登录 401、Bearer/Cookie 双通道、
 *       accountId 服务端推导（客户端伪造无效）、聊天历史按账号隔离、CORS 白名单、登出失效。
 */

const TEST_PORT = 8792
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`
// 与其他测试文件隔离数据文件，避免并行执行时争抢 store.json
const DATA_FILE = path.join(os.tmpdir(), `edumind-test-auth-${process.pid}.json`)

async function waitForServer(child) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`API server exited early with code ${child.exitCode}`)
    }
    try {
      const response = await fetch(`${BASE_URL}/api/health`)
      if (response.ok) return
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  throw new Error('Timed out waiting for API server')
}

async function withApiServer(fn) {
  const api = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      ZHIXUE_DATA_FILE: DATA_FILE,
      ZHIXUE_CHAT_STORE_FILE: DATA_FILE,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stderr = ''
  api.stderr.on('data', chunk => {
    stderr += chunk.toString()
  })

  try {
    await waitForServer(api)
    await fn()
  } finally {
    if (api.exitCode === null) {
      api.kill()
      await once(api, 'exit')
    }
    fs.rmSync(DATA_FILE, { force: true })
  }

  assert.equal(stderr, '')
}

async function login(account, password, role = 'student') {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password, role }),
  })
  assert.equal(response.status, 200, `login ${account} should succeed`)
  const setCookie = response.headers.get('set-cookie') || ''
  const cookie = setCookie.split(';')[0]
  const data = await response.json()
  return { cookie, token: data.token, account: data.account, role: data.role }
}

test('未登录访问业务接口返回 401', async () => {
  await withApiServer(async () => {
    for (const path of ['/api/chat/history', '/api/profile/latest', '/api/tutoring/topics', '/api/resources']) {
      const response = await fetch(`${BASE_URL}${path}`)
      assert.equal(response.status, 401, `${path} should require session`)
    }
    const chat = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '你好' }),
    })
    assert.equal(chat.status, 401)
  })
})

test('错误密码返回 401，不签发会话', async () => {
  await withApiServer(async () => {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: 'reviewer', password: 'wrong-password', role: 'student' }),
    })
    assert.equal(response.status, 401)
    assert.equal(response.headers.get('set-cookie'), null)
  })
})

test('登录签发 HttpOnly Cookie，/api/auth/session 可校验、乱码 token 拒绝', async () => {
  await withApiServer(async () => {
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: 'reviewer', password: 'Zhixue2026!', role: 'student' }),
    })
    assert.equal(loginResponse.status, 200)
    const setCookie = loginResponse.headers.get('set-cookie') || ''
    assert.ok(setCookie.includes('HttpOnly'), `cookie should be HttpOnly, got: ${setCookie}`)
    assert.ok(setCookie.includes('SameSite='), `cookie should set SameSite, got: ${setCookie}`)
    const cookie = setCookie.split(';')[0]
    const { token } = await loginResponse.json()

    const ok = await fetch(`${BASE_URL}/api/auth/session`, { headers: { Cookie: cookie } })
    assert.equal(ok.status, 200)
    const session = await ok.json()
    assert.equal(session.account, 'reviewer')
    assert.equal(session.role, 'student')

    const bearer = await fetch(`${BASE_URL}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(bearer.status, 200)

    const bad = await fetch(`${BASE_URL}/api/auth/session`, {
      headers: { Authorization: 'Bearer not-a-real-token' },
    })
    assert.equal(bad.status, 401)
  })
})

test('Capacitor 场景：Bearer token 可访问业务接口', async () => {
  await withApiServer(async () => {
    const { token } = await login('reviewer', 'Zhixue2026!')
    const response = await fetch(`${BASE_URL}/api/tutoring/topics`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(response.status, 200)
    const data = await response.json()
    assert.ok(Array.isArray(data.topics))
  })
})

test('accountId 由服务端会话推导：客户端伪造 accountId 无效', async () => {
  await withApiServer(async () => {
    const { cookie } = await login('reviewer', 'Zhixue2026!')

    // 旧攻击面：在 body / query 里自报身份，服务端必须忽略
    const saved = await fetch(`${BASE_URL}/api/profile/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        accountId: 'victim-account',
        score: 77,
        radarPoints: [{ dimension: '知识基础', score: 77 }],
        weaknesses: ['越权写入测试'],
        suggestions: ['应写入 reviewer 而非 victim-account'],
      }),
    })
    assert.equal(saved.status, 200)

    const asVictim = await fetch(`${BASE_URL}/api/profile/latest?accountId=victim-account`, {
      headers: { Cookie: cookie },
    })
    assert.equal(asVictim.status, 200)
    const victimData = await asVictim.json()
    // 服务端按会话账号读取：返回的是 reviewer 自己的画像，不是 victim-account 的
    assert.equal(victimData.result.accountId, 'reviewer')
    assert.equal(victimData.result.totalScore, 77)

    const settings = await fetch(`${BASE_URL}/api/account/settings?accountId=victim-account`, {
      headers: { Cookie: cookie },
    })
    assert.equal(settings.status, 200)
    const settingsData = await settings.json()
    assert.ok(settingsData.result === null || settingsData.result.accountId === 'reviewer')
  })
})

test('聊天历史按账号隔离：两个账号互相看不到对方记录', async () => {
  await withApiServer(async () => {
    const marker = `isolation-${Date.now()}`
    const reviewer = await login('reviewer', 'Zhixue2026!')
    const student = await login('student', 'student123')

    const send = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: reviewer.cookie },
      body: JSON.stringify({ message: marker }),
    })
    assert.equal(send.status, 200)

    const reviewerHistory = await fetch(`${BASE_URL}/api/chat/history`, {
      headers: { Cookie: reviewer.cookie },
    })
    const reviewerItems = (await reviewerHistory.json()).items
    assert.ok(reviewerItems.some(item => item.content === marker), 'reviewer should see own message')

    const studentHistory = await fetch(`${BASE_URL}/api/chat/history`, {
      headers: { Cookie: student.cookie },
    })
    const studentItems = (await studentHistory.json()).items
    assert.ok(!studentItems.some(item => item.content === marker), 'student must not see reviewer message')
  })
})

test('CORS 白名单：不在名单中的 Origin 不获得跨域许可', async () => {
  await withApiServer(async () => {
    const allowed = await fetch(`${BASE_URL}/api/health`, {
      headers: { Origin: 'http://localhost:5174' },
    })
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5174')
    assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true')

    const denied = await fetch(`${BASE_URL}/api/health`, {
      headers: { Origin: 'http://evil.example.com' },
    })
    assert.equal(denied.headers.get('access-control-allow-origin'), null)
  })
})

test('登出后会话立即失效', async () => {
  await withApiServer(async () => {
    const { cookie } = await login('reviewer', 'Zhixue2026!')
    const before = await fetch(`${BASE_URL}/api/tutoring/topics`, { headers: { Cookie: cookie } })
    assert.equal(before.status, 200)

    const out = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    assert.equal(out.status, 200)

    const after = await fetch(`${BASE_URL}/api/tutoring/topics`, { headers: { Cookie: cookie } })
    assert.equal(after.status, 401)
  })
})
