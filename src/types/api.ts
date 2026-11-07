import type { ProfileResult, SurveyAnswers } from '@/composables/useProfileSurvey'

export interface ApiResource {
  id: number
  type: 'doc' | 'mindmap' | 'exercise' | 'video' | 'code'
  title: string
  desc: string
  tags: string[]
  date: string
  color: string
  reads: number
  author?: string
  difficulty?: string
  reason?: string
  profileTag?: string
  pathStage?: string
  format?: string
  estTime?: string

  slides?: Array<{
    title: string
    subtitle?: string
    content: string
    icon?: string
    image?: string
  }>
  recommendEvidence?: {
    profileSource: string
    evaluationReason: string
    pathStage: string
    formatReason: string
  }
}

export interface ChatResource {
  type: 'doc' | 'mindmap' | 'exercise' | 'video' | 'code'
  title: string
  color?: string
}

export interface ApiSuggestion {
  text: string
  type?: 'weakness' | 'strength' | 'positive' | 'action'
}

export interface MultimodalContent {
  type: 'text' | 'image'
  text?: string
  imageData?: string
  imageType?: string
}

export interface ChatReply {
  content: string
  resources?: ChatResource[]
  suggestions?: string[]
}

export interface ChatHistoryItem {
  id: number
  role: 'user' | 'assistant'
  content: string
  time: string
  resources?: ChatResource[]
  suggestions?: string[]
  multimodalContents?: MultimodalContent[]
}

export interface TutoringReply {
  answer: string
  time: string
  /** 触发降级的智能体列表（空数组表示全程真实模型） */
  fallbackAgents?: string[]
  /** 提示注入等安全拦截标记 */
  securityRefused?: boolean
  riskFlags?: string[]
  /** 支架式教学元数据 */
  scaffolding?: unknown
}

export interface TutoringHistoryItem {
  q: string
  a: string
  time: string
  helpful?: boolean
  scenario: string
  mode: string
  multimodalContents?: MultimodalContent[]
}

export interface LearningPathResponse {
  dataSource?: 'real' | 'demo-fixture'
  simulated?: boolean
  phases: Array<{
    title: string
    period: string
    progress: number
    status: string
    color: string
    nodes: Array<{
      name: string
      progress: number
      duration: string
      resources: number
    }>
  }>
  weeklyGoals: Array<{
    label: string
    progress: number
    target: string
  }>
}

export interface EvaluationDashboardMetric {
  key: string
  label: string
  stage0: number
  stage1: number
  stage2: number
}

export interface EvaluationDashboardWeakness {
  id: string
  label: string
  severity: 'low' | 'medium' | 'high'
  reason: string
  impact: string
  action: string
}

export interface EvaluationDashboardPayload {
  flow: string[]
  profileMetrics: EvaluationDashboardMetric[]
  weaknesses: EvaluationDashboardWeakness[]
  evidenceRounds: Array<{
    stage: 0 | 1 | 2
    trigger: string
    evidence: string[]
    profileUpdates: string[]
    pathImpact: string
  }>
}

export interface EvaluationResponse {
  generatedAt: string
  dataSource?: 'real' | 'demo-fixture'
  simulated?: boolean
  stats: Array<{
    label: string
    value: string
    change: string
    color: string
    icon?: string
  }>
  suggestions: ApiSuggestion[]
  dashboard?: EvaluationDashboardPayload
}

export type ProfileAnalyzeRequest = SurveyAnswers
export type ProfileAnalyzeResponse = ProfileResult
export interface LatestProfileResponse {
  result: ProfileResult | null
}

export interface AgentTrace {
  agentId: string
  agentName: string
  role: string
  input: string
  process: string
  output: string
  confidence: number
  evidenceTags: string[]
  timestamp: string
  status: 'running' | 'completed' | 'pending' | 'error'
}

export interface LearningWorkflowResponse {
  workflowId: string
  startTime: string
  endTime: string
  agents: AgentTrace[]
  summary: string
  profileSnapshot: Record<string, unknown>
}

export interface GeneratedResource {
  id: string
  concept: string
  example: string
  exercise: string
  mistakeReminder: string
  recommendReason: string
  evidence: {
    profileSource: string
    evaluationReason: string
    pathStage: string
    formatReason: string
  }
  audioText?: string
}

