/**
 * 学习状态归约器（纯函数，便于单元测试）+ 本地持久化
 *
 * 所有状态迁移都是确定性的纯函数：相同输入必定产生相同输出，
 * 不依赖 Vue、不依赖浏览器，可在 node:test 中直接测试。
 */
import type { Exercise, KpEvidence, KpMasteryState, LearningEvent, LearningState, TutorMessage } from './types.ts'
import { diagnosisQuestions } from '../data/diagnosis.ts'
import { exercisesByKp, getExercise } from '../data/exercises.ts'
import { demoCourse } from '../data/course.ts'
import { scoreAnswer, summarizeAttempts } from './scoring.ts'
import { applyPracticeSession, buildDiagnosisBaseline, createUntestedState } from './mastery.ts'

export const STATE_VERSION = 1
export const STORAGE_KEY = 'astripath.demo.v1'

let eventSeq = 0
function eventId(): string {
  eventSeq += 1
  return `evt-${Date.now().toString(36)}-${eventSeq}`
}

export function createInitialState(courseId: string = demoCourse.id): LearningState {
  const kpStates: Record<string, KpMasteryState> = {}
  for (const kp of demoCourse.knowledgePoints) kpStates[kp.id] = createUntestedState(kp.id)
  return {
    version: STATE_VERSION,
    courseId,
    diagnosis: { answers: {}, submitted: false, submittedAt: null },
    kpStates,
    practice: {},
    planCompletion: {},
    planGeneratedAt: null,
    chat: [],
    events: []
  }
}

/** 重置为初始演示状态 */
export function resetLearningState(): LearningState {
  return createInitialState()
}

export interface DiagnosisResult {
  perQuestion: Array<{ questionId: string; kpId: string; chosen: number | null; correct: boolean; reason: string }>
  perKp: KpEvidence[]
  summary: { total: number; correct: number; correctRate: number | null }
}

/** 提交诊断：自动判分、按知识点统计正确率、建立掌握度基线 */
export function submitDiagnosis(state: LearningState, answers: Record<string, number>): { state: LearningState; result: DiagnosisResult } {
  const at = new Date().toISOString()
  const perQuestion: DiagnosisResult['perQuestion'] = []
  const kpCorrect = new Map<string, { correct: number; total: number }>()

  for (const question of diagnosisQuestions) {
    const chosen = Object.prototype.hasOwnProperty.call(answers, question.id) ? answers[question.id] : null
    const score = chosen === null ? { correct: false, reason: '未作答' } : scoreAnswer(question, chosen)
    perQuestion.push({ questionId: question.id, kpId: question.kpId, chosen, correct: score.correct, reason: score.reason })
    const entry = kpCorrect.get(question.kpId) ?? { correct: 0, total: 0 }
    entry.total += 1
    if (score.correct) entry.correct += 1
    kpCorrect.set(question.kpId, entry)
  }

  const kpStates: Record<string, KpMasteryState> = {}
  for (const kp of demoCourse.knowledgePoints) {
    const evidence = kpCorrect.get(kp.id)
    kpStates[kp.id] = evidence
      ? buildDiagnosisBaseline(kp.id, evidence.correct, evidence.total, at)
      : createUntestedState(kp.id)
  }

  const attempts = perQuestion.map((q) => ({ correct: q.correct }))
  const summary = summarizeAttempts(attempts)
  const overallRate = summary.correctRate ?? 0

  const event: LearningEvent = {
    id: eventId(),
    kind: 'diagnosis-submitted',
    at,
    summary: `完成学习诊断：${summary.correct}/${summary.total} 正确（${(overallRate * 100).toFixed(0)}%），生成初始知识画像`
  }

  return {
    state: {
      ...state,
      diagnosis: { answers: { ...answers }, submitted: true, submittedAt: at },
      kpStates,
      practice: {},
      planCompletion: {},
      planGeneratedAt: null,
      events: [...state.events, event]
    },
    result: {
      perQuestion,
      perKp: [...kpCorrect.entries()].map(([kpId, v]) => ({ kpId, ...v })),
      summary
    }
  }
}

export interface PracticeResult {
  perExercise: Array<{ exerciseId: string; chosen: number | null; correct: boolean; explanation: string }>
  summary: { total: number; correct: number; correctRate: number | null }
  masteryBefore: number
  masteryAfter: number
  delta: number
  reason: string
}

