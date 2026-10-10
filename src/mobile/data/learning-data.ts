/**
 * 移动端学习数据适配层（P2-2A · feat/mobile-v1）
 *
 * 职责：
 * - 把服务端响应收敛为类型化契约（不直接用 any 映射 UI）；
 * - 兼容画像的 dimensions / radarPoints 两种历史格式；
 * - 提供可追溯的今日主题确定性选取；
 * - 异步请求防串号：epoch 机制丢弃过期账号的响应。
 */
import { apiGet } from '@/lib/api'
import { getAuthSession } from '@/lib/auth'
import type {
  KnowledgePath,
  KnowledgeTopic,
  LearnerProfile,
  LearningCycle,
  ProfileDimension,
  TodayTopic,
  TutorMessage,
  TutoringHistoryItem,
} from './types'

/** 数据纪元：登录/退出/切号时递增；异步响应仅在当时纪元一致时才允许落状态 */
let dataEpoch = 0

export function currentEpoch(): number {
  return dataEpoch
}

export function bumpDataEpoch(): void {
  dataEpoch += 1
}

function isCurrent(epoch: number): boolean {
  return epoch === dataEpoch
}

/* ———————————— 原始获取（带纪元校验） ———————————— */

export interface AccountData {
  profile: LearnerProfile | null
  knowledgePath: KnowledgePath | null
  learningCycle: LearningCycle | null
}

/**
 * 拉取当前账号的学习数据。返回 null 表示响应已过期（切号/退出），调用方应丢弃。
 */
export async function fetchAccountData(): Promise<AccountData | null> {
  const epoch = currentEpoch()
  const [profile, knowledgePath, learningCycle] = await Promise.all([
    apiGet<{ result: LearnerProfile | null }>('/api/profile/latest').catch(() => null),
    apiGet<{ result: KnowledgePath | null }>('/api/knowledge-path/latest').catch(() => null),
    apiGet<{ result: LearningCycle | null }>('/api/learning-cycles/latest').catch(() => null),
  ])
  if (!isCurrent(epoch)) return null
  return {
    profile: profile?.result ?? null,
    knowledgePath: knowledgePath?.result ?? null,
    learningCycle: learningCycle?.result ?? null,
  }
}

export async function fetchTutoringHistoryItems(): Promise<TutoringHistoryItem[] | null> {
  const epoch = currentEpoch()
  const data = await apiGet<{ items: TutoringHistoryItem[] }>('/api/tutoring/history').catch(() => null)
  if (!isCurrent(epoch)) return null
  return Array.isArray(data?.items) ? data.items : []
}

/* ———————————— 画像适配（dimensions / radarPoints 双格式） ———————————— */

export function profileDimensions(profile: LearnerProfile | null): ProfileDimension[] {
  if (!profile) return []
  if (Array.isArray(profile.dimensions) && profile.dimensions.length > 0) {
    return profile.dimensions
      .filter(d => d && typeof d.label === 'string' && typeof d.value === 'number')
      .map(d => ({ label: d.label, value: d.value, color: d.color }))
  }
  // 对话页保存的 radarPoints 格式
  if (Array.isArray(profile.radarPoints) && profile.radarPoints.length > 0) {
    return profile.radarPoints
      .filter(p => p && typeof p.dimension === 'string' && typeof p.score === 'number')
      .map(p => ({ label: p.dimension, value: p.score, color: '#3b82f6' }))
  }
  return []
}

export function profileTotalScore(profile: LearnerProfile | null): number | null {
  if (!profile) return null
  if (typeof profile.totalScore === 'number') return profile.totalScore
  const dims = profileDimensions(profile)
  if (dims.length === 0) return null
  return Math.round(dims.reduce((sum, d) => sum + d.value, 0) / dims.length)
}

/* ———————————— 今日主题：确定性选取（可追溯） ———————————— */

/**
 * 从知识路径中选取今日学习主题。规则确定且可复现：
 * 1. 只在 recommended = true 的知识点中选；
 * 2. 按 (importance 降序, mastery 升序, topicId 字典序) 取第一个——
 *    重要且掌握估计低的优先；同分时稳定，不随机；
 * 3. 没有 recommended 时退化为全路径同规则选取，并在 reason 中说明。
 */
