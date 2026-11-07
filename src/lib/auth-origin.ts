/**
 * 凭据 origin 绑定（P4-1A · feat/mobile-v1）
 *
 * 铁律：一份 Bearer token 只对签发它的 API origin 有效。
 * - 登录时把 token 与当前 API origin 一起存放；
 * - 取用 token 时校验当前 API origin——不匹配则视为未认证
 *   （绝不把 A 服务的 token 发往 B 服务）；
 * - 切换 API origin 必须先解除本地认证绑定，并尽力向旧服务
 *   发送撤销请求；
 * - 本模块不依赖浏览器 API / import.meta.env，可在 Node 下单测。
 */

export const TOKEN_KEY = 'edumind-auth-token'
export const TOKEN_ORIGIN_KEY = 'edumind-auth-token-origin'
export const SESSION_KEY = 'edumind-auth-session'

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** 取 URL 的 origin（非法输入返回 null） */
export function originOf(base: string): string | null {
  const value = (base || '').trim()
  if (!value) return null // 空 = 相对路径（同源），由调用方按当前页面源处理
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

/** 相对路径（空 base）时的等效 origin：当前页面源 */
export function effectiveOrigin(base: string, pageOrigin: string): string {
  return originOf(base) || pageOrigin || ''
}

/** 绑定 token 到 origin（登录/恢复登录时调用） */
export function bindToken(storage: KeyValueStorage, token: string, origin: string): void {
  storage.setItem(TOKEN_KEY, token)
  storage.setItem(TOKEN_ORIGIN_KEY, origin)
}

/**
 * 取当前 origin 可用的 token。
 * 绑定 origin 与当前 origin 不一致 → 返回 null（不泄露给其他服务）。
 */
export function getTokenForOrigin(storage: KeyValueStorage, currentOrigin: string): string | null {
  const token = storage.getItem(TOKEN_KEY)
  const bound = storage.getItem(TOKEN_ORIGIN_KEY)
  if (!token || !bound) return null
  if (!currentOrigin || bound !== currentOrigin) return null
  return token
}

/** 解除本地认证绑定（切 origin / 退出 / 会话失效） */
export function clearTokenBinding(storage: KeyValueStorage): void {
  storage.removeItem(TOKEN_KEY)
  storage.removeItem(TOKEN_ORIGIN_KEY)
  storage.removeItem(SESSION_KEY)
}

/** 绑定 origin 与目标 origin 是否不同（决定切换时是否必须解绑） */
export function isOriginChange(storage: KeyValueStorage, nextOrigin: string): boolean {
  const bound = storage.getItem(TOKEN_ORIGIN_KEY)
  if (!bound) return false // 没有绑定凭据，无所谓切换
  return Boolean(nextOrigin) && bound !== nextOrigin
}

/** 生产构建的可信 API 主机判断（不再把「任意 HTTPS」当可信） */
export function isTrustedApiBase(base: string, options: { allowlist?: string[]; buildTimeBase?: string } = {}): { ok: boolean; error?: string } {
  const value = (base || '').trim().replace(/\/+$/, '')
  if (!value) return { ok: true } // 相对路径（同源部署）
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { ok: false, error: '不是合法的 URL' }
  }
  if (url.protocol !== 'https:') {
    return { ok: false, error: '正式版本只允许 HTTPS 地址（明文 HTTP 会暴露登录凭据）' }
  }
  const allowlist = new Set((options.allowlist || []).map(item => item.trim()).filter(Boolean))
  if (options.buildTimeBase) {
    try {
      allowlist.add(new URL(options.buildTimeBase).host)
    } catch {
      /* ignore */
    }
  }
  if (allowlist.size === 0) {
    return { ok: false, error: '未配置可信 API 主机白名单（VITE_ALLOWED_API_HOSTS），拒绝任意地址' }
  }
  if (!allowlist.has(url.host)) {
    return { ok: false, error: `该 API 主机不在可信白名单内（已配置 ${allowlist.size} 个）` }
  }
  return { ok: true }
}
