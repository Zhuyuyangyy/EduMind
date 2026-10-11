/**
 * 学习会话公开 DTO（P4-0 · feat/mobile-v1）
 *
 * 铁律：公开接口只返回白名单字段，绝不直接序列化内部状态。
 * - publicSessionView：会话公开视图（无快照、无答案）；
 * - publicAttemptView：作答公开视图；
 * - publicExerciseView：题目视图，revealed=false 时连答案相关的
 *   任何字段都不出现（白名单而非黑名单，未来新增私有字段默认不泄露）；
 * - completed 会话的答案公开只允许经由 /questions 且 revealed=true。
 */

const SESSION_FIELDS = [
  'id', 'topicId', 'phaseId', 'status', 'exerciseIds',
  'createdAt', 'completedAt', 'timezone', 'bankVersion',
]

const ATTEMPT_FIELDS = ['exerciseId', 'exerciseVersion', 'correct', 'reason', 'submitted', 'submittedAt']

/** 未公开阶段允许出现的题目字段（白名单） */
const PUBLIC_EXERCISE_FIELDS = [
  'id', 'version', 'topicId', 'phaseId', 'domain',
  'knowledgePoint', 'difficulty', 'type', 'prompt', 'choices', 'profileDimension',
]

/** 已公开阶段额外允许的字段 */
const REVEALED_EXERCISE_FIELDS = ['answer', 'explanation']

function pick(source, fields) {
  const out = {}
  for (const field of fields) {
    if (source && Object.prototype.hasOwnProperty.call(source, field)) {
      out[field] = source[field]
    }
  }
  return out
}

export function publicSessionView(session) {
  return session ? pick(session, SESSION_FIELDS) : null
}

export function publicAttemptView(attempt) {
  return pick(attempt, ATTEMPT_FIELDS)
}

export function publicExerciseView(exercise, { revealed = false } = {}) {
  if (!exercise) return null
  const fields = revealed ? [...PUBLIC_EXERCISE_FIELDS, ...REVEALED_EXERCISE_FIELDS] : PUBLIC_EXERCISE_FIELDS
  return pick(exercise, fields)
}
