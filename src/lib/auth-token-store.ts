/**
 * 统一认证凭据存储（P4-1C · feat/mobile-v1）
 *
 * 双实现，按运行平台选择：
 * - Web（浏览器）：HttpOnly Cookie 承载会话，**本地不存任何 token**；
 *   CSRF Token 从可读 Cookie 取出，仅用于双提交请求头。
 * - Android/iOS（Capacitor 原生）：Bearer token 存安全存储
 *   （@aparajita/capacitor-secure-storage，底层 Android Keystore /
 *   iOS Keychain）。生产构建禁用非安全回退。
 *
 * 迁移：清理 P4-1C 之前写入 localStorage 的明文 token
 *（edumind-auth-token）——升级用户下次登录自动完成迁移。
 *
 * 本模块的平台探测与纯逻辑部分可在 Node 下单测。
 */

export const CSRF_COOKIE_NAME = 'edumind_csrf'
export const LEGACY_TOKEN_KEY = 'edumind-auth-token'
export const SECURE_TOKEN_KEY = 'edumind.bearer.token'
export const SECURE_ORIGIN_KEY = 'edumind.bearer.origin'
/** 跨源 Web 桥接的 origin 绑定键（开发/测试） */
export const TOKEN_ORIGIN_KEY = 'edumind-auth-token-origin'

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type Platform = 'web' | 'native'

/** 从 Cookie 头字符串中读取指定 Cookie（纯函数） */
export function readCookieValue(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=')
    if (index <= 0) continue
    if (part.slice(0, index).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(index + 1).trim())
    } catch {
      return part.slice(index + 1).trim()
    }
  }
  return null
}

/** 平台探测（可注入，便于测试） */
export function detectPlatform(probe: { capacitorNative?: boolean } = {}): Platform {
  return probe.capacitorNative ? 'native' : 'web'
}

/** 生产构建下是否允许非安全回退（默认不允许） */
export function allowInsecureFallback(env: { prod?: boolean; allowFlag?: boolean } = {}): boolean {
  if (env.allowFlag) return true
  return !env.prod
}

export interface AuthTokenStore {
  readonly platform: Platform
  /** 取当前 API origin 可用的 Bearer token（Web 恒为 null——用 Cookie） */
  getToken(origin: string): Promise<string | null>
  /** 绑定 token 到 origin（原生安全存储） */
  setToken(token: string, origin: string): Promise<void>
  /** 解除绑定 */
  clearToken(): Promise<void>
  /** 当前绑定的 API origin（无绑定时 null）；用于切换判定 */
  getBoundOrigin(): Promise<string | null>
  /** CSRF Token（Web 从 Cookie 读；原生不需要） */
  getCsrfToken(): Promise<string | null>
  /** 清理遗留明文凭据 */
  migrate(): Promise<{ clearedLegacyToken: boolean }>
}

/* ———————————— Web 实现 ———————————— */

export function createWebTokenStore(storage: KeyValueStorage | null, cookieReader: () => string): AuthTokenStore {
  return {
    platform: 'web',
    async getToken() {
      // Web 不使用 Bearer：会话由 HttpOnly Cookie 自动携带
      return null
    },
    async setToken() {
      // 不落盘——Cookie 已由服务端 Set-Cookie 建立
    },
    async clearToken() {
      storage?.removeItem(LEGACY_TOKEN_KEY)
      storage?.removeItem(TOKEN_ORIGIN_KEY)
    },
    async getBoundOrigin() {
      return null // Cookie 模式无本地 origin 绑定
    },
    async getCsrfToken() {
      return readCookieValue(cookieReader(), CSRF_COOKIE_NAME)
    },
    async migrate() {
      const had = Boolean(storage?.getItem(LEGACY_TOKEN_KEY))
      storage?.removeItem(LEGACY_TOKEN_KEY)
      storage?.removeItem(TOKEN_ORIGIN_KEY)
      return { clearedLegacyToken: had }
    },
  }
}

