/**
 * 实验脚本共用：登录演示账号获取会话（P0 认证改造 · feat/mobile-v1）。
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
  const setCookie = response.headers.get('set-cookie') || ''
  const cookie = setCookie.split(';')[0]
  if (!cookie) throw new Error('登录响应未下发会话 Cookie')
  const data = await response.json()
  return { cookie, token: data.token, account: data.account }
}

/** 把会话 Cookie 合并进请求头。 */
export function withSessionCookie(session, headers = {}) {
  return { ...headers, Cookie: session.cookie }
}
