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
import { clearAuthSession, getAuthSession, getAuthTokenGuarded, getCsrfToken, currentAuthEpoch, registerInFlight, unregisterInFlight } from '@/lib/auth'
import { isMobileApp, resolveApiUrl } from '@/lib/api-config'

function currentAccountId() {
  return getAuthSession()?.account || 'default'
}

export interface AccountSettings {
  accountId: string
  displayName: string
  updatedAt?: string
}

export interface LoginResult {
  account: string
  displayName: string
  role: 'student' | 'admin'
  /** 服务端签发会话 token；Capacitor 端放入 Authorization: Bearer，Web 端由 Cookie 自动携带 */
  token: string
  expiresAt: string
}

export async function loginDemoAccount(account: string, password: string, role: 'student' | 'admin') {
  return requestJson<LoginResult>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ account, password, role }),
  })
}

/** 用服务端会话校验本地登录态（启动时调用）。 */
export async function fetchCurrentSession() {
  return requestJson<{ account: string; role: 'student' | 'admin'; displayName: string }>('/api/auth/session')
}

export async function logout() {
  try {
    await requestJson<{ ok: true }>('/api/auth/logout', { method: 'POST' })
  } finally {
    clearAuthSession()
  }
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

/**
 * 通用 JSON 请求（P1.5 导出供移动端状态页等使用）。
 * 自动携带 Bearer + Cookie、统一 401 处理与超时；调用方需自行 try/catch。
 */
export async function apiGet<T>(input: string, init?: RequestInit): Promise<T> {
  return requestJson<T>(input, init)
}

/** 通用 JSON POST（P2-2B 供移动端生成知识路径等使用） */
export async function apiPost<T>(input: string, body?: unknown): Promise<T> {
  return requestJson<T>(input, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  })
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

  // P4-2A：请求发起时捕获身份纪元。凭据异步读取期间若发生退出/切号
  // （纪元变化），本请求不得继续携带旧凭据发出。
  const epochAtStart = currentAuthEpoch()
  try {
    // P4-1C：token/CSRF 均异步获取（原生走 Keystore 安全存储）；
    // P4-2A：token 读取带纪元防护
    const [token, csrfToken] = await Promise.all([getAuthTokenGuarded(epochAtStart), getCsrfToken()])
    // 统一超时（默认 60s，可用 VITE_API_TIMEOUT_MS 覆盖），超时走 AbortError → 友好提示
    const timeoutMs = Number(import.meta.env.VITE_API_TIMEOUT_MS) > 0 ? Number(import.meta.env.VITE_API_TIMEOUT_MS) : 60000
    const controller = new AbortController()
    // P4-1C：注册在途请求——安全清理/切号时一并中止
    registerInFlight(controller)
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try {
      const isStateChanging = method !== 'GET' && method !== 'HEAD'
      // 纪元在读取期间被推进（退出/切号）→ 视作已取消，不发请求
      if (currentAuthEpoch() !== epochAtStart) {
        const abortError = new Error('Request aborted: auth session changed')
        abortError.name = 'AbortError'
        throw abortError
      }
      response = await fetch(resolveApiUrl(input), {
        credentials: 'include',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          // Cookie 认证的写操作双提交 CSRF（Bearer 认证无需）
          ...(isStateChanging && !token && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          ...(init?.headers || {}),
        },
        ...init,
      })
    } finally {
      clearTimeout(timer)
      unregisterInFlight(controller)
    }

    if (!response.ok) {
      if (isAiRequest) {
        appStore.finishAiRequest(false)
        aiRequestSettled = true
      }
      // 登录接口的 401 是账号密码错误，不做会话失效处理
      if (response.status === 401 && !input.startsWith('/api/auth/')) {
        clearAuthSession()
        if (typeof window !== 'undefined') {
          // 移动端用 hash 路由，网页版用 history 路由
          window.location.assign(isMobileApp() ? '#/login' : '/login')
        }
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

/**
 * 生成聊天幂等键（P4-2B-3b）。
 * 调用方在首次发送时生成，网络失败重试时复用同一个键——服务端按
 * (account, client_message_id) 唯一约束保证只落库一次，重试返回
 * 首次结果。禁止对不同的消息内容复用同一个键（服务端返回 409）。
 */
export function createChatIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

export function sendChatMessage(
  message: string,
  multimodalContents?: MultimodalContent[],
  options?: { idempotencyKey?: string },
) {
  return requestJson<ChatReply>('/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      message,
      multimodalContents,
      ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
    }),
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
