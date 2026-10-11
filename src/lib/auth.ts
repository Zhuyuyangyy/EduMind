import { resolveApiUrl, getApiBase, isNativeApp } from './api-config'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import {
  createWebTokenStore,
  createWebCrossOriginBridgeStore,
  createNativeTokenStore,
  createFallbackNativeStore,
  type AuthTokenStore,
  type KeyValueStorage,
} from './auth-token-store'
import { effectiveOrigin } from './auth-origin'

export type AuthRole = 'student' | 'admin'

export interface AuthSession {
  role: AuthRole
  name: string
  account: string
  loginAt: string
}

export const AUTH_SESSION_KEY = 'edumind-auth-session'
const CSRF_COOKIE_NAME = 'edumind_csrf'

/* ———————————— 平台存储（P4-1C） ———————————— */

function browserStorage(): KeyValueStorage | null {
  if (typeof window === 'undefined') return null
  return window.localStorage as unknown as KeyValueStorage
}

function currentOrigin(): string {
  if (typeof window === 'undefined') return ''
  return effectiveOrigin(getApiBase(), window.location.origin)
}

function apiOrigin(): string {
  if (typeof window === 'undefined') return ''
  return effectiveOrigin(getApiBase(), window.location.origin)
}

/** 当前 API Base 与页面源是否同源 */
function isSameOriginApi(): boolean {
  if (typeof window === 'undefined') return true
  return apiOrigin() === window.location.origin
}

let tokenStore: AuthTokenStore | null = null

/**
 * 统一凭据存储：
 * - 原生（Capacitor）：Keystore/Keychain 安全存储（生产拒绝明文回退）；
 * - Web 同源：HttpOnly Cookie（本地零 token）；
 * - Web 跨源：仅开发/测试的 Bearer 桥接（origin 绑定 + 明确告警），
 *   生产 Web 部署为同源 Cookie 认证。
 */
export function getTokenStore(): AuthTokenStore {
  if (tokenStore) return tokenStore
  const storage = browserStorage()

  if (isNativeApp()) {
    const prod = import.meta.env.PROD === true
    try {
      tokenStore = createNativeTokenStore(
        {
          get: async (key: string) => {
            const value = await SecureStorage.get(key)
            return value == null ? null : String(value)
          },
          set: async (key: string, value: string) => { await SecureStorage.set(key, value) },
          remove: async (key: string) => { await SecureStorage.remove(key) },
        },
        { insecureFallback: storage, prod },
      )
    } catch {
      tokenStore = createFallbackNativeStore(storage, prod)
    }
    return tokenStore
  }

  const cookieReader = () => (typeof document === 'undefined' ? '' : document.cookie)
  if (!isSameOriginApi() && getApiBase()) {
    // 跨源 Web（开发/跨域 E2E）：Bearer 桥接，token origin 绑定
    console.warn('[auth] 跨源 Web 调试模式：使用 origin 绑定的 Bearer 桥接（生产 Web 部署应为同源 Cookie 认证）')
    tokenStore = createWebCrossOriginBridgeStore(storage, cookieReader)
    return tokenStore
  }
  // 同源 Web：HttpOnly Cookie 认证，本地零 token
  tokenStore = createWebTokenStore(storage, cookieReader)
  return tokenStore
}

/* ———————————— 会话状态 ———————————— */

export function getAuthSession(): AuthSession | null {
  const store = browserStorage()
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
 * 取当前 API origin 可用的 Bearer token（P4-1A origin 绑定 +
 * P4-1C 平台存储）。Web 同源部署返回 null——会话由 HttpOnly
 * Cookie 自动携带。
 */
export async function getAuthToken(): Promise<string | null> {
  return getTokenStore().getToken(currentOrigin())
}

/** CSRF Token（Web 双提交用；原生返回 null） */
export async function getCsrfToken(): Promise<string | null> {
  return getTokenStore().getCsrfToken()
}

export function setAuthSession(session: AuthSession) {
  const store = browserStorage()
  if (!store) return
  store.setItem(AUTH_SESSION_KEY, JSON.stringify(session))
}

/** 登录成功：本地只写展示性会话信息；token 按平台进入安全存储 */
export async function completeLogin(session: AuthSession, token?: string) {
  if (token) {
    await getTokenStore().setToken(token, currentOrigin())
  }
  setAuthSession(session)
}

/* ———————————— 在途请求失效（P4-1C） ———————————— */

const inFlightControllers = new Set<AbortController>()
let authEpoch = 0

export function currentAuthEpoch(): number {
  return authEpoch
}

export function registerInFlight(controller: AbortController): void {
  inFlightControllers.add(controller)
}

export function unregisterInFlight(controller: AbortController): void {
  inFlightControllers.delete(controller)
}

/** 安全清理：解除本地绑定 + 中止全部在途请求 + 身份纪元 +1 */
export async function clearAuthSession() {
  authEpoch += 1
  for (const controller of inFlightControllers) {
    try {
      controller.abort()
    } catch {
      /* ignore */
    }
  }
  inFlightControllers.clear()
  const store = browserStorage()
  if (!store) return
  await getTokenStore().clearToken()
  store.removeItem(AUTH_SESSION_KEY)
}

/** 启动迁移：清理遗留明文 token（P4-1C 之前的版本会写入 localStorage） */
export async function migrateLegacyCredentials(): Promise<{ clearedLegacyToken: boolean }> {
  return getTokenStore().migrate()
}

/**
 * 启动时用服务端会话校验本地登录态。
 * - 401：本地会话已失效（过期 / 服务端重启 / 伪造），清除本地状态。
 * - 网络错误：无法证伪，保留本地会话（断网容容）。
 */
export async function restoreAuthSession(): Promise<AuthSession | null> {
  const local = getAuthSession()
  if (!local) return null

  try {
    const token = await getAuthToken()
    const response = await fetch(resolveApiUrl('/api/auth/session'), {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (response.status === 401) {
      await clearAuthSession()
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
    setAuthSession(restored)
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
  const store = browserStorage()
  if (!store) return false
  if (typeof window === 'undefined') return false
  const nextOrigin = effectiveOrigin(nextBase, window.location.origin)
  const bound = store.getItem('edumind-auth-token-origin')
  if (!bound) return false
  return Boolean(nextOrigin) && bound !== nextOrigin
}

/** 供测试：重置模块级单例 */
export function __resetTokenStoreForTests() {
  tokenStore = null
}

export { CSRF_COOKIE_NAME }
