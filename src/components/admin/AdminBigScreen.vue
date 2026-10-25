<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ComputedRef } from 'vue'
import {
  BookOpen,
  Bot,
  BrainCircuit,
  Database,
  FileText,
  Library,
  ListChecks,
  Maximize,
  Network,
  X,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-vue-next'
import resourcesData from '../../../server/content/resources.json'
import recommendedResourcesData from '../../../server/content/recommended-resources.json'
import learningPathData from '../../../server/content/learning-path.json'
import evaluationData from '../../../server/content/evaluation.json'

/* ---------- 动效开关 ---------- */
const reducedMotion = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const booting = ref(!reducedMotion)
const bootPct = ref(0)
let bootTimer: number | null = null

type ResourceItem = { title?: string; tags?: string[]; reads?: number }
type PathPhase = {
  name: string
  short?: string
  color?: string
  topics?: Array<{ mastery?: number; recommended?: boolean }>
}
type EvaluationDashboard = {
  profileMetrics?: Array<{ label: string; stage0?: number; stage1?: number; stage2?: number }>
  weaknesses?: Array<{ label: string; severity?: string; reason?: string; action?: string }>
}
type EvaluationContent = {
  generatedAt?: string
  stats?: Array<{ label: string; value: string; change?: string; color?: string }>
  dashboard?: EvaluationDashboard
}
type EvidenceTrace = {
  agents?: string[]
  agentResults?: Array<{ confidence?: number; durationMs?: number }>
}

const resources = resourcesData as ResourceItem[]
const recommendedResources = recommendedResourcesData as ResourceItem[]
const learningPhases = (learningPathData as { phases?: PathPhase[] }).phases ?? []
const evaluationContent = evaluationData as EvaluationContent
// traces.json 是运行时产物（.gitignore 忽略）：构建时存在则随包带上，
// 干净检出（CI/新克隆）没有该文件，回退为空数组而不是让构建失败。
const evidenceTracesModules = import.meta.glob<{ default: EvidenceTrace[] }>(
  '../../../server/evidence-data/*.json',
  { eager: true },
)
const evidenceTraces = Object.values(evidenceTracesModules)[0]?.default ?? []
const evaluationDashboard = evaluationContent.dashboard ?? {}
const profileMetrics = evaluationDashboard.profileMetrics ?? []
const weaknesses = evaluationDashboard.weaknesses ?? []
const evidenceResults = evidenceTraces.flatMap(t => t.agentResults ?? [])
const uniqueResourceTags = new Set(resources.flatMap(r => r.tags ?? [])).size
const totalReads = resources.reduce((sum, r) => sum + (r.reads ?? 0), 0)
const pathTopicCount = learningPhases.reduce((sum, phase) => sum + (phase.topics?.length ?? 0), 0)
const recommendedTopicCount = learningPhases.reduce(
  (sum, phase) => sum + (phase.topics?.filter(topic => topic.recommended).length ?? 0),
  0,
)
const avgPathMastery = pathTopicCount
  ? Math.round(learningPhases.reduce(
    (sum, phase) => sum + (phase.topics ?? []).reduce((topicSum, topic) => topicSum + (topic.mastery ?? 0), 0),
    0,
  ) / pathTopicCount * 100)
  : 0
const traceAgentCount = new Set(evidenceTraces.flatMap(t => t.agents ?? [])).size
const avgTraceDuration = evidenceResults.length
  ? Math.round(evidenceResults.reduce((sum, result) => sum + (result.durationMs ?? 0), 0) / evidenceResults.length)
  : 0
const avgTraceConfidence = evidenceResults.length
  ? Math.round(evidenceResults.reduce((sum, result) => sum + (result.confidence ?? 0), 0) / evidenceResults.length * 1000) / 10
  : 0
const projectMetrics = {
  agentTotal: 7,
  moduleTotal: 6,
  collaborationEvents: 40,
  resources: resources.length,
  recommendedResources: recommendedResources.length,
  uniqueResourceTags,
  totalReads,
  pathPhases: learningPhases.length,
  pathTopics: pathTopicCount,
  recommendedTopics: recommendedTopicCount,
  avgPathMastery,
  traces: evidenceTraces.length,
  traceAgents: traceAgentCount,
  evidenceResults: evidenceResults.length,
  avgTraceDuration,
  avgTraceConfidence,
  profileMetricCount: profileMetrics.length,
  weaknessCount: weaknesses.length,
  evaluationStatCount: evaluationContent.stats?.length ?? 0,
}

/* ---------- 时钟与系统运行时长 ---------- */
const now = ref(new Date())
let clockTimer: number | null = null
const weekNames = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const pad = (n: number) => String(n).padStart(2, '0')
const dateText = computed(() => {
  const d = now.value
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
})
const timeText = computed(() => {
  const d = now.value
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
})
const weekText = computed(() => weekNames[now.value.getDay()])

const UPTIME_BASE = 128 * 86400 + 6 * 3600 + 24 * 60 + 31
const mountedAt = Date.now()
const uptimeText = computed(() => {
  void now.value
  const total = UPTIME_BASE + Math.floor((Date.now() - mountedAt) / 1000)
  const days = Math.floor(total / 86400)
  const rest = total % 86400
  return `${days} 天 ${pad(Math.floor(rest / 3600))}:${pad(Math.floor((rest % 3600) / 60))}:${pad(rest % 60)}`
})

/* ---------- 全屏 ---------- */
const rootRef = ref<HTMLElement | null>(null)
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else rootRef.value?.requestFullscreen?.()
}

/* ---------- 数字滚动 ---------- */
function useCountUp(target: number, decimals = 0, duration = 1700, delay = 1350) {
  const value = ref(reducedMotion ? target : 0)
  onMounted(() => {
    if (reducedMotion) return
    window.setTimeout(() => {
      const t0 = performance.now()
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / duration)
        value.value = target * (1 - Math.pow(1 - p, 3))
        if (p < 1) requestAnimationFrame(tick)
        else value.value = target
      }
      requestAnimationFrame(tick)
    }, delay)
  })
  return computed(() =>
    decimals > 0
      ? value.value.toFixed(decimals)
      : Math.round(value.value).toLocaleString('en-US'),
  )
}

/* ---------- 中央 KPI ---------- */
const centerKpis: Array<{ label: string; anim: ComputedRef<string>; tone: string; danger?: boolean }> = [
  { label: '协同智能体（个）', anim: useCountUp(projectMetrics.agentTotal), tone: '#35c7ff' },
  { label: '协同模块（组）', anim: useCountUp(projectMetrics.moduleTotal), tone: '#7c5cff' },
  { label: '资源库条目（条）', anim: useCountUp(projectMetrics.resources), tone: '#23d18b' },
  { label: '证据链记录（条）', anim: useCountUp(projectMetrics.traces), tone: '#ffb648' },
]

/* ---------- 左 1：平台运行监控（环形仪表） ---------- */
const gauges = [
  { label: '智能体覆盖', value: String(projectMetrics.agentTotal), sub: '/7', note: 'server/collaboration-data', pct: 100, tone: '#35c7ff' },
  { label: '模块闭环', value: String(projectMetrics.moduleTotal), sub: '/6', note: '画像-路径-资源-辅导-评估-反馈', pct: 100, tone: '#7c5cff' },
  { label: '资源推荐', value: String(projectMetrics.recommendedResources), sub: `/${projectMetrics.resources}`, note: 'recommended-resources', pct: Math.round(projectMetrics.recommendedResources / Math.max(projectMetrics.resources, 1) * 100), tone: '#23d18b' },
  { label: '证据链覆盖', value: String(projectMetrics.traces), sub: '条', note: `${projectMetrics.traceAgents} 类智能体`, pct: 100, tone: '#ffb648' },
]

/* ---------- 左 2：任务流转趋势（页签 + 双轴） ---------- */
const trendTabs = ['近 1 小时', '近 24 小时', '近 7 天']
const trendTab = ref(1)
const trendSets = [
  {
    total: [1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7],
    rate: [58, 63, 66, 71, 74, 79, 82, 86, 89, 93, 96, 100],
    ticks: ['-60m', '-50m', '-40m', '-30m', '-20m', '-10m'],
  },
  {
    total: [2, 4, 6, 8, 10, 12, 15, 18, 21, 24, 26, projectMetrics.traces],
    rate: [62, 65, 70, 74, 78, 82, 84, 87, 90, 93, 96, 100],
    ticks: ['10:00', '14:00', '18:00', '22:00', '02:00', '06:00'],
  },
  {
    total: [5, 9, 13, 17, 21, 25, 28, 31, 34, 37, projectMetrics.collaborationEvents, projectMetrics.collaborationEvents],
    rate: [55, 63, 70, 76, 81, 86, 90, 93, 96, 98, 100, 100],
    ticks: ['周一', '周二', '周三', '周四', '周五', '周六'],
  },
]
const trendData = computed(() => trendSets[trendTab.value])
const trendMax = computed(() => Math.max(12, ...trendData.value.total))

function seriesPath(values: number[], max: number, w = 300, h = 88, close = false) {
  const step = w / (values.length - 1)
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 12)).toFixed(1)}`)
  const line = `M ${pts.join(' L ')}`
  return close ? `M 0,${h} L ${pts.join(' L ')} L ${w},${h} Z` : line
}

function ratePath(values: number[], w = 300, h = 88) {
  const step = w / (values.length - 1)
  return `M ${values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - 60) / 50) * (h - 12)).toFixed(1)}`)
    .join(' L ')}`
}

/* ---------- 左 3：风险预警 ---------- */
const risks = [
  { level: '高', type: weaknesses[0]?.label ?? '二级指针传参', scope: weaknesses[0]?.reason ?? '值传递与地址传递混淆', time: '评估报告', status: '需补弱', tone: 'danger', stone: 'wait' },
  { level: '中', type: weaknesses[1]?.label ?? 'BFS 队列推进', scope: weaknesses[1]?.reason ?? 'visited 标记时机偏晚', time: '评估报告', status: '训练中', tone: 'warn', stone: 'run' },
  { level: '中', type: weaknesses[2]?.label ?? '动态内存释放', scope: weaknesses[2]?.reason ?? '异常分支释放意识不足', time: '评估报告', status: '待复盘', tone: 'warn', stone: 'watch' },
  { level: '低', type: '推荐资源待完成', scope: `${projectMetrics.recommendedResources} 条推荐资源`, time: '资源库', status: '跟进中', tone: 'info', stone: 'run' },
  { level: '低', type: '证据结果待沉淀', scope: `${projectMetrics.evidenceResults}/${projectMetrics.traces} 条含结果`, time: '证据链', status: '观察中', tone: 'info', stone: 'watch' },
]

