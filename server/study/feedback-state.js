/**
 * 反馈处理状态存储（P3-2.1 · feat/mobile-v1）
 *
 * 以 (accountId, sessionId) 为唯一业务键的持久化状态机：
 *   processing → completed（缓存结果，重复请求直接返回）
 *   processing → failed（可重试）
 *   processing（超过 STALE_MS 未推进）→ 可被接管（崩溃恢复）
 *
 * 单飞保证：
 * - MySQL：UNIQUE(account_id, session_id) + INSERT 抢占，ER_DUP_ENTRY 者
 *   重新读取状态（不用进程内 Set）；
 * - JSON：单文件读-改-写之间无 await，单进程内并发安全；不宣称多实例能力。
 *
 * LLM 调用不持有任何数据库事务（见 index.js feedback 端点流程）。
 */

const STALE_MS = 60_000

/* ———————————— JSON 开发实现 ———————————— */

import fs from 'node:fs'
import path from 'node:path'

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

function jsonClaim(accountId, sessionId) {
  const map = readJsonState()
  const key = jsonKey(accountId, sessionId)
  const existing = map[key]
  const now = Date.now()

  if (existing) {
    if (existing.status === 'completed') {
      return { status: 'completed', result: existing.result, attempt: existing.attempt }
    }
    if (existing.status === 'processing' && now - new Date(existing.startedAt).getTime() < STALE_MS) {
      return { status: 'in-progress', attempt: existing.attempt }
    }
    // failed 或 stale processing → 接管
    const record = {
      ...existing,
      status: 'processing',
      attempt: (existing.attempt || 0) + 1,
      startedAt: new Date().toISOString(),
      error: null,
    }
    map[key] = record
    writeJsonState(map)
    return { status: 'claimed', attempt: record.attempt, steps: record.steps }
  }

  const record = {
    accountId,
    sessionId,
    status: 'processing',
    attempt: 1,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    result: null,
    steps: { profile: 'pending', path: 'pending', revision: 'pending' },
    profileAfterValues: null,
    pathVersionAfter: null,
  }
  map[key] = record
  writeJsonState(map)
  return { status: 'claimed', attempt: 1, steps: record.steps }
}

