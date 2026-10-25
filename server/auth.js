/**
 * 服务端会话管理（P4-1B 持久化 · feat/mobile-v1）
 *
 * 设计要点：
 * - 登录成功后签发高熵不透明 token（32 字节随机数，base64url）。
 *   存储侧只保留 token 的 SHA-256 哈希；原始 token 仅在签发时返回。
 * - 双通道取用：Authorization: Bearer（Capacitor / 原生端）+
 *   httpOnly Cookie（Web 同源自动携带）。
 * - 持久化：JSON 文件（demo/开发）与 MySQL auth_sessions 表（生产），
 *   契约一致。服务重启、多进程共享、退出撤销均以存储为准。
 * - accountId/role 一律由会话推导，客户端自报不是授权依据。
 * - 存储不可达时 fail-closed：生产模式拒绝会话，绝不放行。
 *
 * 异步边界：createSession / getSession / destroySession 均为 async。
 * 调用方必须 await——认证门禁集中在 server/index.js 的单一位置，
 * 业务代码通过 req.session 同步读取，不受影响。
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_TTL_HOURS = 24 * 7

function ttlMs() {
  const hours = Number(process.env.SESSION_TTL_HOURS || DEFAULT_TTL_HOURS)
  if (!Number.isFinite(hours) || hours <= 0) return DEFAULT_TTL_HOURS * 3600 * 1000
  return hours * 3600 * 1000
}

function useMysql() {
  return Boolean(process.env.MYSQL_URL || (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE))
}

function isProduction() {
  const explicit = (process.env.ZHIXUE_ENV || '').trim().toLowerCase()
  if (explicit === 'production' || explicit === 'prod') return true
  if (explicit === 'demo' || explicit === 'test' || explicit === 'development' || explicit === 'dev') return false
  return process.env.NODE_ENV === 'production'
}

/** token 哈希（不可逆；存储与查询都以此为准） */
export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

/* ———————————— JSON 持久实现 ———————————— */

function sessionFilePath() {
  return process.env.ZHIXUE_SESSION_FILE
    ? path.resolve(process.env.ZHIXUE_SESSION_FILE)
    : path.resolve(process.cwd(), 'server/sessions.json')
}

function readSessionFile() {
  const filePath = sessionFilePath()
  if (!fs.existsSync(filePath)) return {}
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeSessionFile(map) {
  const filePath = sessionFilePath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(map, null, 2), 'utf8')
  fs.renameSync(temporary, filePath)
}

function purgeExpiredJson(map) {
  const now = Date.now()
  let changed = false
  for (const [key, session] of Object.entries(map)) {
    if (session.expiresAt <= now || session.revokedAt) {
      delete map[key]
      changed = true
    }
  }
  return changed
}

/* ———————————— MySQL 持久实现 ———————————— */

let mysqlSchemaReady = false

