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
// 与其他测试文件隔离数据文件，避免并行执行时争抢 store.json / traces.json
const DATA_FILE = path.join(os.tmpdir(), `edumind-test-auth-${process.pid}.json`)
const TRACE_FILE = path.join(os.tmpdir(), `edumind-test-auth-traces-${process.pid}.json`)
const SESSION_FILE = path.join(os.tmpdir(), `edumind-test-auth-sessions-${process.pid}.json`)
const IDENTITY_FILE = path.join(os.tmpdir(), `edumind-test-auth-identities-${process.pid}.json`)

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
      ZHIXUE_TRACE_FILE: TRACE_FILE,
      // P4-1B：会话/身份文件按测试隔离（并行测试不互相覆盖）
      ZHIXUE_SESSION_FILE: SESSION_FILE,
      ZHIXUE_IDENTITY_FILE: IDENTITY_FILE,
      // P4-1B：强制 JSON 模式，避免继承调用方 MYSQL_* 共库
      MYSQL_URL: '', MYSQL_HOST: '', MYSQL_PORT: '', MYSQL_USER: '', MYSQL_PASSWORD: '', MYSQL_DATABASE: '',
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
    fs.rmSync(TRACE_FILE, { force: true })
    fs.rmSync(SESSION_FILE, { force: true })
    fs.rmSync(IDENTITY_FILE, { force: true })
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
  // P4-1C：登录响应同时下发会话 Cookie 与 CSRF Cookie（双提交）
  const setCookies = response.headers.getSetCookie?.() || []
  const cookie = setCookies.map(item => item.split(';')[0].trim()).filter(Boolean).join('; ')
  let csrf = ''
  for (const item of setCookies) {
    const pair = item.split(';')[0]
    const index = pair.indexOf('=')
    if (index > 0 && pair.slice(0, index).trim() === 'edumind_csrf') {
      csrf = decodeURIComponent(pair.slice(index + 1).trim())
    }
  }
  const data = await response.json()
  return { cookie, token: data.token, account: data.account, role: data.role, csrf }
}

/**
 * P4-1C：Cookie 认证的写请求必须双提交 CSRF。
 * authHeaders(cookie, csrf, extra) 生成带头部的 init。
 */