function jsonMutate(accountId, sessionId, mutate) {
  const map = readJsonState()
  const key = jsonKey(accountId, sessionId)
  const existing = map[key]
  if (!existing) return null
  const next = mutate(existing)
  map[key] = next
  writeJsonState(map)
  return next
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
      path_version_after INT NULL,
      PRIMARY KEY (account_id, session_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  mysqlSchemaReady = true
}

async function mysqlClaim(accountId, sessionId) {
  const { getMySqlPool } = await import('../store/mysql.js')
  await ensureMysqlSchema()
  const db = getMySqlPool()
  const now = new Date()

  try {
    // 抢占插入：并发下只有一个请求成功
    await db.query(
      `INSERT INTO study_feedback (account_id, session_id, status, attempt, started_at, steps_json)
       VALUES (?, ?, 'processing', 1, ?, CAST(? AS JSON))`,
      [accountId, sessionId, now, JSON.stringify({ profile: 'pending', path: 'pending', revision: 'pending' })],
    )
    return { status: 'claimed', attempt: 1, steps: { profile: 'pending', path: 'pending', revision: 'pending' } }
  } catch (error) {
    const isDuplicate = error?.code === 'ER_DUP_ENTRY' || error?.code === 'ER_DUP_KEY'
    if (!isDuplicate) throw error
  }

  // 抢占失败：读取现状并分类
  const [rows] = await db.query('SELECT * FROM study_feedback WHERE account_id = ? AND session_id = ?', [accountId, sessionId])
  const row = rows[0]
  if (!row) return { status: 'claimed', attempt: 1, steps: { profile: 'pending', path: 'pending', revision: 'pending' } }

  const startedAt = row.started_at instanceof Date ? row.started_at.getTime() : new Date(row.started_at).getTime()
  const fresh = row.status === 'processing' && Date.now() - startedAt < STALE_MS
  if (row.status === 'completed') {
    return {
      status: 'completed',
      result: row.result_json ? (typeof row.result_json === 'string' ? JSON.parse(row.result_json) : row.result_json) : null,
      attempt: row.attempt,
    }
  }
  if (fresh) {
    return { status: 'in-progress', attempt: row.attempt }
  }

  // failed 或 stale → 接管（行锁语义由主键 UPDATE 保证）
  await db.query(
    `UPDATE study_feedback SET status = 'processing', attempt = attempt + 1, started_at = ?, error = NULL
     WHERE account_id = ? AND session_id = ?`,
    [new Date(), accountId, sessionId],
  )
  const steps = typeof row.steps_json === 'string' ? JSON.parse(row.steps_json) : row.steps_json
  return { status: 'claimed', attempt: (row.attempt || 0) + 1, steps }
}

async function mysqlMutate(accountId, sessionId, mutate) {
  const { getMySqlPool } = await import('../store/mysql.js')
  await ensureMysqlSchema()
  const db = getMySqlPool()
  const [rows] = await db.query('SELECT * FROM study_feedback WHERE account_id = ? AND session_id = ?', [accountId, sessionId])
  const row = rows[0]
  if (!row) return null
  const current = {
    accountId: row.account_id,
    sessionId: row.session_id,
    status: row.status,
    attempt: row.attempt,
    steps: typeof row.steps_json === 'string' ? JSON.parse(row.steps_json) : row.steps_json,
    profileAfterValues: row.profile_after_json ? (typeof row.profile_after_json === 'string' ? JSON.parse(row.profile_after_json) : row.profile_after_json) : null,
    pathVersionAfter: row.path_version_after,
    result: row.result_json ? (typeof row.result_json === 'string' ? JSON.parse(row.result_json) : row.result_json) : null,
  }
  const next = mutate(current)
  await db.query(
    `UPDATE study_feedback SET status = ?, attempt = ?, finished_at = ?, error = ?, result_json = CAST(? AS JSON),
     steps_json = CAST(? AS JSON), profile_after_json = CAST(? AS JSON), path_version_after = ?
     WHERE account_id = ? AND session_id = ?`,
    [
      next.status,
      next.attempt,
      next.finishedAt || null,
      next.error || null,
      JSON.stringify(next.result ?? null),
      JSON.stringify(next.steps),
      JSON.stringify(next.profileAfterValues ?? null),
      next.pathVersionAfter ?? null,
      accountId,
      sessionId,
    ],
  )
  return next
}

/* ———————————— 门面 ———————————— */

function useMysql() {
  return Boolean(process.env.MYSQL_URL || (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE))
}

export function claimFeedback(accountId, sessionId) {
  return useMysql() ? mysqlClaim(accountId, sessionId) : jsonClaim(accountId, sessionId)
}

export function mutateFeedback(accountId, sessionId, mutate) {
  return useMysql() ? mysqlMutate(accountId, sessionId, mutate) : jsonMutate(accountId, sessionId, mutate)
}

export function getFeedbackState(accountId, sessionId) {
  if (useMysql()) {
    return (async () => {
      const { getMySqlPool } = await import('../store/mysql.js')
      await ensureMysqlSchema()
      const db = getMySqlPool()
      const [rows] = await db.query('SELECT * FROM study_feedback WHERE account_id = ? AND session_id = ?', [accountId, sessionId])
      const row = rows[0]
      if (!row) return null
      return {
        status: row.status,
        attempt: row.attempt,
        steps: typeof row.steps_json === 'string' ? JSON.parse(row.steps_json) : row.steps_json,
        result: row.result_json ? (typeof row.result_json === 'string' ? JSON.parse(row.result_json) : row.result_json) : null,
      }
    })()
  }
  const map = readJsonState()
  const record = map[jsonKey(accountId, sessionId)]
  return record ? { status: record.status, attempt: record.attempt, steps: record.steps, result: record.result } : null
}
