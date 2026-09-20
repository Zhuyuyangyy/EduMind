import type {
  ApiResource,
  ChatHistoryItem,
  ChatReply,
  EvaluationResponse,
  LearningPathResponse,
  LatestProfileResponse,
  ProfileAnalyzeRequest,
  ProfileAnalyzeResponse,
  TutoringHistoryItem,
  TutoringReply,
  MultimodalContent,
  AgentTrace,
  LearningWorkflowResponse,
  GeneratedResource,
  GeneratedResourceItem,
  EvidenceTrace,
  TraceRecord,
  EvidenceSummary,
  ResourceGenerateRequest,
  ResourceGenerateResponse,
  EvidenceTracesResponse,
  EvidenceSummaryResponse,
  PathReplanResponse,
  TutorAgentResponse,
  FullEvaluationResponse,
  FullRunRequest,
  FullRunResponse,
  KnowledgeContextResponse,
  KnowledgeStatusResponse,
} from '@/types/api'
import type { ProfileResult } from '@/composables/useProfileSurvey'
import { useAppStore } from '@/store'
import { getAuthSession } from '@/lib/auth'

function currentAccountId() {
  return getAuthSession()?.account || 'default'
}

export interface AccountSettings {
  accountId: string
  displayName: string
  updatedAt?: string
}

export async function loginDemoAccount(account: string, password: string, role: 'student' | 'admin') {
  return requestJson<{ account: string; displayName: string; role: 'student' | 'admin' }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ account, password, role }),
  })
}

export async function fetchAccountSettings(accountId = currentAccountId()) {
  const data = await requestJson<{ result: AccountSettings | null }>(`/api/account/settings?accountId=${encodeURIComponent(accountId)}`)
  return data.result
}

export async function saveAccountSettings(displayName: string) {
  const data = await requestJson<{ result: AccountSettings }>('/api/account/settings', {
    method: 'POST',
    body: JSON.stringify({ accountId: currentAccountId(), displayName }),
  })
  return data.result
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const appStore = useAppStore()
  const method = (init?.method ?? 'GET').toUpperCase()
  const isAiRequest =
    method !== 'GET' &&
    (
      input.startsWith('/api/chat') ||
      input.startsWith('/api/tutoring') ||
      input.startsWith('/api/profile/analyze') ||
      input.startsWith('/api/agents/') ||
      input.startsWith('/api/resources/generate')
    )

  if (isAiRequest) {
    appStore.beginAiRequest()
  }

  let aiRequestSettled = false

  try {
    const response = await fetch(input, {
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
      ...init,
    })

    if (!response.ok) {
      if (isAiRequest) {
        appStore.finishAiRequest(false)
        aiRequestSettled = true
      }
      throw new Error(`Request failed: ${response.status}`)
    }

    const data = await response.json() as T

    if (isAiRequest) {
      appStore.finishAiRequest(true)
      aiRequestSettled = true
    }

    return data
  } catch (error) {
    if (isAiRequest && !aiRequestSettled) {
      appStore.finishAiRequest(false)
    }
    throw error
  }
}

export function analyzeProfile(payload: ProfileAnalyzeRequest) {
  return requestJson<ProfileAnalyzeResponse>('/api/profile/analyze', {
    method: 'POST',
    body: JSON.stringify({ ...payload, accountId: currentAccountId() }),
  })
}

export async function fetchLatestProfile() {
  const data = await requestJson<LatestProfileResponse>(`/api/profile/latest?accountId=${encodeURIComponent(currentAccountId())}`)
  return data.result
}

export function saveProfile(report: { score: number; radarPoints: { dimension: string; score: number }[]; weaknesses: string[]; suggestions: string[] } | ProfileResult) {
  return requestJson<any>('/api/profile/save', {
    method: 'POST',
    body: JSON.stringify({ ...report, accountId: currentAccountId() }),
  })
}

export function triggerKnowledgePath(profile?: unknown) {
  return requestJson<any>('/api/knowledge-path/generate', {
    method: 'POST',
    body: JSON.stringify({ profile }),
  })
}

export function fetchKnowledgePath() {
  return requestJson<{ result: any }>('/api/knowledge-path/latest')
}

export function sendChatMessage(message: string, multimodalContents?: MultimodalContent[]) {
  return requestJson<ChatReply>('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message, multimodalContents }),
  })
}

export async function fetchChatHistory() {
  const data = await requestJson<{ items: ChatHistoryItem[] }>('/api/chat/history')
  return data.items
}

export function askTutoringQuestion(question: string, mode: string, scenario?: string, multimodalContents?: MultimodalContent[]) {
  return requestJson<TutoringReply>('/api/tutoring/ask', {
    method: 'POST',
    body: JSON.stringify({ question, mode, scenario, multimodalContents }),
  })
}

export async function fetchTutoringHistory() {
  const data = await requestJson<{ items: TutoringHistoryItem[] }>('/api/tutoring/history')
  return data.items
}