/* ———————————— 跨源 Web 桥接（仅开发/测试） ———————————— */

/**
 * 跨源 Web 调试桥接：SameSite=None Cookie 在部分浏览器/无头环境下
 * 不稳定，开发与跨域 E2E 需要 Bearer 通道。token 仍 origin 绑定
 * （P4-1A）。**仅限开发/测试构建**——生产 Web 跨源部署不受支持
 * （见 createProductionRefusalStore）。
 *
 * P4-2A：migrate() 不再清理桥接自身的键。桥接的 token/origin 是
 * 当前活动凭据而非遗留数据；早期实现每次启动都清除，导致跨域调试
 * 刷新后登录态丢失。遗留清理只对同源 Cookie 模式有意义。
 */
export function createWebCrossOriginBridgeStore(storage: KeyValueStorage | null, cookieReader: () => string): AuthTokenStore {
  return {
    platform: 'web',
    async getToken(origin: string) {
      const token = storage?.getItem(LEGACY_TOKEN_KEY) || null
      const bound = storage?.getItem(TOKEN_ORIGIN_KEY) || null
      if (!token || !bound) return null
      if (origin && bound !== origin) return null
      return token
    },
    async setToken(token: string, origin: string) {
      storage?.setItem(LEGACY_TOKEN_KEY, token)
      storage?.setItem(TOKEN_ORIGIN_KEY, origin)
    },
    async clearToken() {
      storage?.removeItem(LEGACY_TOKEN_KEY)
      storage?.removeItem(TOKEN_ORIGIN_KEY)
    },
    async getBoundOrigin() {
      return storage?.getItem(TOKEN_ORIGIN_KEY) || null
    },
    async getCsrfToken() {
      return readCookieValue(cookieReader(), CSRF_COOKIE_NAME)
    },
    async migrate() {
      // 桥接键是活动凭据：不清除（刷新/冷启动后恢复登录）
      return { clearedLegacyToken: false }
    },
  }
}

/* ———————————— 生产拒绝存储（P4-2A） ———————————— */

/**
 * 生产 Web 跨源组合的显式拒绝。
 *
 * 正式 Web 构建只支持同源部署（反向代理 + HttpOnly Cookie）。跨源
 * Web 需要另行设计 Cookie/CSRF/origin 策略，在此之前明确失败，
 * 绝不静默退化到明文 localStorage Bearer。
 */
export function createProductionRefusalStore(reason = '正式 Web 构建不支持跨源 API 部署：请使用同源反向代理 + HttpOnly Cookie。跨域 Web 需要另行设计的安全方案，当前构建明确拒绝。'): AuthTokenStore {
  return {
    platform: 'web',
    async getToken() {
      return null // 绝不提供明文 Bearer
    },
    async setToken() {
      throw new Error(reason)
    },
    async clearToken() {
      /* 无需清理：从未写入 */
    },
    async getBoundOrigin() {
      return null
    },
    async getCsrfToken() {
      return null
    },
    async migrate() {
      return { clearedLegacyToken: false }
    },
  }
}

/* ———————————— 存储选择（纯工厂，可单测） ———————————— */

export interface TokenStoreEnv {
  platform: Platform
  /** API Base 与页面源是否跨源 */
  crossOrigin: boolean
  /** 是否生产构建 */
  prod: boolean
}

export interface TokenStoreDeps {
  storage: KeyValueStorage | null
  cookieReader: () => string
  secure?: SecureStorageLike
}

/**
 * 按平台/部署/构建模式选择凭据存储。
 * - 原生：Keystore/Keychain 安全存储（生产拒绝明文回退）
 * - Web 同源：HttpOnly Cookie（本地零 token）
 * - Web 跨源 + 开发/测试：origin 绑定 Bearer 桥接
 * - Web 跨源 + 生产：显式拒绝（不写 localStorage）
 */
