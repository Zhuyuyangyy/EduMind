import { resolveApiUrl } from './api-config'

export type AuthRole = 'student' | 'admin'

export interface AuthSession {
  role: AuthRole
  name: string
  account: string
  loginAt: string
}

export const AUTH_SESSION_KEY = 'edumind-auth-session'
const AUTH_TOKEN_KEY = 'edumind-auth-token'

export function getAuthSession(): AuthSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthSession
    if (parsed.role !== 'student' && parsed.role !== 'admin') return null
    return parsed
  } catch {
    return null
  }
}

/** 登录时服务端签发的会话 token（Capacitor 端走 Authorization: Bearer；Web 端由 Cookie 自动携带）。 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(AUTH_TOKEN_KEY)
}

/**
 * 写入本地登录态。
 * token 参数语义：传入新 token 时覆盖；省略时保留现有 token
 * （设置页等只更新展示信息的调用不能把移动端 Bearer 认证的 token 清掉）。
 */
export function setAuthSession(session: AuthSession, token?: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session))
  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token)
  }
}

export function clearAuthSession() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(AUTH_SESSION_KEY)
  window.localStorage.removeItem(AUTH_TOKEN_KEY)
}

/**
 * 启动时用服务端会话校验本地登录态。
 * - 401：本地会话已失效（过期 / 服务端重启 / 伪造），清除本地状态。
 * - 网络错误：无法证伪，保留本地会话（断网容错，接口调用时会自然暴露 401）。
 */
export async function restoreAuthSession(): Promise<AuthSession | null> {
  const local = getAuthSession()
  if (!local) return null

  try {
    const token = getAuthToken()
    // P1.5：必须走 resolveApiUrl——Capacitor WebView 里相对路径会打到 App 自身
    const response = await fetch(resolveApiUrl('/api/auth/session'), {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (response.status === 401) {
      clearAuthSession()
      return null
    }
    if (!response.ok) return local
    const data = await response.json() as { account: string; role: AuthRole; displayName: string }
    const restored: AuthSession = {
      role: data.role,
      name: data.displayName || local.name,
      account: data.account,
      loginAt: local.loginAt,
    }
    setAuthSession(restored, token || undefined)
    return restored
  } catch {
    return local
  }
}