export async function fetchResources(type?: string, q?: string) {
  const params = new URLSearchParams()
  if (type) params.set('type', type)
  if (q) params.set('q', q)
  const query = params.toString()
  const data = await requestJson<{ items: ApiResource[] }>(`/api/resources${query ? `?${query}` : ''}`)
  return data.items
}

export async function fetchRecommendedResources() {
  const data = await requestJson<{ items: ApiResource[] }>('/api/resources/recommended')
  return data.items
}

export function fetchLearningPath() {
  return requestJson<LearningPathResponse>('/api/learning-path')
}

export function fetchEvaluation() {
  return requestJson<EvaluationResponse>('/api/evaluation')
}

export function fetchAgentWorkflow() {
  return requestJson<LearningWorkflowResponse>('/api/agent/workflow')
}

export function generateResources(topic?: string, resourceType?: string) {
  return requestJson<{ resources: GeneratedResourceItem[] }>('/api/resources/generate', {
    method: 'POST',
    body: JSON.stringify({
      topic: topic || '综合学习',
      resourceType: resourceType || 'concept',
    }),
  })
}

export function generateResource(payload: ResourceGenerateRequest) {
  return requestJson<ResourceGenerateResponse>('/api/resources/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchEvidenceTraces(limit = 50, offset = 0) {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  params.set('offset', String(offset))
  return requestJson<EvidenceTracesResponse>(`/api/evidence/traces?${params.toString()}`)
}

export function fetchEvidenceSummary() {
  return requestJson<EvidenceSummaryResponse>('/api/evidence/summary')
}

export function agentProfileAnalyze(payload: unknown) {
  return requestJson<{ profile: ProfileAnalyzeResponse; agentResults: unknown[]; trace: unknown }>('/api/agents/profile', {
    method: 'POST',
    body: JSON.stringify({ ...(payload as Record<string, unknown>), accountId: currentAccountId() }),
  })
}

export function fetchTutoringTopics() {
  return requestJson<{ topics: Array<{ id: string; label: string; category: string }> }>('/api/tutoring/topics')
}

export function agentPathReplan(payload: { profile?: unknown; evaluation?: unknown; currentPath?: unknown }) {
  return requestJson<PathReplanResponse>('/api/agents/path-replan', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function agentTutoring(payload: { question: string; mode: string; profile?: unknown; resources?: unknown[]; hintLevel?: number; attempts?: number }) {
  return requestJson<TutorAgentResponse>('/api/agents/tutor', {
    method: 'POST',
    body: JSON.stringify({ ...payload, accountId: currentAccountId() }),
  })
}

export function submitLearningCycleUpdate(payload: {
  profile: unknown
  currentPath?: unknown
  learningData?: unknown
  exerciseResults?: unknown
}) {
  return requestJson<{
    workflowId: string
    profileChanges: Array<{ dimension: string; before: number; after: number; reason: string }>
    path: { replanReason?: string; phases?: unknown[] }
    reflection: { reflection?: string; nextSteps?: string[] }
    trace: TraceRecord
  }>('/api/learning-cycles/update', {
    method: 'POST',
    body: JSON.stringify({ ...payload, accountId: currentAccountId() }),
  })
}

export function agentEvaluate(payload: { profile?: unknown; learningData?: unknown; exerciseResults?: unknown }) {
  return requestJson<FullEvaluationResponse>('/api/agents/evaluate', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchKnowledgeStatus() {
  return requestJson<KnowledgeStatusResponse>('/api/knowledge/status')
}

export function searchKnowledge(payload: { query?: string; profile?: unknown; learningData?: unknown; exerciseResults?: unknown; limit?: number }) {
  return requestJson<KnowledgeContextResponse>('/api/knowledge/search', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function agentFullRun(payload: FullRunRequest) {
  return requestJson<FullRunResponse>('/api/agents/run', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export interface AgentCollaborationEvent {
  id: string
  chain: string
  agent: string
  t: number
  type: string
  label: string
  detail: string
}

export interface AgentCollaborationChain {
  id: string
  name: string
  summary: string
  issue: string
  outcome: string
  eventIds: string[]
}

export interface AgentCollaborationAgent {
  id: string
  name: string
  role: string
  color: string
  artSrc: string
}

export interface AgentCollaborationModule {
  id: string
  chainId: string
  name: string
  agentNames: string[]
  color: string
  artSrc: string
  eventCount: number
}

export interface AgentCollaborationDay {
  name: string
  label: string
  index: number
}

export interface AgentCollaborationResponse {
  dayOfWeek: number
  dayName: string
  dayLabel: string
  dateString: string
  totalAgents: number
  totalEvents: number
  totalChains: number
  agents: AgentCollaborationAgent[]
  chains: AgentCollaborationChain[]
  events: AgentCollaborationEvent[]
  modules: AgentCollaborationModule[]
}

export function fetchAgentCollaboration(day: string) {
  return requestJson<AgentCollaborationResponse>(`/api/agent-collaboration?day=${encodeURIComponent(day)}`)
}

export async function fetchAgentCollaborationDays() {
  const data = await requestJson<{ days: AgentCollaborationDay[] }>('/api/agent-collaboration/days')
  return data.days
}
