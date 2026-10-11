/**
 * 正式身份存储（P4-1A · feat/mobile-v1）
 *
 * - 密码哈希：Node scrypt（每账号独立盐值），禁明文/可逆存储；
 * - 双实现：JSON 文件（demo/开发）与 MySQL 表 identities（生产），
 *   契约一致；
 * - role/enabled/credentialVersion 只来自服务端记录，客户端提交的
 *   role 不是授权依据；
 * - 生产模式（ZHIXUE_ENV=production）没有身份存储时拒绝登录，
 *   不退化到任何内置演示身份。
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// RFC 7914「interactive」参数（N=16384, r=8, p=1 ≈ 16MB 工作区），
// 并显式 maxmem——部分 Node/OpenSSL 构建默认上限 32MB 会拒收更高参数。
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 32, maxmem: 64 * 1024 * 1024 }

/** 运行时模式：demo（默认，竞赛/开发）| test | production */
export function runtimeMode() {
  const explicit = (process.env.ZHIXUE_ENV || '').trim().toLowerCase()
  if (explicit === 'production' || explicit === 'prod') return 'production'
  if (explicit === 'test') return 'test'
  if (explicit === 'demo' || explicit === 'development' || explicit === 'dev') return 'demo'
  return process.env.NODE_ENV === 'production' ? 'production' : 'demo'
}

export function isProductionMode() {
  return runtimeMode() === 'production'
}

/* ———————————— 密码哈希 ———————————— */

export function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const derived = crypto.scryptSync(String(password), salt, SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: SCRYPT_PARAMS.maxmem,
  })
  return [
    'scrypt',
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$')
}

