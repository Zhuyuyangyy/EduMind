/**
 * 移动端学习数据契约（P2-2A · feat/mobile-v1）
 * 单一数据来源：服务端按账号隔离的接口。所有 UI 消费的数据必须带来源标识，
 * 禁止把模型估计/规则降级/演示数据冒充账号真实学习结果。
 */

/** 数据来源标识（UI 必须据此标注，不得混用） */
export type DataProvenance =
  | 'account' // 账号真实记录（画像/路径/历史）
  | 'estimate' // 模型估计（如知识路径的 mastery 预测）
  | 'fallback' // 规则降级生成
  | 'demo' // 演示占位数据（明确标记，不得伪装真实）

/** 知识路径知识点（/api/knowledge-path/latest 的 phases[].topics[]） */
export interface KnowledgeTopic {
  id: string
  name: string
  /** 模型估计的掌握度 0~1，不是完成率 */
  mastery: number
  /** 重要度 0~1 */
  importance: number
  recommended: boolean
}

export interface KnowledgePhase {
  id: string
  name: string
  short?: string
  color?: string
  topics: KnowledgeTopic[]
}

export interface KnowledgePath {
  phases: KnowledgePhase[]
}

/** 画像维度（兼容 dimensions 与 radarPoints 两种历史格式） */
export interface ProfileDimension {
  label: string
  value: number
  color?: string
}

export interface LearnerProfile {
  dimensions?: ProfileDimension[]
  radarPoints?: Array<{ dimension: string; score: number }>
  totalScore?: number
  weaknesses?: Array<{ tag: string; count?: number }>
  recommendations?: string[]
  source?: string
  savedAt?: string
}

/** 学习闭环统一契约（服务端 normalizeLearningCycle 归一后的形态） */
export interface LearningCycle {
  workflowId: string | null
  accountId: string | null
  createdAt: string | null
  /** 证据标记：'unverified-client-input' = 旧演示闭环（未核验）；真实闭环带评分事件 ID */
  evidence: string | null
  profile: LearnerProfile | null
  profileBefore: LearnerProfile | null
  profileChanges: Array<{ dimension?: string; before?: number; after?: number; reason?: string }>
  resourcePackage: unknown
  tutoring: unknown
  evaluation: unknown
  path: KnowledgePath | null
  reflection: unknown
  trace: unknown
  agentResults: unknown[]
}

/** 辅导历史条目（服务端 q/a/time 形态） */
export interface TutoringHistoryItem {
  q: string
  a: string
  time: string
  mode?: string
  scenario?: string
  /** P2-2C 起新记录携带；旧记录缺失 → 来源未记录 */
  fallbackAgents?: string[]
}

/** 导师页统一消息模型（历史 + 新问答共用） */
export interface TutorMessage {
  id: string
  question: string
  answer: string
  time: string
  /** 来源标注：真实模型 / 规则降级 / 来源未记录（旧历史） */
  source: 'model' | 'fallback' | 'unknown'
  fallbackAgents: string[]
}

/** 今日主题选取结果（可追溯到具体 topic） */
export interface TodayTopic {
  phaseId: string
  phaseName: string
  topicId: string
  topicName: string
  /** 选取理由（确定性规则，可展示给用户） */
  reason: string
  /** 掌握度为模型估计，不是完成率 */
  masteryEstimate: number
  importance: number
}