export function selectTokenStore(env: TokenStoreEnv, deps: TokenStoreDeps): AuthTokenStore {
  if (env.platform === 'native') {
    if (!deps.secure) {
      return createFallbackNativeStore(deps.storage, env.prod)
    }
    return createNativeTokenStore(deps.secure, { insecureFallback: deps.storage, prod: env.prod })
  }
  if (env.crossOrigin) {
    if (env.prod) {
      return createProductionRefusalStore()
    }
    return createWebCrossOriginBridgeStore(deps.storage, deps.cookieReader)
  }
  return createWebTokenStore(deps.storage, deps.cookieReader)
}

/* ———————————— 原生实现（Keystore/Keychain） ———————————— */

export interface SecureStorageLike {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

export function createNativeTokenStore(
  secure: SecureStorageLike,
  options: { insecureFallback?: KeyValueStorage | null; prod?: boolean } = {},
): AuthTokenStore {
  const fallbackAllowed = allowInsecureFallback({ prod: options.prod })
  return {
    platform: 'native',
    async getToken(origin: string) {
      const [token, bound] = await Promise.all([secure.get(SECURE_TOKEN_KEY), secure.get(SECURE_ORIGIN_KEY)])
      if (!token || !bound) return null
      // origin 绑定（P4-1A）：不匹配绝不外发
      if (origin && bound !== origin) return null
      return token
    },
    async setToken(token: string, origin: string) {
      await secure.set(SECURE_TOKEN_KEY, token)
      await secure.set(SECURE_ORIGIN_KEY, origin)
    },
    async clearToken() {
      await secure.remove(SECURE_TOKEN_KEY)
      await secure.remove(SECURE_ORIGIN_KEY)
    },
    async getBoundOrigin() {
      return secure.get(SECURE_ORIGIN_KEY)
    },
    async getCsrfToken() {
      return null // 原生 Bearer 认证无 CSRF 面
    },
    async migrate() {
      // 清理旧版明文 localStorage token
      const had = Boolean(options.insecureFallback?.getItem(LEGACY_TOKEN_KEY))
      options.insecureFallback?.removeItem(LEGACY_TOKEN_KEY)
      return { clearedLegacyToken: had }
    },
  }
}

/** 安全存储不可用时的显式降级（仅开发允许；生产抛错，不静默明文） */
export function createFallbackNativeStore(storage: KeyValueStorage | null, prod = false): AuthTokenStore {
  if (prod) {
    return {
      platform: 'native',
      async getToken() { throw new Error('安全存储不可用且为生产构建，拒绝明文回退') },
      async setToken() { throw new Error('安全存储不可用且为生产构建，拒绝明文回退') },
      async clearToken() { storage?.removeItem(LEGACY_TOKEN_KEY) },
      async getBoundOrigin() { return null },
      async getCsrfToken() { return null },
      async migrate() { const had = Boolean(storage?.getItem(LEGACY_TOKEN_KEY)); storage?.removeItem(LEGACY_TOKEN_KEY); return { clearedLegacyToken: had } },
    }
  }
  console.warn('[auth] 安全存储插件不可用，开发模式使用非安全回退存储 token（生产构建将拒绝）')
  return {
    platform: 'native',
    async getToken(origin: string) {
      const raw = storage?.getItem(LEGACY_TOKEN_KEY) || null
      const bound = storage?.getItem(SECURE_ORIGIN_KEY) || null
      if (!raw || !bound) return null
      if (origin && bound !== origin) return null
      return raw
    },
    async setToken(token: string, origin: string) {
      storage?.setItem(LEGACY_TOKEN_KEY, token)
      storage?.setItem(SECURE_ORIGIN_KEY, origin)
    },
    async clearToken() {
      storage?.removeItem(LEGACY_TOKEN_KEY)
      storage?.removeItem(SECURE_ORIGIN_KEY)
    },
    async getBoundOrigin() {
      return storage?.getItem(SECURE_ORIGIN_KEY) || null
    },
    async getCsrfToken() { return null },
    async migrate() { return { clearedLegacyToken: false } },
  }
}