export function verifyPasswordHash(password, stored) {
  if (typeof stored !== 'string') return false
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, saltText, hashText] = parts
  try {
    const expected = Buffer.from(hashText, 'base64')
    const derived = crypto.scryptSync(String(password), Buffer.from(saltText, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: SCRYPT_PARAMS.maxmem,
    })
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

/* ———————————— 存储路径选择 ———————————— */

function useMysql() {
  return Boolean(process.env.MYSQL_URL || (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE))
}

function identityFilePath() {
  return process.env.ZHIXUE_IDENTITY_FILE
    ? path.resolve(process.env.ZHIXUE_IDENTITY_FILE)
    : path.resolve(process.cwd(), 'server/identities.json')
}

function normalizeIdentity(record) {
  return {
    accountId: record.accountId,
    account: record.account,
    role: record.role === 'admin' ? 'admin' : 'student',
    displayName: record.displayName || record.account,
    enabled: record.enabled !== false,
    credentialVersion: Number(record.credentialVersion) || 1,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt || record.createdAt,
  }
}

/* ———————————— JSON 实现 ———————————— */

function readIdentityFile() {
  const filePath = identityFilePath()
  if (!fs.existsSync(filePath)) return {}
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeIdentityFile(map) {
  const filePath = identityFilePath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(map, null, 2), 'utf8')
  fs.renameSync(temporary, filePath)
}

/* ———————————— MySQL 实现 ———————————— */

let mysqlSchemaReady = false

async function ensureIdentitySchema() {
  if (mysqlSchemaReady) return
  const { getMySqlPool } = await import('./store/mysql.js')
  const db = getMySqlPool()
  await db.query(`
    CREATE TABLE IF NOT EXISTS identities (
      account_id VARCHAR(191) NOT NULL PRIMARY KEY,
      account VARCHAR(191) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(16) NOT NULL DEFAULT 'student',
      display_name VARCHAR(128) NOT NULL DEFAULT '',
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      credential_version INT NOT NULL DEFAULT 1,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      UNIQUE KEY identities_account (account)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  mysqlSchemaReady = true
}

/* ———————————— 对外 API ———————————— */

/**
 * 创建正式账号。accountId 稳定唯一（等于 account）。
 * 生产模式必须走这里；demo 模式的内置演示账号与它并存。
 */
export async function createIdentity({ account, password, role = 'student', displayName = '' }) {
  const accountId = String(account || '').trim()
  if (!accountId || accountId.length > 64) throw new Error('账号应为 1-64 个字符')
  if (typeof password !== 'string' || password.length < 8) throw new Error('密码至少 8 位')
  const record = {
    accountId,
    account: accountId,
    passwordHash: hashPassword(password),
    role: role === 'admin' ? 'admin' : 'student',
    displayName: String(displayName || accountId),
    enabled: true,
    credentialVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  if (useMysql()) {
    await ensureIdentitySchema()
    const { getMySqlPool } = await import('./store/mysql.js')
    await getMySqlPool().query(
      `INSERT INTO identities (account_id, account, password_hash, role, display_name, enabled, credential_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)`,
      [record.accountId, record.account, record.passwordHash, record.role, record.displayName, new Date(record.createdAt), new Date(record.updatedAt)],
    )
    return normalizeIdentity(record)
  }

  const map = readIdentityFile()
  if (map[accountId]) throw new Error(`账号已存在: ${accountId}`)
  map[accountId] = record
  writeIdentityFile(map)
  return normalizeIdentity(record)
}

/** 查询身份（不含密码哈希）。生产认证只认这里。 */
export async function findIdentity(accountId) {
  const key = String(accountId || '').trim()
  if (!key) return null
  if (useMysql()) {
    await ensureIdentitySchema()
    const { getMySqlPool } = await import('./store/mysql.js')
    const [rows] = await getMySqlPool().query(
      'SELECT account_id, account, password_hash, role, display_name, enabled, credential_version, created_at, updated_at FROM identities WHERE account_id = ? OR account = ?',
      [key, key],
    )
    const row = rows[0]
    if (!row) return null
    return {
      ...normalizeIdentity({
        accountId: row.account_id,
        account: row.account,
        role: row.role,
        displayName: row.display_name,
        enabled: Boolean(row.enabled),
        credentialVersion: row.credential_version,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
      }),
      passwordHash: row.password_hash,
    }
  }
  const record = readIdentityFile()[key]
  if (!record) return null
  return { ...normalizeIdentity(record), passwordHash: record.passwordHash }
}

export async function verifyIdentityPassword(accountId, password) {
  const identity = await findIdentity(accountId)
  if (!identity || !identity.enabled) return false
  return verifyPasswordHash(password, identity.passwordHash)
}

export async function setIdentityEnabled(accountId, enabled) {
  if (useMysql()) {
    await ensureIdentitySchema()
    const { getMySqlPool } = await import('./store/mysql.js')
    await getMySqlPool().query('UPDATE identities SET enabled = ?, updated_at = ? WHERE account_id = ?', [enabled ? 1 : 0, new Date(), String(accountId)])
    return
  }
  const map = readIdentityFile()
  const record = map[String(accountId)]
  if (!record) return
  record.enabled = Boolean(enabled)
  record.updatedAt = new Date().toISOString()
  writeIdentityFile(map)
}

/** 凭据版本 +1：密码修改/管理员强制下线时使旧会话失效 */
export async function bumpCredentialVersion(accountId) {
  if (useMysql()) {
    await ensureIdentitySchema()
    const { getMySqlPool } = await import('./store/mysql.js')
    await getMySqlPool().query('UPDATE identities SET credential_version = credential_version + 1, updated_at = ? WHERE account_id = ?', [new Date(), String(accountId)])
    return
  }
  const map = readIdentityFile()
  const record = map[String(accountId)]
  if (!record) return
  record.credentialVersion = (Number(record.credentialVersion) || 1) + 1
  record.updatedAt = new Date().toISOString()
  writeIdentityFile(map)
}

/** 供测试/运维：清空 JSON 身份存储 */
export function resetIdentityStore() {
  if (!useMysql()) writeIdentityFile({})
}