export function selectTodayTopic(path: KnowledgePath | null): TodayTopic | null {
  if (!path || !Array.isArray(path.phases) || path.phases.length === 0) return null

  const candidates: Array<{ phaseId: string; phaseName: string; topic: KnowledgeTopic; recommended: boolean }> = []
  for (const phase of path.phases) {
    for (const topic of phase.topics || []) {
      if (!topic || typeof topic.id !== 'string') continue
      candidates.push({ phaseId: phase.id, phaseName: phase.name, topic, recommended: !!topic.recommended })
    }
  }
  if (candidates.length === 0) return null

  const rank = (a: typeof candidates[number], b: typeof candidates[number]) => {
    if (b.topic.importance !== a.topic.importance) return b.topic.importance - a.topic.importance
    if (a.topic.mastery !== b.topic.mastery) return a.topic.mastery - b.topic.mastery
    return a.topic.id.localeCompare(b.topic.id)
  }

  const recommendedPool = candidates.filter(c => c.recommended)
  const usingRecommended = recommendedPool.length > 0
  const pool = usingRecommended ? recommendedPool : candidates
  const best = [...pool].sort(rank)[0]

  return {
    phaseId: best.phaseId,
    phaseName: best.phaseName,
    topicId: best.topic.id,
    topicName: best.topic.name,
    reason: usingRecommended
      ? '路径推荐知识点中重要度最高、掌握估计最低的一项'
      : '路径暂无推荐标记，取全路径中重要度最高、掌握估计最低的一项',
    masteryEstimate: best.topic.mastery,
    importance: best.topic.importance,
  }
}

/** 掌握度展示映射：0 / 0.5 / 1 都必须可区分，且不得表述为完成率 */
export function masteryLabel(mastery: number): { text: string; level: 'low' | 'mid' | 'high' } {
  if (!Number.isFinite(mastery)) return { text: '估计缺失', level: 'low' }
  if (mastery <= 0.001) return { text: '估计未接触', level: 'low' }
  if (mastery >= 0.999) return { text: '估计熟练', level: 'high' }
  if (mastery < 0.4) return { text: '估计薄弱', level: 'low' }
  if (mastery < 0.7) return { text: '估计中等', level: 'mid' }
  return { text: '估计良好', level: 'high' }
}

/* ———————————— 辅导历史 → 统一消息模型 ———————————— */

export function historyToMessages(items: TutoringHistoryItem[]): TutorMessage[] {
  return items
    .filter(item => item && typeof item.q === 'string' && typeof item.a === 'string')
    .map((item, index) => {
      const fallbackAgents = Array.isArray(item.fallbackAgents) ? item.fallbackAgents : []
      return {
        id: `history-${index}-${item.time || 'na'}`,
        question: item.q,
        answer: item.a,
        time: item.time || '',
        // 旧历史没有 fallback 元数据 → 来源未记录，不得标为真实模型生成
        source: fallbackAgents.length > 0 ? 'fallback' : (item.fallbackAgents ? 'model' : 'unknown'),
        fallbackAgents,
      }
    })
}

/** 新问答结果 → 消息模型（携带真实 fallback 元数据） */
export function replyToMessage(reply: {
  question: string
  answer: string
  time?: string
  fallbackAgents?: string[]
}): TutorMessage {
  const fallbackAgents = Array.isArray(reply.fallbackAgents) ? reply.fallbackAgents : []
  return {
    id: `live-${Date.now()}`,
    question: reply.question,
    answer: reply.answer,
    time: reply.time || '',
    source: fallbackAgents.length > 0 ? 'fallback' : 'model',
    fallbackAgents,
  }
}

/* ———————————— 账号守卫 ———————————— */

/** 当前本地会话账号（用于渲染前二次校验，防旧账号数据残留） */
export function currentAccount(): string | null {
  return getAuthSession()?.account ?? null
}
