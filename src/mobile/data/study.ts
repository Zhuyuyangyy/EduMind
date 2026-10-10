/**
 * 移动端练习数据层（P3-3A · feat/mobile-v1）
 *
 * 规则：
 * - 客户端只提交答案；正确率/标准答案/分数一律来自服务端；
 * - 幂等键本地稳定生成并持久化：网络超时后重试用同一把钥匙，
 *   服务端返回首次评分结果，不会重复计分；
 * - 会话恢复：GET 会话拿题目快照与已答状态，未作答题不泄露答案。
 */
import { apiGet, apiPost } from '@/lib/api'
import { bumpDataEpoch, currentEpoch } from './learning-data'
import type { TutorMessage } from './types'

export interface StudyExercise {
  id: string
  version: number
  topicId: string
  phaseId: string
  domain: string
  knowledgePoint: string
  difficulty: string
  type: string
  prompt: string
  choices?: string[]
  /** 仅已完成会话返回（结果页展示用） */
  answer?: number
  explanation?: string
}

export interface StudySession {
  id: string
  topicId: string | null
  phaseId: string | null
  status: 'active' | 'completed'
  exerciseIds: string[]
  createdAt: string
  completedAt: string | null
  timezone: string
}

export interface StudyAttempt {
  exerciseId: string
  exerciseVersion: number
  correct: boolean
  reason: string
  submitted: unknown
  submittedAt: string
}

export interface StudyStats {
  completedSessions: number
  totalAnswers: number
  correctAnswers: number
  studyDays: number
  streakDays: number
}

export interface FeedbackResult {
  assessment: { total: number; correct: number; correctRate: number | null }
  feedback: { source: 'model' | 'rule'; text: string; degraded: boolean; error: string | null }
  profileUpdate: {
    applied: boolean
    reason: string
    changes: Array<{ dimension: string; before: number; after: number; delta: number; reason: string }>
    skippedDimensions?: string[]
    reconciled?: boolean
  }
  pathUpdate: { applied: boolean; reason: string; version?: number; basedOn?: number; reconciled?: boolean }
  rules?: Record<string, number>
  idempotent?: boolean
}

const KEY_STORAGE = 'edumind-study-idem-keys'

