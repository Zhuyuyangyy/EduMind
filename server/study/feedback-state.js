/**
 * 反馈处理状态存储（P3.4 · feat/mobile-v1）
 *
 * 以 (accountId, sessionId) 为唯一业务键的持久化状态机：
 *   processing → completed（缓存结果，重复请求直接返回）
 *   processing → failed（可重试）
 *   processing（超过 STALE_MS 未推进）→ 可被接管（崩溃恢复）
 *
 * P3.4 加固：
 * 1. 完整状态契约：getFeedbackState 返回恢复所需的全部字段
 *    （profileAfterValues / pendingRevision / pathVersionAfter / partial）；
 * 2. CAS 接管 + fencing token（代际令牌）：接管用
 *    `UPDATE ... WHERE attempt = 读取值` 且校验受影响行数；所有后续
 *    状态变更都带 expectedAttempt，旧执行器（代际过期）不得提交；
 * 3. MySQL 与 JSON 对恢复字段采用同一契约，不静默丢弃任何字段。
 *
 * 单飞保证：
 * - MySQL：PRIMARY KEY(account_id, session_id) + INSERT 抢占 + CAS 接管；
 * - JSON：单文件读-改-写之间无 await，单进程内并发安全（不宣称多实例能力）。
 */

import fs from 'node:fs'
import path from 'node:path'

// 接管超时窗口读取（P4-0：调用时读取，避免模块加载后设置环境变量不生效）
function staleMs() {
  return Math.max(0, Number(process.env.ZHIXUE_FEEDBACK_STALE_MS || 60_000))
}

const EMPTY_STEPS = { profile: 'pending', path: 'pending', revision: 'pending' }

function emptyRecord(accountId, sessionId) {
  return {
    accountId,
    sessionId,
    status: 'processing',
    attempt: 1,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    result: null,
    steps: { ...EMPTY_STEPS },
    profileAfterValues: null,
    pendingRevision: null,
    pathVersionAfter: null,
    partial: {},
  }
}

/* ———————————— JSON 开发实现 ———————————— */

function jsonPath() {
  return process.env.ZHIXUE_DATA_FILE || 'store.json'
}

function readJsonState() {
  const filePath = jsonPath()
  if (!fs.existsSync(filePath)) return {}
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return parsed.studyFeedback && typeof parsed.studyFeedback === 'object' ? parsed.studyFeedback : {}
  } catch {
    return {}
  }
}

