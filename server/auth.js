import crypto from 'node:crypto'

/**
 * 服务端会话管理（P0 认证改造 · feat/mobile-v1）
 *
 * 设计要点：
 * - 登录成功后签发随机 token（32 字节随机数，base64url），服务端内存存储，带 TTL。
 * - 双通道取用：httpOnly Cookie（Web 同源自动携带）+ Authorization: Bearer（Capacitor / 原生端）。
 * - accountId 一律由会话推导，客户端传的 accountId 不再被信任（见 server/index.js）。
 * - 会话目前为进程内存存储：重启后失效需重新登录。MySQL 持久化列为后续工作
 *   （当前阶段优先关闭"客户端自报身份"的越权面，存储持久化不放大该风险）。
 */

const DEFAULT_TTL_HOURS = 24 * 7

function ttlMs() {
  const hours = Number(process.env.SESSION_TTL_HOURS || DEFAULT_TTL_HOURS)
  if (!Number.isFinite(hours) || hours <= 0) return DEFAULT_TTL_HOURS * 3600 * 1000
  return hours * 3600 * 1000
}

/** token -> { account, role, displayName, createdAt, expiresAt } */
const sessions = new Map()

function purgeExpired() {
  const now = Date.now()
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token)
  }
}

export function createSession({ account, role, displayName }) {
  purgeExpired()
  const token = crypto.randomBytes(32).toString('base64url')
  const createdAt = Date.now()
  const session = {
    account: String(account),
    role,
    displayName: String(displayName || ''),
    createdAt,
    expiresAt: createdAt + ttlMs(),
  }
  sessions.set(token, session)
  return { token, session }
}

export function getSession(token) {
  if (!token) return null
  const session = sessions.get(token)
  if (!session) return null
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token)
    return null
  }
  return session
}

export function destroySession(token) {
  if (!token) return false
  return sessions.delete(token)
}

export function sessionCookieName() {
  return process.env.SESSION_COOKIE_NAME || 'edumind_session'
}

export function parseCookies(req) {
  const header = req.headers.cookie
  if (!header) return {}
  const cookies = {}
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    const key = part.slice(0, index).trim()
    if (!key) continue
    try {
      cookies[key] = decodeURIComponent(part.slice(index + 1).trim())
    } catch {
      cookies[key] = part.slice(index + 1).trim()
    }
  }
  return cookies
}

/** 优先 Bearer（Capacitor 原生端），其次 httpOnly Cookie（Web 端）。 */
export function extractToken(req) {
  const authorization = req.headers.authorization
  if (authorization && authorization.startsWith('Bearer ')) {
    const token = authorization.slice(7).trim()
    if (token) return token
  }
  return parseCookies(req)[sessionCookieName()] || null
}

export function buildSessionCookie(token, maxAgeMs) {
  const sameSite = process.env.SESSION_COOKIE_SAMESITE || 'Lax'
  const secure = process.env.SESSION_COOKIE_SECURE === 'true' ? '; Secure' : ''
  const maxAge = Math.max(0, Math.floor((maxAgeMs || 0) / 1000))
  return `${sessionCookieName()}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=${sameSite}${secure}`
}

export function clearSessionCookie() {
  return `${sessionCookieName()}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
}

/** 供测试使用：清空全部会话。 */
export function resetAllSessions() {
  sessions.clear()
}