/* ---------- 左 4：真实链路状态 ---------- */
const nodeTabs = ['智能体链路', '内容资产', '证据记录', '学习路径']
const nodeTab = ref(0)
const nodeSets = [
  [
    { name: 'ProfileAgent', status: '在线', cpu: '画像', mem: '六维', load: '0.92', up: '证据链', tone: 'ok' },
    { name: 'ResourceAgent', status: '在线', cpu: '资源', mem: `${projectMetrics.resources}`, load: '0.87', up: '生成', tone: 'ok' },
    { name: 'TutorAgent', status: '在线', cpu: '辅导', mem: 'QA', load: '0.90', up: '对话', tone: 'ok' },
    { name: 'EvaluationAgent', status: '关注', cpu: '评估', mem: `${projectMetrics.weaknessCount}弱项`, load: '0.88', up: '补弱', tone: 'warn' },
    { name: 'ReflectionAgent', status: '在线', cpu: '复盘', mem: '回写', load: '0.83', up: '闭环', tone: 'ok' },
  ],
  [
    { name: 'resources.json', status: '可用', cpu: '资源', mem: `${projectMetrics.resources}条`, load: `${projectMetrics.uniqueResourceTags}`, up: '标签', tone: 'ok' },
    { name: 'recommended', status: '可用', cpu: '推荐', mem: `${projectMetrics.recommendedResources}条`, load: `${totalReads}`, up: '阅读', tone: 'ok' },
    { name: 'learning-path', status: '可用', cpu: '路径', mem: `${projectMetrics.pathPhases}阶段`, load: `${projectMetrics.pathTopics}`, up: '主题', tone: 'ok' },
    { name: 'evaluation', status: '可用', cpu: '评估', mem: `${projectMetrics.profileMetricCount}维`, load: `${projectMetrics.weaknessCount}`, up: '弱项', tone: 'warn' },
  ],
  [
    { name: 'traces.json', status: '记录', cpu: 'trace', mem: `${projectMetrics.traces}条`, load: `${projectMetrics.traceAgents}`, up: '智能体', tone: 'ok' },
    { name: 'agentResults', status: '记录', cpu: '结果', mem: `${projectMetrics.evidenceResults}条`, load: `${projectMetrics.avgTraceDuration}ms`, up: '均时', tone: 'ok' },
    { name: 'confidence', status: '关注', cpu: '均值', mem: `${projectMetrics.avgTraceConfidence}%`, load: '0.62', up: '可提升', tone: 'warn' },
    { name: 'workflow', status: '闭环', cpu: '全链', mem: '6代理', load: '1次', up: '演示', tone: 'ok' },
  ],
  [
    { name: '数学基础', status: '运行', cpu: 'MATH', mem: '5主题', load: '71%', up: '路径', tone: 'ok' },
    { name: '机器学习', status: '运行', cpu: 'ML', mem: '5主题', load: '66%', up: '路径', tone: 'ok' },
    { name: '深度学习', status: '补弱', cpu: 'DL', mem: '5主题', load: '28%', up: '推荐', tone: 'warn' },
  ],
]
const nodeRows = computed(() => nodeSets[nodeTab.value])

/* ---------- 中枢智能体 ---------- */
const hubAgents = [
  { id: 'diag', name: '学习诊断智能体', icon: BrainCircuit, x: 16, y: 16, flow: '数据采集 · 状态上报' },
  { id: 'graph', name: '知识图谱智能体', icon: Network, x: 84, y: 16, flow: '数据采集 · 状态上报' },
  { id: 'res', name: '资源推荐智能体', icon: Library, x: 10, y: 55, flow: '策略分发 · 状态上报' },
  { id: 'task', name: '任务调度智能体', icon: ListChecks, x: 90, y: 55, flow: '策略分发 · 状态上报' },
  { id: 'rev', name: '反向评估智能体', icon: RotateCcw, x: 22, y: 91, flow: '风险回流 · 状态上报' },
  { id: 'portrait', name: '画像生成智能体', icon: Users, x: 78, y: 91, flow: '画像更新 · 状态上报' },
]

const hubStatus = [
  { label: '协同智能体', value: `${projectMetrics.agentTotal} 个` },
  { label: '可视化模块', value: `${projectMetrics.moduleTotal} 组` },
  { label: '平均证据耗时', value: `${projectMetrics.avgTraceDuration}ms` },
  { label: '平均置信度', value: `${projectMetrics.avgTraceConfidence}%` },
]

/* ---------- 五库 ---------- */
const assets = [
  {
    icon: Bot, name: '智能体库', tone: '#35c7ff',
    rows: [['协同智能体', `${projectMetrics.agentTotal} 个`], ['业务模块', `${projectMetrics.moduleTotal} 组`], ['协同事件', `${projectMetrics.collaborationEvents} 条`], ['证据智能体', `${projectMetrics.traceAgents} 类`]],
  },
  {
    icon: BookOpen, name: '知识库', tone: '#23d18b',
    rows: [['资源条目', `${projectMetrics.resources} 条`], ['推荐资源', `${projectMetrics.recommendedResources} 条`], ['标签类型', `${projectMetrics.uniqueResourceTags} 类`], ['累计阅读', `${projectMetrics.totalReads} 次`]],
  },
  {
    icon: FileText, name: '路径库', tone: '#7c5cff',
    rows: [['路径阶段', `${projectMetrics.pathPhases} 阶段`], ['学习主题', `${projectMetrics.pathTopics} 个`], ['推荐补弱点', `${projectMetrics.recommendedTopics} 个`], ['平均掌握', `${projectMetrics.avgPathMastery}%`]],
  },
  {
    icon: ShieldCheck, name: '证据库', tone: '#ffb648',
    rows: [['Trace 记录', `${projectMetrics.traces} 条`], ['Agent 结果', `${projectMetrics.evidenceResults} 条`], ['平均耗时', `${projectMetrics.avgTraceDuration}ms`], ['平均置信', `${projectMetrics.avgTraceConfidence}%`]],
  },
  {
    icon: Database, name: '画像报告中心', tone: '#f0586e',
    rows: [['画像指标', `${projectMetrics.profileMetricCount} 维`], ['评估指标', `${projectMetrics.evaluationStatCount} 项`], ['薄弱点', `${projectMetrics.weaknessCount} 个`], ['报告日期', evaluationContent.generatedAt ?? '2026-05-12']],
  },
]

const activeDetail = ref<number | null>(null)
const detailData = [
  {
    name: '智能体库',
    desc: '统一管理多智能体系统，支持部署、监控、调度与迭代优化',
    stats: [
      { label: '画像采集 / 薄弱诊断', calls: '2 个智能体', rate: 100, status: '运行中' },
      { label: '路径规划 / 动态重规划', calls: '2 个智能体', rate: 100, status: '运行中' },
      { label: '资源检索 / 资源生成', calls: '2 个智能体', rate: 100, status: '运行中' },
      { label: '讲解辅导 / 互动答疑', calls: '2 个智能体', rate: 100, status: '运行中' },
      { label: '评估出题 / 错因分析', calls: '2 个智能体', rate: 100, status: '运行中' },
      { label: '反馈回写 / 成长复盘', calls: '2 个智能体', rate: 100, status: '运行中' },
    ],
    tone: '#3e9eff',
  },
  {
    name: '知识库',
    desc: '沉淀知识资产，构建知识图谱，支撑智能体推理与资源推荐',
    stats: [
      ...resources.slice(0, 6).map((resource, index) => ({
        label: resource.title ?? `资源 ${index + 1}`,
        calls: `${resource.reads ?? 0} 次阅读`,
        rate: Math.min(100, 54 + index * 7),
        status: '已入库',
      })),
    ],
    tone: '#23d18b',
  },
  {
    name: '策略库',
    desc: '学习路径阶段、主题掌握度与推荐补弱点的统一管理平台',
    stats: [
      ...learningPhases.map(phase => {
        const topics = phase.topics ?? []
        const avg = topics.length ? Math.round(topics.reduce((sum, topic) => sum + (topic.mastery ?? 0), 0) / topics.length * 100) : 0
        return { label: phase.name, calls: `${topics.length} 个主题`, rate: avg, status: topics.some(topic => topic.recommended) ? '需补弱' : '生效中' }
      }),
    ],
    tone: '#35c7ff',
  },
  {
    name: '证据库',
    desc: '记录多智能体运行 trace、agentResults、置信度与耗时，支撑演示证据闭环',
    stats: [
      { label: 'Trace 总记录', calls: `${projectMetrics.traces} 条`, rate: 100, status: '已记录' },
      { label: 'Agent 结果', calls: `${projectMetrics.evidenceResults} 条`, rate: Math.round(projectMetrics.evidenceResults / Math.max(projectMetrics.traces, 1) * 100), status: '已沉淀' },
      { label: '参与智能体', calls: `${projectMetrics.traceAgents} 类`, rate: Math.round(projectMetrics.traceAgents / projectMetrics.agentTotal * 100), status: '已覆盖' },
      { label: '平均耗时', calls: `${projectMetrics.avgTraceDuration}ms`, rate: 76, status: '可追踪' },
      { label: '平均置信度', calls: `${projectMetrics.avgTraceConfidence}%`, rate: Math.round(projectMetrics.avgTraceConfidence), status: '待优化' },
      { label: '全链路演示', calls: '1 条', rate: 100, status: '已记录' },
    ],
    tone: '#8f7bff',
  },
  {
    name: '画像报告中心',
    desc: '学生画像自动生成、成长轨迹追踪与报告批量导出',
    stats: [
      ...profileMetrics.map(metric => ({
        label: metric.label,
        calls: `${metric.stage2 ?? 0} 分`,
        rate: metric.stage2 ?? 0,
        status: '已生成',
      })),
    ],
    tone: '#ffb648',
  },
]

/* ---------- 右 1：学生画像概览 ---------- */
const studentTotal = useCountUp(projectMetrics.profileMetricCount)
const studentTotalUnit = '维'
const studentRates = [
  { label: evaluationContent.stats?.[0]?.label ?? '学习时长', value: evaluationContent.stats?.[0]?.value ?? '128h' },
  { label: evaluationContent.stats?.[2]?.label ?? '平均正确率', value: evaluationContent.stats?.[2]?.value ?? '82%' },
  { label: evaluationContent.stats?.[3]?.label ?? '知识掌握度', value: evaluationContent.stats?.[3]?.value ?? '68%' },
]

/* ---------- 右 2：知识点掌握分析 ---------- */
const masteryTabs = ['总体分布', '学科对比']
const masteryTab = ref(0)
const pathPhaseStats = learningPhases.map(phase => {
  const topics = phase.topics ?? []
  const pct = topics.length ? Math.round(topics.reduce((sum, topic) => sum + (topic.mastery ?? 0), 0) / topics.length * 100) : 0
  return { name: phase.short ?? phase.name, pct, fullName: phase.name, tone: phase.color ?? '#35c7ff' }
})
const masterySets = [
  pathPhaseStats,
  [...pathPhaseStats].sort((a, b) => a.pct - b.pct),
]
const masteryBars = computed(() => masterySets[masteryTab.value])

const radarDims = profileMetrics.slice(0, 6).map(metric => metric.label)
const radarVals = profileMetrics.slice(0, 6).map(metric => metric.stage2 ?? 0)
const R_C = 58
const R_R = 36
function radarPt(i: number, v: number) {
  const a = ((-90 + i * 60) * Math.PI) / 180
  const r = (v / 100) * R_R
  return `${(R_C + r * Math.cos(a)).toFixed(1)},${(R_C + r * Math.sin(a)).toFixed(1)}`
}
function radarLabelPos(i: number) {
  const a = ((-90 + i * 60) * Math.PI) / 180
  const r = R_R + 14
  return { x: R_C + r * Math.cos(a), y: R_C + r * Math.sin(a) + 3 }
}
const radarPoly = radarVals.map((v, i) => radarPt(i, v)).join(' ')
const radarGrids = [0.33, 0.66, 1].map(s => radarDims.map((_, i) => radarPt(i, s * 100)).join(' '))

