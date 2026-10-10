/**
 * API Base URL 解析（P1 Android 原型 · feat/mobile-v1）
 *
 * 优先级：localStorage 运行时覆盖 > 构建时环境变量 > 空值（相对路径）。
 * - 网页版：空值 → 相对 /api，走同域 Nginx 代理，行为与改造前完全一致。
 * - Capacitor App：必须配置绝对地址（如 https://yx.shushubiye.fun），
 *   因为 WebView 的源是 capacitor://localhost，相对路径会打到 App 自己。
 * - 原型阶段 token 存 localStorage（XSS 敞口），正式版需迁移到
 *   Capacitor Preferences + Keychain/Keystore 安全存储，已列入遗留问题。
 */

const STORAGE_KEY = 'edumind-api-base'

function readEnvBase(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL
  return typeof fromEnv === 'string' ? fromEnv.trim() : ''
}

function readStoredBase(): string {
  if (typeof window === 'undefined') return ''
  try {
    return (window.localStorage.getItem(STORAGE_KEY) || '').trim()
  } catch {
    return ''
  }
}

/** 当前生效的 API Base（'' 表示相对路径，仅网页版同源可用）。 */
export function getApiBase(): string {
  return readStoredBase() || readEnvBase()
}

/** 运行时切换 API Base（设置页用）；传空字符串恢复默认。 */
export function setApiBase(base: string): void {
  if (typeof window === 'undefined') return
  const value = (base || '').trim().replace(/\/+$/, '')
  if (value) {
    window.localStorage.setItem(STORAGE_KEY, value)
  } else {
    window.localStorage.removeItem(STORAGE_KEY)
  }
}

/** 默认 Base（构建时环境变量），用于设置页展示“恢复默认”。 */
export function getDefaultApiBase(): string {
  return readEnvBase()
}

/**
 * 把接口路径拼接为完整 URL。
 * base 为空时原样返回相对路径（网页版同源代理行为不变）。
 */
export function resolveApiUrl(path: string): string {
  const base = getApiBase()
  if (!base) return path
  return `${base.replace(/\/+$/, '')}${path}`
}

/** 当前是否运行在 Capacitor 原生容器里。 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.())
}

/**
 * 当前是否运行在 Mobile 入口（hash 路由的移动端应用，含原生容器与浏览器预览）。
 * 由 src/mobile/main.ts 启动时置位，供共享代码选择登录跳转方式。
 */
export function isMobileApp(): boolean {
  if (typeof window === 'undefined') return false
  return (window as unknown as { __EDUMIND_MOBILE__?: boolean }).__EDUMIND_MOBILE__ === true
}
