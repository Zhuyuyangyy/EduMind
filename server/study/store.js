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

/**
 * 时区内回退一天（P3.4）。
 * dayStr 为「该时区的自然日」字符串；取 UTC 正午为锚点避开夏令时边界，
 * 再按目标时区格式化，保证回退结果仍是同一时区的合法自然日。
 */
export function previousDayInZone(dayStr, timeZone = 'Asia/Shanghai') {
  const anchor = new Date(`${dayStr}T12:00:00Z`)
  if (Number.isNaN(anchor.getTime())) return dayStr
  anchor.setUTCDate(anchor.getUTCDate() - 1)
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(anchor)
  } catch {
    return anchor.toISOString().slice(0, 10)
  }
}

/**
 * 计算连续学习天数（P4-0 修正）。
 * 只有最近一个学习日是「今天或昨天」（账号时区）时，才存在当前
 * 意义上的连续记录；最后学习日早于昨天 → 当前连续为 0
 * （历史上很久以前的连续记录不得误显示为仍在连续）。
 */
export function computeStreak(daySet, timeZone = 'Asia/Shanghai') {
  if (daySet.size === 0) return 0
  const days = [...daySet].sort()
  const latest = days[days.length - 1]
  const today = naturalDay(new Date().toISOString(), timeZone)
  const yesterday = previousDayInZone(today, timeZone)
  if (latest !== today && latest !== yesterday) return 0

  let streak = 0
  let cursor = latest
  for (;;) {
    if (!daySet.has(cursor)) break
    streak += 1
    cursor = previousDayInZone(cursor, timeZone)
    // 防御：异常时区数据导致死循环
    if (streak > 3650) break
  }
  return streak
}

/* ———————————— 会话 ———————————— */

export function createStudySession(accountId, { topicId, topicIds, phaseId, timezone, exerciseCount } = {}) {
  const store = readStore()
  const bank = loadExerciseBank()
  // 主题选择：topicIds（混合练习）优先，其次单个 topicId；始终由服务端从题库选取
  const wanted = Array.isArray(topicIds) && topicIds.length > 0
    ? topicIds.filter(id => typeof id === 'string')
    : (typeof topicId === 'string' && topicId ? [topicId] : [])
  if (wanted.length === 0) {
    return { error: 'invalid-topic', message: '必须提供 topicId 或 topicIds' }
  }
  let exercises = bank.exercises.filter(item => wanted.includes(item.topicId))
  if (exercises.length === 0) {
    return { error: 'no-exercises', message: `题库中暂无这些主题的题目: ${wanted.join(',')}` }
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
    // P3.4：题目快照（含题库版本）。历史练习恢复读快照，
    // 题库升级不改变历史练习的题目/答案/解析含义
    bankVersion: bank.version,
    exerciseSnapshot: exercises.map(item => ({ ...item })),
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
  return {
    session: publicSession(session),
    attempts,
    // P3.4：题目快照（旧会话无快照时回退当前题库，由调用方标注）
    snapshot: Array.isArray(session.exerciseSnapshot) ? session.exerciseSnapshot : null,
    bankVersion: session.bankVersion ?? null,
  }
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
    bankVersion: session.bankVersion ?? null,
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
  // P3.4：判分优先用会话快照的题目（题库升级不改变本会话的对错含义）
  const snapshotExercise = Array.isArray(session.exerciseSnapshot)
    ? session.exerciseSnapshot.find(item => item.id === exerciseId)
    : null
  const scoringExercise = snapshotExercise || exercise

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
  const { correct, reason } = scoreAnswer(scoringExercise, submitted)
  const attempt = {
    exerciseId,
    exerciseVersion: scoringExercise.version,
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
    ref: { exerciseId, exerciseVersion: scoringExercise.version, correct },
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
  let accountTimezone = 'Asia/Shanghai'
  for (const session of completed) {
    daySet.add(naturalDay(session.completedAt, session.timezone))
    accountTimezone = session.timezone || accountTimezone
  }

  return {
    completedSessions: completed.length,
    totalAnswers: attempts.length,
    correctAnswers: attempts.filter(a => a.correct).length,
    studyDays: daySet.size,
    streakDays: computeStreak(daySet, accountTimezone),
  }
}

/* ———————————— 画像修订账本 ———————————— */

/**
 * 保存画像修订（P4-0：幂等）。
 * sessionId 持久化到记录；同一 (accountId, sessionId) 重复保存返回
 * 已有记录（JSON 模式按会话索引 O(1) 判断，不扫描历史）。
 * 无 sessionId 的历史修订保留并标记来源不可归因。
 */
export function saveProfileRevision(accountId, revision) {
  const store = readStore()
  const sessionId = revision.sessionId || null

  // 幂等：同会话已有修订 → 直接返回已有记录
  if (sessionId) {
    const existing = store.profileRevisions.find(r => r.accountId === accountId && r.sessionId === sessionId)
    if (existing) return existing
  }

  const record = {
    id: newId('revision'),
    accountId,
    sessionId,
    eventIds: Array.isArray(revision.eventIds) ? revision.eventIds : [],
    before: revision.before ?? null,
    after: revision.after ?? null,
    reason: revision.reason || '',
    source: revision.source === 'model' ? 'model' : 'rule',
    version: Number.isInteger(revision.version) ? revision.version : 1,
    // 无法归因到会话的历史记录显式标注（不猜测关联）
    attribution: sessionId ? 'session' : 'unattributed',
    createdAt: nowIso(),
  }
  store.profileRevisions = [...store.profileRevisions, record].slice(-500)
  appendEvent(store, {
    accountId,
    sessionId,
    type: 'profile-revision',
    ref: { revisionId: record.id, source: record.source },
  })
  writeStore(store)
  return record
}

/** 按会话判断修订是否已存在（O(1)，替代扫描最近 N 条） */
export function hasRevisionForSession(accountId, sessionId) {
  if (!sessionId) return false
  const store = readStore()
  return store.profileRevisions.some(r => r.accountId === accountId && r.sessionId === sessionId)
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