function writeJsonState(map) {
  const filePath = jsonPath()
  let full = {}
  if (fs.existsSync(filePath)) {
    try {
      full = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch {
      full = {}
    }
  }
  full.studyFeedback = map
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.fb.tmp`
  fs.writeFileSync(temporaryPath, JSON.stringify(full, null, 2), 'utf8')
  fs.renameSync(temporaryPath, filePath)
}

function jsonKey(accountId, sessionId) {
  return `${accountId}::${sessionId}`
}

/** JSON 抢占：读-判-写之间无 await，单进程内并发安全 */
function jsonClaim(accountId, sessionId) {
  const map = readJsonState()
  const key = jsonKey(accountId, sessionId)
  const existing = map[key]
  const now = Date.now()

  if (existing) {
    if (existing.status === 'completed') {
      return { status: 'completed', result: existing.result, attempt: existing.attempt }
    }
    const fresh = existing.status === 'processing' && now - new Date(existing.startedAt).getTime() < staleMs()
    if (fresh) {
      return { status: 'in-progress', attempt: existing.attempt }
    }
    // failed 或 stale → CAS 接管（attempt +1 即新 fencing token）
    const record = {
      ...existing,
      status: 'processing',
      attempt: (existing.attempt || 0) + 1,
      startedAt: new Date().toISOString(),
      error: null,
    }
    map[key] = record
    writeJsonState(map)
    return { status: 'claimed', attempt: record.attempt }
  }

  const record = emptyRecord(accountId, sessionId)
  map[key] = record
  writeJsonState(map)
  return { status: 'claimed', attempt: record.attempt }
}

/** JSON 变更：expectedAttempt 不匹配 → 旧执行器被拒绝（fencing） */
function jsonMutate(accountId, sessionId, expectedAttempt, mutate) {
  const map = readJsonState()
  const key = jsonKey(accountId, sessionId)
  const existing = map[key]
  if (!existing) return { ok: false, code: 'not-found' }
  if (Number.isInteger(expectedAttempt) && existing.attempt !== expectedAttempt) {
    return { ok: false, code: 'stale-executor' }
  }
  const next = mutate(existing)
  map[key] = next
  writeJsonState(map)
  return { ok: true, record: next }
}

function jsonGet(accountId, sessionId) {
  const record = readJsonState()[jsonKey(accountId, sessionId)]
  return record ? { ...record } : null
}

/* ———————————— MySQL 生产实现 ———————————— */

let mysqlSchemaReady = false

async function ensureMysqlSchema() {
  if (mysqlSchemaReady) return
  const { ensureMySqlSchema, getMySqlPool } = await import('../store/mysql.js')
  await ensureMySqlSchema()
  const db = getMySqlPool()
  await db.query(`
    CREATE TABLE IF NOT EXISTS study_feedback (
      account_id VARCHAR(191) NOT NULL,
      session_id VARCHAR(64) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'processing',
      attempt INT NOT NULL DEFAULT 1,
      started_at DATETIME(3) NOT NULL,
      finished_at DATETIME(3) NULL,
      error VARCHAR(500) NULL,
      result_json JSON NULL,
      steps_json JSON NOT NULL,
      profile_after_json JSON NULL,
      pending_revision_json JSON NULL,
      path_version_after INT NULL,
      partial_json JSON NOT NULL,
      PRIMARY KEY (account_id, session_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  // P4-0 迁移：P3-2.1 旧表补 P3.4 新增列（幂等；CREATE IF NOT EXISTS
  // 对已存在的表不会补列，必须显式 ALTER）
  for (const [column, definition] of [
    ['pending_revision_json', 'JSON NULL'],
    ['partial_json', "JSON NOT NULL"],
  ]) {
    try {
      await db.query(`ALTER TABLE study_feedback ADD COLUMN ${column} ${definition}`)
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME' && !/Duplicate column/i.test(error?.message || '')) throw error
    }
  }
  mysqlSchemaReady = true
}

function parseMaybe(value) {
  if (value == null) return null
  return typeof value === 'string' ? JSON.parse(value) : value
}

function rowToRecord(row) {
  return {
    accountId: row.account_id,
    sessionId: row.session_id,
    status: row.status,
    attempt: row.attempt,
    startedAt: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
    finishedAt: row.finished_at ? (row.finished_at instanceof Date ? row.finished_at.toISOString() : row.finished_at) : null,
    error: row.error,
    result: parseMaybe(row.result_json),
    steps: parseMaybe(row.steps_json) || { ...EMPTY_STEPS },
    profileAfterValues: parseMaybe(row.profile_after_json),
    pendingRevision: parseMaybe(row.pending_revision_json),
    pathVersionAfter: row.path_version_after,
    partial: parseMaybe(row.partial_json) || {},
  }
}

/** MySQL 抢占：INSERT；ER_DUP_ENTRY → 分类重读 */
async function mysqlClaim(accountId, sessionId) {
  const { getMySqlPool } = await import('../store/mysql.js')
  await ensureMysqlSchema()
  const db = getMySqlPool()
  const now = new Date()

  try {
    await db.query(
      `INSERT INTO study_feedback (account_id, session_id, status, attempt, started_at, steps_json, partial_json)
       VALUES (?, ?, 'processing', 1, ?, CAST(? AS JSON), CAST(? AS JSON))`,
      [accountId, sessionId, now, JSON.stringify(EMPTY_STEPS), JSON.stringify({})],
    )
    return { status: 'claimed', attempt: 1 }
  } catch (error) {
    const isDuplicate = error?.code === 'ER_DUP_ENTRY' || error?.code === 'ER_DUP_KEY'
    if (!isDuplicate) throw error
  }

  const [rows] = await db.query('SELECT * FROM study_feedback WHERE account_id = ? AND session_id = ?', [accountId, sessionId])
  const row = rows[0]
  if (!row) return { status: 'claimed', attempt: 1 }

  const startedAt = row.started_at instanceof Date ? row.started_at.getTime() : new Date(row.started_at).getTime()
  if (row.status === 'completed') {
    return { status: 'completed', result: parseMaybe(row.result_json), attempt: row.attempt }
  }
  const fresh = row.status === 'processing' && Date.now() - startedAt < staleMs()
  if (fresh) {
    return { status: 'in-progress', attempt: row.attempt }
  }

  // CAS 接管：仅当 attempt 仍为读取值时才接管；affectedRows=0 说明
  // 其他执行者已抢先 → 重新读取并让位
  const [result] = await db.query(
    `UPDATE study_feedback SET status = 'processing', attempt = attempt + 1, started_at = ?, error = NULL
     WHERE account_id = ? AND session_id = ? AND attempt = ?`,
    [new Date(), accountId, sessionId, row.attempt],
  )
  if (result.affectedRows !== 1) {
    const [rerun] = await db.query('SELECT * FROM study_feedback WHERE account_id = ? AND session_id = ?', [accountId, sessionId])
    const latest = rerun[0]
    if (latest?.status === 'completed') {
      return { status: 'completed', result: parseMaybe(latest.result_json), attempt: latest.attempt }
    }
    return { status: 'in-progress', attempt: latest?.attempt ?? row.attempt }
  }
  return { status: 'claimed', attempt: row.attempt + 1 }
}

/** MySQL 变更：expectedAttempt 不匹配 → 旧执行器被拒绝（fencing） */
async function mysqlMutate(accountId, sessionId, expectedAttempt, mutate) {
  const { getMySqlPool } = await import('../store/mysql.js')
  await ensureMysqlSchema()
  const db = getMySqlPool()

  const [rows] = await db.query('SELECT * FROM study_feedback WHERE account_id = ? AND session_id = ?', [accountId, sessionId])
  const row = rows[0]
  if (!row) return { ok: false, code: 'not-found' }
  if (Number.isInteger(expectedAttempt) && row.attempt !== expectedAttempt) {
    return { ok: false, code: 'stale-executor' }
  }

  const next = mutate(rowToRecord(row))
  // CAS 写入：attempt 仍是读取值才允许提交（行锁 + 代际双重保护）
  const [result] = await db.query(
    `UPDATE study_feedback SET status = ?, finished_at = ?, error = ?, result_json = CAST(? AS JSON),
     steps_json = CAST(? AS JSON), profile_after_json = CAST(? AS JSON), pending_revision_json = CAST(? AS JSON),
     path_version_after = ?, partial_json = CAST(? AS JSON)
     WHERE account_id = ? AND session_id = ? AND attempt = ?`,
    [
      next.status,
      next.finishedAt || null,
      next.error || null,
      JSON.stringify(next.result ?? null),
      JSON.stringify(next.steps),
      JSON.stringify(next.profileAfterValues ?? null),
      JSON.stringify(next.pendingRevision ?? null),
      next.pathVersionAfter ?? null,
      JSON.stringify(next.partial ?? {}),
      accountId,
      sessionId,
      row.attempt,
    ],
  )
  if (result.affectedRows !== 1) {
    return { ok: false, code: 'stale-executor' }
  }
  return { ok: true, record: next }
}

async function mysqlGet(accountId, sessionId) {
  const { getMySqlPool } = await import('../store/mysql.js')
  await ensureMysqlSchema()
  const db = getMySqlPool()
  const [rows] = await db.query('SELECT * FROM study_feedback WHERE account_id = ? AND session_id = ?', [accountId, sessionId])
  return rows[0] ? rowToRecord(rows[0]) : null
}

/* ———————————— 门面 ———————————— */

function useMysql() {
  return Boolean(process.env.MYSQL_URL || (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE))
}

export function claimFeedback(accountId, sessionId) {
  return useMysql() ? mysqlClaim(accountId, sessionId) : jsonClaim(accountId, sessionId)
}

/**
 * 变更状态。expectedAttempt 为 claim 返回的代际令牌；
 * 不匹配（旧执行器）时返回 { ok: false, code: 'stale-executor' } 且不写入。
 */
export function mutateFeedback(accountId, sessionId, expectedAttempt, mutate) {
  return useMysql()
    ? mysqlMutate(accountId, sessionId, expectedAttempt, mutate)
    : jsonMutate(accountId, sessionId, expectedAttempt, mutate)
}

/** 完整状态（含恢复字段），JSON 与 MySQL 契约一致 */
export function getFeedbackState(accountId, sessionId) {
  return useMysql() ? mysqlGet(accountId, sessionId) : jsonGet(accountId, sessionId)
}