/** 稳定的幂等键：同一 (session, exercise) 始终同一把钥匙 */
export function idempotencyKeyFor(sessionId: string, exerciseId: string): string {
  let map: Record<string, string> = {}
  try {
    map = JSON.parse(localStorage.getItem(KEY_STORAGE) || '{}')
  } catch {
    map = {}
  }
  const composite = `${sessionId}:${exerciseId}`
  if (!map[composite]) {
    map[composite] = `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    try {
      localStorage.setItem(KEY_STORAGE, JSON.stringify(map))
    } catch {
      /* 存储不可用时退化为进程内键（服务端仍有 (session,exercise) 唯一兜底） */
    }
  }
  return map[composite]
}

/** 切换账号时清理本地幂等键（避免跨账号本地残留） */
export function clearIdempotencyKeys(): void {
  try {
    localStorage.removeItem(KEY_STORAGE)
  } catch {
    /* ignore */
  }
}

function isCurrent(epoch: number): boolean {
  return epoch === currentEpoch()
}

export async function createStudySession(topicIds: string[], exerciseCount = 3): Promise<{
  session: StudySession
  exercises: StudyExercise[]
} | { error: string; message: string }> {
  const epoch = currentEpoch()
  try {
    const result = await apiPost<{ session: StudySession; exercises: StudyExercise[] }>('/api/study/sessions', {
      topicIds,
      exerciseCount,
    })
    return isCurrent(epoch) ? result : { error: 'stale', message: '账号已切换，请重试' }
  } catch (err) {
    return { error: 'request-failed', message: err instanceof Error ? err.message : '创建练习失败' }
  }
}

export async function fetchStudySession(sessionId: string): Promise<{
  session: StudySession
  attempts: StudyAttempt[]
} | null> {
  const epoch = currentEpoch()
  try {
    const result = await apiGet<{ session: StudySession; attempts: StudyAttempt[] }>(`/api/study/sessions/${sessionId}`)
    return isCurrent(epoch) ? result : null
  } catch {
    return null
  }
}

/** 会话恢复：题目快照 + 已答状态 + 权威评分；revealed=true 时含答案（已完成会话） */
export async function fetchSessionQuestions(sessionId: string): Promise<{
  session: StudySession
  exercises: StudyExercise[]
  answered: Array<{ exerciseId: string; correct: boolean; submitted: unknown }>
  revealed: boolean
  assessment: { total: number; correct: number; correctRate: number | null }
  bankVersion: number | null
  fromSnapshot: boolean
} | null> {
  const epoch = currentEpoch()
  try {
    const result = await apiGet<{
      session: StudySession
      exercises: StudyExercise[]
      answered: Array<{ exerciseId: string; correct: boolean; submitted: unknown }>
      revealed: boolean
      assessment: { total: number; correct: number; correctRate: number | null }
      bankVersion: number | null
      fromSnapshot: boolean
    }>(`/api/study/sessions/${sessionId}/questions`)
    return isCurrent(epoch) ? result : null
  } catch {
    return null
  }
}

export interface AnswerResult {
  ok: boolean
  code?: string
  message?: string
  correct?: boolean
  reason?: string
  duplicate?: boolean
  progress?: { answered: number; total: number; correct: number }
}

export async function submitAnswer(
  sessionId: string,
  exerciseId: string,
  submitted: number,
): Promise<AnswerResult> {
  const epoch = currentEpoch()
  try {
    const result = await apiPost<AnswerResult & { ok: boolean }>(
      `/api/study/sessions/${sessionId}/answers`,
      { exerciseId, submitted, idempotencyKey: idempotencyKeyFor(sessionId, exerciseId) },
    )
    return isCurrent(epoch) ? result : { ok: false, code: 'stale', message: '账号已切换' }
  } catch (err) {
    const message = err instanceof Error ? err.message : '提交失败'
    // 401 已被 api 层统一处理并跳转登录；这里覆盖其余错误
    return { ok: false, code: 'request-failed', message }
  }
}

export async function completeStudySession(sessionId: string): Promise<{
  ok: boolean
  code?: string
  message?: string
  duplicate?: boolean
  assessment?: { total: number; correct: number; correctRate: number | null }
}> {
  const epoch = currentEpoch()
  try {
    const result = await apiPost<{
      ok: boolean
      code?: string
      message?: string
      duplicate?: boolean
      assessment?: { total: number; correct: number; correctRate: number | null }
    }>(`/api/study/sessions/${sessionId}/complete`, {})
    return isCurrent(epoch) ? result : { ok: false, code: 'stale', message: '账号已切换' }
  } catch (err) {
    return { ok: false, code: 'request-failed', message: err instanceof Error ? err.message : '完成失败' }
  }
}

/** 反馈（幂等）：重复调用返回首次处理缓存的结果 */
export async function fetchFeedback(sessionId: string): Promise<FeedbackResult | { error: string; message: string }> {
  const epoch = currentEpoch()
  try {
    const result = await apiPost<FeedbackResult>(`/api/study/sessions/${sessionId}/feedback`, {})
    return isCurrent(epoch) ? result : { error: 'stale', message: '账号已切换' }
  } catch (err) {
    return { error: 'request-failed', message: err instanceof Error ? err.message : '反馈获取失败' }
  }
}

export async function fetchStudyStats(): Promise<StudyStats | null> {
  const epoch = currentEpoch()
  try {
    const result = await apiGet<StudyStats>('/api/study/stats')
    return isCurrent(epoch) ? result : null
  } catch {
    return null
  }
}

export async function fetchStudyRevisions(): Promise<Array<{
  id: string
  reason: string
  source: string
  version: number
  createdAt: string
  eventIds: string[]
}> | null> {
  const epoch = currentEpoch()
  try {
    const result = await apiGet<{ items: Array<{ id: string; reason: string; source: string; version: number; createdAt: string; eventIds: string[] }> }>('/api/study/revisions')
    return isCurrent(epoch) ? result.items : null
  } catch {
    return null
  }
}

/** 账号切换时调用：清理本地幂等键并使在途响应失效 */
export function resetStudyLocalState(): void {
  clearIdempotencyKeys()
  bumpDataEpoch()
}

export type { TutorMessage }