export interface GeneratedResourceItem {
  type: 'video' | 'doc' | 'mindmap' | 'exercise' | 'code' | 'audio'
  title: string
  description: string
  difficulty: string
  estimatedMinutes: number
  tags: string[]
  formatReason: string
  sourceResourceId?: number
  source?: 'local-resource-library'
  assetKind?: 'interactive-slides' | 'catalog-item' | 'browser-speech' | 'unavailable'
  speechText?: string
  slides?: Array<{
    title: string
    subtitle?: string
    content: string
    keyPoints?: string[]
    example?: string
    tip?: string
  }>
}

export interface EvidenceTrace {
  traceId: string
  workflowId: string
  agentId: string
  agentName: string
  input: string
  output: string
  confidence: number
  evidenceTags: string[]
  timestamp: string
  duration: number
}

export interface EvidenceSummary {
  workflowId: string
  totalAgents: number
  completedAgents: number
  totalDuration: number
  traceCount: number
  keyFindings: string[]
  profileUpdates: Array<{
    field: string
    before: string
    after: string
    evidence: string
  }>
  pathAdjustments: Array<{
    reason: string
    addedNodes: string[]
    removedNodes: string[]
  }>
}

export interface AgentResult {
  agentName: string
  inputSummary: string
  outputSummary: string
  input: unknown
  output: unknown
  confidence: number
  evidence: string[]
  durationMs: number
  status: string
  fallbackUsed: boolean
}

export interface TraceAgentResult {
  agentName: string
  inputSummary: string
  outputSummary: string
  confidence: number
  evidence: string[]
  durationMs: number
  fallbackUsed: boolean
}

export interface TraceRecord {
  requestId: string
  timestamp: string
  agents: string[]
  inputsSummary: string
  outputsSummary: string
  evidence: string[]
  riskFlags: string[]
  fallbackUsed: boolean
  durationMs: number
  agentResults: TraceAgentResult[]
}

export interface ResourceGenerateRequest {
  profile?: ProfileResult
  weaknesses?: Array<{ tag: string; count: number }>
  topic: string
  resourceType: string
}

export interface ResourcePackage {
  concept: string
  example: { title: string; description: string; steps: string[] }
  exercise: { title: string; questions: Array<{ question: string; options: string[]; correctAnswer: string; explanation: string }> }
  errorTip: string
  recommendReason: string
  profileEvidence: string
}

export interface ResourceGenerateResponse {
  resourcePackage: ResourcePackage
  agentResults: AgentResult[]
  trace: TraceRecord
}

export interface EvidenceTracesResponse {
  items: TraceRecord[]
  total: number
}

export interface EvidenceSummaryResponse {
  totalTraces: number
  fallbackCount: number
  fallbackRate: number
  riskFlagCount: number
  riskRate: number
  avgDurationMs: number
  agentCounts: Record<string, number>
  lastTraceAt: string | null
  llmAvailable: boolean
}

export interface PathReplanResponse {
  path: LearningPathResponse & { replanReason?: string }
  evaluation: unknown
  agentResults: AgentResult[]
  trace: TraceRecord
}

export interface TutorAgentResponse {
  answer: string
  scaffolding?: {
    level: number
    attempts: number
    revealsCompleteAnswer: boolean
    nextLevelAvailable: boolean
  }
  agentResults: AgentResult[]
  trace: TraceRecord
}

export interface FullEvaluationResponse {
  evaluation: unknown
  reflection: unknown
  agentResults: AgentResult[]
  trace: TraceRecord
}

export interface KnowledgeHit {
  id: string
  source: 'local' | 'vector'
  title: string
  type: string
  tags: string[]
  summary: string
  agentHint: string
  score: number
}

export interface KnowledgeContextResponse {
  query: string
  matches: KnowledgeHit[]
  embedding: {
    model: string
    dimensions: number
    indexSize: number
    generatedAt: string
  }
}

export interface KnowledgeStatusResponse {
  model: string
  dimensions: number
  localDocuments: number
  vectorDocuments: number
  syncedAgents: string[]
  updatedAt: string
}

export interface FullRunRequest {
  answers?: unknown
  topic?: string
  resourceType?: string
  question?: string
  mode?: string
}

export interface FullRunResponse {
  workflowId: string
  agentResults: AgentResult[]
  resourcePackage: ResourcePackage
  tutoringAnswer: string
  evaluation: unknown
  path: LearningPathResponse & { replanReason?: string }
  reflection: unknown
  profile: ProfileResult
  trace: TraceRecord
}
