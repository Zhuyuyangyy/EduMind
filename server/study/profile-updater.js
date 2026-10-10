/**
 * 证据驱动的画像与路径更新（P3-2.1 · feat/mobile-v1）
 *
 * 规则边界（全部确定性，不依赖模型）：
 * 1. 证据量门槛：会话作答题数 < MIN_QUESTIONS 不更新画像；
 *    单个维度有效题数 < MIN_DIMENSION_QUESTIONS 不调整该维度；
 * 2. 变化边界：单维度单次变化限制在 ±MAX_DELTA；
 * 3. 稳定区间：0.4 <= 正确率 < 0.8 视为稳定，不调整；
 * 4. 无基线不更新；无变化不写库；
 * 5. 派生字段一致：dimensions 变化后同步 totalScore / radarPoints / score，
 *    不触碰 source、weaknesses 等无关字段；
 * 6. 每次真实更新产出修订载荷（before/after/reason/eventIds/source/version），
 *    由调用方按恢复协议落库。
 *
 * 崩溃安全（write-ahead 协议）：
 * prepare* 只读且确定性；调用方先把意图（profileAfterValues /
 * pendingRevision）持久化，再 commit* 落库。恢复时按意图对账，
 * 每个子更新最多生效一次，绝不出现「分数已变但无证据」。
 */
import { getProfileResult, saveProfileResult } from '../store/mysql.js'
import { getLatestKnowledgePath, saveKnowledgePathResult } from '../data.js'
import { findExercise } from './exercise-bank.js'
import { summarizeAttempts } from './scoring.js'
import { listLearningEvents } from './repository.js'

export const UPDATE_RULES = {
  MIN_QUESTIONS: 3,
  MIN_DIMENSION_QUESTIONS: 2,
  MAX_DELTA: 4,
  STABLE_LOW: 0.4,
  STABLE_HIGH: 0.8,
  PATH_STEP: 0.3,
}

