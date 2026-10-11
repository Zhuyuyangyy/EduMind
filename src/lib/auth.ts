import { resolveApiUrl, getApiBase } from './api-config'
import {
  bindToken,
  clearTokenBinding,
  effectiveOrigin,
  getTokenForOrigin,
  isOriginChange,
  type KeyValueStorage,
} from './auth-origin'

export type AuthRole = 'student' | 'admin'

export interface AuthSession {
  role: AuthRole
  name: string
  account: string
  loginAt: string
}

export const AUTH_SESSION_KEY = 'edumind-auth-session'

function storage(): KeyValueStorage | null {
  if (typeof window === 'undefined') return null
  return window.localStorage as unknown as KeyValueStorage
}

/** 当前 API 目标 origin（相对路径部署时取页面源） */
function currentOrigin(): string {
  if (typeof window === 'undefined') return ''
  return effectiveOrigin(getApiBase(), window.location.origin)
}

export function getAuthSession(): AuthSession | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(AUTH_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthSession
    if (parsed.role !== 'student' && parsed.role !== 'admin') return null
    return parsed
  } catch {
    return null
  }
}

/**
 * 取当前 API origin 可用的会话 token（P4-1A）。
 * token 与签发它的 API origin 绑定：当前 origin 不匹配时返回 null——
 * 绝不把 A 服务的 Bearer 发往 B 服务。
 */
export function getAuthToken(): string | null {
  const store = storage()
  if (!store) return null
  return getTokenForOrigin(store, currentOrigin())
}

/**
 * 写入本地登录态。
 * - token 传入时与当前 API origin 绑定存放；
 * - 省略时保留现有 token（设置页等只更新展示信息的调用不能把
 *   移动端 Bearer 认证的 token 清掉）。
 */
export function setAuthSession(session: AuthSession, token?: string) {
  const store = storage()
  if (!store) return
  store.setItem(AUTH_SESSION_KEY, JSON.stringify(session))
  if (token) {
    bindToken(store, token, currentOrigin())
  }
}

export function clearAuthSession() {
  const store = storage()
  if (!store) return
  clearTokenBinding(store)
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

/**
 * 切换 API origin 时的凭据冲突判定（P4-1A）。
 * 绑定 origin 与新 origin 不同 → true，调用方必须先解绑并要求重新登录。
 */
export function authBindingConflictsWith(nextBase: string): boolean {
  const store = storage()
  if (!store) return false
  if (typeof window === 'undefined') return false
  const nextOrigin = effectiveOrigin(nextBase, window.location.origin)
  return isOriginChange(store, nextOrigin)
}