/** 提交一次针对性练习：即时判分、更新该知识点掌握度 */
export function submitPractice(
  state: LearningState,
  kpId: string,
  answers: Record<string, number>
): { state: LearningState; result: PracticeResult } {
  const at = new Date().toISOString()
  const bank: Exercise[] = exercisesByKp[kpId] ?? []
  const perExercise: PracticeResult['perExercise'] = []
  const attempts: Array<{ correct: boolean }> = []

  for (const exercise of bank) {
    const chosen = Object.prototype.hasOwnProperty.call(answers, exercise.id) ? answers[exercise.id] : null
    const score = chosen === null ? { correct: false, reason: '未作答' } : scoreAnswer(exercise, chosen)
    perExercise.push({
      exerciseId: exercise.id,
      chosen,
      correct: score.correct,
      explanation: exercise.explanation
    })
    attempts.push({ correct: score.correct })
  }

  const summary = summarizeAttempts(attempts)
  const prevState = state.kpStates[kpId] ?? createUntestedState(kpId)
  const update = applyPracticeSession(prevState, summary.correct, summary.total, at)

  const event: LearningEvent = {
    id: eventId(),
    kind: 'practice-submitted',
    at,
    summary: `完成「${prevState.kpId}」针对性练习：${summary.correct}/${summary.total} 正确，${update.reason}`
  }

  return {
    state: {
      ...state,
      kpStates: { ...state.kpStates, [kpId]: update.state },
      practice: { ...state.practice, [kpId]: { ...(state.practice[kpId] ?? {}), ...answers } },
      events: [...state.events, event]
    },
    result: {
      perExercise,
      summary,
      masteryBefore: update.before,
      masteryAfter: update.after,
      delta: update.delta,
      reason: update.reason
    }
  }
}

/** 切换计划任务完成状态 */
export function togglePlanTask(state: LearningState, key: string, taskLabel: string): LearningState {
  const done = state.planCompletion[key] === true
  const planCompletion = { ...state.planCompletion, [key]: !done }
  const events = [...state.events]
  if (!done) {
    events.push({
      id: eventId(),
      kind: 'plan-task-completed',
      at: new Date().toISOString(),
      summary: `完成学习计划任务：${taskLabel}`
    })
  }
  return { ...state, planCompletion, events }
}

/** 追加一条导师对话消息（保留最近 50 条） */
export function appendChat(state: LearningState, message: TutorMessage): LearningState {
  return { ...state, chat: [...state.chat, message].slice(-50) }
}

// —— 持久化 ——

export interface KvStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 轻量结构校验：版本与关键字段不匹配时视为损坏，返回 null（安全降级为初始状态） */
export function deserializeState(raw: string | null): LearningState | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  if (parsed.version !== STATE_VERSION) return null
  if (!isRecord(parsed.kpStates)) return null
  const fresh = createInitialState()
  const kpStates: Record<string, KpMasteryState> = {}
  for (const kp of demoCourse.knowledgePoints) {
    const stored = parsed.kpStates[kp.id]
    kpStates[kp.id] = isRecord(stored) && typeof stored.mastery === 'number' ? (stored as KpMasteryState) : fresh.kpStates[kp.id]
  }
  return {
    version: STATE_VERSION,
    courseId: typeof parsed.courseId === 'string' ? parsed.courseId : fresh.courseId,
    diagnosis: isRecord(parsed.diagnosis)
      ? { ...fresh.diagnosis, ...(parsed.diagnosis as object) }
      : fresh.diagnosis,
    kpStates,
    practice: isRecord(parsed.practice) ? (parsed.practice as LearningState['practice']) : {},
    planCompletion: isRecord(parsed.planCompletion) ? (parsed.planCompletion as Record<string, boolean>) : {},
    planGeneratedAt: typeof parsed.planGeneratedAt === 'string' ? parsed.planGeneratedAt : null,
    chat: Array.isArray(parsed.chat) ? (parsed.chat as TutorMessage[]) : [],
    events: Array.isArray(parsed.events) ? (parsed.events as LearningEvent[]) : []
  }
}

export function loadState(storage: KvStorage): LearningState | null {
  try {
    return deserializeState(storage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

export function saveState(storage: KvStorage, state: LearningState): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function clearState(storage: KvStorage): void {
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    /* 忽略清理失败：重置后仍以内存初始状态运行 */
  }
}