/** 按画像维度汇总练习证据（确定性；exerciseResolver 支持会话快照归因） */
export function collectDimensionEvidence(attempts, exerciseResolver = null) {
  const resolve = exerciseResolver || findExercise
  const byDimension = new Map()
  for (const attempt of attempts) {
    const exercise = resolve(attempt.exerciseId)
    const dimension = exercise?.profileDimension
    if (!dimension) continue
    if (!byDimension.has(dimension)) byDimension.set(dimension, { correct: 0, total: 0 })
    const entry = byDimension.get(dimension)
    entry.total += 1
    if (attempt.correct) entry.correct += 1
  }
  return [...byDimension.entries()].map(([dimension, { correct, total }]) => ({
    dimension,
    correct,
    total,
    rate: total === 0 ? null : correct / total,
  }))
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

/**
 * 画像派生字段一致性：dimensions 变化后同步 totalScore / radarPoints / score，
 * 不触碰 source、weaknesses、recommendations 等无关字段。
 */
export function withDerivedFields(profile) {
  const dimensions = Array.isArray(profile.dimensions) ? profile.dimensions : []
  if (dimensions.length === 0) return profile

  const values = dimensions.map(d => Number(d.value) || 0)
  const mean = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
  const next = { ...profile, totalScore: mean }

  if (Array.isArray(profile.radarPoints)) {
    const byLabel = new Map(dimensions.map(d => [d.label, d.value]))
    next.radarPoints = profile.radarPoints.map(point => {
      const label = point?.dimension ?? point?.label
      const value = byLabel.get(label)
      return value == null ? point : { ...point, dimension: label, score: value }
    })
  }
  if ('score' in profile) {
    next.score = mean
  }
  return next
}

/**
 * 准备画像更新（只读、确定性、无副作用）。
 * 返回 { applied, reason, changes, skippedDimensions, nextProfile?, revision?, profileAfter? }
 */
export async function prepareProfileUpdate({ accountId, session, attempts, exerciseResolver = null }) {
  const resolve = exerciseResolver || findExercise
  if (attempts.length < UPDATE_RULES.MIN_QUESTIONS) {
    return {
      applied: false,
      reason: `证据不足：作答题数 ${attempts.length} 低于更新门槛 ${UPDATE_RULES.MIN_QUESTIONS}`,
      changes: [],
    }
  }

  const profile = await getProfileResult(accountId)
  if (!profile || !Array.isArray(profile.dimensions)) {
    return { applied: false, reason: '无服务端画像基线，不更新', changes: [] }
  }

  const evidence = collectDimensionEvidence(attempts, resolve)
  const skippedDimensions = []
  const changes = []
  const nextDimensions = profile.dimensions.map(dimension => {
    const entry = evidence.find(item => item.dimension === dimension.label)
    if (!entry || entry.rate == null) return dimension

    if (entry.total < UPDATE_RULES.MIN_DIMENSION_QUESTIONS) {
      skippedDimensions.push(`${dimension.label}（仅 ${entry.total} 题，低于 ${UPDATE_RULES.MIN_DIMENSION_QUESTIONS} 题门槛）`)
      return dimension
    }

    let delta = 0
    if (entry.rate >= UPDATE_RULES.STABLE_HIGH) delta = UPDATE_RULES.MAX_DELTA
    else if (entry.rate < UPDATE_RULES.STABLE_LOW) delta = -UPDATE_RULES.MAX_DELTA

    const before = Number(dimension.value) || 0
    const after = clamp(before + delta, 0, 100)
    if (after === before) return dimension

    changes.push({
      dimension: dimension.label,
      before,
      after,
      delta: after - before,
      reason: `练习正确率 ${Math.round(entry.rate * 100)}%（${entry.correct}/${entry.total} 题）`,
    })
    return { ...dimension, value: after }
  })

  if (changes.length === 0) {
    const reason = skippedDimensions.length > 0
      ? `维度证据不足：${skippedDimensions.join('；')}`
      : '各维度正确率处于稳定区间，无需调整'
    return { applied: false, reason, changes: [], skippedDimensions }
  }

  const nextProfile = withDerivedFields({ ...profile, dimensions: nextDimensions })
  const events = await listLearningEvents(accountId, 50)
  const eventIds = events
    .filter(event => event.sessionId === session.id && ['answer-submit', 'session-complete'].includes(event.type))
    .map(event => event.id)
  const revisionReason = changes.map(change => `${change.dimension}: ${change.before}→${change.after}（${change.reason}）`).join('；')

  return {
    applied: true,
    reason: revisionReason,
    changes,
    skippedDimensions,
    nextProfile,
    profileAfter: Object.fromEntries(changes.map(change => [change.dimension, change.after])),
    revision: {
      eventIds,
      before: profile,
      after: nextProfile,
      reason: revisionReason,
      source: 'rule',
      version: 1,
      sessionId: session.id,
    },
  }
}

/** 落库画像更新（唯一写操作） */
export async function commitProfileUpdate(accountId, nextProfile) {
  await saveProfileResult(accountId, nextProfile)
}

/**
 * 兼容封装：prepare + commit（无恢复协议的简单调用方使用）。
 */
export async function applyEvidenceToProfile({ accountId, session, attempts }) {
  const prepared = await prepareProfileUpdate({ accountId, session, attempts })
  if (!prepared.applied) return prepared
  await commitProfileUpdate(accountId, prepared.nextProfile)
  const { nextProfile, ...rest } = prepared
  return rest
}

/* ———————————— 路径更新 ———————————— */

/**
 * 准备路径更新（只读、确定性）。知识点 ID 保持不变，版本递增。
 */
export async function preparePathUpdate({ accountId, session, attempts, exerciseResolver = null }) {
  const resolvePath = exerciseResolver || findExercise
  if (attempts.length === 0) {
    return { applied: false, reason: '无作答证据，不调整路径' }
  }
  const path = await getLatestKnowledgePath(accountId)
  if (!path || !Array.isArray(path.phases)) {
    return { applied: false, reason: '无知识路径，不调整' }
  }

  const currentVersion = Number(path.version) || 1
  const assessment = summarizeAttempts(attempts)
  const rate = assessment.correctRate
  if (rate == null) {
    return { applied: false, reason: '无有效正确率，不调整' }
  }

  // 本次实际作答覆盖的知识点（从题目推导，支持混合主题会话）
  const sessionTopicIds = new Set(
    attempts.map(attempt => findExercise(attempt.exerciseId)?.topicId).filter(Boolean),
  )

  let touched = 0
  const nextPhases = path.phases.map(phase => ({
    ...phase,
    topics: (phase.topics || []).map(topic => {
      if (!sessionTopicIds.has(topic.id)) return topic
      const mastery = Number(topic.mastery) || 0
      const next = clamp(mastery + (rate - mastery) * UPDATE_RULES.PATH_STEP, 0, 1)
      if (Math.abs(next - mastery) < 0.001) return topic
      touched += 1
      return { ...topic, mastery: Number(next.toFixed(4)) }
    }),
  }))

  if (touched === 0) {
    return { applied: false, reason: '路径中无与本次练习对应的知识点' }
  }

  const nextPath = {
    ...path,
    phases: nextPhases,
    version: currentVersion + 1,
    basedOn: currentVersion,
    updatedAt: new Date().toISOString(),
    updateReason: `依据练习观测正确率 ${Math.round(rate * 100)}% 修正掌握度估计（有界步长，知识点 ID 不变）`,
  }
  return {
    applied: true,
    reason: nextPath.updateReason,
    version: nextPath.version,
    basedOn: currentVersion,
    nextPath,
  }
}

/** 落库路径更新（唯一写操作） */
export async function commitPathUpdate(accountId, nextPath) {
  await saveKnowledgePathResult(accountId, nextPath)
}

/** 兼容封装 */
export async function applyEvidenceToPath({ accountId, session, attempts }) {
  const prepared = await preparePathUpdate({ accountId, session, attempts })
  if (!prepared.applied) return prepared
  await commitPathUpdate(accountId, prepared.nextPath)
  const { nextPath, ...rest } = prepared
  return rest
}