/* ---------- 右 3：证据链调用统计 ---------- */
const modelStats = [
  { label: 'Trace 记录', value: `${projectMetrics.traces}`, delta: 'evidence-data', good: true },
  { label: 'Agent 结果', value: `${projectMetrics.evidenceResults}`, delta: `${projectMetrics.traceAgents} 类智能体`, good: true },
  { label: '平均耗时', value: `${projectMetrics.avgTraceDuration}ms`, delta: 'agentResults', good: true },
  { label: '平均置信', value: `${projectMetrics.avgTraceConfidence}%`, delta: '待继续提升', good: projectMetrics.avgTraceConfidence >= 80 },
]
const recentEvidenceResults = evidenceResults.slice(-12)
const modelBars = recentEvidenceResults.length
  ? recentEvidenceResults.map(result => Math.min(120, Math.max(18, Math.round((result.durationMs ?? avgTraceDuration) / Math.max(avgTraceDuration, 1) * 72))))
  : [32, 48, 56, 64, 72, 80]
const modelLine = recentEvidenceResults.length
  ? recentEvidenceResults.map(result => Math.max(1, Math.min(8, (result.confidence ?? 0.6) * 8)))
  : [4.2, 4.8, 5.1, 5.4, 5.8, 6.1]
const modelTicks = ['t-5', 't-4', 't-3', 't-2', 't-1', 'now']

/* ---------- 右 4：学习路径分布 ---------- */
const regions = learningPhases.map(phase => {
  const topics = phase.topics ?? []
  const avg = topics.length ? Math.round(topics.reduce((sum, topic) => sum + (topic.mastery ?? 0), 0) / topics.length * 100) : 0
  return { name: phase.name, schools: `${topics.length} 主题`, rate: `${avg}%` }
})
const regionDots = Array.from({ length: 36 }, (_, i) => {
  const seed = (i + 7) * 2654435761 % 1000
  return {
    x: 8 + (seed % 84),
    y: 10 + ((seed * 13) % 76),
    r: 1 + ((seed * 7) % 10) / 6,
    a: 0.25 + ((seed * 3) % 50) / 100,
    d: ((seed * 11) % 40) / 10,
  }
})

/* ---------- 粒子星尘 ---------- */
const starCanvas = ref<HTMLCanvasElement | null>(null)
let starRaf = 0
let starObserver: ResizeObserver | null = null

