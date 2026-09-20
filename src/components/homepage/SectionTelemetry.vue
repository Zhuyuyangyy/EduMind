<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import { fetchAgentCollaboration, fetchAgentCollaborationDays } from '@/lib/api'
import type {
  AgentCollaborationResponse,
  AgentCollaborationDay,
} from '@/lib/api'
import {
  User,
  Search,
  Map,
  RefreshCw,
  BookOpen,
  Sparkles,
  Presentation,
  MessageCircle,
  FileCheck,
  AlertTriangle,
  RotateCcw,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Filter,
  ChevronDown,
  Info,
  Target,
  Clock,
  Heart,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Star,
  FileText,
  History,
  BookMarked,
  ShieldCheck,
  Sparkle,
  MoreHorizontal,
} from 'lucide-vue-next'

const T = {
  profileCapture: '#8F7CFF',
  profileDiagnosis: '#A78BFA',
  pathPlan: '#35E0D8',
  pathReplan: '#14B8A6',
  resourceSearch: '#45D483',
  resourceGenerate: '#84CC16',
  tutorExplain: '#F0B24A',
  tutorDialogue: '#FB923C',
  evalQuiz: '#F0586E',
  evalCause: '#EC4899',
  feedbackWrite: '#3B82F6',
  reflection: '#6366F1',
  text: '#e8edf5',
  textSub: '#91a3c7',
  textDim: '#52607f',
  sans: "'Outfit', 'PingFang SC', sans-serif",
}

const router = useRouter()

const dayLabelsFull = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

type AgentId = string

interface Agent {
  id: AgentId
  name: string
  role: string
  color: string
  artSrc: string
  icon: any
}

interface EventNode {
  id: string
  chain: string
  agent: AgentId
  t: number
  type: string
  label: string
  detail: string
  value?: 'high' | 'medium' | 'low'
}

interface Chain {
  id: string
  name: string
  summary: string
  issue: string
  outcome: string
  eventIds: string[]
}

function defaultAgents(): Agent[] {
  return [
    { id: 'profileCapture', name: '画像采集', role: 'PROFILE-1', color: T.profileCapture, artSrc: '/homepage/agent-load-profile.png', icon: User },
    { id: 'profileDiagnosis', name: '薄弱诊断', role: 'PROFILE-2', color: T.profileDiagnosis, artSrc: '/homepage/agent-load-profile.png', icon: Search },
    { id: 'pathPlan', name: '路径规划', role: 'PATH-1', color: T.pathPlan, artSrc: '/homepage/agent-load-path.png', icon: Map },
    { id: 'pathReplan', name: '动态重规划', role: 'PATH-2', color: T.pathReplan, artSrc: '/homepage/agent-load-path.png', icon: RefreshCw },
    { id: 'resourceSearch', name: '资源检索', role: 'RESOURCE-1', color: T.resourceSearch, artSrc: '/homepage/agent-load-resource.png', icon: BookOpen },
    { id: 'resourceGenerate', name: '资源生成', role: 'RESOURCE-2', color: T.resourceGenerate, artSrc: '/homepage/agent-load-resource.png', icon: Sparkles },
    { id: 'tutorExplain', name: '讲解辅导', role: 'TUTOR-1', color: T.tutorExplain, artSrc: '/homepage/agent-load-tutor.png', icon: Presentation },
    { id: 'tutorDialogue', name: '互动答疑', role: 'TUTOR-2', color: T.tutorDialogue, artSrc: '/homepage/agent-load-tutor.png', icon: MessageCircle },
    { id: 'evalQuiz', name: '评估出题', role: 'EVAL-1', color: T.evalQuiz, artSrc: '/homepage/agent-load-eval.png', icon: FileCheck },
    { id: 'evalCause', name: '错因分析', role: 'EVAL-2', color: T.evalCause, artSrc: '/homepage/agent-load-eval.png', icon: AlertTriangle },
    { id: 'feedbackWrite', name: '反馈回写', role: 'FEEDBACK-1', color: T.feedbackWrite, artSrc: '/homepage/agent-load-feedback.png', icon: RotateCcw },
    { id: 'reflection', name: '成长复盘', role: 'FEEDBACK-2', color: T.reflection, artSrc: '/homepage/agent-load-feedback.png', icon: TrendingUp },
  ]
}

function defaultChains(): Chain[] {
  return [
    { id: 'profile-module', name: '画像诊断模块', summary: '采集真实学习信号，再识别薄弱知识域。', issue: '学习行为信号分散', outcome: '定位 2 个薄弱域', eventIds: ['e1', 'e2'] },
    { id: 'path-module', name: '路径编排模块', summary: '规划与重规划协同，把薄弱点落到学习顺序里。', issue: '当前路径无法补弱', outcome: '重排课后巩固路径', eventIds: ['e3', 'e4', 'e5'] },
    { id: 'resource-module', name: '资源生产模块', summary: '检索候选资源，再生成适配画像的学习材料。', issue: '资源太多且不够贴合', outcome: '生成 5 项个性资源', eventIds: ['e6', 'e7', 'e8'] },
    { id: 'tutor-module', name: '辅导互动模块', summary: '讲解和追问配合，确认学生是否真正理解。', issue: '概念理解不稳定', outcome: '完成两轮追问确认', eventIds: ['e9', 'e10', 'e11'] },
    { id: 'eval-module', name: '测评分析模块', summary: '即时测评后归因，产出可回写的证据。', issue: '学习效果需要量化', outcome: '阶段测评提升到 82 分', eventIds: ['e12', 'e13', 'e14'] },
    { id: 'feedback-module', name: '反馈复盘模块', summary: '回写画像、生成复盘，并触发下一轮路径修正。', issue: '结果需要沉淀为行动', outcome: '生成下一轮学习计划', eventIds: ['e15', 'e16', 'e17', 'e18'] },
  ]
}

function baseEvents(): EventNode[] {
  return [
    { id: 'e1', chain: 'profile-module', agent: 'profileCapture', t: 9 * 60 + 12, type: 'PC', label: '采集学习信号', detail: '采集答题、停留时长、偏好和卡顿行为，更新六维核心画像。', value: 'medium' },
    { id: 'e2', chain: 'profile-module', agent: 'profileDiagnosis', t: 9 * 60 + 14, type: 'DG', label: '识别指针薄弱', detail: '二级指针传参题正确率仅 41%，标记为薄弱知识域。', value: 'high' },
    { id: 'e3', chain: 'path-module', agent: 'pathPlan', t: 9 * 60 + 16, type: 'PL', label: '插入补弱节点', detail: '路径规划在课后巩固阶段插入二级指针专项训练。', value: 'medium' },
    { id: 'e4', chain: 'path-module', agent: 'pathReplan', t: 9 * 60 + 21, type: 'RP', label: '动态重排路径', detail: '根据卡顿强度推迟进阶节点，前置偏导和梯度复习。', value: 'high' },
    { id: 'e5', chain: 'path-module', agent: 'resourceSearch', t: 9 * 60 + 27, type: 'RQ', label: '发起资源请求', detail: '向资源模块提交薄弱点、偏好和预期掌握度目标。', value: 'low' },
    { id: 'e6', chain: 'resource-module', agent: 'resourceSearch', t: 10 * 60 + 5, type: 'RS', label: '检索候选资源', detail: '命中 18 个候选材料，按难度、时长和偏好打分。', value: 'medium' },
    { id: 'e7', chain: 'resource-module', agent: 'resourceGenerate', t: 10 * 60 + 12, type: 'GN', label: '生成个性资源', detail: '生成思维导图、专项练习和图解卡片共 5 项资源。', value: 'high' },
    { id: 'e8', chain: 'resource-module', agent: 'tutorExplain', t: 10 * 60 + 24, type: 'HF', label: '交给辅导模块', detail: '将资源包转换为可讲解的步骤、例题和追问线索。', value: 'medium' },
    { id: 'e9', chain: 'tutor-module', agent: 'tutorExplain', t: 11 * 60 + 10, type: 'TX', label: '讲解核心概念', detail: '解释二级指针与数组指针的区别，并生成代码示例。', value: 'high' },
    { id: 'e10', chain: 'tutor-module', agent: 'tutorDialogue', t: 11 * 60 + 18, type: 'QA', label: '连续追问确认', detail: '根据学生回答生成下一轮追问，确认是否真正理解。', value: 'medium' },
    { id: 'e11', chain: 'tutor-module', agent: 'evalQuiz', t: 11 * 60 + 36, type: 'EV', label: '请求即时测评', detail: '辅导结束后触发 2 道针对性诊断题。', value: 'low' },
    { id: 'e12', chain: 'eval-module', agent: 'evalQuiz', t: 14 * 60 + 20, type: 'QZ', label: '阶段测评 82 分', detail: '评估出题智能体验证指针补弱效果。', value: 'high' },
    { id: 'e13', chain: 'eval-module', agent: 'evalCause', t: 14 * 60 + 27, type: 'CA', label: '错因归类', detail: '将错题拆成概念遗漏、步骤跳跃和迁移困难三类原因。', value: 'medium' },
    { id: 'e14', chain: 'eval-module', agent: 'feedbackWrite', t: 14 * 60 + 35, type: 'WB', label: '提交回写证据', detail: '把测评结论和错因标签交给反馈模块。', value: 'high' },
    { id: 'e15', chain: 'feedback-module', agent: 'feedbackWrite', t: 15 * 60 + 10, type: 'FB', label: '反向写入画像', detail: '将测评薄弱点反向更新到六维核心画像。', value: 'high' },
    { id: 'e16', chain: 'feedback-module', agent: 'reflection', t: 15 * 60 + 18, type: 'RF', label: '生成成长复盘', detail: '沉淀今日成就、风险和明日行动建议。', value: 'medium' },
    { id: 'e17', chain: 'feedback-module', agent: 'pathReplan', t: 15 * 60 + 32, type: 'RP', label: '触发路径修正', detail: '明日聚焦 4 个反馈盲点，插入思维导图生成节点。', value: 'high' },
    { id: 'e18', chain: 'feedback-module', agent: 'profileCapture', t: 16 * 60 + 3, type: 'NU', label: '画像进入新轮次', detail: '连续学习 5 天，今日还差 14 分钟达标，准备下一轮协同。', value: 'low' },
  ]
}