function writeInit(cookie, csrf, body) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf },
    body: JSON.stringify(body),
  }
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
    const { cookie, csrf } = await login('reviewer', 'Zhixue2026!')

    // 旧攻击面：在 body / query 里自报身份，服务端必须忽略
    const saved = await fetch(`${BASE_URL}/api/profile/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf },
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
      headers: { 'Content-Type': 'application/json', Cookie: reviewer.cookie, 'X-CSRF-Token': reviewer.csrf },
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
    const { cookie, csrf } = await login('reviewer', 'Zhixue2026!')
    const before = await fetch(`${BASE_URL}/api/tutoring/topics`, { headers: { Cookie: cookie } })
    assert.equal(before.status, 200)

    const out = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie, 'X-CSRF-Token': csrf },
    })
    assert.equal(out.status, 200)

    const after = await fetch(`${BASE_URL}/api/tutoring/topics`, { headers: { Cookie: cookie } })
    assert.equal(after.status, 401)
  })
})

test('证据追踪按账号隔离：两个账号互相看不到对方的 trace', async () => {
  await withApiServer(async () => {
    const marker = `trace-leak-${Date.now()}`
    const reviewer = await login('reviewer', 'Zhixue2026!')
    const student = await login('student', 'student123')

    const chat = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: reviewer.cookie, 'X-CSRF-Token': reviewer.csrf },
      body: JSON.stringify({ message: marker }),
    })
    assert.equal(chat.status, 200)

    const reviewerTraces = await fetch(`${BASE_URL}/api/evidence/traces`, { headers: { Cookie: reviewer.cookie } })
    const reviewerItems = (await reviewerTraces.json()).items
    assert.ok(reviewerItems.some(t => (t.inputsSummary || '').includes(marker)), 'reviewer should see own trace')

    const studentTraces = await fetch(`${BASE_URL}/api/evidence/traces`, { headers: { Cookie: student.cookie } })
    const studentItems = (await studentTraces.json()).items
    assert.ok(!studentItems.some(t => (t.inputsSummary || '').includes(marker)), 'student must not see reviewer trace')

    const reviewerSummary = await fetch(`${BASE_URL}/api/evidence/summary`, { headers: { Cookie: reviewer.cookie } })
    const studentSummary = await fetch(`${BASE_URL}/api/evidence/summary`, { headers: { Cookie: student.cookie } })
    const rSummary = await reviewerSummary.json()
    const sSummary = await studentSummary.json()
    assert.ok(rSummary.totalTraces >= 1, 'reviewer summary counts own trace')
    assert.equal(sSummary.totalTraces, 0, 'student summary must not count reviewer trace')
  })
})

test('历史 trace（无 accountId 字段）对登录用户不可见', async () => {
  await withApiServer(async () => {
    // 直接在 trace 文件里埋一条改造前的历史数据
    const legacy = [{
      requestId: 'legacy-1',
      timestamp: new Date().toISOString(),
      agents: ['ChatAgent'],
      inputsSummary: 'legacy-secret-message',
      outputsSummary: 'legacy-secret-reply',
      evidence: [], riskFlags: [], fallbackUsed: true, durationMs: 0, agentResults: [],
    }]
    fs.writeFileSync(TRACE_FILE, JSON.stringify(legacy), 'utf8')

    const { cookie, csrf } = await login('reviewer', 'Zhixue2026!')
    const traces = await fetch(`${BASE_URL}/api/evidence/traces`, { headers: { Cookie: cookie } })
    const items = (await traces.json()).items
    assert.ok(!items.some(t => (t.inputsSummary || '').includes('legacy-secret')), 'legacy traces must not leak to logged-in users')
  })
})

test('协作演示数据重置接口要求管理员角色', async () => {
  await withApiServer(async () => {
    const student = await login('student', 'student123')
    const denied = await fetch(`${BASE_URL}/api/agent-collaboration/seed`, {
      method: 'POST', headers: { Cookie: student.cookie, 'X-CSRF-Token': student.csrf },
    })
    assert.equal(denied.status, 403)
  })
})

test('知识路径按账号隔离', async () => {
  await withApiServer(async () => {
    const reviewer = await login('reviewer', 'Zhixue2026!')
    const student = await login('student', 'student123')
    const profile = {
      dimensions: [
        { label: '知识基础', value: 61 }, { label: '学习速度', value: 61 },
        { label: '逻辑思维', value: 61 }, { label: '创造力', value: 61 },
        { label: '专注力', value: 61 }, { label: '自律力', value: 61 },
      ],
      totalScore: 61,
      weaknesses: ['知识基础需巩固'],
    }

    const generated = await fetch(`${BASE_URL}/api/knowledge-path/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: reviewer.cookie, 'X-CSRF-Token': reviewer.csrf },
      body: JSON.stringify({ profile }),
    })
    assert.equal(generated.status, 200)

    const reviewerLatest = await fetch(`${BASE_URL}/api/knowledge-path/latest`, { headers: { Cookie: reviewer.cookie } })
    assert.notEqual((await reviewerLatest.json()).result, null, 'reviewer sees own knowledge path')

    const studentLatest = await fetch(`${BASE_URL}/api/knowledge-path/latest`, { headers: { Cookie: student.cookie } })
    assert.equal((await studentLatest.json()).result, null, 'student must not see reviewer knowledge path')
  })
})

test('交错并发产生 trace 时严格归属各自账号（非压测，交错发起）', async () => {
  await withApiServer(async () => {
    const reviewer = await login('reviewer', 'Zhixue2026!')
    const student = await login('student', 'student123')
    const rounds = 5

    for (let i = 0; i < rounds; i++) {
      const rMarker = `concurrent-r-${i}-${Date.now()}`
      const sMarker = `concurrent-s-${i}-${Date.now()}`
      // 两个账号的请求在时间上重叠发起，考验账号上下文在并发下不串台
      const [rRes, sRes] = await Promise.all([
        fetch(`${BASE_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: reviewer.cookie, 'X-CSRF-Token': reviewer.csrf },
          body: JSON.stringify({ message: rMarker }),
        }),
        fetch(`${BASE_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: student.cookie, 'X-CSRF-Token': student.csrf },
          body: JSON.stringify({ message: sMarker }),
        }),
      ])
      assert.equal(rRes.status, 200)
      assert.equal(sRes.status, 200)
    }

    const rData = await (await fetch(`${BASE_URL}/api/evidence/traces?limit=100`, { headers: { Cookie: reviewer.cookie } })).json()
    const sData = await (await fetch(`${BASE_URL}/api/evidence/traces?limit=100`, { headers: { Cookie: student.cookie } })).json()
    const rOwn = rData.items.filter(t => (t.inputsSummary || '').includes('concurrent-r-')).length
    const sOwn = sData.items.filter(t => (t.inputsSummary || '').includes('concurrent-s-')).length
    assert.equal(rOwn, rounds, 'reviewer 应看到自己全部 trace')
    assert.equal(sOwn, rounds, 'student 应看到自己全部 trace')
    assert.ok(!JSON.stringify(rData.items).includes('concurrent-s-'), 'reviewer 视图不得出现 student 的 trace')
    assert.ok(!JSON.stringify(sData.items).includes('concurrent-r-'), 'student 视图不得出现 reviewer 的 trace')
  })
})

