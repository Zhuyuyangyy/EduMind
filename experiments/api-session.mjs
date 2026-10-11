/**
 * 实验脚本共用：登录演示账号获取会话（P0 认证改造 · feat/mobile-v1；
 * P4-1C 起同时取 CSRF Token 供 Cookie 认证的写请求双提交）。
 * 业务接口现在要求有效会话，实验脚本先登录再携带 Cookie 调用。
 * 账号密码可用环境变量覆盖：DEMO_STUDENT_ACCOUNT / DEMO_STUDENT_PASSWORD。
 */
export async function createExperimentSession(baseUrl) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      account: process.env.DEMO_STUDENT_ACCOUNT || 'reviewer',
      password: process.env.DEMO_STUDENT_PASSWORD || 'Zhixue2026!',
      role: 'student',
    }),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`实验脚本登录失败（${response.status}）：${detail}`)
  }
  // 登录响应下发两个 Cookie：会话（HttpOnly）+ CSRF（可读，双提交用）
  const setCookies = response.headers.getSetCookie?.() || []
  const cookie = setCookies.map(item => item.split(';')[0].trim()).filter(Boolean).join('; ')
  if (!cookie) throw new Error('登录响应未下发会话 Cookie')
  let csrf = ''
  for (const item of setCookies) {
    const pair = item.split(';')[0]
    const index = pair.indexOf('=')
    if (index > 0 && pair.slice(0, index).trim() === 'edumind_csrf') {
      csrf = decodeURIComponent(pair.slice(index + 1).trim())
    }
  }
  const data = await response.json()
  return { cookie, csrf, token: data.token, account: data.account }
}

/** 把会话 Cookie 合并进请求头。 */
export function withSessionCookie(session, headers = {}) {
  return { ...headers, Cookie: session.cookie }
}

/**
 * 把会话 Cookie + CSRF Token 合并进请求头（P4-1C）。
 * 写请求（POST/PUT/PATCH/DELETE）必须带 X-CSRF-Token，
 * 否则服务端按 CSRF 防护拒绝（403）。
 */
export function withSessionAuth(session, headers = {}) {
  return {
    ...headers,
    Cookie: session.cookie,
    ...(session.csrf ? { 'X-CSRF-Token': session.csrf } : {}),
  }
}
