/** 智学星枢竞赛版 · 领域模型（全部为演示数据，不对应真实学生） */

export interface KnowledgePoint {
  id: string
  name: string
  category: string
  description: string
  /** 先修知识点 id 列表 */
  prerequisites: string[]
  /** 预计学习时长（分钟，演示估值） */
  estMinutes: number
}

export interface DemoCourse {
  id: string
  name: string
  subtitle: string
  description: string
  goals: string[]
  level: string
  knowledgePoints: KnowledgePoint[]
}

export interface DiagnosisQuestion {
  id: string
  kpId: string
  prompt: string
  choices: string[]
  /** 正确选项下标 */
  answer: number
  explanation: string
}

export interface Exercise {
  id: string
  kpId: string
  difficulty: 'easy' | 'medium' | 'hard'
  prompt: string
  choices: string[]
  answer: number
  explanation: string
}

export interface KbCard {
  id: string
  kpId: string
  title: string
  /** 检索关键词（含同义词） */
  keywords: string[]
  concept: string
  example: string
  pitfalls: string[]
  /** 引用依据：课程资料出处（演示内容） */
  source: string
  relatedExercises: string[]
  followUps: string[]
}

export type MasteryStatus = 'untested' | 'weak' | 'learning' | 'mastered'

export interface KpEvidence {
  correct: number
  total: number
}

export interface MasteryChange {
  at: string
  before: number
  after: number
  reason: string
  kind: 'diagnosis' | 'practice'
}

export interface KpMasteryState {
  kpId: string
  /** 掌握度 0-100（演示评估值，非真实能力测量） */
  mastery: number
  diagnosis: KpEvidence | null
  practiceCount: number
  practiceCorrect: number
  lastResult: (KpEvidence & { at: string; kind: 'diagnosis' | 'practice' }) | null
  history: MasteryChange[]
}

export type PlanTaskKind = 'learn' | 'practice' | 'review' | 'project' | 'assessment'

export interface PlanTask {
  /** 稳定键，用于跨重新生成保留完成状态 */
  key: string
  day: number
  kpId: string | null
  kpName: string
  kind: PlanTaskKind
  title: string
  minutes: number
  reason: string
}

export interface TutorMessage {
  id: string
  role: 'user' | 'tutor'
  text: string
  at: string
  /** 导师回复的引用依据（演示知识库出处） */
  source?: string
  matchedTerms?: string[]
  kpId?: string
}

export type LearningEventKind =
  | 'diagnosis-submitted'
  | 'practice-submitted'
  | 'plan-generated'
  | 'plan-task-completed'
  | 'demo-reset'

export interface LearningEvent {
  id: string
  kind: LearningEventKind
  at: string
  summary: string
}

export interface LearningState {
  version: number
  courseId: string
  diagnosis: {
    /** questionId -> 选项下标 */
    answers: Record<string, number>
    submitted: boolean
    submittedAt: string | null
  }
  kpStates: Record<string, KpMasteryState>
  /** kpId -> exerciseId -> 选项下标 */
  practice: Record<string, Record<string, number>>
  /** planTaskKey -> 是否完成 */
  planCompletion: Record<string, boolean>
  planGeneratedAt: string | null
  chat: TutorMessage[]
  events: LearningEvent[]
}