function defaultEvents(day: string = 'monday'): EventNode[] {
  const all = baseEvents()
  const plan: Record<string, string[]> = {
    monday: ['profile-module', 'path-module', 'resource-module', 'tutor-module', 'eval-module', 'feedback-module'],
    tuesday: ['profile-module', 'path-module'],
    wednesday: ['resource-module', 'tutor-module'],
    thursday: ['eval-module', 'feedback-module'],
    friday: ['profile-module', 'path-module', 'resource-module', 'tutor-module', 'eval-module', 'feedback-module'],
    saturday: ['tutor-module'],
    sunday: ['feedback-module'],
  }
  const modules = plan[day] ?? plan.monday
  let events = all.filter(e => modules.includes(e.chain))
  const targetCount: Record<string, number> = {
    monday: 17,
    tuesday: 5,
    wednesday: 8,
    thursday: 7,
    friday: 16,
    saturday: 3,
    sunday: 4,
  }
  const maxCount = targetCount[day] ?? events.length
  if (events.length > maxCount) {
    events = events.slice(0, maxCount)
  }
  return events.map((e, i) => ({
    ...e,
    t: e.t + (i % 3) * 5 - (day === 'friday' ? 10 : 0),
  }))
}

interface ModuleCard {
  id: string
  chainId: string
  name: string
  agentNames: string[]
  color: string
  artSrc: string
  eventCount: number
}

function defaultModuleCards(events: EventNode[]): ModuleCard[] {
  const counts: Record<string, number> = {}
  events.forEach((e) => { counts[e.chain] = (counts[e.chain] ?? 0) + 1 })
  return [
    { id: 'profile-module', chainId: 'profile-module', name: '画像诊断', agentNames: ['画像采集', '薄弱诊断'], color: T.profileCapture, artSrc: '/homepage/agent-load-profile.png', eventCount: counts['profile-module'] ?? 0 },
    { id: 'path-module', chainId: 'path-module', name: '路径编排', agentNames: ['路径规划', '动态重规划'], color: T.pathPlan, artSrc: '/homepage/agent-load-path.png', eventCount: counts['path-module'] ?? 0 },
    { id: 'resource-module', chainId: 'resource-module', name: '资源生产', agentNames: ['资源检索', '资源生成'], color: T.resourceSearch, artSrc: '/homepage/agent-load-resource.png', eventCount: counts['resource-module'] ?? 0 },
    { id: 'tutor-module', chainId: 'tutor-module', name: '辅导互动', agentNames: ['讲解辅导', '互动答疑'], color: T.tutorExplain, artSrc: '/homepage/agent-load-tutor.png', eventCount: counts['tutor-module'] ?? 0 },
    { id: 'eval-module', chainId: 'eval-module', name: '测评分析', agentNames: ['评估出题', '错因分析'], color: T.evalQuiz, artSrc: '/homepage/agent-load-eval.png', eventCount: counts['eval-module'] ?? 0 },
    { id: 'feedback-module', chainId: 'feedback-module', name: '反馈复盘', agentNames: ['反馈回写', '成长复盘'], color: T.feedbackWrite, artSrc: '/homepage/agent-load-feedback.png', eventCount: counts['feedback-module'] ?? 0 },
  ]
}

interface OverviewStat {
  label: string
  value: string | number
  sub?: string
  type?: 'module'
  color?: string
  name?: string
}

interface MainMetric {
  label: string
  value: string
  change: string
  up: boolean | null
  icon: any
}

interface TopModule {
  name: string
  count: number
  color: string
}

interface LatestEvent {
  id: string
  time: string
  agent: Agent
  label: string
  detail: string
  value: 'high' | 'medium' | 'low'
  chainLabel: string
  routeLabel: string
  routePath: string
  evidenceCount: number
}

const agents = ref<Agent[]>(defaultAgents())
const chains = ref<Chain[]>(defaultChains())
const events = ref<EventNode[]>(defaultEvents('monday'))
const moduleCards = ref<ModuleCard[]>(defaultModuleCards(events.value))

const availableDays = ref<AgentCollaborationDay[]>([])
const selectedDay = ref<string>('monday')
const isLoading = ref(false)
const loadError = ref<string | null>(null)
const switchingDay = ref(false)

const dayEventCache = computed(() => {
  const cache: Record<string, EventNode[]> = {}
  ;['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].forEach((day) => {
    cache[day] = defaultEvents(day)
  })
  return cache
})

const dayStats = computed(() => {
  const stats: Record<string, number> = {}
  availableDays.value.forEach((day) => {
    stats[day.name] = day.name === selectedDay.value ? events.value.length : dayEventCache.value[day.name]?.length ?? 0
  })
  return stats
})

interface DateCard {
  name: string
  label: string
  dateLabel: string
  fullDate: string
  count: number
  density: number
}

const dateCards = computed((): DateCard[] => {
  const names = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const counts = names.map(name => name === selectedDay.value ? events.value.length : dayEventCache.value[name]?.length ?? 0)
  const maxCount = Math.max(1, ...counts)
  return names.map((name, index) => {
    const count = counts[index]
    return {
      name,
      label: dayLabelsFull[index],
      dateLabel: dayDateLabel(name),
      fullDate: fullDateLabel(name),
      count,
      density: Math.round((count / maxCount) * 100),
    }
  })
})

function getTodayDayName(): string {
  const jsDay = new Date().getDay()
  const index = (jsDay + 6) % 7
  const names = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  return names[index]
}

function firstChainWithEvents(): Chain | undefined {
  return chains.value.find(chain => chain.eventIds.some(id => events.value.find(e => e.id === id)))
}

function applyCollaborationPayload(data: Partial<AgentCollaborationResponse>) {
  if (data.agents) agents.value = data.agents as Agent[]
  if (data.chains) chains.value = data.chains as Chain[]
  events.value = (data.events ?? defaultEvents(selectedDay.value)) as EventNode[]
  moduleCards.value = (data.modules ?? defaultModuleCards(events.value)) as ModuleCard[]

  const firstChain = firstChainWithEvents()
  selectedChainId.value = firstChain?.id ?? chains.value[0]?.id ?? ''
  selectedEventId.value = firstChain?.eventIds.find(id => events.value.find(e => e.id === id)) ?? null
  hoverChainId.value = null
  hoverEventId.value = null
  pulseIndex.value = 0
  updateCharts()
}

async function loadDay(day: string, useNetwork = false) {
  loadError.value = null
  applyCollaborationPayload({ events: dayEventCache.value[day] ?? defaultEvents(day) })

  if (useNetwork) {
    isLoading.value = true
    try {
      const data = await fetchAgentCollaboration(day)
      applyCollaborationPayload(data)
    } catch (error) {
      console.error('Failed to load agent collaboration:', error)
      loadError.value = '数据加载失败，使用默认演示数据'
    } finally {
      isLoading.value = false
    }
  }
}

async function initDays() {
  try {
    const days = await fetchAgentCollaborationDays()
    availableDays.value = days
  } catch (error) {
    console.error('Failed to load available days:', error)
    availableDays.value = [
      { name: 'monday', label: '周一', index: 0 },
      { name: 'tuesday', label: '周二', index: 1 },
      { name: 'wednesday', label: '周三', index: 2 },
      { name: 'thursday', label: '周四', index: 3 },
      { name: 'friday', label: '周五', index: 4 },
      { name: 'saturday', label: '周六', index: 5 },
      { name: 'sunday', label: '周日', index: 6 },
    ]
  }
}

function selectDay(day: string) {
  if (day === selectedDay.value || switchingDay.value) return
  switchingDay.value = true
  popupVisible.value = false
  selectedDay.value = day
  loadDay(day)
  requestAnimationFrame(() => {
    setTimeout(() => { switchingDay.value = false }, 80)
  })
}

function dayLabel(dayName: string): string {
  const found = availableDays.value.find(d => d.name === dayName)
  return found?.label ?? ''
}

function dayDateLabel(dayName: string): string {
  const today = new Date()
  const jsDay = today.getDay()
  const names = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const currentIndex = (jsDay + 6) % 7
  const targetIndex = names.indexOf(dayName)
  const diff = targetIndex - currentIndex
  const targetDate = new Date(today)
  targetDate.setDate(today.getDate() + diff)
  const month = String(targetDate.getMonth() + 1).padStart(2, '0')
  const date = String(targetDate.getDate()).padStart(2, '0')
  return `${month}.${date}`
}

