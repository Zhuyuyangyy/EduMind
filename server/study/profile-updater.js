/**
 * 证据驱动的画像与路径更新（P3-2 · feat/mobile-v1）
 *
 * 规则边界（全部确定性，不依赖模型）：
 * 1. 证据量门槛：作答题数 < MIN_QUESTIONS 不更新画像（一次三题练习
 *    可以给学习建议，但不足以证明整体能力变化）；
 * 2. 变化边界：单维度单次变化限制在 ±MAX_DELTA；
 * 3. 稳定区间：0.4 <= 正确率 < 0.8 视为稳定，不调整；
 * 4. 无基线不更新；无变化不写库；
 * 5. 每次真实更新写入 ProfileRevision（before/after/reason/eventIds/
 *    source/version），路径更新保持知识点 ID 稳定并递增版本。
 */
import { getProfileResult, saveProfileResult } from '../store/mysql.js'
import { getLatestKnowledgePath, saveKnowledgePathResult } from '../data.js'
import { findExercise } from './exercise-bank.js'
import { summarizeAttempts } from './scoring.js'
import { saveProfileRevision, listLearningEvents } from './repository.js'

export const UPDATE_RULES = {
  MIN_QUESTIONS: 3,
  MAX_DELTA: 4,
  STABLE_LOW: 0.4,
  STABLE_HIGH: 0.8,
  PATH_STEP: 0.3, // 路径掌握度向观测正确率移动的步长比例
}

/** 按画像维度汇总练习证据（确定性） */
export function collectDimensionEvidence(attempts) {
  const byDimension = new Map()
  for (const attempt of attempts) {
    const exercise = findExercise(attempt.exerciseId)
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
 * 应用练习证据到画像。返回结构化决策记录（无论是否应用）。
 */
export async function applyEvidenceToProfile({ accountId, session, attempts }) {
  const assessment = summarizeAttempts(attempts)

  // 门槛 1：证据量
  if (attempts.length < UPDATE_RULES.MIN_QUESTIONS) {
    return {
      applied: false,
      reason: `证据不足：作答题数 ${attempts.length} 低于更新门槛 ${UPDATE_RULES.MIN_QUESTIONS}`,
      changes: [],
    }
  }

  // 门槛 2：画像基线必须来自服务端
  const profile = await getProfileResult(accountId)
  if (!profile || !Array.isArray(profile.dimensions)) {
    return { applied: false, reason: '无服务端画像基线，不更新', changes: [] }
  }

  const evidence = collectDimensionEvidence(attempts)
  const changes = []
  const nextDimensions = profile.dimensions.map(dimension => {
    const entry = evidence.find(item => item.dimension === dimension.label)
    if (!entry || entry.rate == null) return dimension

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
    return { applied: false, reason: '各维度正确率处于稳定区间，无需调整', changes: [] }
  }

  const nextProfile = { ...profile, dimensions: nextDimensions }
  await saveProfileResult(accountId, nextProfile)

  // 事件溯源：本会话相关事件 ID
  const events = await listLearningEvents(accountId, 50)
  const eventIds = events
    .filter(event => event.sessionId === session.id && ['answer-submit', 'session-complete'].includes(event.type))
    .map(event => event.id)

  const revision = await saveProfileRevision(accountId, {
    eventIds,
    before: profile,
    after: nextProfile,
    reason: changes.map(change => `${change.dimension}: ${change.before}→${change.after}（${change.reason}）`).join('；'),
    source: 'rule',
    version: 1,
    sessionId: session.id,
  })

  return { applied: true, reason: revision.reason, changes, revisionId: revision.id }
}

/**
 * 用观测正确率修正路径掌握度估计（有界步长），知识点 ID 保持不变，
 * 路径版本递增并可追踪旧版。
 */
export async function applyEvidenceToPath({ accountId, session, attempts }) {
  if (attempts.length === 0) {
    return { applied: false, reason: '无作答证据，不调整路径' }
  }
  const path = await getLatestKnowledgePath(accountId)
  if (!path || !Array.isArray(path.phases)) {
    return { applied: false, reason: '无知识路径，不调整' }
  }

  const assessment = summarizeAttempts(attempts)
  const rate = assessment.correctRate
  if (rate == null) {
    return { applied: false, reason: '无有效正确率，不调整' }
  }

  const currentVersion = Number(path.version) || 1
  let touched = 0
  const nextPhases = path.phases.map(phase => ({
    ...phase,
    // 按知识点 ID 匹配（题库 topicId 与路径 topic.id 同源，ID 稳定）
    topics: (phase.topics || []).map(topic => {
      if (topic.id !== session.topicId) return topic
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
  await saveKnowledgePathResult(accountId, nextPath)
  return {
    applied: true,
    reason: nextPath.updateReason,
    version: nextPath.version,
    basedOn: currentVersion,
  }
}
