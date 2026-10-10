/**
 * 学习事件存储（P3-1 · feat/mobile-v1）——JSON 开发模式。
 *
 * 设计原则：
 * - 账号边界：所有读写都带 accountId，跨账号访问返回 null（不泄露存在性）；
 * - 幂等：idempotencyKey 全局唯一，(sessionId, exerciseId) 唯一，
 *   重复提交返回首次评分结果，绝不重复计分；
 * - 事件账本 append-only：learningEvents 只增不改；
 * - 本实现为单文件读写，适用于开发/测试；
 *   多实例生产环境请使用 MySQL 实现（store-mysql.js）。
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { scoreAnswer, summarizeAttempts } from './scoring.js'
import { loadExerciseBank, findExercise } from './exercise-bank.js'

const STUDY_KEYS = ['studySessions', 'studyAttempts', 'studyIdempotency', 'learningEvents', 'profileRevisions']

function dataFilePath() {
  return process.env.ZHIXUE_DATA_FILE || path.join(process.cwd(), 'data', 'store.json')
}

function readStore() {
  const filePath = dataFilePath()
  if (!fs.existsSync(filePath)) {
    return { studySessions: {}, studyAttempts: {}, studyIdempotency: {}, learningEvents: [], profileRevisions: [] }
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  return {
    studySessions: parsed.studySessions || {},
    studyAttempts: parsed.studyAttempts || {},
    studyIdempotency: parsed.studyIdempotency || {},
    learningEvents: Array.isArray(parsed.learningEvents) ? parsed.learningEvents : [],
    profileRevisions: Array.isArray(parsed.profileRevisions) ? parsed.profileRevisions : [],
  }
}

/** 原子写：临时文件 + rename；只覆盖自己负责的键，其余键原样保留 */
function writeStore(studyState) {
  const filePath = dataFilePath()
  let full = {}
  if (fs.existsSync(filePath)) {
    full = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  }
  for (const key of STUDY_KEYS) {
    full[key] = studyState[key]
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.study.tmp`
  fs.writeFileSync(temporaryPath, JSON.stringify(full, null, 2), 'utf8')
  fs.renameSync(temporaryPath, filePath)
}

function nowIso() {
  return new Date().toISOString()
}

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** 按账号时区取自然日（默认 Asia/Shanghai） */
export function naturalDay(atIso, timeZone = 'Asia/Shanghai') {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(atIso))
  } catch {
    return atIso.slice(0, 10)
  }
}

/* ———————————— 会话 ———————————— */

export function createStudySession(accountId, { topicId, phaseId, timezone, exerciseCount } = {}) {
  const store = readStore()
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
    phaseId: phaseId || exercises[0]?.phaseId || null,
    timezone: timezone || 'Asia/Shanghai',
    status: 'active',
    exerciseIds: exercises.map(item => item.id),
    createdAt: nowIso(),
    completedAt: null,
  }
  store.studySessions[session.id] = session
  store.studyAttempts[session.id] = []
  appendEvent(store, { accountId, sessionId: session.id, type: 'session-start', ref: { topicId: session.topicId } })
  writeStore(store)

  // 返回给客户端时不带正确答案
  return {
    session: publicSession(session),
    exercises: exercises.map(stripAnswer),
  }
}

export function getStudySession(accountId, sessionId) {
  const store = readStore()
  const session = store.studySessions[sessionId]
  if (!session || session.accountId !== accountId) return null // 跨账号不泄露存在性
  const attempts = store.studyAttempts[sessionId] || []
  return { session: publicSession(session), attempts }
}

function publicSession(session) {
  return {
    id: session.id,
    topicId: session.topicId,
    phaseId: session.phaseId,
    status: session.status,
    exerciseIds: session.exerciseIds,
    createdAt: session.createdAt,
    completedAt: session.completedAt,
    timezone: session.timezone,
  }
}

function stripAnswer(exercise) {
  const { answer, explanation, ...rest } = exercise
  return rest
}

/* ———————————— 作答与判分（幂等） ———————————— */

/**
 * 提交一道题的答案。返回：
 * - { ok: true, correct, reason, duplicate: boolean, progress }
 * - { ok: false, code, message } 业务拒绝（零题/非法/越权由调用方处理）
 */
export function recordAnswer(accountId, sessionId, { exerciseId, submitted, idempotencyKey } = {}) {
  const store = readStore()
  const session = store.studySessions[sessionId]

  // 越权/不存在统一 404 语义
  if (!session || session.accountId !== accountId) {
    return { ok: false, code: 'session-not-found', message: '会话不存在或不属于当前账号' }
  }
  if (session.status !== 'active') {
    return { ok: false, code: 'session-closed', message: '会话已结束，不能继续作答' }
  }
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 8) {
    return { ok: false, code: 'invalid-idempotency-key', message: '缺少合法的幂等键（>=8 字符）' }
  }

  const exercise = findExercise(exerciseId)
  if (!exercise) {
    return { ok: false, code: 'invalid-exercise', message: `题目不存在: ${exerciseId}` }
  }
  if (!session.exerciseIds.includes(exerciseId)) {
    return { ok: false, code: 'exercise-not-in-session', message: '该题目不属于本会话' }
  }

  // 幂等 1：同一幂等键直接返回首次结果
  const seen = store.studyIdempotency[idempotencyKey]
  if (seen && seen.sessionId === sessionId && seen.exerciseId === exerciseId) {
    return { ok: true, ...seen.result, duplicate: true, progress: progressOf(store, sessionId) }
  }
  // 幂等 2：同会话同题已评分（不同键），返回已有结果，不重复计分
  const existing = (store.studyAttempts[sessionId] || []).find(a => a.exerciseId === exerciseId)
  if (existing) {
    const result = { correct: existing.correct, reason: existing.reason }
    store.studyIdempotency[idempotencyKey] = { sessionId, exerciseId, result, at: nowIso() }
    writeStore(store)
    return { ok: true, ...result, duplicate: true, progress: progressOf(store, sessionId) }
  }

  // 服务端确定性判分
  const { correct, reason } = scoreAnswer(exercise, submitted)
  const attempt = {
    exerciseId,
    exerciseVersion: exercise.version,
    correct,
    reason,
    submitted: submitted ?? null,
    submittedAt: nowIso(),
    idempotencyKey,
  }
  store.studyAttempts[sessionId] = [...(store.studyAttempts[sessionId] || []), attempt]
  store.studyIdempotency[idempotencyKey] = { sessionId, exerciseId, result: { correct, reason }, at: nowIso() }
  appendEvent(store, {
    accountId,
    sessionId,
    type: 'answer-submit',
    ref: { exerciseId, exerciseVersion: exercise.version, correct },
  })
  writeStore(store)

  return { ok: true, correct, reason, duplicate: false, progress: progressOf(store, sessionId) }
}

function progressOf(store, sessionId) {
  const attempts = store.studyAttempts[sessionId] || []
  const session = store.studySessions[sessionId]
  return {
    answered: attempts.length,
    total: session?.exerciseIds?.length || 0,
    correct: attempts.filter(a => a.correct).length,
  }
}

/* ———————————— 完成与统计 ———————————— */

export function completeStudySession(accountId, sessionId) {
  const store = readStore()
  const session = store.studySessions[sessionId]
  if (!session || session.accountId !== accountId) {
    return { ok: false, code: 'session-not-found', message: '会话不存在或不属于当前账号' }
  }
  if (session.status === 'completed') {
    // 重复完成请求同样幂等
    const attempts = store.studyAttempts[sessionId] || []
    return { ok: true, duplicate: true, assessment: summarizeAttempts(attempts) }
  }

  const attempts = store.studyAttempts[sessionId] || []
  if (attempts.length === 0) {
    // 零题提交拒绝：没有作答证据不允许“完成”
    return { ok: false, code: 'no-answers', message: '尚未提交任何作答，不能完成练习' }
  }

  session.status = 'completed'
  session.completedAt = nowIso()
  appendEvent(store, {
    accountId,
    sessionId,
    type: 'session-complete',
    ref: summarizeAttempts(attempts),
  })
  writeStore(store)
  return { ok: true, duplicate: false, assessment: summarizeAttempts(attempts) }
}

/** 账号学习统计：真实有效学习完成事件（按账号时区计算自然日） */
export function getStudyStats(accountId) {
  const store = readStore()
  const sessions = Object.values(store.studySessions).filter(s => s.accountId === accountId)
  const completed = sessions.filter(s => s.status === 'completed')
  const attempts = completed.flatMap(s => store.studyAttempts[s.id] || [])

  // 有效学习日：来自 completed 会话（页面访问不计入）
  const daySet = new Set()
  for (const session of completed) {
    daySet.add(naturalDay(session.completedAt, session.timezone))
  }

  let streak = 0
  if (daySet.size > 0) {
    const days = [...daySet].sort()
    const cursor = new Date(`${days[days.length - 1]}T00:00:00Z`)
    // 以账号时区近似：用 UTC 日回退连续天数（时区偏移不影响连续性判断的单调性）
    for (;;) {
      const key = cursor.toISOString().slice(0, 10)
      if (!daySet.has(key)) break
      streak += 1
      cursor.setUTCDate(cursor.getUTCDate() - 1)
    }
  }

  return {
    completedSessions: completed.length,
    totalAnswers: attempts.length,
    correctAnswers: attempts.filter(a => a.correct).length,
    studyDays: daySet.size,
    streakDays: streak,
  }
}

/* ———————————— 画像修订账本 ———————————— */

export function saveProfileRevision(accountId, revision) {
  const store = readStore()
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
  store.profileRevisions = [...store.profileRevisions, record].slice(-500)
  appendEvent(store, {
    accountId,
    sessionId: revision.sessionId || null,
    type: 'profile-revision',
    ref: { revisionId: record.id, source: record.source },
  })
  writeStore(store)
  return record
}

export function listProfileRevisions(accountId, limit = 20) {
  const store = readStore()
  return store.profileRevisions.filter(r => r.accountId === accountId).slice(-limit).reverse()
}

/* ———————————— 事件账本 ———————————— */

function appendEvent(store, { accountId, sessionId, type, ref }) {
  store.learningEvents = [
    ...store.learningEvents,
    { id: newId('event'), accountId, sessionId, type, ref: ref || {}, at: nowIso() },
  ].slice(-2000)
}

export function listLearningEvents(accountId, limit = 50) {
  const store = readStore()
  return store.learningEvents.filter(e => e.accountId === accountId).slice(-limit).reverse()
}