function fullDateLabel(dayName: string): string {
  const today = new Date()
  const jsDay = today.getDay()
  const names = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const currentIndex = (jsDay + 6) % 7
  const targetIndex = names.indexOf(dayName)
  const diff = targetIndex - currentIndex
  const targetDate = new Date(today)
  targetDate.setDate(today.getDate() + diff)
  const y = targetDate.getFullYear()
  const m = String(targetDate.getMonth() + 1).padStart(2, '0')
  const d = String(targetDate.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function scrollDays(direction: 'left' | 'right') {
  if (!dateListRef.value) return
  const scrollAmount = direction === 'left' ? -200 : 200
  dateListRef.value.scrollBy({ left: scrollAmount, behavior: 'smooth' })
}

function selectAgentChain(agentId: AgentId) {
  const agent = agentById(agentId)
  const chain = chains.value.find(c => c.eventIds.some(id => eventById(id)?.agent === agentId))
  if (chain) {
    selectedChainId.value = chain.id
    selectedEventId.value = chain.eventIds.find(id => eventById(id)?.agent === agentId) ?? chain.eventIds[0]
    hoverChainId.value = null
    hoverEventId.value = null
    pulseIndex.value = 0
  }
}

const agentById = (id: AgentId) => agents.value.find(a => a.id === id) ?? agents.value[0]
const eventById = (id: string) => events.value.find(e => e.id === id)

const selectedChainId = ref<string>(chains.value[0]?.id ?? '')
const selectedEventId = ref<string | null>(null)
const hoverChainId = ref<string | null>(null)
const hoverEventId = ref<string | null>(null)
const pulseIndex = ref(0)

const popupVisible = ref(false)
const popupPos = ref({ x: 0, y: 0 })
const popupAnchor = ref<HTMLElement | null>(null)
const viewport = ref({ width: window.innerWidth, height: window.innerHeight })

const popupStyle = computed(() => ({
  left: `${Math.min(Math.max(popupPos.value.x, 180), viewport.value.width - 360)}px`,
  top: `${Math.min(Math.max(popupPos.value.y + 16, 80), viewport.value.height - 560)}px`,
}))

function updateViewport() {
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
}

const activeChainId = computed(() => hoverChainId.value ?? selectedChainId.value)
const activeChain = computed(() => (
  chains.value.find(chain => chain.id === activeChainId.value)
  ?? firstChainWithEvents()
  ?? chains.value[0]
))

const filteredEvents = computed(() => {
  return events.value
})

const activeEvents = computed(() => {
  const chain = activeChain.value
  return chain?.eventIds.map(id => eventById(id)).filter(Boolean) as EventNode[] ?? []
})

const selectedEvent = computed(() => {
  if (selectedEventId.value) {
    const found = eventById(selectedEventId.value)
    if (found) return found
  }
  const list = activeEvents.value
  if (!list.length) return null
  return list[pulseIndex.value % list.length]
})

const timeLabel = (minutes: number) => {
  const h = Math.floor(minutes / 60)
  const m = String(minutes % 60).padStart(2, '0')
  return `${h}:${m}`
}

const overviewStats = computed((): OverviewStat[] => {
  const active = new Set(events.value.map(e => e.agent)).size
  const focusModule = moduleCards.value.slice().sort((a, b) => b.eventCount - a.eventCount)[0]
  return [
    { label: '干预类型总数', value: agents.value.length },
    { label: '当前活跃类型', value: active },
    { label: '关注模块', value: focusModule?.name ?? '-', type: 'module', color: focusModule?.color, name: focusModule?.name },
  ]
})

const agentRows = computed(() => {
  const counts: Record<string, number> = {}
  events.value.forEach((e) => { counts[e.agent] = (counts[e.agent] ?? 0) + 1 })
  return agents.value.map((agent) => ({
    agent,
    count: counts[agent.id] ?? 0,
    active: activeChain.value.eventIds?.some(id => eventById(id)?.agent === agent.id),
  })).sort((a, b) => b.count - a.count)
})

const mainMetrics = computed((): MainMetric[] => {
  const total = events.value.length
  const highValueCount = events.value.filter(e => e.value === 'high').length
  const highValuePct = Math.round((highValueCount / Math.max(1, events.value.length)) * 100)
  const activeAgents = new Set(events.value.map(e => e.agent)).size
  const chainSpanMin = events.value.length
    ? Math.max(...events.value.map(e => e.t)) - Math.min(...events.value.map(e => e.t))
    : 0
  const hours = Math.floor(chainSpanMin / 60)
  const mins = chainSpanMin % 60
  const duration = hours > 0 ? `${hours}h ${mins.toString().padStart(2, '0')}m` : `${mins}m`
  const engagement = Math.min(99, Math.round(58 + activeAgents * 4 + highValuePct * 0.25))
  const prevTotal = Math.max(1, total - Math.floor(Math.random() * 5) + 2)
  const totalChange = ((total - prevTotal) / prevTotal) * 100
  return [
    { label: '干预总次数', value: `${total} 次`, change: `较昨日 ${totalChange >= 0 ? '+' : ''}${totalChange.toFixed(1)}%`, up: totalChange >= 0, icon: Target },
    { label: '关键节点命中率', value: `${highValuePct} %`, change: `较昨日 ${highValuePct >= 40 ? '+' : ''}${(highValuePct - 38).toFixed(1)}%`, up: highValuePct >= 40, icon: Sparkles },
    { label: '平均链条时长', value: duration, change: '较昨日 -8.4%', up: false, icon: Clock },
    { label: '活跃智能体', value: `${activeAgents} 个`, change: `较昨日 ${activeAgents >= 6 ? '+' : ''}${activeAgents - 5}`, up: activeAgents >= 6, icon: Users },
    { label: '用户参与度', value: `${engagement} %`, change: `较昨日 ${engagement >= 75 ? '+' : ''}${(engagement - 72).toFixed(1)}%`, up: engagement >= 75, icon: Heart },
  ]
})

const topModules = computed((): TopModule[] => {
  return moduleCards.value
    .map(m => ({ name: m.name, count: m.eventCount, color: m.color }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
})

const typeDistribution = computed(() => {
  const counts: Record<string, number> = {}
  events.value.forEach((e) => { counts[e.agent] = (counts[e.agent] ?? 0) + 1 })
  const total = events.value.length || 1
  return agents.value
    .map(a => ({ name: a.name, value: counts[a.id] ?? 0, color: a.color }))
    .filter(x => x.value > 0)
    .sort((a, b) => b.value - a.value)
})

const latestEvents = computed((): LatestEvent[] => {
  return events.value
    .slice()
    .sort((a, b) => b.t - a.t)
    .slice(0, 5)
    .map(e => {
      const route = routeForEvent(e)
      return {
        id: e.id,
        time: timeLabel(e.t),
        agent: agentById(e.agent),
        label: e.label,
        detail: e.detail,
        value: e.value ?? 'medium',
        chainLabel: chainLabel(e.chain),
        routeLabel: route.label,
        routePath: route.path,
        evidenceCount: evidenceCount(e),
      }
    })
})

const detailMetrics = computed(() => {
  const evt = selectedEvent.value
  if (!evt) return []
  const seed = evt.id.charCodeAt(0) + evt.id.charCodeAt(evt.id.length - 1)
  const knowledge = 6 + (seed % 9)
  const related = 3 + (seed % 8)
  const dimension = 4 + (seed % 6)
  const risk = seed % 4
  const strategy = 1 + (seed % 5)
  return [
    { label: '识别知识点', value: knowledge, unit: '个' },
    { label: '关联知识点', value: related, unit: '个' },
    { label: '能力维度', value: dimension, unit: '项' },
    { label: '风险预警', value: risk, unit: '条' },
    { label: '建议策略', value: strategy, unit: '条' },
    { label: '价值评级', value: evt.value === 'high' ? '高价值' : evt.value === 'medium' ? '中价值' : '低价值', unit: '', stars: evt.value === 'high' ? 4 : evt.value === 'medium' ? 3 : 2 },
  ]
})

const impactAnalysis = computed(() => {
  const evt = selectedEvent.value
  const seed = evt ? evt.id.charCodeAt(1) + evt.t : 0
  const masteryDir = (seed % 2) === 0
  const masteryVal = 8 + (seed % 9)
  const efficiencyDir = (seed % 3) !== 0
  const efficiencyVal = 5 + (seed % 8)
  const weakPointsDir = (seed % 2) === 1
  const weakPointsVal = 1 + (seed % 4)
  return [
    { label: '知识掌握度', change: `${masteryDir ? '+' : '-'}${masteryVal}%`, up: masteryDir, sparkline: masteryDir
      ? [42, 48, 52, 58, 64, 72, 78, 84 + masteryVal]
      : [84, 78, 72, 68, 62, 58, 52, 84 - masteryVal] },
    { label: '学习效率', change: `${efficiencyDir ? '+' : '-'}${efficiencyVal}%`, up: efficiencyDir, sparkline: efficiencyDir
      ? [55, 58, 60, 65, 68, 72, 76, 80 + efficiencyVal]
      : [80, 76, 72, 68, 64, 60, 56, 80 - efficiencyVal] },
    { label: '薄弱点数量', change: `${weakPointsDir ? '-' : '+'}${weakPointsVal}`, up: weakPointsDir ? null : false, sparkline: weakPointsDir
      ? [12, 11, 11, 10, 9, 8, 7, 7 - weakPointsVal]
      : [7, 8, 9, 10, 11, 11, 12, 7 + weakPointsVal] },
  ]
})

const relatedRecords = computed(() => {
  const evt = selectedEvent.value
  const seed = evt ? evt.id.charCodeAt(2) + evt.t : 0
  return [
    { label: '关联测评记录', value: `${18 + (seed % 24)} 条`, icon: FileText },
    { label: '历史相似干预', value: `${4 + (seed % 12)} 条`, icon: History },
    { label: '关联学习资源', value: `${10 + (seed % 20)} 个`, icon: BookMarked },
  ]
})

const qualityMetrics = computed(() => {
  const evt = selectedEvent.value
  const seed = evt ? evt.id.charCodeAt(0) + evt.t : 0
  return {
    confidence: 78 + (seed % 18),
    completeness: 82 + (seed % 15),
  }
})

const aiSuggestion = computed(() => {
  const evt = selectedEvent.value
  const focus = moduleCards.value.slice().sort((a, b) => b.eventCount - a.eventCount)[0]
  const agent = evt ? agentById(evt.agent) : null
  return {
    title: 'AI 助教建议',
    content: evt
      ? `「${agent?.name ?? ''}」的「${evt.label}」建议结合${focus?.name ?? '路径编排'}模块持续跟踪，针对薄弱点生成下一轮个性化干预。`
      : `建议持续关注“${focus?.name ?? '动态重规划'}”模块，优化学习路径以提升效率。`,
  }
})

function selectChain(chainId: string) {
  const chain = chains.value.find(c => c.id === chainId)
  if (!chain) return
  selectedChainId.value = chainId
  const firstEvent = chain.eventIds.find(id => eventById(id))
  selectedEventId.value = firstEvent ?? null
  hoverChainId.value = null
  hoverEventId.value = null
  pulseIndex.value = 0
}

function selectNode(event: EventNode, nativeEvent?: MouseEvent) {
  selectedChainId.value = event.chain
  selectedEventId.value = event.id
  hoverChainId.value = null
  hoverEventId.value = null
  const chain = chains.value.find(item => item.id === event.chain)
  pulseIndex.value = Math.max(0, chain?.eventIds.indexOf(event.id) ?? 0)
  if (nativeEvent) {
    openPopup(nativeEvent)
  }
}

function selectNodeById(id: string, nativeEvent?: MouseEvent) {
  const found = events.value.find(e => e.id === id)
  if (found) selectNode(found, nativeEvent)
}

let ignoreNextDocumentClick = false

function openPopup(nativeEvent: MouseEvent) {
  const rect = (nativeEvent.currentTarget as HTMLElement)?.getBoundingClientRect()
  if (rect) {
    popupPos.value = {
      x: rect.left + rect.width / 2,
      y: rect.top,
    }
  } else {
    popupPos.value = { x: nativeEvent.clientX, y: nativeEvent.clientY }
  }
  popupVisible.value = true
  ignoreNextDocumentClick = true
  setTimeout(() => { ignoreNextDocumentClick = false }, 0)
}

function closePopup() {
  popupVisible.value = false
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) closePopup()
}

function handleDocumentClick(event: MouseEvent) {
  if (ignoreNextDocumentClick) return
  if (popupVisible.value && popupAnchor.value && !popupAnchor.value.contains(event.target as Node)) {
    closePopup()
  }
}

function onNodeEnter(event: EventNode) {
  hoverEventId.value = event.id
  hoverChainId.value = event.chain
}

function onNodeLeave() {
  hoverEventId.value = null
  hoverChainId.value = null
}

let pulseTimer = 0
function startPulse() {
  stopPulse()
  pulseTimer = window.setInterval(() => {
    const list = activeEvents.value
    if (list.length > 1) {
      pulseIndex.value = (pulseIndex.value + 1) % list.length
      selectedEventId.value = list[pulseIndex.value]?.id ?? selectedEventId.value
    }
  }, 4200)
}

function stopPulse() {
  if (pulseTimer) {
    clearInterval(pulseTimer)
    pulseTimer = 0
  }
}

watch(activeEvents, () => {
  pulseIndex.value = 0
})

watch(selectedEventId, () => {
  startPulse()
})

const dateListRef = ref<HTMLDivElement | null>(null)

const W = 1280
const H = 520
const PAD_L = 120
const PAD_R = 40
const PAD_T = 56
const PAD_B = 46
const startMinutes = 9 * 60
const endMinutes = 18 * 60
const totalMinutes = endMinutes - startMinutes

function xForTime(minutes: number) {
  return PAD_L + ((minutes - startMinutes) / totalMinutes) * (W - PAD_L - PAD_R)
}

function yForAgent(agentId: AgentId) {
  const index = agents.value.findIndex(a => a.id === agentId)
  if (index < 0) return PAD_T + 20
  const usableH = H - PAD_T - PAD_B
  const step = usableH / (agents.value.length + 1)
  return PAD_T + step * (index + 1)
}

function timeGridLines() {
  const lines: { x1: number; x2: number; y1: number; y2: number; label: string }[] = []
  for (let m = startMinutes; m <= endMinutes; m += 60) {
    const x = xForTime(m)
    lines.push({ x1: x, x2: x, y1: PAD_T, y2: H - PAD_B, label: `${Math.floor(m / 60)}:00` })
  }
  return lines
}

function eventPos(events: EventNode[]) {
  return events.map(e => ({
    ...e,
    x: xForTime(e.t),
    y: yForAgent(e.agent),
    color: agentById(e.agent).color,
  }))
}

function chainPaths() {
  const groups: Record<string, ReturnType<typeof eventPos>> = {}
  events.value.forEach((e) => {
    if (!groups[e.chain]) groups[e.chain] = []
    groups[e.chain].push(...eventPos([e]))
  })
  return Object.entries(groups).map(([chainId, pts]) => {
    const sorted = pts.sort((a, b) => a.t - b.t)
    let d = ''
    sorted.forEach((p, i) => {
      if (i === 0) d += `M ${p.x} ${p.y}`
      else {
        const prev = sorted[i - 1]
        const cp1x = prev.x + (p.x - prev.x) * 0.5
        const cp1y = prev.y
        const cp2x = prev.x + (p.x - prev.x) * 0.5
        const cp2y = p.y
        d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p.x} ${p.y}`
      }
    })
    return { chainId, d, active: activeChainId.value === chainId }
  })
}

const nowMinutes = 15 * 60 + 20

const filterOptions = ['全部类型', '画像诊断', '路径编排', '资源生产', '辅导互动', '测评分析', '反馈复盘']
const selectedFilter = ref('全部类型')

const chainRouteMap: Record<string, { path: string; label: string }> = {
  'profile-module': { path: '/dialogue', label: '查看画像' },
  'path-module': { path: '/learning-path', label: '查看路径' },
  'resource-module': { path: '/resources', label: '查看资源' },
  'tutor-module': { path: '/tutoring', label: '进入辅导' },
  'eval-module': { path: '/evaluation', label: '查看测评' },
  'feedback-module': { path: '/reverse-evaluation', label: '查看反馈' },
}

const agentRouteMap: Record<string, { path: string; label: string }> = {
  profileCapture: chainRouteMap['profile-module'],
  profileDiagnosis: chainRouteMap['profile-module'],
  pathPlan: chainRouteMap['path-module'],
  pathReplan: chainRouteMap['path-module'],
  resourceSearch: chainRouteMap['resource-module'],
  resourceGenerate: chainRouteMap['resource-module'],
  tutorExplain: chainRouteMap['tutor-module'],
  tutorDialogue: chainRouteMap['tutor-module'],
  evalQuiz: chainRouteMap['eval-module'],
  evalCause: chainRouteMap['eval-module'],
  feedbackWrite: chainRouteMap['feedback-module'],
  reflection: chainRouteMap['feedback-module'],
}

const metricRoutes = ['/reverse-evaluation', '/evaluation', '/learning-path', '/dialogue', '/tutoring']
const chartRoutes: Record<string, string> = {
  trend: '/reverse-evaluation',
  top: '/reverse-evaluation',
  pie: '/evaluation',
  heatmap: '/evaluation',
  latest: '/reverse-evaluation',
}

function routeForEvent(event: EventNode) {
  return agentRouteMap[event.agent] ?? chainRouteMap[event.chain] ?? { path: '/reverse-evaluation', label: '查看详情' }
}

function chainLabel(chainId: string) {
  return chains.value.find(chain => chain.id === chainId)?.name ?? '协同模块'
}

function evidenceCount(event: EventNode) {
  const base = event.value === 'high' ? 4 : event.value === 'medium' ? 3 : 2
  return base + (event.t % 2)
}

function navigateTo(path: string) {
  if (!path) return
  router.push(path)
}

function navigateMetric(index: number) {
  navigateTo(metricRoutes[index] ?? '/reverse-evaluation')
}

function activateKeyboard(event: KeyboardEvent, action: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  action()
}

const trendChartRef = ref<HTMLDivElement | null>(null)
const topChartRef = ref<HTMLDivElement | null>(null)
const pieChartRef = ref<HTMLDivElement | null>(null)
const heatmapChartRef = ref<HTMLDivElement | null>(null)
let trendChart: echarts.ECharts | null = null
let topChart: echarts.ECharts | null = null
let pieChart: echarts.ECharts | null = null
let heatmapChart: echarts.ECharts | null = null

function initCharts() {
  if (trendChartRef.value && !trendChart) trendChart = echarts.init(trendChartRef.value)
  if (topChartRef.value && !topChart) topChart = echarts.init(topChartRef.value)
  if (pieChartRef.value && !pieChart) pieChart = echarts.init(pieChartRef.value)
  if (heatmapChartRef.value && !heatmapChart) heatmapChart = echarts.init(heatmapChartRef.value)
  updateCharts()
}

function updateCharts() {
  nextTick(() => {
    updateTrendChart()
    updateTopChart()
    updatePieChart()
    updateHeatmapChart()
  })
}

function updateTrendChart() {
  if (!trendChart) return
  const hours: string[] = []
  const today: number[] = []
  const yesterday: number[] = []
  for (let i = 0; i <= 24; i += 2) {
    hours.push(`${String(i).padStart(2, '0')}:00`)
    const base = Math.max(0, (i - 8) * 10 + Math.random() * 20)
    today.push(Math.round(base + Math.random() * 15))
    yesterday.push(Math.round(base * 0.85 + Math.random() * 12))
  }
  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { data: ['今日', '昨日'], textStyle: { color: '#8497bd', fontSize: 11 }, right: 0, top: 0, itemWidth: 8, itemHeight: 8 },
    grid: { left: 36, right: 12, top: 28, bottom: 22 },
    xAxis: {
      type: 'category',
      data: hours,
      axisLine: { lineStyle: { color: 'rgba(150,175,220,0.15)' } },
      axisLabel: { color: '#5d6e8f', fontSize: 10 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(150,175,220,0.08)' } },
      axisLabel: { color: '#5d6e8f', fontSize: 10 },
    },
    series: [
      {
        name: '今日',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: today,
        lineStyle: { color: '#22d3ee', width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(34, 211, 238, 0.28)' },
            { offset: 1, color: 'rgba(34, 211, 238, 0.01)' },
          ]),
        },
      },
      {
        name: '昨日',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: yesterday,
        lineStyle: { color: 'rgba(150, 175, 220, 0.45)', width: 1.5, type: 'dashed' },
      },
    ],
  }
  trendChart.setOption(option)
}

function updateTopChart() {
  if (!topChart) return
  const data = topModules.value.slice(0, 8).reverse()
  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 72, right: 28, top: 10, bottom: 10 },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: data.map(d => d.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#9badcc', fontSize: 11 },
    },
    series: [{
      type: 'bar',
      data: data.map(d => ({ value: d.count, itemStyle: { color: d.color, borderRadius: [0, 4, 4, 0] } })),
      barWidth: 10,
      label: { show: true, position: 'right', color: '#e8edf5', fontSize: 11, formatter: '{c}' },
    }],
  }
  topChart.setOption(option, true)
}

function updatePieChart() {
  if (!pieChart) return
  const data = typeDistribution.value.length ? typeDistribution.value : agents.value.map(a => ({ name: a.name, value: 1, color: a.color }))
  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item' },
    legend: {
      orient: 'vertical',
      right: 0,
      top: 'center',
      textStyle: { color: '#9badcc', fontSize: 10 },
      itemWidth: 8,
      itemHeight: 8,
      formatter: '{name}  {d}%',
    },
    series: [{
      name: '干预类型占比',
      type: 'pie',
      radius: ['46%', '68%'],
      center: ['32%', '50%'],
      avoidLabelOverlap: false,
      label: { show: false },
      data: data.map(d => ({ value: d.value, name: d.name, itemStyle: { color: d.color } })),
    }],
  }
  pieChart.setOption(option, true)
}

function updateHeatmapChart() {
  if (!heatmapChart) return
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const data: [number, number, number][] = []
  days.forEach((_, d) => {
    hours.forEach((_, h) => {
      const base = (h >= 8 && h <= 22) ? Math.random() * 80 + 20 : Math.random() * 20
      data.push([h, d, Math.round(base)])
    })
  })
  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: { position: 'top' },
    grid: { left: 44, right: 10, top: 10, bottom: 24 },
    xAxis: {
      type: 'category',
      data: hours,
      splitArea: { show: true, areaStyle: { color: ['rgba(150,175,220,0.03)', 'rgba(150,175,220,0.01)'] } },
      axisLabel: { color: '#5d6e8f', fontSize: 9 },
      axisLine: { lineStyle: { color: 'rgba(150,175,220,0.10)' } },
    },
    yAxis: {
      type: 'category',
      data: days,
      splitArea: { show: true, areaStyle: { color: ['rgba(150,175,220,0.03)', 'rgba(150,175,220,0.01)'] } },
      axisLabel: { color: '#5d6e8f', fontSize: 10 },
      axisLine: { lineStyle: { color: 'rgba(150,175,220,0.10)' } },
    },
    visualMap: {
      min: 0,
      max: 100,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: -2,
      show: false,
      inRange: { color: ['#0a1120', '#112240', '#1d4e89', '#22d3ee', '#a78bfa'] },
    },
    series: [{
      type: 'heatmap',
      data,
      label: { show: false },
      itemStyle: {
        borderColor: 'rgba(6,10,24,0.8)',
        borderWidth: 1,
        borderRadius: 2,
      },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(34,211,238,0.5)' } },
    }],
  }
  heatmapChart.setOption(option)
  heatmapChart.off('click')
  heatmapChart.on('click', () => navigateTo(chartRoutes.heatmap))
}

function handleResize() {
  trendChart?.resize()
  topChart?.resize()
  pieChart?.resize()
  heatmapChart?.resize()
}

onMounted(() => {
  updateViewport()
  initDays().then(() => {
    const today = getTodayDayName()
    if (availableDays.value.some(d => d.name === today)) {
      selectedDay.value = today
    }
    loadDay(selectedDay.value, true)
    nextTick(() => {
      initCharts()
      startPulse()
    })
  })
  window.addEventListener('resize', handleResize)
  window.addEventListener('resize', updateViewport)
  document.addEventListener('click', handleDocumentClick)
})

onBeforeUnmount(() => {
  stopPulse()
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('resize', updateViewport)
  document.removeEventListener('click', handleDocumentClick)
  trendChart?.dispose()
  topChart?.dispose()
  pieChart?.dispose()
  heatmapChart?.dispose()
})

watch(selectedDay, () => {
  updateCharts()
})
</script>

<template>
  <section class="section-telemetry">
    <div class="telemetry-inner">
      <div class="date-cards-row">
        <button
          v-for="card in dateCards"
          :key="card.name"
          type="button"
          class="date-card"
          :class="{ active: selectedDay === card.name }"
          @click="selectDay(card.name)"
        >
          <div class="date-day">{{ card.label }}</div>
          <div class="date-number">{{ card.dateLabel }}</div>
          <div class="date-density">
            <div class="density-track"><div class="density-fill" :style="{ width: `${card.density}%` }" /></div>
            <span class="density-count">{{ card.count }} 次</span>
          </div>
        </button>
      </div>

      <div class="dashboard-grid">
        <!-- Left column -->
        <aside class="dash-col left-col">
          <div class="glass-card overview-card">
            <div class="card-header">
              <span class="card-title">干预类型概览</span>
              <Info :size="14" class="card-info" />
            </div>
            <div class="overview-stats">
              <div
                v-for="(stat, idx) in overviewStats"
                :key="idx"
                class="overview-stat"
                :class="{ 'stat-module': stat.type === 'module' }"
              >
                <div class="stat-value" :style="stat.color ? { color: stat.color } : {}">
                  {{ stat.value }}
                </div>
                <div class="stat-label">{{ stat.label }}</div>
              </div>
            </div>
          </div>

          <div class="glass-card agent-list-card">
            <div class="card-header">
              <span class="card-title">干预类型列表</span>
            </div>
            <div class="agent-rows">
              <button
                v-for="row in agentRows"
                :key="row.agent.id"
                type="button"
                class="agent-row"
                :class="{ active: row.active }"
                :style="{ '--agent-color': row.agent.color }"
                @click="selectAgentChain(row.agent.id)"
              >
                <div class="agent-icon">
                  <component :is="row.agent.icon" :size="18" />
                </div>
                <div class="agent-info">
                  <div class="agent-name">{{ row.agent.name }}</div>
                  <div class="agent-sub">{{ row.count }} 次干预</div>
                </div>
              </button>
            </div>
          </div>
        </aside>

        <!-- Center column -->
        <div class="dash-col center-col">
          <div class="glass-card timeline-card">
            <div class="timeline-header">
              <h2 class="timeline-title">
                干预链条时间轴
              </h2>
              <div class="timeline-controls">
                <div class="filter-select">
                  <Filter :size="14" />
                  <span>{{ selectedFilter }}</span>
                  <ChevronDown :size="14" />
                </div>
                <div class="date-picker">
                  <Calendar :size="14" />
                  <span>{{ fullDateLabel(selectedDay) }}</span>
                </div>
              </div>
            </div>

            <div class="timeline-shell" @click="onBackdropClick">
              <svg :viewBox="`0 0 ${W} ${H}`" class="timeline-svg" role="img" aria-label="多智能体因果接力时间线">
                <defs>
                  <filter id="chain-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                <g class="time-grid">
                  <line
                    v-for="(g, i) in timeGridLines()"
                    :key="`grid-${i}`"
                    :x1="g.x1"
                    :y1="g.y1"
                    :x2="g.x2"
                    :y2="g.y2"
                  />
                  <text
                    v-for="(g, i) in timeGridLines()"
                    :key="`label-${i}`"
                    :x="g.x1"
                    :y="PAD_T - 16"
                    text-anchor="middle"
                  >{{ g.label }}</text>
                </g>

                <g class="agent-lanes">
                  <line
                    v-for="agent in agents"
                    :key="`lane-${agent.id}`"
                    :x1="PAD_L"
                    :y1="yForAgent(agent.id)"
                    :x2="W - PAD_R"
                    :y2="yForAgent(agent.id)"
                    stroke="rgba(150,175,220,0.08)"
                  />
                </g>

                <g class="agent-labels">
                  <text
                    v-for="agent in agents"
                    :key="`label-${agent.id}`"
                    :x="PAD_L - 14"
                    :y="yForAgent(agent.id) + 4"
                    text-anchor="end"
                    class="agent-name"
                    :style="{ fill: agent.color }"
                  >{{ agent.name }}</text>
                </g>

                <g class="chain-links">
                  <path
                    v-for="(link, i) in chainPaths()"
                    :key="`link-${i}`"
                    :d="link.d"
                    :class="{ active: link.active }"
                    :stroke="chains.find(c => c.id === link.chainId)?.id ? agentById(events.find(e => e.chain === link.chainId)?.agent ?? agents[0].id).color : '#22d3ee'"
                    :style="{ '--delay': `${i * 120}ms` }"
                  />
                </g>

                <g class="now-layer">
                  <line :x1="xForTime(nowMinutes)" :y1="PAD_T" :x2="xForTime(nowMinutes)" :y2="H - PAD_B" />
                  <text :x="xForTime(nowMinutes)" :y="PAD_T - 28" text-anchor="middle">NOW</text>
                </g>

                <g class="event-nodes">
                  <g
                    v-for="event in eventPos(events)"
                    :key="event.id"
                    class="event-node"
                    :class="{
                      active: selectedEvent?.id === event.id,
                      dimmed: hoverChainId && hoverChainId !== event.chain,
                      pulse: selectedEvent?.id === event.id,
                    }"
                    :style="{ '--node-color': event.color, '--order': events.indexOf(event) }"
                    @click="selectNode(event, $event)"
                    @mouseenter="onNodeEnter(event)"
                    @mouseleave="onNodeLeave"
                  >
                    <circle class="node-hit" :cx="event.x" :cy="event.y" r="18" />
                    <circle class="node-core" :cx="event.x" :cy="event.y" r="8" />
                    <circle class="node-inner" :cx="event.x" :cy="event.y" r="4.5" />
                  </g>
                </g>
              </svg>

              <Transition name="popup">
                <div
                  v-if="popupVisible && selectedEvent"
                  ref="popupAnchor"
                  class="detail-popup"
                  :style="popupStyle"
                  @click.stop
                >
                  <button type="button" class="popup-close" @click="closePopup">
                    <MoreHorizontal :size="14" />
                  </button>
                  <div class="popup-head">
                    <div class="detail-icon" :style="{ background: agentById(selectedEvent.agent).color }">
                      <component :is="agentById(selectedEvent.agent).icon" :size="20" />
                    </div>
                    <div class="detail-titles">
                      <div class="detail-title">{{ selectedEvent.label }}</div>
                      <div class="detail-subtitle">{{ agentById(selectedEvent.agent).name }} · {{ timeLabel(selectedEvent.t) }}</div>
                    </div>
                  </div>
                  <p class="detail-desc">{{ selectedEvent.detail }}</p>

                  <div class="detail-section-title">关键指标</div>
                  <div class="detail-metrics">
                    <div
                      v-for="(m, idx) in detailMetrics"
                      :key="idx"
                      class="detail-metric"
                      :class="{ 'metric-wide': m.label === '价值评级' }"
                    >
                      <div class="metric-top">
                        <span class="metric-label">{{ m.label }}</span>
                        <div v-if="m.stars" class="metric-stars">
                          <Star v-for="s in m.stars" :key="s" :size="12" class="star-filled" />
                          <Star v-for="s in 5 - (m.stars || 0)" :key="`empty-${s}`" :size="12" class="star-empty" />
                        </div>
                      </div>
                      <div class="metric-value-row">
                        <strong>{{ m.value }}</strong>
                        <small v-if="m.unit">{{ m.unit }}</small>
                      </div>
                    </div>
                  </div>

                  <div class="detail-section-title">影响分析</div>
                  <div class="impact-grid">
                    <div
                      v-for="(impact, idx) in impactAnalysis"
                      :key="idx"
                      class="impact-card"
                    >
                      <div class="impact-label">{{ impact.label }}</div>
                      <div class="impact-change" :class="{ up: impact.up === true, down: impact.up === false }">
                        {{ impact.change }}
                      </div>
                      <svg class="sparkline" viewBox="0 0 80 24" preserveAspectRatio="none">
                        <polyline
                          fill="none"
                          :stroke="impact.up === false ? '#ef4444' : '#22d3ee'"
                          stroke-width="2"
                          :points="impact.sparkline.map((v, i) => `${(i / (impact.sparkline.length - 1)) * 80},${24 - (v / 100) * 24}`).join(' ')"
                        />
                      </svg>
                    </div>
                  </div>

                  <div class="detail-section-title">相关记录</div>
                  <div class="records-list">
                    <div v-for="(rec, idx) in relatedRecords" :key="idx" class="record-item">
                      <component :is="rec.icon" :size="14" />
                      <span>{{ rec.label }}</span>
                      <strong>{{ rec.value }}</strong>
                    </div>
                  </div>

                  <div class="detail-section-title">置信与质量</div>
                  <div class="quality-bars">
                    <div class="quality-bar">
                      <div class="quality-label">
                        <span>置信度</span>
                        <strong>{{ qualityMetrics.confidence }}%</strong>
                      </div>
                      <div class="quality-track"><div class="quality-fill" :style="{ width: `${qualityMetrics.confidence}%` }" /></div>
                    </div>
                    <div class="quality-bar">
                      <div class="quality-label">
                        <span>数据完整度</span>
                        <strong>{{ qualityMetrics.completeness }}%</strong>
                      </div>
                      <div class="quality-track"><div class="quality-fill" :style="{ width: `${qualityMetrics.completeness}%` }" /></div>
                    </div>
                  </div>

                  <div class="ai-suggestion">
                    <div class="ai-title">
                      <Sparkle :size="14" />
                      {{ aiSuggestion.title }}
                    </div>
                    <p>{{ aiSuggestion.content }}</p>
                  </div>
                </div>
              </Transition>
            </div>
          </div>

          <div class="metrics-row">
            <div
              v-for="(metric, idx) in mainMetrics"
              :key="idx"
              class="glass-card metric-card clickable-card"
              role="button"
              tabindex="0"
              @click="navigateMetric(idx)"
              @keydown="activateKeyboard($event, () => navigateMetric(idx))"
            >
              <div class="metric-icon">
                <component :is="metric.icon" :size="18" />
              </div>
              <div class="metric-body">
                <div class="metric-label">{{ metric.label }}</div>
                <div class="metric-value">{{ metric.value }}</div>
                <div class="metric-change" :class="{ up: metric.up === true, down: metric.up === false }">
                  <component :is="metric.up === true ? ArrowUpRight : metric.up === false ? ArrowDownRight : Minus" :size="12" />
                  {{ metric.change }}
                </div>
              </div>
            </div>
          </div>

          <div class="charts-grid">
            <div
              class="glass-card chart-card trend-card clickable-card"
              role="button"
              tabindex="0"
              @click="navigateTo(chartRoutes.trend)"
              @keydown="activateKeyboard($event, () => navigateTo(chartRoutes.trend))"
            >
              <div class="card-header">
                <span class="card-title">干预次数趋势</span>
                <div class="chart-legend">
                  <span class="legend-dot cyan" /> 今日
                  <span class="legend-dot gray" /> 昨日
                </div>
              </div>
              <div ref="trendChartRef" class="chart-body" />
            </div>

            <div
              class="glass-card chart-card top-card clickable-card"
              role="button"
              tabindex="0"
              @click="navigateTo(chartRoutes.top)"
              @keydown="activateKeyboard($event, () => navigateTo(chartRoutes.top))"
            >
              <div class="card-header">
                <span class="card-title">模块干预频次 TOP 8</span>
              </div>
              <div ref="topChartRef" class="chart-body" />
            </div>

            <div
              class="glass-card chart-card pie-card clickable-card"
              role="button"
              tabindex="0"
              @click="navigateTo(chartRoutes.pie)"
              @keydown="activateKeyboard($event, () => navigateTo(chartRoutes.pie))"
            >
              <div class="card-header">
                <span class="card-title">干预类型占比</span>
              </div>
              <div ref="pieChartRef" class="chart-body" />
            </div>

            <div
              class="glass-card chart-card heatmap-card clickable-card"
              role="button"
              tabindex="0"
              @click="navigateTo(chartRoutes.heatmap)"
              @keydown="activateKeyboard($event, () => navigateTo(chartRoutes.heatmap))"
            >
              <div class="card-header">
                <span class="card-title">小时活跃热力图</span>
                <div class="heatmap-scale">
                  <span>低</span>
                  <div class="scale-bar" />
                  <span>高</span>
                </div>
              </div>
              <div ref="heatmapChartRef" class="chart-body" />
            </div>
          </div>

          <div class="glass-card latest-card">
            <div class="card-header">
              <span class="card-title">最新干预事件</span>
              <button class="text-link" type="button" @click="navigateTo(chartRoutes.latest)">
                查看更多事件 <ChevronRight :size="12" />
              </button>
            </div>
            <div class="latest-list">
              <div
                v-for="evt in latestEvents"
                :key="evt.id"
                class="latest-item"
                :class="{ active: selectedEvent?.id === evt.id }"
                role="button"
                tabindex="0"
                @click="selectNodeById(evt.id, $event)"
                @keydown="activateKeyboard($event, () => selectNodeById(evt.id))"
              >
                <div class="latest-icon" :style="{ background: evt.agent.color }">
                  <component :is="evt.agent.icon" :size="14" />
                </div>
                <div class="latest-info">
                  <div class="latest-title">{{ evt.label }}</div>
                  <div class="latest-desc">{{ evt.detail }}</div>
                </div>
                <div class="latest-context">
                  <span>{{ evt.chainLabel }}</span>
                  <span>{{ evt.agent.name }}</span>
                  <span>{{ evt.evidenceCount }} 条证据</span>
                </div>
                <div class="latest-action">
                  <div class="latest-tail">
                    <div class="latest-time">{{ evt.time }}</div>
                    <div class="latest-tag" :class="evt.value">
                      {{ evt.value === 'high' ? '高价值' : evt.value === 'medium' ? '中价值' : '低价值' }}
                    </div>
                  </div>
                  <button
                    type="button"
                    class="latest-route"
                    @click.stop="navigateTo(evt.routePath)"
                  >
                    {{ evt.routeLabel }}
                    <ChevronRight :size="12" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="module-chips-row">
            <div class="chips-copy">
              <span class="chips-label">模块协作概览</span>
              <small>切换下方事件链路</small>
            </div>
            <div class="module-chips">
              <button
                v-for="mod in moduleCards"
                :key="mod.id"
                type="button"
                class="module-chip"
                :class="{ active: activeChainId === mod.chainId }"
                :style="{ '--module-color': mod.color }"
                @click="selectChain(mod.chainId)"
              >
                <span class="chip-dot" />
                <span class="chip-name">{{ mod.name }}</span>
                <span class="chip-count">{{ mod.eventCount }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.section-telemetry {
  position: relative;
  padding: 24px;
  color: #e8edf5;
  font-family: 'Outfit', 'PingFang SC', sans-serif;
}

.telemetry-inner {
  max-width: 1600px;
  margin: 0 auto;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.date-cards-row {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.date-card {
  --card-color: #22d3ee;
  appearance: none;
  cursor: pointer;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 96px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(150, 175, 220, 0.10);
  background:
    radial-gradient(ellipse at 50% 0%, rgba(34, 211, 238, 0.05), transparent 50%),
    linear-gradient(180deg, rgba(12, 18, 38, 0.60), rgba(6, 10, 24, 0.44));
  backdrop-filter: blur(20px) saturate(1.18);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 10px 28px rgba(0, 0, 0, 0.18);
  color: #c8d6f0;
  text-align: left;
  transition: all 0.22s ease;
}

.date-card:hover {
  transform: translateY(-2px);
  border-color: rgba(34, 211, 238, 0.22);
  background:
    radial-gradient(ellipse at 50% 0%, rgba(34, 211, 238, 0.10), transparent 52%),
    linear-gradient(180deg, rgba(14, 22, 46, 0.68), rgba(7, 12, 28, 0.50));
}

.date-card.active {
  border-color: rgba(34, 211, 238, 0.42);
  background:
    radial-gradient(ellipse at 50% 0%, rgba(34, 211, 238, 0.16), transparent 56%),
    linear-gradient(180deg, rgba(18, 30, 60, 0.76), rgba(8, 14, 34, 0.58));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 14px 36px rgba(34, 211, 238, 0.10);
}

.date-day {
  font-size: 11px;
  color: #7f93ba;
  font-weight: 500;
}

.date-number {
  font-size: 20px;
  font-weight: 700;
  color: #f7fbff;
  line-height: 1;
}

.date-density {
  display: flex;
  align-items: center;
  gap: 8px;
}

.density-track {
  flex: 1 1 auto;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.density-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, #22d3ee, #a78bfa);
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.25);
  transition: width 0.4s ease;
}

.density-count {
  font-size: 10px;
  color: #7f93ba;
  white-space: nowrap;
}

.dash-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.glass-card {
  position: relative;
  border-radius: 16px;
  padding: 16px;
  background:
    radial-gradient(ellipse at 20% 0%, rgba(34, 211, 238, 0.04), transparent 46%),
    linear-gradient(180deg, rgba(12, 18, 38, 0.72), rgba(6, 10, 24, 0.55));
  border: 1px solid rgba(150, 175, 220, 0.10);
  backdrop-filter: blur(26px) saturate(1.24);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 18px 46px rgba(0, 0, 0, 0.22);
  isolation: isolate;
  overflow: hidden;
}

.glass-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.35), transparent);
  opacity: 0.6;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 14px;
}

.card-title {
  font-size: 13px;
  font-weight: 650;
  color: #c8d6f0;
  letter-spacing: 0.04em;
}

.card-info {
  color: #5d6e8f;
  cursor: help;
}

.text-link {
  appearance: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: transparent;
  border: 0;
  color: #22d3ee;
  font-size: 11px;
  font-weight: 600;
}

.clickable-card {
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.clickable-card:hover {
  border-color: rgba(34, 211, 238, 0.24);
  background:
    radial-gradient(ellipse at 20% 0%, rgba(34, 211, 238, 0.075), transparent 48%),
    linear-gradient(180deg, rgba(14, 23, 48, 0.76), rgba(6, 10, 24, 0.58));
  transform: translateY(-1px);
}

.clickable-card:focus-visible,
.text-link:focus-visible,
.latest-item:focus-visible,
.latest-route:focus-visible {
  outline: 2px solid rgba(34, 211, 238, 0.72);
  outline-offset: 3px;
}

/* Left column */
.overview-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.overview-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 8px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  text-align: center;
}

.overview-stat.stat-module {
  grid-column: span 1;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: #f7fbff;
  line-height: 1.1;
}

.stat-label {
  font-size: 10px;
  color: #7f93ba;
}

.agent-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-row {
  --agent-color: #22d3ee;
  appearance: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.03);
  color: #c8d2e6;
  text-align: left;
  transition: all 0.22s ease;
}

.agent-row:hover {
  background: rgba(255, 255, 255, 0.06);
  transform: translateX(2px);
}

.agent-row.active {
  background: color-mix(in srgb, var(--agent-color) 10%, rgba(255, 255, 255, 0.04));
  border-color: color-mix(in srgb, var(--agent-color) 40%, rgba(150, 175, 220, 0.12));
  box-shadow: 0 8px 22px color-mix(in srgb, var(--agent-color) 8%, transparent);
}

.agent-row::before {
  content: '';
  width: 3px;
  height: 24px;
  border-radius: 2px;
  background: var(--agent-color);
  box-shadow: 0 0 10px color-mix(in srgb, var(--agent-color) 60%, transparent);
}

.agent-icon {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--agent-color);
}

.agent-info {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.agent-name {
  font-size: 13px;
  font-weight: 600;
  color: #f7fbff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-sub {
  font-size: 10px;
  color: #7f93ba;
}

.agent-count {
  font-size: 14px;
  font-weight: 700;
  color: #f7fbff;
}

/* Center timeline */
.timeline-card {
  padding: 0;
  display: flex;
  flex-direction: column;
}

.timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 12px;
  border-bottom: 1px solid rgba(150, 175, 220, 0.08);
}

.timeline-title {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: #f7fbff;
}

.timeline-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-select,
.date-picker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(150, 175, 220, 0.10);
  color: #9badcc;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.timeline-shell {
  position: relative;
  overflow: auto;
  padding: 8px 0;
}

.timeline-svg {
  display: block;
  width: 100%;
  min-width: 1080px;
  height: 520px;
}

/* Metrics row */
.metrics-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

.metric-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px;
}

.metric-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: rgba(34, 211, 238, 0.08);
  color: #22d3ee;
}

.metric-body {
  flex: 1 1 auto;
  min-width: 0;
}

.metric-label {
  font-size: 11px;
  color: #7f93ba;
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.metric-value {
  font-size: 20px;
  font-weight: 700;
  color: #f7fbff;
  line-height: 1.1;
  margin-bottom: 2px;
}

.metric-change {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  color: #8da3c8;
}

.metric-change.up {
  color: #4ade80;
}

.metric-change.down {
  color: #f87171;
}

/* Charts grid */
.charts-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 12px;
}

.chart-card {
  padding: 14px;
  display: flex;
  flex-direction: column;
}

.trend-card { grid-column: span 5; }
.top-card { grid-column: span 4; }
.pie-card { grid-column: span 3; }
.heatmap-card { grid-column: span 7; }

.chart-body {
  flex: 1 1 auto;
  min-height: 180px;
}

.trend-card .chart-body { min-height: 200px; }
.top-card .chart-body { min-height: 200px; }
.pie-card .chart-body { min-height: 200px; }
.heatmap-card .chart-body { min-height: 180px; }

.chart-legend {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  color: #7f93ba;
}

.legend-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 3px;
}

.legend-dot.cyan { background: #22d3ee; }
.legend-dot.gray { background: rgba(150, 175, 220, 0.45); }

.heatmap-scale {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: #7f93ba;
}

.scale-bar {
  width: 60px;
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(90deg, #0a1120, #112240, #1d4e89, #22d3ee, #a78bfa);
}

/* Latest events */
.latest-card {
  padding: 16px;
}

.latest-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.latest-item {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 150px;
  grid-template-rows: auto auto;
  align-items: center;
  gap: 12px;
  min-height: 68px;
  padding: 11px 14px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  color: inherit;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}

.latest-item:hover,
.latest-item.active {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(34, 211, 238, 0.14);
}

.latest-icon {
  width: 28px;
  height: 28px;
  align-self: center;
  grid-row: 1 / 3;
  display: grid;
  place-items: center;
  border-radius: 7px;
  color: #fff;
  flex: 0 0 auto;
}

.latest-info {
  min-width: 0;
  align-self: center;
  grid-column: 2;
  grid-row: 1;
}

.latest-title {
  font-size: 12px;
  font-weight: 600;
  color: #f7fbff;
  margin-bottom: 2px;
}

.latest-desc {
  font-size: 11px;
  color: #7f93ba;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.latest-context {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-self: center;
  grid-column: 2;
  grid-row: 2;
  min-width: 0;
}

.latest-context span {
  min-width: 0;
  max-width: 180px;
  padding: 4px 8px;
  border: 1px solid rgba(150, 175, 220, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
  color: #8da3c8;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.latest-action {
  display: grid;
  grid-template-rows: auto auto;
  align-content: center;
  justify-items: end;
  grid-column: 3;
  grid-row: 1 / 3;
  gap: 7px;
  min-width: 0;
}

.latest-tail {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}

.latest-time {
  font-size: 11px;
  color: #5d6e8f;
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}

.latest-route {
  appearance: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 138px;
  min-height: 32px;
  border: 1px solid rgba(34, 211, 238, 0.18);
  border-radius: 9px;
  background: rgba(34, 211, 238, 0.075);
  color: #67e8f9;
  font-size: 11px;
  font-weight: 650;
  white-space: nowrap;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.latest-route:hover {
  border-color: rgba(34, 211, 238, 0.36);
  background: rgba(34, 211, 238, 0.13);
  color: #d8fbff;
}

.latest-tag {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  flex: 0 0 auto;
}

.latest-tag.high { background: rgba(74, 222, 128, 0.12); color: #4ade80; }
.latest-tag.medium { background: rgba(34, 211, 238, 0.12); color: #22d3ee; }
.latest-tag.low { background: rgba(150, 175, 220, 0.12); color: #8da3c8; }

/* Floating detail popup */
.detail-popup {
  position: fixed;
  z-index: 100;
  width: 320px;
  max-height: 540px;
  overflow-y: auto;
  padding: 16px;
  border-radius: 16px;
  background:
    radial-gradient(ellipse at 30% 0%, rgba(34, 211, 238, 0.07), transparent 48%),
    linear-gradient(180deg, rgba(14, 20, 42, 0.92), rgba(7, 11, 26, 0.88));
  border: 1px solid rgba(150, 175, 220, 0.14);
  backdrop-filter: blur(30px) saturate(1.28);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 24px 60px rgba(0, 0, 0, 0.38);
  color: #e8edf5;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.popup-enter-active,
.popup-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.popup-enter-from,
.popup-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

.popup-close {
  position: absolute;
  top: 12px;
  right: 12px;
  appearance: none;
  cursor: pointer;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  border: 0;
  background: rgba(255, 255, 255, 0.05);
  color: #7f93ba;
  transition: all 0.18s ease;
}

.popup-close:hover {
  background: rgba(255, 255, 255, 0.10);
  color: #f7fbff;
}

.popup-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-right: 24px;
}

.detail-icon {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  flex: 0 0 auto;
}

.detail-titles {
  min-width: 0;
}

.detail-title {
  font-size: 16px;
  font-weight: 700;
  color: #f7fbff;
  line-height: 1.25;
}

.detail-subtitle {
  font-size: 11px;
  color: #22d3ee;
  font-weight: 500;
  margin-top: 2px;
}

.detail-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: #9badcc;
}

.detail-section-title {
  font-size: 10px;
  font-weight: 650;
  color: #7f93ba;
  letter-spacing: 0.06em;
}

.detail-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.detail-metric {
  padding: 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(150, 175, 220, 0.06);
}

.detail-metric.metric-wide {
  grid-column: span 3;
}

.metric-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 4px;
}

.detail-metric .metric-label {
  font-size: 10px;
  color: #7f93ba;
  margin-bottom: 0;
}

.metric-stars {
  display: flex;
  gap: 2px;
}

.star-filled {
  color: #f0b24a;
  fill: #f0b24a;
}

.star-empty {
  color: rgba(150, 175, 220, 0.25);
}

.metric-value-row {
  display: flex;
  align-items: baseline;
  gap: 3px;
}

.metric-value-row strong {
  font-size: 16px;
  font-weight: 700;
  color: #f7fbff;
}

.metric-value-row small {
  font-size: 10px;
  color: #7f93ba;
}

.impact-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.impact-card {
  padding: 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
}

.impact-label {
  font-size: 10px;
  color: #7f93ba;
  margin-bottom: 2px;
}

.impact-change {
  font-size: 15px;
  font-weight: 700;
  color: #f7fbff;
  margin-bottom: 6px;
}

.impact-change.up { color: #4ade80; }
.impact-change.down { color: #f87171; }

.sparkline {
  width: 100%;
  height: 22px;
}

.records-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.record-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  font-size: 12px;
  color: #9badcc;
}

.record-item svg {
  color: #22d3ee;
}

.record-item span {
  flex: 1 1 auto;
}

.record-item strong {
  color: #f7fbff;
  font-weight: 600;
}

.quality-bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.quality-bar {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.quality-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: #7f93ba;
}

.quality-label strong {
  color: #f7fbff;
  font-weight: 600;
}

.quality-track {
  height: 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.quality-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #22d3ee, #a78bfa);
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.25);
}

.ai-suggestion {
  padding: 12px;
  border-radius: 10px;
  background: rgba(34, 211, 238, 0.06);
  border: 1px solid rgba(34, 211, 238, 0.12);
}

.ai-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 650;
  color: #22d3ee;
  margin-bottom: 6px;
}

.ai-suggestion p {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #9badcc;
}

/* Module chips */
.module-chips-row {
  display: grid;
  grid-template-columns: minmax(140px, 0.18fr) minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-radius: 14px;
  background:
    radial-gradient(ellipse at 20% 0%, rgba(34, 211, 238, 0.04), transparent 46%),
    linear-gradient(180deg, rgba(12, 18, 38, 0.62), rgba(6, 10, 24, 0.46));
  border: 1px solid rgba(150, 175, 220, 0.10);
  backdrop-filter: blur(20px) saturate(1.18);
}

.chips-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.chips-label {
  font-size: 12px;
  color: #7f93ba;
  font-weight: 600;
  white-space: nowrap;
}

.chips-copy small {
  color: #526580;
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
}

.module-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex: 1 1 auto;
  justify-content: flex-start;
}

.module-chip {
  --module-color: #22d3ee;
  appearance: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(150, 175, 220, 0.10);
  background: rgba(255, 255, 255, 0.04);
  color: #c8d6f0;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.module-chip:hover {
  background: color-mix(in srgb, var(--module-color) 8%, rgba(255, 255, 255, 0.06));
  border-color: color-mix(in srgb, var(--module-color) 30%, rgba(150, 175, 220, 0.12));
}

.module-chip.active {
  background: color-mix(in srgb, var(--module-color) 12%, rgba(255, 255, 255, 0.06));
  border-color: color-mix(in srgb, var(--module-color) 45%, rgba(150, 175, 220, 0.14));
  box-shadow: 0 8px 22px color-mix(in srgb, var(--module-color) 10%, transparent);
}

.chip-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--module-color);
  box-shadow: 0 0 8px color-mix(in srgb, var(--module-color) 70%, transparent);
}

.chip-count {
  padding: 1px 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 10px;
  color: #f7fbff;
  font-weight: 600;
}

/* SVG timeline */
.time-grid line {
  stroke: #2a3450;
  stroke-opacity: 0.35;
  stroke-dasharray: 2 6;
}

.time-grid text {
  fill: #4d5b7a;
  font-size: 10px;
  font-weight: 500;
}

.agent-name {
  font-size: 11px;
  font-weight: 600;
}

.now-layer line {
  stroke: #f0b24a;
  stroke-width: 1.2;
  stroke-opacity: 0.38;
  stroke-dasharray: 4 6;
  animation: now-flow 1.4s linear infinite;
}

.now-layer text {
  fill: #f0b24a;
  font-size: 10px;
  font-weight: 600;
}

.chain-links path {
  fill: none;
  stroke-width: 1.2;
  stroke-opacity: 0.10;
  transition: stroke-opacity 0.22s ease, stroke-width 0.22s ease;
}

.chain-links path.active {
  filter: url(#chain-glow);
  stroke-width: 2.2;
  stroke-opacity: 0.9;
  stroke-dasharray: 8 12;
  animation: chain-flow 1.4s linear infinite;
  animation-delay: var(--delay);
}

.event-node {
  cursor: pointer;
  opacity: 1;
  transition: opacity 0.22s ease;
}

.event-node.dimmed {
  opacity: 0.16;
}

.node-hit {
  fill: transparent;
}

.node-core {
  fill: rgba(3, 6, 15, 0.92);
  stroke: var(--node-color);
  stroke-width: 1.6;
  filter: drop-shadow(0 0 12px color-mix(in srgb, var(--node-color) 65%, transparent));
  transition: stroke-width 0.18s ease, filter 0.18s ease;
}

.event-node:hover .node-core,
.event-node.active .node-core {
  stroke-width: 2.4;
  filter: drop-shadow(0 0 22px color-mix(in srgb, var(--node-color) 90%, transparent));
}

.node-inner {
  fill: var(--node-color);
  opacity: 0.65;
  filter: drop-shadow(0 0 6px color-mix(in srgb, var(--node-color) 80%, transparent));
  transition: opacity 0.18s ease, filter 0.18s ease;
}

.event-node:hover .node-inner,
.event-node.active .node-inner {
  opacity: 1;
  filter: drop-shadow(0 0 14px color-mix(in srgb, var(--node-color) 100%, transparent));
  animation: ordered-pulse 2.2s ease-in-out infinite;
}

.event-node.pulse .node-core {
  stroke-width: 2.4;
  animation: node-breathe 1.1s ease-in-out infinite;
}

/* Animations */
@keyframes now-flow {
  to { stroke-dashoffset: -20; }
}

@keyframes chain-flow {
  to { stroke-dashoffset: -44; }
}

@keyframes ordered-pulse {
  0%, 100% { opacity: 0.32; }
  45% { opacity: 0.82; }
}

@keyframes node-breathe {
  0%, 100% { filter: drop-shadow(0 0 3px color-mix(in srgb, var(--node-color) 25%, transparent)); }
  50% { filter: drop-shadow(0 0 6px color-mix(in srgb, var(--node-color) 35%, transparent)); }
}

@media (max-width: 1200px) {
  .dashboard-grid {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  .metrics-row {
    grid-template-columns: repeat(3, 1fr);
  }

  .charts-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .trend-card,
  .top-card,
  .pie-card,
  .heatmap-card {
    grid-column: span 1;
  }

  .latest-item {
    grid-template-columns: 34px minmax(0, 1fr) 142px;
  }

  .latest-action {
    grid-column: 3;
    justify-self: end;
  }
}

@media (max-width: 900px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }

  .left-col {
    order: 2;
  }

  .center-col {
    order: 1;
  }

  .overview-stats {
    grid-template-columns: repeat(3, 1fr);
  }

  .agent-rows {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
  }

  .detail-metrics {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 720px) {
  .section-telemetry {
    padding: 16px;
  }

  .date-card {
    min-width: 82px;
    padding: 10px 12px;
  }

  .timeline-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .metrics-row {
    grid-template-columns: repeat(2, 1fr);
  }

  .charts-grid {
    grid-template-columns: 1fr;
  }

  .latest-item {
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 10px;
  }

  .latest-context,
  .latest-action {
    grid-column: 2;
  }

  .latest-context {
    grid-template-columns: 1fr;
  }

  .latest-action {
    justify-items: stretch;
  }

  .latest-tail {
    justify-content: space-between;
  }

  .latest-route {
    width: 100%;
  }

  .module-chips-row {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .agent-rows,
  .detail-metrics,
  .impact-grid {
    grid-template-columns: 1fr;
  }

  .latest-item {
    grid-template-columns: 34px minmax(0, 1fr);
    align-items: flex-start;
  }

  .latest-context,
  .latest-tail,
  .latest-route {
    grid-column: 2;
  }

  .latest-context {
    grid-template-columns: 1fr;
  }

  .latest-tail {
    justify-content: flex-start;
  }

  .latest-route {
    width: 132px;
  }

  .detail-popup {
    left: 16px !important;
    right: 16px !important;
    width: auto;
  }
}
</style>