async function ensureSessionSchema() {
  if (mysqlSchemaReady) return
  const { getMySqlPool } = await import('./store/mysql.js')
  const db = getMySqlPool()
  await db.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash CHAR(64) NOT NULL PRIMARY KEY,
      account_id VARCHAR(191) NOT NULL,
      role VARCHAR(16) NOT NULL DEFAULT 'student',
      display_name VARCHAR(128) NOT NULL DEFAULT '',
      created_at DATETIME(3) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      revoked_at DATETIME(3) NULL,
      last_used_at DATETIME(3) NULL,
      device_type VARCHAR(32) NULL,
      credential_version INT NOT NULL DEFAULT 1,
      KEY auth_sessions_account (account_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  mysqlSchemaReady = true
}

/* ———————————— 对外 API ———————————— */

/**
 * 签发会话。返回 { token, session }——token 只在此时可见，
 * 持久化仅保存其哈希。
 */
export async function createSession({ account, role, displayName, deviceType }) {
  const token = crypto.randomBytes(32).toString('base64url')
  const tokenHash = hashToken(token)
  const createdAt = Date.now()
  const session = {
    account: String(account),
    role,
    displayName: String(displayName || ''),
    createdAt,
    expiresAt: createdAt + ttlMs(),
    credentialVersion: 1,
    deviceType: deviceType ? String(deviceType).slice(0, 32) : null,
  }

  if (useMysql()) {
    await ensureSessionSchema()
    const { getMySqlPool } = await import('./store/mysql.js')
    await getMySqlPool().query(
      `INSERT INTO auth_sessions (token_hash, account_id, role, display_name, created_at, expires_at, device_type, credential_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tokenHash, session.account, session.role, session.displayName, new Date(createdAt), new Date(session.expiresAt), session.deviceType, 1],
    )
  } else {
    const map = readSessionFile()
    purgeExpiredJson(map)
    map[tokenHash] = session
    writeSessionFile(map)
  }

  return { token, session }
}

/**
 * 校验会话。
 *
 * P4-1B：每次都查持久存储（权威）——不用进程内缓存作为放行依据。
 * 原因：退出撤销、禁用账号、凭据升级可能发生在其他进程；缓存命中
 * 会让「立即撤销」跨进程失效（实测复现：B 撤销后 A 仍 200）。
 * JSON 模式为一次文件读，MySQL 模式为一次主键查询，代价可接受。
 * 存储不可达时 fail-closed：返回 null（生产尤其不能放行）。
 */
export async function getSession(token) {
  if (!token) return null

  const tokenHash = hashToken(token)
  try {
    const { findIdentity, isProductionMode } = await import('./identity.js')
    if (useMysql()) {
      await ensureSessionSchema()
      const { getMySqlPool } = await import('./store/mysql.js')
      const [rows] = await getMySqlPool().query(
        'SELECT * FROM auth_sessions WHERE token_hash = ?',
        [tokenHash],
      )
      const row = rows[0]
      if (!row) return null
      if (row.revoked_at) return null
      const expiresAt = row.expires_at instanceof Date ? row.expires_at.getTime() : new Date(row.expires_at).getTime()
      if (expiresAt <= Date.now()) return null
      // 身份校验（每次实时查询，不用缓存）：
      // - 账号被禁用 → 会话失效
      // - 凭据版本递增（改密/强制下线）→ 旧会话失效
      // - 正式身份已被删除 → 生产模式会话失效（demo 模式保留演示账号兼容）
      // - role 实时取自身份记录：权限降级不依赖凭据版本递增即生效
      const identity = await findIdentity(row.account_id)
      if (identity) {
        if (!identity.enabled) return null
        if ((Number(identity.credentialVersion) || 1) > (Number(row.credential_version) || 1)) return null
      } else if (isProductionMode()) {
        return null
      }
      return {
        account: row.account_id,
        role: identity ? identity.role : row.role,
        displayName: identity ? (identity.displayName || row.display_name) : row.display_name,
        createdAt: row.created_at instanceof Date ? row.created_at.getTime() : new Date(row.created_at).getTime(),
        expiresAt,
        credentialVersion: Number(row.credential_version) || 1,
      }
    }

    const map = readSessionFile()
    const session = map[tokenHash]
    if (!session) return null
    if (session.revokedAt || session.expiresAt <= Date.now()) return null
    const identity = await findIdentity(session.account)
    if (identity) {
      if (!identity.enabled) return null
      if ((Number(identity.credentialVersion) || 1) > (Number(session.credentialVersion) || 1)) return null
    } else if (isProductionMode()) {
      return null
    }
    // role 实时取自身份记录（演示账号无身份记录时沿用会话内角色）
    return identity ? { ...session, role: identity.role, displayName: identity.displayName || session.displayName } : session
  } catch {
    // fail-closed：存储不可达不视为已认证
    return null
  }
}

/** 撤销会话（退出登录 / 管理员强制下线） */
export async function destroySession(token) {
  if (!token) return false
  const tokenHash = hashToken(token)
  try {
    if (useMysql()) {
      await ensureSessionSchema()
      const { getMySqlPool } = await import('./store/mysql.js')
      const [result] = await getMySqlPool().query(
        'UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL',
        [new Date(), tokenHash],
      )
      return result.affectedRows > 0
    }
    const map = readSessionFile()
    if (!map[tokenHash]) return false
    map[tokenHash].revokedAt = Date.now()
    writeSessionFile(map)
    return true
  } catch {
    return false
  }
}

export function sessionCookieName() {
  return process.env.SESSION_COOKIE_NAME || 'edumind_session'
}

/* ———————————— P4-1C CSRF（双提交） ———————————— */

export function csrfCookieName() {
  return process.env.CSRF_COOKIE_NAME || 'edumind_csrf'
}

export function generateCsrfToken() {
  return crypto.randomBytes(24).toString('base64url')
}

/**
 * CSRF Cookie：必须可被 JS 读取（双提交模式），故不设 HttpOnly；
 * 仅用于比对请求头，不承载认证信息。
 */
export function buildCsrfCookie(token, options = {}) {
  const crossOrigin = Boolean(options.crossOrigin)
  const sameSite = crossOrigin ? 'None' : (process.env.SESSION_COOKIE_SAMESITE || 'Lax')
  const secure = crossOrigin || isProduction() || process.env.SESSION_COOKIE_SECURE === 'true' ? '; Secure' : ''
  return `${csrfCookieName()}=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.floor(ttlMs() / 1000)}; SameSite=${sameSite}${secure}`
}

/** 请求是否跨源（Origin 存在且与 Host 不同） */
export function isCrossOriginRequest(req) {
  const origin = req.headers.origin
  if (!origin) return false
  try {
    return new URL(origin).host !== String(req.headers.host || '')
  } catch {
    return false
  }
}

export function clearCsrfCookie() {
  const secure = isProduction() ? '; Secure' : ''
  return `${csrfCookieName()}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
}

/** 请求是否携带 CSRF 头且与 Cookie 中的值一致（timingSafeEqual） */
export function verifyCsrf(req) {
  const header = String(req.headers['x-csrf-token'] || '')
  const cookie = parseCookies(req)[csrfCookieName()]
  if (!header || !cookie) return false
  const a = Buffer.from(header)
  const b = Buffer.from(String(cookie))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** 状态修改方法（CSRF 只对这些有义） */
export function isStateChangingMethod(method) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase())
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

export function buildSessionCookie(token, maxAgeMs, options = {}) {
  // P4-1C：跨源部署（Capacitor/分离前后端）必须 SameSite=None 才能
  // 随 XHR 携带；同源部署用 Lax（CSRF 面更小）。Secure 在跨源时必需
  // （浏览器要求），同源时按显式配置。
  const crossOrigin = Boolean(options.crossOrigin)
  const sameSite = crossOrigin ? 'None' : (process.env.SESSION_COOKIE_SAMESITE || 'Lax')
  const secure = crossOrigin || isProduction() || process.env.SESSION_COOKIE_SECURE === 'true' ? '; Secure' : ''
  const maxAge = Math.max(0, Math.floor((maxAgeMs || 0) / 1000))
  return `${sessionCookieName()}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=${sameSite}${secure}`
}

export function clearSessionCookie() {
  const secure = isProduction() ? '; Secure' : ''
  return `${sessionCookieName()}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`
}

/** 供测试使用：清空进程内缓存与 JSON 持久会话。 */
export function resetAllSessions() {
  if (!useMysql()) writeSessionFile({})
}
