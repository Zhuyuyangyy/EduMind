/**
 * API Base URL 解析（P1 Android 原型 · feat/mobile-v1）
 *
 * 优先级：localStorage 运行时覆盖 > 构建时环境变量 > 空值（相对路径）。
 * - 网页版：空值 → 相对 /api，走同域 Nginx 代理，行为与改造前完全一致。
 * - Capacitor App：必须配置绝对地址（如 https://yx.shushubiye.fun），
 *   因为 WebView 的源是 capacitor://localhost，相对路径会打到 App 自己。
 * - P4-1A：token 与 API origin 绑定（见 auth-origin.ts），切换 origin
 *   必须先解绑并要求重新登录；生产构建仅接受可信主机白名单。
 */

import { isTrustedApiBase } from './auth-origin'

const STORAGE_KEY = 'edumind-api-base'

function isDev(): boolean {
  return import.meta.env.DEV === true
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}

/**
 * 校验 API Base 地址（P1.5 安全加固 + P4-1A origin 绑定）。
 * 规则：
 * - 必须是合法的 http/https URL 且有主机名；
 * - 开发构建：http 仅限 localhost/127.0.0.1，其余必须 https；
 * - 正式构建（PROD）：只允许 https，且主机必须在可信白名单内
 *   （VITE_ALLOWED_API_HOSTS 或构建时 VITE_API_BASE_URL 的主机）——
 *   「任意合法 HTTPS」不再视为可信（审计 P0：切换 API 地址可能把
 *   旧服务的 Bearer token 发给不可信新服务）。
 */
export function validateApiBase(base: string): { ok: boolean; error?: string } {
  const value = (base || '').trim().replace(/\/+$/, '')
  if (!value) return { ok: true } // 空值 = 相对路径（仅网页版同源可用），合法
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { ok: false, error: '不是合法的 URL（示例：https://yx.shushubiye.fun）' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: '只支持 http:// 或 https:// 协议' }
  }
  if (!url.hostname) {
    return { ok: false, error: '缺少主机名' }
  }
  if (!isDev()) {
    // P4-1A：生产走可信白名单（见 auth-origin.isTrustedApiBase）
    const allowlist = String(import.meta.env.VITE_ALLOWED_API_HOSTS || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
    const check = isTrustedApiBase(value, { allowlist, buildTimeBase: readEnvBase() })
    if (!check.ok) return { ok: false, error: check.error }
    return { ok: true }
  }
  if (url.protocol === 'http:' && !isLocalHost(url.hostname)) {
    return { ok: false, error: '开发版本仅允许 http://localhost 或 http://127.0.0.1，其他地址请用 HTTPS' }
  }
  return { ok: true }
}

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

/** 运行时切换 API Base（设置页用）；传空字符串恢复默认。校验失败抛错，不落盘。 */
export function setApiBase(base: string): void {
  const value = (base || '').trim().replace(/\/+$/, '')
  const check = validateApiBase(value)
  if (!check.ok) {
    throw new Error(check.error || 'API 地址不合法')
  }
  if (typeof window === 'undefined') return
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
