/**
 * 学习事件存储（P3-1 · feat/mobile-v1）——MySQL 生产模式。
 * 事务 + 唯一约束保证：重复/并发提交不重复计分；账号越权不可见。
 */
import {
  isMySqlConfigured,
  getMySqlPool,
  ensureMySqlSchema,
} from '../store/mysql.js'
import { loadExerciseBank, findExercise } from './exercise-bank.js'
import { scoreAnswer, summarizeAttempts } from './scoring.js'

let studySchemaReady = false

export async function ensureStudySchema() {
  if (studySchemaReady) return
  await ensureMySqlSchema()
  const db = getMySqlPool()
  await db.query(`
    CREATE TABLE IF NOT EXISTS study_sessions (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      account_id VARCHAR(191) NOT NULL,
      topic_id VARCHAR(191) NULL,
      phase_id VARCHAR(191) NULL,
      timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      exercise_ids JSON NOT NULL,
      created_at DATETIME(3) NOT NULL,
      completed_at DATETIME(3) NULL,
      KEY study_sessions_account (account_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  await db.query(`
    CREATE TABLE IF NOT EXISTS answer_submissions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      session_id VARCHAR(64) NOT NULL,
      account_id VARCHAR(191) NOT NULL,
      exercise_id VARCHAR(191) NOT NULL,
      exercise_version INT NOT NULL,
      correct TINYINT(1) NOT NULL,
      reason VARCHAR(255) NOT NULL DEFAULT '',
      idempotency_key VARCHAR(191) NOT NULL,
      submitted_at DATETIME(3) NOT NULL,
      UNIQUE KEY answer_submissions_idem (idempotency_key),
      UNIQUE KEY answer_submissions_session_exercise (session_id, exercise_id),
      KEY answer_submissions_account (account_id, submitted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  await db.query(`
    CREATE TABLE IF NOT EXISTS learning_events (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      account_id VARCHAR(191) NOT NULL,
      session_id VARCHAR(64) NULL,
      type VARCHAR(64) NOT NULL,
      ref_json JSON NOT NULL,
      at DATETIME(3) NOT NULL,
      KEY learning_events_account (account_id, at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  await db.query(`
    CREATE TABLE IF NOT EXISTS profile_revisions (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      account_id VARCHAR(191) NOT NULL,
      event_ids JSON NOT NULL,
      before_json JSON NULL,
      after_json JSON NULL,
      reason VARCHAR(500) NOT NULL DEFAULT '',
      source VARCHAR(16) NOT NULL DEFAULT 'rule',
      version INT NOT NULL DEFAULT 1,
      created_at DATETIME(3) NOT NULL,
      KEY profile_revisions_account (account_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  studySchemaReady = true
}

function nowIso() {
  return new Date().toISOString()
}

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function publicSession(row) {
  return {
    id: row.id,
    topicId: row.topic_id,
    phaseId: row.phase_id,
    status: row.status,
    exerciseIds: typeof row.exercise_ids === 'string' ? JSON.parse(row.exercise_ids) : row.exercise_ids,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    completedAt: row.completed_at ? (row.completed_at instanceof Date ? row.completed_at.toISOString() : row.completed_at) : null,
    timezone: row.timezone,
  }
}

function stripAnswer(exercise) {
  const { answer, explanation, ...rest } = exercise
  return rest
}

export async function createStudySession(accountId, { topicId, phaseId, timezone, exerciseCount } = {}) {
  await ensureStudySchema()
  const bank = loadExerciseBank()
  let exercises = bank.exercises.filter(item => item.topicId === topicId)
  if (exercises.length === 0) {
    return { error: 'no-exercises', message: `题库中暂无 topicId=${topicId} 的题目` }
  }
  if (Number.isInteger(exerciseCount) && exerciseCount > 0) {
    exercises = exercises.slice(0, exerciseCount)
  }

  const session = {
    id: newId('session'),
    accountId,
    topicId: topicId || null,
    phaseId: phaseId || null,
    timezone: timezone || 'Asia/Shanghai',
    status: 'active',
    exerciseIds: exercises.map(item => item.id),
    createdAt: nowIso(),
    completedAt: null,
  }
  const db = getMySqlPool()
  await db.query(
    `INSERT INTO study_sessions (id, account_id, topic_id, phase_id, timezone, status, exercise_ids, created_at)
     VALUES (?, ?, ?, ?, ?, 'active', CAST(? AS JSON), ?)`,
    [session.id, accountId, session.topicId, session.phaseId, session.timezone, JSON.stringify(session.exerciseIds), session.createdAt],
  )
  await db.query(
    `INSERT INTO learning_events (id, account_id, session_id, type, ref_json, at) VALUES (?, ?, ?, 'session-start', CAST(? AS JSON), ?)`,
    [newId('event'), accountId, session.id, JSON.stringify({ topicId: session.topicId }), nowIso()],
  )
  return { session: publicSession({ ...session, created_at: session.createdAt, completed_at: null }), exercises: exercises.map(stripAnswer) }
}

async function loadSession(db, accountId, sessionId) {
  const [rows] = await db.query('SELECT * FROM study_sessions WHERE id = ?', [sessionId])
  const row = rows[0]
  if (!row || row.account_id !== accountId) return null
  return row
}

export async function getStudySession(accountId, sessionId) {
  await ensureStudySchema()
  const db = getMySqlPool()
  const row = await loadSession(db, accountId, sessionId)
  if (!row) return null
  const [attempts] = await db.query(
    'SELECT exercise_id, exercise_version, correct, reason, submitted_at FROM answer_submissions WHERE session_id = ? ORDER BY id',
    [sessionId],
  )
  return {
    session: publicSession(row),
    attempts: attempts.map(a => ({
      exerciseId: a.exercise_id,
      exerciseVersion: a.exercise_version,
      correct: Boolean(a.correct),
      reason: a.reason,
      submittedAt: a.submitted_at instanceof Date ? a.submitted_at.toISOString() : a.submitted_at,
    })),
  }
}

export async function recordAnswer(accountId, sessionId, { exerciseId, submitted, idempotencyKey } = {}) {
  await ensureStudySchema()
  const db = getMySqlPool()

  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 8) {
    return { ok: false, code: 'invalid-idempotency-key', message: '缺少合法的幂等键（>=8 字符）' }
  }

  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()

    const row = await loadSession(connection, accountId, sessionId)
    if (!row) {
      await connection.rollback()
      return { ok: false, code: 'session-not-found', message: '会话不存在或不属于当前账号' }
    }
    if (row.status !== 'active') {
      await connection.rollback()
      return { ok: false, code: 'session-closed', message: '会话已结束，不能继续作答' }
    }

    // 幂等 1：幂等键已存在 → 返回首次结果
    const [byKey] = await connection.query(
      'SELECT exercise_id, correct, reason FROM answer_submissions WHERE idempotency_key = ?',
      [idempotencyKey],
    )
    if (byKey[0] && byKey[0].exercise_id === exerciseId) {
      await connection.commit()
      return { ok: true, correct: Boolean(byKey[0].correct), reason: byKey[0].reason, duplicate: true, ...(await progressOf(connection, sessionId)) }
    }

    const exercise = findExercise(exerciseId)
    if (!exercise) {
      await connection.rollback()
      return { ok: false, code: 'invalid-exercise', message: `题目不存在: ${exerciseId}` }
    }
    const exerciseIds = typeof row.exercise_ids === 'string' ? JSON.parse(row.exercise_ids) : row.exercise_ids
    if (!exerciseIds.includes(exerciseId)) {
      await connection.rollback()
      return { ok: false, code: 'exercise-not-in-session', message: '该题目不属于本会话' }
    }

    // 幂等 2：同会话同题已评分 → 不重复插入（唯一约束兜底）
    const [byExercise] = await connection.query(
      'SELECT correct, reason FROM answer_submissions WHERE session_id = ? AND exercise_id = ?',
      [sessionId, exerciseId],
    )
    if (byExercise[0]) {
      await connection.query(
        `INSERT INTO learning_events (id, account_id, session_id, type, ref_json, at) VALUES (?, ?, ?, 'answer-duplicate', CAST(? AS JSON), ?)`,
        [newId('event'), accountId, sessionId, JSON.stringify({ exerciseId }), nowIso()],
      )
      await connection.commit()
      return { ok: true, correct: Boolean(byExercise[0].correct), reason: byExercise[0].reason, duplicate: true, ...(await progressOf(connection, sessionId)) }
    }

    // 服务端确定性判分
    const { correct, reason } = scoreAnswer(exercise, submitted)
    await connection.query(
      `INSERT INTO answer_submissions (session_id, account_id, exercise_id, exercise_version, correct, reason, idempotency_key, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, accountId, exerciseId, exercise.version, correct ? 1 : 0, reason, idempotencyKey, nowIso()],
    )
    await connection.query(
      `INSERT INTO learning_events (id, account_id, session_id, type, ref_json, at) VALUES (?, ?, ?, 'answer-submit', CAST(? AS JSON), ?)`,
      [newId('event'), accountId, sessionId, JSON.stringify({ exerciseId, exerciseVersion: exercise.version, correct }), nowIso()],
    )
    await connection.commit()
    return { ok: true, correct, reason, duplicate: false, ...(await progressOf(db, sessionId)) }
  } catch (error) {
    await connection.rollback().catch(() => {})
    // 唯一约束冲突（极端并发双写）→ 按重复提交返回已有结果
    if (error?.code === 'ER_DUP_ENTRY') {
      const existing = await db.query('SELECT exercise_id, correct, reason FROM answer_submissions WHERE session_id = ? AND exercise_id = ?', [sessionId, exerciseId])
      if (existing[0]?.[0]) {
        return { ok: true, correct: Boolean(existing[0][0].correct), reason: existing[0][0].reason, duplicate: true, ...(await progressOf(db, sessionId)) }
      }
    }
    throw error
  } finally {
    connection.release()
  }
}

async function progressOf(db, sessionId) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS answered, SUM(correct) AS correct FROM answer_submissions WHERE session_id = ?`,
    [sessionId],
  )
  const [sessionRows] = await db.query('SELECT exercise_ids FROM study_sessions WHERE id = ?', [sessionId])
  const exerciseIds = sessionRows[0] ? (typeof sessionRows[0].exercise_ids === 'string' ? JSON.parse(sessionRows[0].exercise_ids) : sessionRows[0].exercise_ids) : []
  return {
    progress: {
      answered: Number(rows[0]?.answered || 0),
      total: exerciseIds.length,
      correct: Number(rows[0]?.correct || 0),
    },
  }
}

export async function completeStudySession(accountId, sessionId) {
  await ensureStudySchema()
  const db = getMySqlPool()
  const row = await loadSession(db, accountId, sessionId)
  if (!row) return { ok: false, code: 'session-not-found', message: '会话不存在或不属于当前账号' }
  if (row.status === 'completed') {
    const [attempts] = await db.query('SELECT correct FROM answer_submissions WHERE session_id = ?', [sessionId])
    return { ok: true, duplicate: true, assessment: summarizeAttempts(attempts.map(a => ({ correct: Boolean(a.correct) }))) }
  }
  const [attempts] = await db.query('SELECT correct FROM answer_submissions WHERE session_id = ?', [sessionId])
  if (attempts.length === 0) {
    return { ok: false, code: 'no-answers', message: '尚未提交任何作答，不能完成练习' }
  }
  await db.query(`UPDATE study_sessions SET status = 'completed', completed_at = ? WHERE id = ?`, [nowIso(), sessionId])
  await db.query(
    `INSERT INTO learning_events (id, account_id, session_id, type, ref_json, at) VALUES (?, ?, ?, 'session-complete', CAST(? AS JSON), ?)`,
    [newId('event'), accountId, sessionId, JSON.stringify(summarizeAttempts(attempts.map(a => ({ correct: Boolean(a.correct) })))), nowIso()],
  )
  return { ok: true, duplicate: false, assessment: summarizeAttempts(attempts.map(a => ({ correct: Boolean(a.correct) }))) }
}

export async function getStudyStats(accountId) {
  await ensureStudySchema()
  const db = getMySqlPool()
  const [sessionRows] = await db.query(
    `SELECT id, timezone, completed_at FROM study_sessions WHERE account_id = ? AND status = 'completed'`,
    [accountId],
  )
  const [attemptRows] = await db.query(
    `SELECT a.correct FROM answer_submissions a
     JOIN study_sessions s ON s.id = a.session_id
     WHERE a.account_id = ? AND s.status = 'completed'`,
    [accountId],
  )
  const { naturalDay } = await import('./store.js')
  const daySet = new Set()
  for (const row of sessionRows) {
    const at = row.completed_at instanceof Date ? row.completed_at.toISOString() : row.completed_at
    if (at) daySet.add(naturalDay(at, row.timezone))
  }
  let streak = 0
  if (daySet.size > 0) {
    const days = [...daySet].sort()
    const cursor = new Date(`${days[days.length - 1]}T00:00:00Z`)
    for (;;) {
      if (!daySet.has(cursor.toISOString().slice(0, 10))) break
      streak += 1
      cursor.setUTCDate(cursor.getUTCDate() - 1)
    }
  }
  return {
    completedSessions: sessionRows.length,
    totalAnswers: attemptRows.length,
    correctAnswers: attemptRows.filter(a => Boolean(a.correct)).length,
    studyDays: daySet.size,
    streakDays: streak,
  }
}

export async function saveProfileRevision(accountId, revision) {
  await ensureStudySchema()
  const db = getMySqlPool()
  const record = {
    id: newId('revision'),
    accountId,
    eventIds: Array.isArray(revision.eventIds) ? revision.eventIds : [],
    before: revision.before ?? null,
    after: revision.after ?? null,
    reason: revision.reason || '',
    source: revision.source === 'model' ? 'model' : 'rule',
    version: Number.isInteger(revision.version) ? revision.version : 1,
    createdAt: nowIso(),
  }
  await db.query(
    `INSERT INTO profile_revisions (id, account_id, event_ids, before_json, after_json, reason, source, version, created_at)
     VALUES (?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), ?, ?, ?, ?)`,
    [
      record.id, accountId,
      JSON.stringify(record.eventIds),
      JSON.stringify(record.before),
      JSON.stringify(record.after),
      record.reason, record.source, record.version, record.createdAt,
    ],
  )
  await db.query(
    `INSERT INTO learning_events (id, account_id, session_id, type, ref_json, at) VALUES (?, ?, ?, 'profile-revision', CAST(? AS JSON), ?)`,
    [newId('event'), accountId, revision.sessionId || null, JSON.stringify({ revisionId: record.id, source: record.source }), nowIso()],
  )
  return record
}

export async function listProfileRevisions(accountId, limit = 20) {
  await ensureStudySchema()
  const db = getMySqlPool()
  const [rows] = await db.query(
    'SELECT * FROM profile_revisions WHERE account_id = ? ORDER BY created_at DESC LIMIT ?',
    [accountId, limit],
  )
  return rows.map(row => ({
    id: row.id,
    accountId: row.account_id,
    eventIds: typeof row.event_ids === 'string' ? JSON.parse(row.event_ids) : row.event_ids,
    before: row.before_json ? (typeof row.before_json === 'string' ? JSON.parse(row.before_json) : row.before_json) : null,
    after: row.after_json ? (typeof row.after_json === 'string' ? JSON.parse(row.after_json) : row.after_json) : null,
    reason: row.reason,
    source: row.source,
    version: row.version,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }))
}

export async function listLearningEvents(accountId, limit = 50) {
  await ensureStudySchema()
  const db = getMySqlPool()
  const [rows] = await db.query(
    'SELECT * FROM learning_events WHERE account_id = ? ORDER BY at DESC LIMIT ?',
    [accountId, limit],
  )
  return rows.map(row => ({
    id: row.id,
    accountId: row.account_id,
    sessionId: row.session_id,
    type: row.type,
    ref: typeof row.ref_json === 'string' ? JSON.parse(row.ref_json) : row.ref_json,
    at: row.at instanceof Date ? row.at.toISOString() : row.at,
  }))
}
