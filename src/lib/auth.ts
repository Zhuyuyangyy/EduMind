import { resolveApiUrl, getApiBase, isNativeApp } from './api-config'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import {
  selectTokenStore,
  type AuthTokenStore,
  type KeyValueStorage,
  type SecureStorageLike,
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

let tokenStore: AuthTokenStore | null = null

function isProdBuild(): boolean {
  return import.meta.env.PROD === true
}

/** 当前 API Base 与页面源是否跨源 */
function isCrossOriginApi(): boolean {
  if (typeof window === 'undefined') return false
  const base = getApiBase()
  if (!base) return false
  return effectiveOrigin(base, window.location.origin) !== window.location.origin
}

/**
 * 统一凭据存储（P4-1C 建立，P4-2A 收紧）：
 * - 原生（Capacitor）：Keystore/Keychain 安全存储（生产拒绝明文回退）；
 * - Web 同源：HttpOnly Cookie（本地零 token）；
 * - Web 跨源 + 开发/测试：origin 绑定 Bearer 桥接；
 * - Web 跨源 + 生产：显式拒绝（P0 复核发现原分支未限制构建模式，
 *   生产 Web 配跨源 API 会把 Bearer 写进 localStorage）。
 */
export function getTokenStore(): AuthTokenStore {
  if (tokenStore) return tokenStore
  const storage = browserStorage()
  const cookieReader = () => (typeof document === 'undefined' ? '' : document.cookie)

  if (isNativeApp()) {
    const secure: SecureStorageLike = {
      get: async (key: string) => {
        const value = await SecureStorage.get(key)
        return value == null ? null : String(value)
      },
      set: async (key: string, value: string) => { await SecureStorage.set(key, value) },
      remove: async (key: string) => { await SecureStorage.remove(key) },
    }
    tokenStore = selectTokenStore(
      { platform: 'native', crossOrigin: isCrossOriginApi(), prod: isProdBuild() },
      { storage, cookieReader, secure },
    )
    return tokenStore
  }

  tokenStore = selectTokenStore(
    { platform: 'web', crossOrigin: isCrossOriginApi(), prod: isProdBuild() },
    { storage, cookieReader },
  )
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
 * 切换 API origin 时的凭据处理（P4-1A 建立，P4-2A 重写）。
 *
 * 复核发现：旧实现只读 Web localStorage 的 origin 绑定键，原生端
 * 绑定在安全存储里，切换判定失效。现改为**直接比较切换前后的 API
 * origin**（与存储位置无关）：origin 变化即视为需要解除绑定。
 *
 * 返回 { conflict, revoked }：
 * - conflict=true 时调用方必须把 API Base 改为新地址并要求重新登录；
 * - revoked 表示是否已尽力向旧服务发送撤销（best-effort，失败不阻断）。
 */
export async function prepareOriginSwitch(nextBase: string): Promise<{ conflict: boolean; revoked: boolean }> {
  if (typeof window === 'undefined') return { conflict: false, revoked: false }
  const currentOriginValue = effectiveOrigin(getApiBase(), window.location.origin)
  const nextOriginValue = effectiveOrigin(nextBase, window.location.origin)
  // 两边都为空（同源相对路径 ↔ 同源相对路径）或相等 → 无切换
  if (currentOriginValue === nextOriginValue) return { conflict: false, revoked: false }

  // origin 变化：先尽力撤销旧服务会话，再解除本地绑定并中止在途请求
  let revoked = false
  try {
    const token = await getAuthToken()
    if (token) {
      const response = await fetch(resolveApiUrl('/api/auth/logout'), {
        method: 'POST',
        credentials: 'include',
        headers: { Authorization: `Bearer ${token}` },
      })
      revoked = response.ok
    } else {
      // Cookie 认证：带 CSRF 双提交注销（尽力而为）
      const csrf = await getCsrfToken()
      const response = await fetch(resolveApiUrl('/api/auth/logout'), {
        method: 'POST',
        credentials: 'include',
        headers: csrf ? { 'X-CSRF-Token': csrf } : {},
      })
      revoked = response.ok
    }
  } catch {
    /* 旧服务不可达：本地解绑仍然生效 */
  }
  await clearAuthSession()
  return { conflict: true, revoked }
}

/**
 * 带身份纪元防护的 token 读取（P4-2A 竞态修复）。
 *
 * 竞态场景：请求开始 → 异步读取 Keystore/存储 → 期间用户退出或
 * 切号 → 读取恢复。若不校验纪元，旧 token 会随清理后的请求再次
 * 外发。调用方在发送前必须调用本函数并检查 null。
 */
export async function getAuthTokenGuarded(startEpoch: number): Promise<string | null> {
  const token = await getAuthToken()
  if (currentAuthEpoch() !== startEpoch) return null // 清理已发生：不外发旧凭据
  return token
}

/** 供测试：重置模块级单例 */
export function __resetTokenStoreForTests() {
  tokenStore = null
}

export { CSRF_COOKIE_NAME }