function startStars() {
  const canvas = starCanvas.value
  if (!canvas || reducedMotion) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const fit = () => {
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
  }
  fit()
  starObserver = new ResizeObserver(fit)
  starObserver.observe(canvas)

  const dots = Array.from({ length: 64 }, () => ({
    x: Math.random(), y: Math.random(),
    r: 0.4 + Math.random() * 1.3,
    vx: (Math.random() - 0.5) * 0.00016,
    vy: (Math.random() - 0.5) * 0.0001,
    a: 0.12 + Math.random() * 0.4,
    tw: 1 + Math.random() * 4,
  }))
  interface Comet { x: number; y: number; vx: number; vy: number; life: number }
  let comet: Comet | null = null
  let nextComet = performance.now() + 2600

  const draw = (t: number) => {
    const { width: w, height: h } = canvas
    ctx.clearRect(0, 0, w, h)
    for (const d of dots) {
      d.x = (d.x + d.vx + 1) % 1
      d.y = (d.y + d.vy + 1) % 1
      const alpha = d.a * (0.6 + 0.4 * Math.sin(t / 1000 * d.tw))
      ctx.beginPath()
      ctx.arc(d.x * w, d.y * h, d.r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(140, 200, 255, ${alpha.toFixed(3)})`
      ctx.fill()
    }
    if (!comet && t > nextComet) {
      const fromLeft = Math.random() > 0.5
      comet = {
        x: fromLeft ? -0.05 : 1.05,
        y: 0.08 + Math.random() * 0.5,
        vx: (fromLeft ? 1 : -1) * (0.0045 + Math.random() * 0.003),
        vy: 0.0011 + Math.random() * 0.0012,
        life: 1,
      }
      nextComet = t + 3800 + Math.random() * 4200
    }
    if (comet) {
      comet.x += comet.vx
      comet.y += comet.vy
      comet.life -= 0.006
      const cx = comet.x * w
      const cy = comet.y * h
      const tail = 90 * (comet.vx > 0 ? -1 : 1)
      const grad = ctx.createLinearGradient(cx, cy, cx + tail, cy - 26)
      grad.addColorStop(0, `rgba(120, 210, 255, ${(0.85 * comet.life).toFixed(3)})`)
      grad.addColorStop(1, 'rgba(120, 210, 255, 0)')
      ctx.strokeStyle = grad
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + tail, cy - 26)
      ctx.stroke()
      if (comet.life <= 0 || comet.x < -0.1 || comet.x > 1.1) comet = null
    }
    starRaf = requestAnimationFrame(draw)
  }
  starRaf = requestAnimationFrame(draw)
}

/* ---------- 流程链 ---------- */
const pipeline = [
  { name: '数据接入', icon: Database },
  { name: '智能协同', icon: Bot },
  { name: '监控预警', icon: ShieldAlert },
  { name: '学情诊断', icon: BrainCircuit },
  { name: '资源调度', icon: Library },
  { name: '画像更新', icon: Users },
  { name: '持续优化', icon: TrendingUp },
]

onMounted(() => {
  clockTimer = window.setInterval(() => { now.value = new Date() }, 1000)
  startStars()
  if (!reducedMotion) {
    bootTimer = window.setInterval(() => {
      bootPct.value = Math.min(100, bootPct.value + 3 + Math.random() * 6)
      if (bootPct.value >= 100 && bootTimer) {
        window.clearInterval(bootTimer)
        bootTimer = null
        window.setTimeout(() => { booting.value = false }, 260)
      }
    }, 34)
  }
})

onBeforeUnmount(() => {
  if (clockTimer) window.clearInterval(clockTimer)
  if (bootTimer) window.clearInterval(bootTimer)
  if (starRaf) cancelAnimationFrame(starRaf)
  starObserver?.disconnect()
})
</script>

<template>
  <div ref="rootRef" class="big-screen" :class="{ live: !booting }">
    <canvas ref="starCanvas" class="star-canvas" aria-hidden="true" />

    <!-- 顶部 -->
    <header class="bs-head">
      <div class="head-side-info">
        <ShieldCheck :size="14" stroke-width="1.8" />
        系统运行时间&ensp;<b>{{ uptimeText }}</b>
      </div>
      <div class="head-title">
        <i class="title-wing left" aria-hidden="true" />
        <div>
          <h1>多智能体教育管理监控中心</h1>
          <p>平台监控 · 智能调度 · 学情总览 · 风险预警</p>
        </div>
        <i class="title-wing right" aria-hidden="true" />
      </div>
      <div class="head-side-info right">
        <b>{{ timeText }}</b>&ensp;{{ dateText }}&ensp;{{ weekText }}
        <button class="fs-btn" type="button" title="全屏" @click="toggleFullscreen">
          <Maximize :size="13" stroke-width="2" />
        </button>
      </div>
    </header>

    <!-- 主体三栏 -->
    <section class="bs-main">
      <!-- 左列 -->
      <div class="bs-col">
        <article class="bs-card" :style="{ '--d': '0.2s' }">
          <h3 class="card-title">平台运行监控</h3>
          <div class="gauge-grid">
            <div v-for="g in gauges" :key="g.label" class="gauge" :style="{ '--tone': g.tone, '--pct': `${g.pct}%` }">
              <i class="gauge-ring"><b>{{ g.value }}<small>{{ g.sub }}</small></b></i>
              <span>{{ g.label }}</span>
              <small>{{ g.note }}</small>
            </div>
          </div>
        </article>

        <article class="bs-card" :style="{ '--d': '0.7s' }">
          <div class="card-head-row">
            <h3 class="card-title">任务流转趋势</h3>
            <div class="tab-row">
              <button
                v-for="(tab, i) in trendTabs" :key="tab" type="button"
                :class="{ active: trendTab === i }" @click="trendTab = i"
              >{{ tab }}</button>
            </div>
          </div>
          <div class="chart-legend">
            <span><i class="sq blue" />协同记录</span>
            <span><i class="sq gold" />链路覆盖（%）</span>
          </div>
          <div class="dual-chart">
            <div class="y-axis left"><span>{{ trendMax }}</span><span>{{ Math.round(trendMax / 2) }}</span><span>0</span></div>
            <svg viewBox="0 0 300 100" preserveAspectRatio="none">
              <line v-for="g in 3" :key="g" x1="0" :y1="g * 25" x2="300" :y2="g * 25" class="grid-line" />
              <path :d="seriesPath(trendData.total, trendMax, 300, 88, true)" class="area-blue" />
              <path :d="seriesPath(trendData.total, trendMax, 300, 88)" class="line-blue" />
              <path :d="ratePath(trendData.rate)" class="line-gold" />
            </svg>
            <div class="y-axis right"><span>110%</span><span>85%</span><span>60%</span></div>
          </div>
          <div class="x-ticks">
            <span v-for="t in trendData.ticks" :key="t">{{ t }}</span>
          </div>
        </article>

        <article class="bs-card" :style="{ '--d': '1.2s' }">
          <h3 class="card-title">风险预警</h3>
          <div class="mini-table risk-table">
            <div class="tr th">
              <span>风险等级</span><span>风险类型</span><span>影响范围</span><span>触发时间</span><span>处理状态</span>
            </div>
            <div v-for="risk in risks" :key="risk.type" class="tr">
              <span><b class="lv" :class="risk.tone">{{ risk.level }}</b></span>
              <span class="ellip">{{ risk.type }}</span>
              <span>{{ risk.scope }}</span>
              <span class="mono">{{ risk.time }}</span>
              <span><em class="st" :class="risk.stone">{{ risk.status }}</em></span>
            </div>
          </div>
          <p class="card-foot">来自评估报告弱项 <b class="warn-c">{{ projectMetrics.weaknessCount }}</b> 个，证据链记录 <b class="ok-c">{{ projectMetrics.traces }}</b> 条</p>
        </article>

        <article class="bs-card" :style="{ '--d': '1.7s' }">
          <div class="card-head-row">
            <h3 class="card-title">节点运行状态</h3>
            <div class="tab-row">
              <button
                v-for="(tab, i) in nodeTabs" :key="tab" type="button"
                :class="{ active: nodeTab === i }" @click="nodeTab = i"
              >{{ tab }}</button>
            </div>
          </div>
          <div class="mini-table node-table">
            <div class="tr th">
              <span>节点名称</span><span>状态</span><span>CPU</span><span>内存</span><span>负载</span><span>运行时长</span>
            </div>
            <div v-for="node in nodeRows" :key="node.name" class="tr">
              <span class="mono">{{ node.name }}</span>
              <span><em class="st" :class="node.tone === 'ok' ? 'done' : 'wait'">{{ node.status }}</em></span>
              <span class="mono">{{ node.cpu }}</span>
              <span class="mono">{{ node.mem }}</span>
              <span class="mono">{{ node.load }}</span>
              <span class="mono">{{ node.up }}</span>
            </div>
          </div>
          <p class="card-foot">真实资产：智能体 <b class="ok-c">{{ projectMetrics.agentTotal }}</b> · 模块 <b class="warn-c">{{ projectMetrics.moduleTotal }}</b> · 资源 <b class="dg-c">{{ projectMetrics.resources }}</b></p>
        </article>
      </div>

      <!-- 中列 -->
      <div class="bs-col center-col">
        <div class="center-kpis">
          <article
            v-for="(kpi, i) in centerKpis" :key="kpi.label"
            class="bs-card kpi-chip"
            :style="{ '--d': `${0.1 + i * 0.35}s`, '--tone': kpi.tone }"
          >
            <span>{{ kpi.label }}</span>
            <strong>{{ kpi.anim.value }}</strong>
          </article>
        </div>

        <article class="bs-card hub-card" :style="{ '--d': '0s' }">
          <div class="hub-visual" aria-label="智能协同中枢">
            <span class="hub-glow g1" aria-hidden="true" />
            <span class="hub-glow g2" aria-hidden="true" />
            <span class="hub-particle-field" aria-hidden="true" />
            <span class="hub-energy-line left top" aria-hidden="true" />
            <span class="hub-energy-line right top" aria-hidden="true" />
            <span class="hub-energy-line left bottom" aria-hidden="true" />
            <span class="hub-energy-line right bottom" aria-hidden="true" />
            <span class="hub-scan-light" aria-hidden="true" />
            <img src="/manager.png" alt="智能协同中枢" class="hub-image" />
          </div>

          <div class="hub-core">
            <span class="ring r1" /><span class="ring r2" />
            <strong>智能协同中枢</strong>
            <small>实时决策 · 全局协调 · 智能调度</small>
          </div>

          <div class="hub-status">
            <h4>中枢运行状态</h4>
            <div v-for="s in hubStatus" :key="s.label">
              <i /><span>{{ s.label }}</span><b>{{ s.value }}</b>
            </div>
          </div>
        </article>

        <div class="asset-row">
          <article
            v-for="(asset, i) in assets" :key="asset.name"
            class="bs-card asset-card" :style="{ '--d': `${0.5 + i * 0.35}s`, '--tone': asset.tone }"
          >
            <header>
              <i class="asset-orb"><component :is="asset.icon" :size="18" stroke-width="1.6" /></i>
              <strong>{{ asset.name }}</strong>
            </header>
            <div class="asset-rows">
              <div v-for="[k, v] in asset.rows" :key="k">
                <span>{{ k }}</span><b>{{ v }}</b>
              </div>
            </div>
            <button type="button" class="asset-more" @click="activeDetail = i">查看更多 ›</button>
          </article>
        </div>
      </div>

      <!-- 右列 -->
      <div class="bs-col">
        <article class="bs-card" :style="{ '--d': '0.4s' }">
          <h3 class="card-title">学生画像概览</h3>
          <div class="student-row">
            <div class="student-total">
              <span>画像指标数</span>
              <strong>{{ studentTotal }}<i>{{ studentTotalUnit }}</i></strong>
            </div>
            <div class="student-rates">
              <div v-for="r in studentRates" :key="r.label">
                <b>{{ r.value }}</b><span>{{ r.label }}</span>
              </div>
            </div>
          </div>
        </article>

        <article class="bs-card" :style="{ '--d': '0.9s' }">
          <div class="card-head-row">
            <h3 class="card-title">知识点掌握分析</h3>
            <div class="tab-row">
              <button
                v-for="(tab, i) in masteryTabs" :key="tab" type="button"
                :class="{ active: masteryTab === i }" @click="masteryTab = i"
              >{{ tab }}</button>
            </div>
          </div>
          <div class="chart-legend">
            <span><i class="sq blue" />路径掌握</span>
            <span><i class="sq gold" />画像能力</span>
          </div>
          <div class="mastery-row">
            <div class="bar-chart">
              <div v-for="bar in masteryBars" :key="bar.name" class="bar-col" :style="{ '--tone': bar.tone }">
                <i :style="{ height: `${bar.pct}%` }" />
                <span>{{ bar.name }}</span>
              </div>
            </div>
            <svg viewBox="0 0 116 116" class="mini-radar" aria-label="学科对比雷达">
              <polygon v-for="grid in radarGrids" :key="grid" :points="grid" class="radar-grid" />
              <polygon :points="radarPoly" class="radar-value" />
              <text
                v-for="(dim, i) in radarDims" :key="dim"
                :x="radarLabelPos(i).x" :y="radarLabelPos(i).y" text-anchor="middle"
              >{{ dim }}</text>
            </svg>
          </div>
        </article>

        <article class="bs-card" :style="{ '--d': '1.4s' }">
          <div class="card-head-row">
            <h3 class="card-title">证据链调用统计</h3>
            <span class="pill-note">本地 traces</span>
          </div>
          <div class="model-stats">
            <div v-for="m in modelStats" :key="m.label">
              <span>{{ m.label }}</span>
              <strong>{{ m.value }}</strong>
              <em :class="{ good: m.good }">{{ m.delta }}</em>
            </div>
          </div>
          <div class="combo-chart">
            <svg viewBox="0 0 300 96" preserveAspectRatio="none">
              <line v-for="g in 3" :key="g" x1="0" :y1="g * 24" x2="300" :y2="g * 24" class="grid-line" />
              <rect
                v-for="(bar, i) in modelBars" :key="i"
                :x="6 + i * 25" :y="88 - (bar / 120) * 78"
                width="12" :height="(bar / 120) * 78" rx="1.5" class="combo-bar"
              />
              <path :d="seriesPath(modelLine, 8, 300, 88)" class="line-gold" />
            </svg>
          </div>
          <div class="x-ticks wide">
            <span v-for="t in modelTicks" :key="t">{{ t }}</span>
          </div>
        </article>

        <article class="bs-card" :style="{ '--d': '1.9s' }">
          <h3 class="card-title">学习路径分布</h3>
          <div class="region-row">
            <svg viewBox="0 0 100 96" class="region-dots" aria-hidden="true">
              <circle
                v-for="(dot, i) in regionDots" :key="i"
                :cx="dot.x" :cy="dot.y" :r="dot.r"
                class="region-dot" :style="{ '--a': dot.a, '--dd': `${dot.d}s` }"
              />
            </svg>
            <div class="mini-table region-table">
              <div class="tr th"><span>阶段</span><span>主题数</span><span>掌握度</span></div>
              <div v-for="region in regions" :key="region.name" class="tr">
                <span>{{ region.name }}</span>
                <span class="mono">{{ region.schools }}</span>
                <span class="mono ok-c">{{ region.rate }}</span>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>

    <!-- 流程链 -->
    <footer class="pipeline-row">
      <template v-for="(step, i) in pipeline" :key="step.name">
        <span class="pipe-step">
          <i class="pipe-icon"><component :is="step.icon" :size="15" stroke-width="1.7" /></i>
          <b>{{ step.name }}</b>
        </span>
        <i v-if="i < pipeline.length - 1" class="pipe-arrow" aria-hidden="true" />
      </template>
    </footer>

    <!-- 开机启动序列 -->
    <Transition name="boot">
      <div v-if="booting" class="boot-overlay" aria-hidden="true">
        <div class="boot-box">
          <strong>智学星枢 · 多智能体监控中心</strong>
          <small>SYSTEM INITIALIZING</small>
          <div class="boot-bar"><i :style="{ width: `${bootPct}%` }" /></div>
          <em>{{ Math.round(bootPct) }}%</em>
        </div>
        <i class="boot-scan" />
      </div>
    </Transition>

    <!-- 详情弹窗 -->
    <Transition name="modal-fade">
      <div v-if="activeDetail !== null" class="detail-modal-mask" @click.self="activeDetail = null">
        <div class="detail-modal" :style="{ '--tone': detailData[activeDetail].tone }">
          <i class="modal-corner tl" /><i class="modal-corner tr" /><i class="modal-corner bl" /><i class="modal-corner br" />

          <header class="modal-head">
            <div class="modal-title-wrap">
              <div class="modal-icon">
                <component :is="assets[activeDetail].icon" :size="22" />
              </div>
              <div>
                <h2>{{ detailData[activeDetail].name }}</h2>
                <p>{{ detailData[activeDetail].desc }}</p>
              </div>
            </div>
            <button class="modal-close" type="button" @click="activeDetail = null">
              <X :size="16" />
            </button>
          </header>

          <div class="modal-body">
            <div class="detail-table-wrap">
              <table class="detail-table">
                <thead>
                  <tr>
                    <th style="width: 40px">序号</th>
                    <th>项目名称</th>
                    <th style="width: 120px">调用/数量</th>
                    <th style="width: 180px">使用率/完整度</th>
                    <th style="width: 100px">状态</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, idx) in detailData[activeDetail].stats" :key="item.label">
                    <td class="mono">{{ String(idx + 1).padStart(2, '0') }}</td>
                    <td class="item-name">{{ item.label }}</td>
                    <td class="mono strong">{{ item.calls }}</td>
                    <td>
                      <div class="rate-bar">
                        <i :style="{ width: `${item.rate}%` }" />
                        <span>{{ item.rate }}%</span>
                      </div>
                    </td>
                    <td><span class="modal-status">{{ item.status }}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="modal-summary">
              <div class="summary-stat">
                <span>总项目数</span>
                <strong>{{ detailData[activeDetail].stats.length }}</strong>
              </div>
              <div class="summary-stat">
                <span>平均使用率</span>
                <strong>{{ Math.round(detailData[activeDetail].stats.reduce((s, x) => s + x.rate, 0) / detailData[activeDetail].stats.length) }}%</strong>
              </div>
              <div class="summary-stat">
                <span>运行状态</span>
                <strong class="ok">正常</strong>
              </div>
            </div>
          </div>

          <footer class="modal-foot">
            <button class="modal-btn secondary" type="button" @click="activeDetail = null">关闭</button>
            <button class="modal-btn primary" type="button">进入管理</button>
          </footer>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.big-screen {
  --bs-blue: #3e9eff;
  --bs-cyan: #35c7ff;
  --bs-violet: #8f7bff;
  --bs-ok: #23d18b;
  --bs-warn: #ffb648;
  --bs-danger: #ff5f56;
  --bs-magenta: #f0586e;
  --bs-green: #06d6a0;
  --bs-ink-1: #eef6ff;
  --bs-ink-2: #a8c4e8;
  --bs-ink-3: #6684ad;
  --bs-line: rgba(62, 158, 255, 0.24);
  position: relative;
  display: grid;
  gap: 11px;
  padding: 14px;
  margin: -12px;
  border-radius: 10px;
  color: var(--bs-ink-1);
  background:
    radial-gradient(1000px 480px at 50% -12%, rgba(46, 123, 255, 0.16), transparent 60%),
    radial-gradient(720px 420px at 8% 108%, rgba(35, 209, 139, 0.1), transparent 55%),
    radial-gradient(720px 420px at 92% 108%, rgba(240, 88, 110, 0.1), transparent 55%),
    radial-gradient(460px 300px at 78% 18%, rgba(255, 182, 72, 0.08), transparent 62%),
    linear-gradient(180deg, #050d21 0%, #071431 48%, #081940 100%);
}

.big-screen::before {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background-image:
    linear-gradient(rgba(62, 158, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(62, 158, 255, 0.04) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(circle at 50% 34%, #000 0, transparent 78%);
  content: '';
}

.star-canvas {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  pointer-events: none;
}

.big-screen > *:not(.star-canvas):not(.boot-overlay) {
  position: relative;
  z-index: 1;
}

/* 全屏极淡扫描光带 */
.big-screen::after {
  position: absolute;
  right: 0;
  left: 0;
  z-index: 3;
  height: 120px;
  background: linear-gradient(180deg, transparent, rgba(90, 190, 255, 0.045), transparent);
  content: '';
  pointer-events: none;
  animation: screen-scan 8s linear infinite;
}

@keyframes screen-scan {
  0% { top: -140px; }
  100% { top: 110%; }
}

/* ========== 呼吸卡片 + 级联点亮 ========== */
.bs-card {
  --tone: var(--bs-cyan);
  position: relative;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 72%);
  border-radius: 8px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--tone), transparent 90%), transparent 32%),
    radial-gradient(220px 120px at 12% 0%, color-mix(in srgb, var(--tone), transparent 92%), transparent 70%),
    rgba(8, 20, 47, 0.72);
  animation: card-breathe 4.6s ease-in-out var(--d, 0s) infinite;
}

.big-screen.live .bs-card {
  animation:
    card-ignite 0.6s cubic-bezier(0.2, 0.9, 0.3, 1) calc(var(--d, 0s) * 0.22) both,
    card-breathe 4.6s ease-in-out calc(0.9s + var(--d, 0s)) infinite;
}

@keyframes card-breathe {
  0%, 100% {
    border-color: var(--bs-line);
    box-shadow: 0 0 0 rgba(62, 158, 255, 0);
  }
  50% {
    border-color: rgba(62, 158, 255, 0.22);
    box-shadow: 0 0 8px rgba(62, 158, 255, 0.06), inset 0 0 4px rgba(62, 158, 255, 0.03);
  }
}

@keyframes card-ignite {
  0% { opacity: 0; clip-path: inset(0 0 100% 0); }
  55% { opacity: 1; clip-path: inset(0 0 0 0); }
  72% {
    border-color: rgba(120, 200, 255, 0.85);
    box-shadow: 0 0 34px rgba(62, 158, 255, 0.4);
  }
  100% { opacity: 1; clip-path: inset(0 0 0 0); }
}

.bs-card::before {
  position: absolute;
  inset: -1px;
  pointer-events: none;
  background:
    linear-gradient(var(--bs-cyan), var(--bs-cyan)) left 0 top 0 / 14px 2px,
    linear-gradient(var(--tone), var(--tone)) left 0 top 0 / 2px 14px,
    linear-gradient(var(--tone), var(--tone)) right 0 top 0 / 14px 2px,
    linear-gradient(var(--tone), var(--tone)) right 0 top 0 / 2px 14px,
    linear-gradient(var(--tone), var(--tone)) left 0 bottom 0 / 14px 2px,
    linear-gradient(var(--tone), var(--tone)) left 0 bottom 0 / 2px 14px,
    linear-gradient(var(--tone), var(--tone)) right 0 bottom 0 / 14px 2px,
    linear-gradient(var(--tone), var(--tone)) right 0 bottom 0 / 2px 14px;
  background-repeat: no-repeat;
  content: '';
  opacity: 0.5;
}

/* ========== 顶部 ========== */
.bs-head {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 14px;
  align-items: center;
  padding: 2px 2px 0;
}

.head-side-info {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  color: var(--bs-ink-2);
  font-size: 11.5px;
}

.head-side-info b {
  color: var(--bs-ink-1);
  font-family: var(--font-mono);
  font-weight: 800;
}

.head-side-info.right {
  justify-self: end;
}

.head-side-info svg {
  color: var(--bs-cyan);
}

.fs-btn {
  display: grid;
  place-content: center;
  width: 24px;
  height: 24px;
  margin-left: 6px;
  border: 1px solid var(--bs-line);
  border-radius: 5px;
  background: rgba(8, 20, 47, 0.7);
  color: var(--bs-ink-2);
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.2s ease;
}

.fs-btn:hover {
  border-color: var(--bs-cyan);
  color: #fff;
}

.head-title {
  display: flex;
  gap: 16px;
  align-items: center;
  text-align: center;
}

.title-wing {
  width: clamp(40px, 6vw, 110px);
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--bs-blue));
  clip-path: polygon(0 100%, 100% 0, 100% 100%);
}

.title-wing.right {
  transform: scaleX(-1);
}

.head-title h1 {
  margin: 0;
  font-size: clamp(20px, 1.9vw, 28px);
  font-weight: 900;
  letter-spacing: 0.06em;
  color: #fff;
  text-shadow: 0 0 22px rgba(62, 158, 255, 0.75), 0 0 44px rgba(53, 199, 255, 0.3);
}

.head-title p {
  margin: 3px 0 0;
  color: #7fa8d9;
  font-size: 10.5px;
  letter-spacing: 0.34em;
}

/* ========== 三栏 ========== */
.bs-main {
  display: grid;
  grid-template-columns: minmax(320px, 0.92fr) minmax(0, 1.6fr) minmax(320px, 0.92fr);
  gap: 11px;
  align-items: stretch;
}

.bs-col {
  display: grid;
  gap: 11px;
  align-content: stretch;
}

.center-col {
  grid-template-rows: auto 1fr auto;
}

.card-title {
  margin: 0 0 9px;
  color: #fff;
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.card-title::before {
  display: inline-block;
  width: 3px;
  height: 11px;
  margin-right: 7px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--tone), var(--bs-blue));
  box-shadow: 0 0 8px color-mix(in srgb, var(--tone), transparent 35%);
  vertical-align: -1px;
  content: '';
}

.card-head-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  align-items: center;
  justify-content: space-between;
}

.card-head-row .card-title {
  white-space: nowrap;
}

.tab-row {
  display: inline-flex;
  gap: 3px;
  margin-bottom: 8px;
  padding: 2px;
  border: 1px solid rgba(62, 158, 255, 0.2);
  border-radius: 6px;
  background: rgba(8, 20, 47, 0.6);
}

.tab-row button {
  padding: 3px 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--bs-ink-3);
  font-size: 9.5px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.2s ease, background 0.2s ease;
}

.tab-row button.active {
  background: linear-gradient(160deg, rgba(53, 199, 255, 0.3), rgba(62, 158, 255, 0.24));
  color: #fff;
}

.pill-note {
  padding: 3px 9px;
  border: 1px solid rgba(62, 158, 255, 0.28);
  border-radius: 5px;
  color: var(--bs-ink-2);
  font-size: 10px;
}

/* 环形仪表：呼吸辉光 */
.gauge-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.gauge {
  display: grid;
  gap: 4px;
  justify-items: center;
  text-align: center;
}

.gauge-ring {
  position: relative;
  display: grid;
  place-content: center;
  width: 62px;
  height: 62px;
  border-radius: 50%;
  background:
    radial-gradient(closest-side, #081430 74%, transparent 75% 100%),
    conic-gradient(var(--tone) var(--pct), rgba(62, 158, 255, 0.12) 0);
  animation: gauge-breathe 3.4s ease-in-out infinite;
}

@keyframes gauge-breathe {
  0%, 100% { filter: drop-shadow(0 0 2px transparent); }
  50% { filter: drop-shadow(0 0 4px color-mix(in srgb, var(--tone), transparent 70%)); }
}

.gauge-ring b {
  color: #fff;
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 800;
}

.gauge-ring small {
  font-size: 9px;
  opacity: 0.7;
}

.gauge > span {
  color: var(--bs-ink-2);
  font-size: 9.5px;
  white-space: nowrap;
}

.gauge > small {
  min-height: 11px;
  color: var(--bs-ink-3);
  font-size: 8.5px;
}

/* 图表通用 */
.chart-legend {
  display: flex;
  gap: 12px;
  margin-bottom: 5px;
  color: var(--bs-ink-3);
  font-size: 9.5px;
}

.chart-legend .sq {
  display: inline-block;
  width: 9px;
  height: 5px;
  margin-right: 4px;
  border-radius: 1px;
  vertical-align: 1px;
}

.chart-legend .blue { background: var(--bs-blue); }
.chart-legend .gold { background: var(--bs-warn); }

.dual-chart {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 5px;
  align-items: stretch;
}

.dual-chart svg {
  width: 100%;
  height: 84px;
}

.y-axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: var(--bs-ink-3);
  font-family: var(--font-mono);
  font-size: 8px;
  text-align: right;
}

.grid-line {
  stroke: rgba(62, 158, 255, 0.12);
  stroke-width: 1;
}

.area-blue { fill: rgba(62, 158, 255, 0.22); }

.line-blue {
  fill: none;
  stroke: var(--bs-blue);
  stroke-width: 1.6;
  filter: drop-shadow(0 0 5px rgba(62, 158, 255, 0.5));
}

.line-gold {
  fill: none;
  stroke: var(--bs-warn);
  stroke-width: 1.6;
  stroke-linejoin: round;
}

.big-screen.live .line-blue,
.big-screen.live .line-gold {
  stroke-dasharray: 420;
  stroke-dashoffset: 420;
  animation: line-draw 1.5s cubic-bezier(0.3, 0, 0.3, 1) 1s forwards;
}

@keyframes line-draw {
  to { stroke-dashoffset: 0; }
}

.x-ticks {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  padding: 0 14px;
  color: var(--bs-ink-3);
  font-family: var(--font-mono);
  font-size: 8.5px;
}

.x-ticks.wide { padding: 0 4px; }

/* 表格 */
.mini-table {
  display: grid;
  gap: 4px;
}

.mini-table .tr {
  display: grid;
  gap: 6px;
  align-items: center;
  font-size: 10px;
  color: var(--bs-ink-2);
}

.risk-table .tr { grid-template-columns: 52px 1fr 62px 54px 52px; }
.node-table .tr { grid-template-columns: 62px 40px 40px 40px 40px 1fr; }
.region-table .tr { grid-template-columns: 1fr auto 52px; }

.mini-table .th {
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(62, 158, 255, 0.16);
  color: var(--bs-ink-3);
  font-size: 9px;
}

.mini-table .mono {
  font-family: var(--font-mono);
}

.mini-table .ellip {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lv {
  display: inline-grid;
  place-content: center;
  min-width: 20px;
  height: 16px;
  border-radius: 3px;
  font-size: 9.5px;
  font-weight: 800;
}

.lv.danger { background: rgba(255, 95, 86, 0.18); color: var(--bs-danger); }
.lv.warn { background: rgba(255, 182, 72, 0.16); color: var(--bs-warn); }
.lv.info { background: rgba(62, 158, 255, 0.16); color: var(--bs-cyan); }

.st {
  font-size: 9.5px;
  font-style: normal;
  font-weight: 700;
}

.st.run { color: var(--bs-cyan); }
.st.wait { color: var(--bs-warn); }
.st.done { color: var(--bs-ok); }
.st.watch { color: var(--bs-ink-3); }

.card-foot {
  margin: 8px 0 0;
  color: var(--bs-ink-3);
  font-size: 10px;
}

.ok-c { color: var(--bs-ok); }
.warn-c { color: var(--bs-warn); }
.dg-c { color: var(--bs-danger); }

/* ========== 中列 ========== */
.center-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 11px;
}

.kpi-chip {
  padding: 9px 13px;
  text-align: center;
}

.kpi-chip span {
  display: block;
  color: var(--bs-ink-3);
  font-size: 9.5px;
  white-space: nowrap;
}

.kpi-chip strong {
  display: block;
  margin-top: 3px;
  color: color-mix(in srgb, var(--tone), #fff 34%);
  font-family: var(--font-mono);
  font-size: 21px;
  font-weight: 800;
  line-height: 1;
  text-shadow: 0 0 16px color-mix(in srgb, var(--tone), transparent 34%);
}

.kpi-chip.danger strong {
  color: var(--bs-danger);
  text-shadow: 0 0 16px rgba(255, 95, 86, 0.5);
}

.kpi-chip.danger {
  animation:
    card-breathe 4.6s ease-in-out var(--d, 0s) infinite,
    alarm-pulse 2s ease-in-out infinite;
}

@keyframes alarm-pulse {
  0%, 100% { box-shadow: 0 0 0 rgba(255, 95, 86, 0); }
  50% { box-shadow: 0 0 18px rgba(255, 95, 86, 0.28); }
}

/* 中枢 */
.hub-card {
  --tone: var(--bs-blue);
  position: relative;
  min-height: 460px;
  overflow: hidden;
  background:
    radial-gradient(720px 380px at 50% 42%, rgba(46, 123, 255, 0.2), transparent 72%),
    radial-gradient(300px 160px at 24% 60%, rgba(35, 209, 139, 0.12), transparent 70%),
    radial-gradient(300px 160px at 76% 42%, rgba(255, 182, 72, 0.11), transparent 70%),
    rgba(8, 20, 47, 0.72);
}

.hub-card::after {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(5, 13, 33, 0.36) 0%, transparent 14%, transparent 78%, rgba(5, 13, 33, 0.58) 100%),
    radial-gradient(ellipse at center, transparent 0 62%, rgba(5, 13, 33, 0.42) 88%, rgba(5, 13, 33, 0.74) 100%);
  content: '';
}

.hub-card::before {
  position: absolute;
  inset: 8px 10px 70px;
  z-index: 2;
  pointer-events: none;
  border-radius: 10px;
  background:
    linear-gradient(90deg, transparent 0 10%, rgba(53, 199, 255, 0.32) 18%, transparent 28% 72%, rgba(53, 199, 255, 0.32) 82%, transparent 90%),
    linear-gradient(180deg, rgba(53, 199, 255, 0.18), transparent 16%, transparent 84%, rgba(53, 199, 255, 0.14));
  mask-image: linear-gradient(#000, #000), linear-gradient(#000, #000);
  opacity: 0.32;
  content: '';
}

.hub-visual {
  position: absolute;
  inset: 6px 0 62px;
  z-index: 1;
  display: grid;
  place-items: center;
  overflow: visible;
  border-radius: inherit;
  background:
    radial-gradient(500px 240px at 50% 52%, rgba(53, 199, 255, 0.16), transparent 72%),
    radial-gradient(320px 180px at 24% 38%, rgba(35, 209, 139, 0.07), transparent 74%),
    radial-gradient(300px 170px at 76% 44%, rgba(255, 182, 72, 0.07), transparent 74%);
  box-shadow:
    inset 0 0 24px rgba(53, 199, 255, 0.04),
    0 0 34px rgba(46, 123, 255, 0.12);
}

.hub-visual::before,
.hub-visual::after {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: '';
}

.hub-visual::before {
  z-index: 3;
  background:
    linear-gradient(90deg, transparent, rgba(116, 220, 255, 0.1), transparent),
    radial-gradient(circle at 30% 42%, rgba(53, 199, 255, 0.16), transparent 18%),
    radial-gradient(circle at 70% 48%, rgba(143, 123, 255, 0.12), transparent 18%);
  mix-blend-mode: screen;
  transform: translateX(-120%);
  animation: hub-light-sweep 5.8s ease-in-out infinite;
}

.hub-visual::after {
  z-index: 2;
  background:
    radial-gradient(circle at 18% 22%, rgba(160, 235, 255, 0.55) 0 1px, transparent 2px),
    radial-gradient(circle at 38% 78%, rgba(94, 203, 255, 0.5) 0 1px, transparent 2px),
    radial-gradient(circle at 62% 18%, rgba(209, 245, 255, 0.44) 0 1px, transparent 2px),
    radial-gradient(circle at 82% 70%, rgba(94, 203, 255, 0.5) 0 1px, transparent 2px);
  background-size: 94px 78px, 126px 108px, 112px 92px, 148px 126px;
  opacity: 0.5;
  animation: hub-particles-drift 16s linear infinite;
}

.hub-image {
  position: relative;
  z-index: 1;
  display: block;
  width: min(106%, 830px);
  max-width: none;
  max-height: none;
  object-fit: contain;
  opacity: 0.98;
  transform: translateY(-1%);
  mask-image:
    linear-gradient(180deg, transparent 0%, #000 9%, #000 88%, transparent 100%),
    radial-gradient(ellipse at center, #000 0 82%, rgba(0, 0, 0, 0.82) 92%, transparent 100%);
  -webkit-mask-image:
    linear-gradient(180deg, transparent 0%, #000 9%, #000 88%, transparent 100%),
    radial-gradient(ellipse at center, #000 0 82%, rgba(0, 0, 0, 0.82) 92%, transparent 100%);
  mask-composite: intersect;
  -webkit-mask-composite: source-in;
  filter:
    saturate(1.08)
    contrast(1.05)
    drop-shadow(0 0 22px rgba(53, 199, 255, 0.34))
    drop-shadow(0 0 52px rgba(46, 123, 255, 0.2));
}

.hub-glow {
  position: absolute;
  z-index: 0;
  border-radius: 999px;
  pointer-events: none;
  filter: blur(18px);
  opacity: 0.78;
  animation: hub-glow-breathe 4.8s ease-in-out infinite;
}

.hub-glow.g1 {
  width: 56%;
  height: 30%;
  background: rgba(53, 199, 255, 0.18);
}

.hub-glow.g2 {
  width: 76%;
  height: 14%;
  bottom: 15%;
  background: rgba(46, 123, 255, 0.2);
  animation-delay: -1.8s;
}

.hub-particle-field {
  position: absolute;
  inset: 4%;
  z-index: 2;
  pointer-events: none;
  background-image:
    radial-gradient(circle, rgba(226, 248, 255, 0.86) 0 1px, transparent 1.8px),
    radial-gradient(circle, rgba(53, 199, 255, 0.58) 0 1px, transparent 1.8px),
    radial-gradient(circle, rgba(143, 210, 255, 0.5) 0 1px, transparent 1.8px);
  background-position: 0 0, 32px 46px, 84px 18px;
  background-size: 118px 92px, 154px 136px, 190px 168px;
  opacity: 0.28;
  mix-blend-mode: screen;
  animation: hub-particles-rise 12s linear infinite;
}

.hub-energy-line {
  position: absolute;
  z-index: 2;
  width: 30%;
  height: 2px;
  border-radius: 999px;
  background:
    linear-gradient(90deg, transparent, rgba(53, 199, 255, 0.18) 18%, rgba(171, 239, 255, 0.92) 52%, rgba(53, 199, 255, 0.18) 84%, transparent),
    repeating-linear-gradient(90deg, transparent 0 13px, rgba(214, 250, 255, 0.65) 13px 15px, transparent 15px 28px);
  box-shadow: 0 0 10px rgba(53, 199, 255, 0.46);
  pointer-events: none;
  animation: hub-line-pulse 2.7s ease-in-out infinite;
}

.hub-energy-line.left { left: -1%; transform-origin: right center; }
.hub-energy-line.right { right: -1%; transform-origin: left center; }
.hub-energy-line.top { top: 32%; }
.hub-energy-line.bottom { bottom: 26%; }
.hub-energy-line.left.top { transform: rotate(17deg); }
.hub-energy-line.right.top { transform: rotate(-17deg); }
.hub-energy-line.left.bottom { transform: rotate(-18deg); }
.hub-energy-line.right.bottom { transform: rotate(18deg); }

.hub-scan-light {
  position: absolute;
  inset: 14% 8%;
  z-index: 3;
  pointer-events: none;
  background: linear-gradient(180deg, transparent, rgba(100, 220, 255, 0.12), transparent);
  opacity: 0.42;
  transform: translateY(-120%);
  animation: hub-vertical-scan 7.5s linear infinite;
}

.hub-core {
  display: none;
}

@keyframes hub-light-sweep {
  0%, 48% { transform: translateX(-120%); opacity: 0; }
  58% { opacity: 0.9; }
  72%, 100% { transform: translateX(120%); opacity: 0; }
}

@keyframes hub-particles-drift {
  to { background-position: 120px -80px, -90px -120px, 70px -100px, -120px -90px; }
}

@keyframes hub-particles-rise {
  to { background-position: 0 -184px, 32px -226px, 84px -318px; }
}

@keyframes hub-glow-breathe {
  0%, 100% { transform: scale(0.98); opacity: 0.62; }
  50% { transform: scale(1.05); opacity: 0.9; }
}

@keyframes hub-line-pulse {
  0%, 100% { opacity: 0.46; filter: brightness(0.9); }
  50% { opacity: 0.92; filter: brightness(1.35); }
}

@keyframes hub-vertical-scan {
  0% { transform: translateY(-125%); opacity: 0; }
  18% { opacity: 0.5; }
  46%, 100% { transform: translateY(125%); opacity: 0; }
}

.hub-lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.hub-link {
  stroke: rgba(62, 158, 255, 0.2);
  stroke-width: 0.4;
  fill: none;
}

.hub-flow {
  stroke: rgba(53, 199, 255, 0.85);
  stroke-dasharray: 1.5 6;
  stroke-width: 0.6;
  fill: none;
  animation: hub-dash 1.5s linear infinite;
}

@keyframes hub-dash {
  to { stroke-dashoffset: -7.5; }
}

.pulse-dot {
  fill: #bfe9ff;
  filter: drop-shadow(0 0 3px rgba(120, 210, 255, 0.95));
}

.hub-sweep {
  position: absolute;
  top: 46%;
  left: 50%;
  z-index: 1;
  width: min(76%, 440px);
  aspect-ratio: 1;
  border-radius: 50%;
  background: conic-gradient(from 0deg, transparent 0 76%, rgba(53, 199, 255, 0.14) 88%, rgba(53, 199, 255, 0.02) 92%, transparent 92%);
  transform: translate(-50%, -50%);
  pointer-events: none;
  animation: sweep-spin 6.5s linear infinite;
}

@keyframes sweep-spin {
  to { transform: translate(-50%, -50%) rotate(360deg); }
}

.hub-orbit {
  position: absolute;
  top: 46%;
  left: 50%;
  z-index: 1;
  border: 1px dashed rgba(62, 158, 255, 0.22);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.hub-orbit.o1 {
  width: 42%;
  aspect-ratio: 1;
  animation: orbit-spin 60s linear infinite;
}

.hub-orbit.o2 {
  width: 68%;
  aspect-ratio: 1;
  border-color: rgba(143, 123, 255, 0.18);
  animation: orbit-spin 90s linear infinite reverse;
}

@keyframes orbit-spin {
  to { transform: translate(-50%, -50%) rotate(360deg); }
}

.hub-platform {
  position: absolute;
  left: 50%;
  z-index: 1;
  border-radius: 50%;
  transform: translateX(-50%);
  pointer-events: none;
}

.hub-platform.p1 {
  top: 56%;
  width: 290px;
  height: 72px;
  border: 1px solid rgba(62, 158, 255, 0.35);
  background: radial-gradient(closest-side, rgba(46, 123, 255, 0.22), rgba(46, 123, 255, 0.04) 72%, transparent);
  box-shadow: 0 0 44px rgba(46, 123, 255, 0.3);
  animation: platform-breathe 3.6s ease-in-out infinite;
}

@keyframes platform-breathe {
  0%, 100% { box-shadow: 0 0 12px rgba(46, 123, 255, 0.12); }
  50% { box-shadow: 0 0 20px rgba(46, 123, 255, 0.2); }
}

.hub-platform.p2 {
  top: 62%;
  width: 390px;
  height: 90px;
  border: 1px solid rgba(62, 158, 255, 0.16);
  background: radial-gradient(closest-side, rgba(46, 123, 255, 0.1), transparent 76%);
}

.hub-beam {
  position: absolute;
  top: 14%;
  left: 50%;
  z-index: 1;
  width: 150px;
  height: 44%;
  background: linear-gradient(180deg, transparent, rgba(53, 199, 255, 0.09) 40%, rgba(53, 199, 255, 0.16));
  clip-path: polygon(38% 0, 62% 0, 100% 100%, 0 100%);
  transform: translateX(-50%);
  pointer-events: none;
  animation: beam-breathe 3.4s ease-in-out infinite;
}

@keyframes beam-breathe {
  0%, 100% { opacity: 0.65; }
  50% { opacity: 0.73; }
}

.hub-core {
  position: absolute;
  top: 52%;
  left: 50%;
  z-index: 2;
  display: none;
  gap: 4px;
  justify-items: center;
  width: 260px;
  padding: 22px 18px;
  border: 1px solid rgba(62, 158, 255, 0.55);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(46, 123, 255, 0.25), rgba(8, 20, 47, 0.7) 65%),
    rgba(6, 15, 36, 0.94);
  text-align: center;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 50px rgba(46, 123, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

.hub-core strong {
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 0.08em;
  color: #fff;
  text-shadow: 0 0 20px rgba(53, 199, 255, 1);
}

.hub-core small {
  color: #9cc0f0;
  font-size: 10.5px;
  letter-spacing: 0.12em;
}

.hub-core .ring {
  position: absolute;
  top: 50%;
  left: 50%;
  border: 1px solid rgba(53, 199, 255, 0.4);
  border-radius: 14px;
  transform: translate(-50%, -50%);
  animation: core-ring 3s ease-out infinite;
}

.hub-core .r1 { width: 100%; height: 100%; }
.hub-core .r2 { width: 100%; height: 100%; animation-delay: 1.5s; }

@keyframes core-ring {
  0% { opacity: 0.8; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.35); }
}

.hub-node {
  position: absolute;
  z-index: 2;
  display: grid;
  gap: 2px;
  justify-items: center;
  transform: translate(-50%, -50%);
  text-align: center;
}

.hub-node .hex {
  display: grid;
  place-content: center;
  width: 44px;
  height: 48px;
  background: linear-gradient(180deg, rgba(46, 123, 255, 0.3), rgba(8, 20, 47, 0.9));
  border: 1px solid rgba(53, 199, 255, 0.65);
  color: #d5efff;
  clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
  filter: drop-shadow(0 0 12px rgba(53, 199, 255, 0.45));
  animation: hex-breathe 3.8s ease-in-out infinite;
}

@keyframes hex-breathe {
  0%, 100% { filter: drop-shadow(0 0 4px rgba(53, 199, 255, 0.25)); }
  50% { filter: drop-shadow(0 0 8px rgba(53, 199, 255, 0.35)); }
}

.hub-node span {
  max-width: 118px;
  color: #fff;
  font-size: 10.5px;
  font-weight: 800;
  white-space: nowrap;
  text-shadow: 0 0 10px rgba(46, 123, 255, 0.8);
}

.hub-node small {
  color: var(--bs-cyan);
  font-size: 8.5px;
  opacity: 0.9;
}

/* 中枢运行状态 */
.hub-status {
  position: absolute;
  right: 18px;
  bottom: 13px;
  left: 18px;
  z-index: 3;
  display: grid;
  grid-template-columns: auto repeat(4, minmax(0, 1fr));
  gap: 8px;
  align-items: center;
  padding: 7px 10px;
  border: 1px solid rgba(62, 158, 255, 0.22);
  border-radius: 6px;
  background:
    linear-gradient(90deg, rgba(7, 17, 42, 0.82), rgba(10, 25, 58, 0.58), rgba(7, 17, 42, 0.82));
  box-shadow:
    0 0 18px rgba(46, 123, 255, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
}

.hub-status h4 {
  margin: 0;
  padding-right: 4px;
  color: var(--bs-cyan);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-shadow: 0 0 10px rgba(53, 199, 255, 0.5);
  white-space: nowrap;
}

.hub-status > div {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 6px;
  align-items: center;
  min-width: 0;
  padding-left: 7px;
  border-left: 1px solid rgba(62, 158, 255, 0.12);
  font-size: 9px;
}

.hub-status i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--bs-cyan);
  box-shadow: 0 0 8px var(--bs-cyan);
  animation: dot-blink 1.6s ease-in-out infinite alternate;
}

@keyframes dot-blink {
  from { opacity: 0.5; }
  to { opacity: 1; }
}

.hub-status span {
  overflow: hidden;
  color: var(--bs-ink-3);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hub-status b {
  grid-column: 2;
  color: #fff;
  font-family: var(--font-mono);
  font-size: 10.5px;
  text-shadow: 0 0 8px rgba(53, 199, 255, 0.4);
}

/* 五库 */
.asset-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 11px;
}

.asset-card {
  display: grid;
  gap: 7px;
}

.asset-card > header {
  display: flex;
  gap: 8px;
  align-items: center;
}

.asset-orb {
  display: grid;
  place-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 45%);
  border-radius: 8px;
  background: radial-gradient(circle at 34% 28%, color-mix(in srgb, var(--tone), transparent 62%), rgba(8, 20, 47, 0.8));
  color: #fff;
  filter: drop-shadow(0 0 9px color-mix(in srgb, var(--tone), transparent 45%));
  animation: hex-breathe 4s ease-in-out infinite;
}

.asset-card strong {
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}

.asset-rows {
  display: grid;
  gap: 3px;
}

.asset-rows > div {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
}

.asset-rows span { color: var(--bs-ink-3); }

.asset-rows b {
  color: var(--bs-ink-1);
  font-family: var(--font-mono);
  font-weight: 700;
}

.asset-more {
  padding: 4px 0 0;
  border: 0;
  border-top: 1px solid rgba(62, 158, 255, 0.14);
  background: transparent;
  color: var(--tone, var(--bs-cyan));
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  text-align: center;
  transition: opacity 0.2s ease;
}

.asset-more:hover { opacity: 0.75; }

/* ========== 右列 ========== */
.student-row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  align-items: center;
}

.student-total span {
  display: block;
  color: var(--bs-ink-3);
  font-size: 10px;
}

.student-total strong {
  color: #fff;
  font-family: var(--font-mono);
  font-size: 27px;
  font-weight: 800;
  text-shadow: 0 0 18px rgba(62, 158, 255, 0.55);
}

.student-total strong i {
  margin-left: 3px;
  font-size: 11px;
  font-style: normal;
  opacity: 0.65;
}

.student-rates {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px;
}

.student-rates > div {
  padding: 7px 6px;
  border: 1px solid rgba(62, 158, 255, 0.16);
  border-radius: 6px;
  background: rgba(62, 158, 255, 0.05);
  text-align: center;
}

.student-rates b {
  display: block;
  color: var(--bs-ok);
  font-family: var(--font-mono);
  font-size: 13px;
}

.student-rates span {
  color: var(--bs-ink-3);
  font-size: 9px;
}

/* 掌握分析 */
.mastery-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: end;
}

.bar-chart {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 5px;
  align-items: end;
  height: 96px;
}

.bar-col {
  display: flex;
  flex-direction: column;
  gap: 3px;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
}

.bar-col i {
  flex: none;
  width: 70%;
  border-radius: 2px 2px 0 0;
  background: linear-gradient(180deg, var(--tone, var(--bs-cyan)), color-mix(in srgb, var(--tone, var(--bs-cyan)), transparent 66%));
  box-shadow: 0 0 8px color-mix(in srgb, var(--tone, var(--bs-cyan)), transparent 55%);
  transform-origin: bottom center;
}

.big-screen.live .bar-col i {
  animation: bar-rise 0.9s cubic-bezier(0.2, 0.9, 0.3, 1) 1.1s both;
}

@keyframes bar-rise {
  from { transform: scaleY(0); }
  to { transform: scaleY(1); }
}

.bar-col span {
  color: var(--bs-ink-3);
  font-size: 8.5px;
  white-space: nowrap;
}

.mini-radar {
  width: 108px;
  height: 108px;
}

.radar-grid {
  fill: none;
  stroke: rgba(62, 158, 255, 0.2);
  stroke-width: 1;
}

.radar-value {
  fill: rgba(62, 158, 255, 0.26);
  stroke: var(--bs-cyan);
  stroke-width: 1.5;
  filter: drop-shadow(0 0 7px rgba(53, 199, 255, 0.6));
}

.mini-radar text {
  fill: var(--bs-ink-3);
  font-size: 8px;
}

/* 模型调用统计 */
.model-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-bottom: 8px;
}

.model-stats > div {
  padding: 6px 7px;
  border: 1px solid rgba(62, 158, 255, 0.14);
  border-radius: 6px;
  background: rgba(62, 158, 255, 0.05);
}

.model-stats span {
  display: block;
  color: var(--bs-ink-3);
  font-size: 8.5px;
  white-space: nowrap;
}

.model-stats strong {
  display: block;
  margin: 2px 0;
  color: #fff;
  font-family: var(--font-mono);
  font-size: 13px;
  text-shadow: 0 0 10px rgba(62, 158, 255, 0.4);
}

.model-stats em {
  color: var(--bs-ink-3);
  font-size: 8.5px;
  font-style: normal;
}

.model-stats em.good { color: var(--bs-ok); }

.combo-chart svg {
  width: 100%;
  height: 88px;
}

.combo-bar {
  fill: rgba(53, 199, 255, 0.58);
}

.big-screen.live .combo-bar {
  transform-origin: center bottom;
  animation: bar-rise 0.9s cubic-bezier(0.2, 0.9, 0.3, 1) 1.2s both;
}

/* 区域分布 */
.region-row {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 10px;
  align-items: center;
}

.region-dots {
  width: 96px;
  height: 96px;
}

.region-dot {
  fill: var(--bs-cyan);
  opacity: var(--a, 0.4);
  animation: region-blink 3s ease-in-out var(--dd, 0s) infinite;
}

@keyframes region-blink {
  0%, 100% { opacity: calc(var(--a, 0.4) * 0.5); }
  50% { opacity: var(--a, 0.4); }
}

/* ========== 流程链 ========== */
.pipeline-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 18px;
  border: 1px solid var(--bs-line);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(62, 158, 255, 0.07), transparent 30%),
    rgba(8, 20, 47, 0.72);
  animation: card-breathe 4.6s ease-in-out 2.4s infinite;
}

.pipe-step {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.pipe-icon {
  display: grid;
  place-content: center;
  width: 29px;
  height: 29px;
  border: 1px solid rgba(53, 199, 255, 0.5);
  border-radius: 50%;
  background: radial-gradient(circle at 34% 28%, rgba(46, 123, 255, 0.4), rgba(8, 20, 47, 0.8));
  color: #d5efff;
  box-shadow: 0 0 12px rgba(46, 123, 255, 0.35);
  animation: hex-breathe 4.2s ease-in-out infinite;
}

.pipe-step b {
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}

.pipe-arrow {
  flex: 1;
  min-width: 20px;
  height: 2px;
  background: linear-gradient(90deg, rgba(53, 199, 255, 0.7), rgba(143, 123, 255, 0.7));
  clip-path: polygon(0 40%, 82% 40%, 82% 0, 100% 50%, 82% 100%, 82% 60%, 0 60%);
  transform: scaleY(3.4);
}

/* ========== 开机启动序列 ========== */
.boot-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-content: center;
  overflow: hidden;
  border-radius: inherit;
  background:
    radial-gradient(680px 380px at 50% 44%, rgba(46, 123, 255, 0.14), transparent 66%),
    linear-gradient(180deg, #040b1d 0%, #061129 100%);
}

.boot-box {
  display: grid;
  gap: 9px;
  justify-items: center;
  text-align: center;
}

.boot-box strong {
  color: #fff;
  font-size: 21px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-shadow: 0 0 24px rgba(53, 199, 255, 0.8);
}

.boot-box small {
  color: #6fa0d8;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.5em;
}

.boot-bar {
  width: 300px;
  height: 4px;
  margin-top: 8px;
  overflow: hidden;
  border-radius: 3px;
  background: rgba(62, 158, 255, 0.14);
}

.boot-bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--bs-blue), var(--bs-cyan));
  box-shadow: 0 0 14px rgba(53, 199, 255, 0.9);
  transition: width 0.05s linear;
}

.boot-box em {
  color: var(--bs-cyan);
  font-family: var(--font-mono);
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
}

.boot-scan {
  position: absolute;
  right: 0;
  left: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(53, 199, 255, 0.85), transparent);
  box-shadow: 0 0 22px rgba(53, 199, 255, 0.7);
  animation: boot-scanline 1.15s ease-in-out infinite alternate;
}

@keyframes boot-scanline {
  from { top: 12%; }
  to { top: 88%; }
}

.boot-leave-active {
  transition: opacity 0.45s ease, transform 0.45s ease;
}

.boot-leave-to {
  opacity: 0;
  transform: scale(1.04);
}

/* ========== 降级 ========== */
@media (prefers-reduced-motion: reduce) {
  .bs-card,
  .big-screen::after,
  .hub-sweep,
  .pulse-dot,
  .gauge-ring,
  .hub-platform.p1,
  .hub-beam,
  .hub-node .hex,
  .asset-orb,
  .pipe-icon,
  .pipeline-row,
  .region-dot,
  .kpi-chip.danger,
  .big-screen.live .bar-col i,
  .big-screen.live .combo-bar,
  .big-screen.live .line-blue,
  .big-screen.live .line-gold {
    animation: none !important;
  }
}

/* ========== 响应式 ========== */
@media (max-width: 1180px) {
  .bs-main {
    grid-template-columns: 1fr 1fr;
  }

  .center-col {
    grid-column: 1 / -1;
    grid-row: 1;
  }
}

@media (max-width: 1100px) {
  .bs-main {
    grid-template-columns: 1fr;
  }

  .asset-row,
  .center-kpis {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 700px) {
  .bs-head {
    grid-template-columns: 1fr;
    justify-items: start;
  }

  .head-side-info.right { justify-self: start; }

  .title-wing { display: none; }

  .asset-row,
  .center-kpis,
  .gauge-grid {
    grid-template-columns: 1fr 1fr;
  }
}

/* ========== 详情弹窗 ========== */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.28s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
.modal-fade-enter-active .detail-modal,
.modal-fade-leave-active .detail-modal {
  transition: transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.28s ease;
}
.modal-fade-enter-from .detail-modal,
.modal-fade-leave-to .detail-modal {
  opacity: 0;
  transform: translateY(20px) scale(0.96);
}

.detail-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-content: center;
  background: rgba(3, 10, 28, 0.72);
  backdrop-filter: blur(6px);
}

.detail-modal {
  position: relative;
  width: 720px;
  max-width: 92vw;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 40%);
  border-radius: 10px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--tone), transparent 88%), transparent 36%),
    rgba(8, 18, 42, 0.92);
  box-shadow:
    0 30px 80px rgba(0, 0, 0, 0.5),
    0 0 40px color-mix(in srgb, var(--tone), transparent 72%),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.modal-corner {
  position: absolute;
  width: 22px;
  height: 22px;
  border: 2px solid var(--tone);
  pointer-events: none;
  filter: drop-shadow(0 0 6px var(--tone));
}
.modal-corner.tl { top: -1px; left: -1px; border-right: 0; border-bottom: 0; border-radius: 10px 0 0 0; }
.modal-corner.tr { top: -1px; right: -1px; border-left: 0; border-bottom: 0; border-radius: 0 10px 0 0; }
.modal-corner.bl { bottom: -1px; left: -1px; border-right: 0; border-top: 0; border-radius: 0 0 0 10px; }
.modal-corner.br { bottom: -1px; right: -1px; border-left: 0; border-top: 0; border-radius: 0 0 10px 0; }

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--tone), transparent 70%);
}
.modal-title-wrap {
  display: flex;
  align-items: center;
  gap: 14px;
}
.modal-icon {
  display: grid;
  place-content: center;
  width: 48px;
  height: 48px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 40%);
  background: radial-gradient(circle at 34% 28%, color-mix(in srgb, var(--tone), transparent 50%), rgba(8,18,42,0.9));
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 0 16px color-mix(in srgb, var(--tone), transparent 60%);
}
.modal-title-wrap h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 0 12px color-mix(in srgb, var(--tone), transparent 50%);
}
.modal-title-wrap p {
  margin: 4px 0 0;
  color: #6684ad;
  font-size: 12px;
}
.modal-close {
  display: grid;
  place-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(145, 223, 255, 0.2);
  border-radius: 7px;
  background: rgba(8, 20, 47, 0.6);
  color: #a8c4e8;
  cursor: pointer;
  transition: all 0.2s ease;
}
.modal-close:hover {
  border-color: var(--tone);
  color: #fff;
  box-shadow: 0 0 10px color-mix(in srgb, var(--tone), transparent 60%);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 24px 20px;
}

.detail-table-wrap {
  overflow-x: auto;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 75%);
  border-radius: 7px;
  margin-bottom: 16px;
}
.detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.detail-table thead tr {
  background: color-mix(in srgb, var(--tone), transparent 86%);
}
.detail-table th {
  padding: 11px 14px;
  text-align: left;
  color: var(--tone);
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.06em;
  border-bottom: 1px solid color-mix(in srgb, var(--tone), transparent 65%);
  white-space: nowrap;
}
.detail-table td {
  padding: 11px 14px;
  color: #a8c4e8;
  border-bottom: 1px solid rgba(62, 158, 255, 0.06);
  white-space: nowrap;
}
.detail-table tbody tr {
  transition: background 0.18s ease;
}
.detail-table tbody tr:hover {
  background: color-mix(in srgb, var(--tone), transparent 92%);
}
.detail-table .strong { color: #fff; font-weight: 700; }
.detail-table .item-name { color: #eaf6ff; }
.mono { font-family: var(--font-mono, monospace); }

.rate-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 18px;
}
.rate-bar i {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--tone), color-mix(in srgb, var(--tone), #fff 30%));
  box-shadow: 0 0 8px var(--tone);
}
.rate-bar span {
  position: relative;
  z-index: 1;
  margin-left: auto;
  font-size: 11px;
  color: #eaf6ff;
  font-weight: 700;
}

.modal-status {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 50%);
  background: color-mix(in srgb, var(--tone), transparent 85%);
  color: color-mix(in srgb, var(--tone), white 20%);
}

.modal-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.summary-stat {
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 75%);
  border-radius: 7px;
  background: color-mix(in srgb, var(--tone), transparent 92%);
  text-align: center;
}
.summary-stat span {
  display: block;
  color: #6684ad;
  font-size: 11px;
  margin-bottom: 6px;
}
.summary-stat strong {
  font-size: 22px;
  font-weight: 800;
  color: #fff;
  font-family: var(--font-mono, monospace);
  text-shadow: 0 0 10px color-mix(in srgb, var(--tone), transparent 50%);
}
.summary-stat strong.ok { color: #8cf0c2; text-shadow: 0 0 10px rgba(35, 209, 139, 0.5); }

.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 24px 18px;
  border-top: 1px solid color-mix(in srgb, var(--tone), transparent 70%);
  background: rgba(6, 15, 36, 0.4);
}
.modal-btn {
  height: 38px;
  padding: 0 22px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}
.modal-btn.secondary {
  border: 1px solid rgba(145, 223, 255, 0.2);
  background: rgba(8, 20, 47, 0.6);
  color: #a8c4e8;
}
.modal-btn.secondary:hover {
  border-color: rgba(145, 223, 255, 0.4);
  color: #fff;
}
.modal-btn.primary {
  border: 1px solid color-mix(in srgb, var(--tone), transparent 35%);
  background: linear-gradient(135deg, color-mix(in srgb, var(--tone), transparent 35%), color-mix(in srgb, var(--tone), transparent 55%));
  color: #fff;
  box-shadow: 0 0 18px color-mix(in srgb, var(--tone), transparent 60%);
}
.modal-btn.primary:hover {
  box-shadow: 0 0 26px color-mix(in srgb, var(--tone), transparent 40%);
  transform: translateY(-1px);
}
</style>
