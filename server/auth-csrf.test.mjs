import test from 'node:test'
import assert from 'node:assert/strict'
import { withTestServer } from './test-server.mjs'

/**
 * P4-1C CSRF 防护验收（先于实现编写，预期在当前版本失败）。
 *
 * 门禁：
 * 1. Cookie 认证的状态修改请求（POST）缺少 X-CSRF-Token → 403
 * 2. 携带正确 CSRF Token（与 Cookie 双提交一致）→ 放行
 * 3. CSRF Token 不匹配 → 403
 * 4. Bearer 认证的请求不受 CSRF 拦截（非浏览器自动携带，无 CSRF 面）
 * 5. 登录接口本身不需要 CSRF（尚无会话）
 */

const DEMO = { account: 'reviewer', password: 'Zhixue2026!' }

async function loginWithCookie(baseUrl) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...DEMO, role: 'student' }),
  })
  assert.equal(res.status, 200, '登录应成功')
  const setCookies = res.headers.getSetCookie?.() || []
  return { token: (await res.json()).token, setCookies }
}

function cookieHeader(setCookies) {
  return setCookies
    .map(item => item.split(';')[0].trim())
    .filter(Boolean)
    .join('; ')
}

function csrfFromCookies(setCookies) {
  for (const item of setCookies) {
    const [pair] = item.split(';')
    const index = pair.indexOf('=')
    if (index > 0 && pair.slice(0, index).trim() === 'edumind_csrf') {
      return decodeURIComponent(pair.slice(index + 1).trim())
    }
  }
  return null
}

test('Cookie 认证的写操作缺少 CSRF Token 被拒（403）', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const { setCookies } = await loginWithCookie(baseUrl)
    const cookie = cookieHeader(setCookies)

    // 不带 X-CSRF-Token 的写请求（浏览器被诱导发起的典型 CSRF 场景）
    const res = await fetch(`${baseUrl}/api/account/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ displayName: 'csrf-attacker' }),
    })
    assert.equal(res.status, 403, `缺少 CSRF Token 必须 403，实际=${res.status}`)
  })
})

test('携带匹配的 CSRF Token 放行；不匹配则 403', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const { setCookies } = await loginWithCookie(baseUrl)
    const cookie = cookieHeader(setCookies)
    const csrf = csrfFromCookies(setCookies)
    assert.ok(csrf, '登录响应应下发 CSRF Token Cookie')

    // 正确双提交 → 放行
    const ok = await fetch(`${baseUrl}/api/account/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf },
      body: JSON.stringify({ displayName: ' legit-user ' }),
    })
    assert.equal(ok.status, 200, `正确 CSRF Token 应放行，实际=${ok.status}`)

    // 错误 Token → 403
    const bad = await fetch(`${baseUrl}/api/account/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': 'wrong-token' },
      body: JSON.stringify({ displayName: 'attacker' }),
    })
    assert.equal(bad.status, 403, 'CSRF Token 不匹配必须 403')
  })
})

test('Bearer 认证不受 CSRF 拦截（原生端无浏览器自动携带面）', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const { token, setCookies } = await loginWithCookie(baseUrl)
    void setCookies

    const res = await fetch(`${baseUrl}/api/account/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ displayName: 'native-user' }),
    })
    assert.equal(res.status, 200, `Bearer 认证不应被 CSRF 拦截，实际=${res.status}`)
  })
})

test('GET 请求不需要 CSRF Token', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const { setCookies } = await loginWithCookie(baseUrl)
    const cookie = cookieHeader(setCookies)
    const res = await fetch(`${baseUrl}/api/account/settings`, {
      headers: { Cookie: cookie },
    })
    assert.equal(res.status, 200, `安全方法不应要求 CSRF，实际=${res.status}`)
  })
})

test('退出登录（Cookie 认证）同样受 CSRF 保护', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const { token, setCookies } = await loginWithCookie(baseUrl)
    const cookie = cookieHeader(setCookies)

    // 无 CSRF Token 的退出 → 403（会话不被撤销）
    const blocked = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    assert.equal(blocked.status, 403, '退出登录也应受 CSRF 保护')

    // 带 Token 的退出 → 200，且会话随即失效
    const csrf = csrfFromCookies(setCookies)
    const ok = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie, 'X-CSRF-Token': csrf },
    })
    assert.equal(ok.status, 200)
    const after = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(after.status, 401, '退出后会话必须失效')
  })
})

test('CORS 预检许可 X-CSRF-Token（跨源部署下 Cookie 写请求不被浏览器拦截）', async () => {
  await withTestServer(async ({ baseUrl }) => {
    // P4-2A 回归：P4-1C 曾遗漏该头，跨源请求携带 X-CSRF-Token 时预检
    // 失败 → 浏览器 TypeError（表现为"网络不可达"）。
    const preflight = await fetch(`${baseUrl}/api/account/settings`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5174',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-csrf-token',
      },
    })
    assert.equal(preflight.status, 204)
    const allowed = preflight.headers.get('access-control-allow-headers') || ''
    assert.match(allowed, /x-csrf-token/i, `预检必须许可 X-CSRF-Token，实际: ${allowed}`)
    assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true')
  })
})