test('协作看板只聚合当前账号的真实活动（元数据也不跨账号）', async () => {
  await withApiServer(async () => {
    const reviewer = await login('reviewer', 'Zhixue2026!')
    const student = await login('student', 'student123')

    // reviewer 产生 1 次 tutor trace，student 产生 3 次（主 agent 均为 ProfileAgent → profile-module）
    const askTutor = (session, question) => fetch(`${BASE_URL}/api/agents/tutor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: session.cookie, 'X-CSRF-Token': session.csrf },
      body: JSON.stringify({ question, mode: 'qa' }),
    })
    assert.equal((await askTutor(reviewer, 'reviewer 的提问')).status, 200)
    for (const q of ['student 提问一', 'student 提问二', 'student 提问三']) {
      assert.equal((await askTutor(student, q)).status, 200)
    }

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const today = dayNames[new Date().getDay()]
    const board = await (await fetch(`${BASE_URL}/api/agent-collaboration?day=${today}`, { headers: { Cookie: reviewer.cookie } })).json()

    const profileChain = board.chains.find(c => c.id === 'profile-module')
    assert.ok(profileChain, '应有画像模块链路')
    // reviewer 只发起 1 次：若把 student 的 3 次也算进来就会是 4
    assert.equal(profileChain.eventIds.length, 1, '看板只能统计当前账号的真实活动')
    assert.ok(!JSON.stringify(board).includes('提问'), '看板不得包含任何账号的提问内容')
  })
})

test('CORS：白名单 Origin 预检放行（含 Authorization），陌生 Origin 被拒绝', async () => {
  await withApiServer(async () => {
    // Capacitor Android 的 WebView 源与本地开发源都应放行
    for (const origin of ['http://localhost:5174', 'https://localhost', 'capacitor://localhost']) {
      const preflight = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type,authorization',
        },
      })
      assert.equal(preflight.status, 204, `${origin} 预检应 204`)
      assert.equal(preflight.headers.get('access-control-allow-origin'), origin, `${origin} 应被反射`)
      assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true')
      assert.match(preflight.headers.get('access-control-allow-headers') || '', /authorization/i)
    }

    // 陌生 Origin 不得拿到 CORS 许可
    const evil = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    })
    assert.ok(!evil.headers.get('access-control-allow-origin'), '陌生 Origin 不得拿到 CORS 许可')

    // 陌生 Origin 的实际请求也应被浏览器拦截（服务端不下发 ACAO）
    const cross = await fetch(`${BASE_URL}/api/evidence/traces`, {
      headers: { Origin: 'https://evil.example.com' },
    })
    assert.ok(!cross.headers.get('access-control-allow-origin'))
  })
})

test('跨 Origin 场景：Bearer Token 可完成业务请求（Cookie 不可依赖）', async () => {
  await withApiServer(async () => {
    // 模拟 Capacitor WebView：源是 https://localhost，不带 Cookie，只带 Bearer
    const login = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://localhost' },
      body: JSON.stringify({ account: 'reviewer', password: 'Zhixue2026!' }),
    })
    assert.equal(login.status, 200)
    assert.equal(login.headers.get('access-control-allow-origin'), 'https://localhost')
    const { token } = await login.json()

    const traces = await fetch(`${BASE_URL}/api/evidence/traces`, {
      headers: { Origin: 'https://localhost', Authorization: `Bearer ${token}` },
    })
    assert.equal(traces.status, 200, 'Bearer 通道在跨域下应放行')

    // 过期/乱码 token 在跨域下同样 401
    const expired = await fetch(`${BASE_URL}/api/evidence/traces`, {
      headers: { Origin: 'https://localhost', Authorization: 'Bearer not-a-real-token' },
    })
    assert.equal(expired.status, 401)
  })
})
