<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  AlertTriangle,
  Bot,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Info,
  RefreshCw,
  TrendingUp,
} from 'lucide-vue-next'
import ThreeKnowledgeTree from '@/components/knowledge-tree/ThreeKnowledgeTree.vue'
import { useEvaluationTreeData } from '@/composables/useEvaluationTreeData'
import { useLearningProgressSync } from '@/composables/useLearningProgressSync'
import { courses, galaxies } from '@/data/courses'
import { DOMAINS } from '@/data/learning-resources'
import type { KnowledgePoint } from '@/types/knowledge-tree'

interface SummaryCard {
  label: string
  value: string
  sub: string
  tone: 'cyan' | 'blue' | 'amber' | 'green'
  icon: typeof BookOpen
}

interface RadarMetric {
  label: string
  value: number
}

interface DistributionItem {
  label: string
  percent: number
  color: string
}

interface UpgradeTopic {
  id: string
  name: string
  mastery: number
  risk: '高风险' | '中风险' | '低风险'
  action: string
  route: string
  domainId?: string
  domainName?: string
}

const route = useRoute()
const router = useRouter()
const {
  recordKnowledgeAction,
  recentFocus,
} = useLearningProgressSync()
const learnerName = computed(() => (route.query.learner as string) || '学习者 A')
const courseName = computed(() => {
  const namedCourse = getQueryText(route.query.courseName)
  if (namedCourse) return resolveCourseNameAlias(namedCourse)

  const courseIdOrName = getQueryText(route.query.course)
  if (courseIdOrName) {
    const numericCourseId = Number(courseIdOrName)
    if (Number.isFinite(numericCourseId)) {
      return courses.find((course) => course.id === numericCourseId)?.name || courseIdOrName
    }
    return resolveCourseNameAlias(courseIdOrName)
  }

  return resolveCourseNameAlias(getQueryText(route.query.topic)) || '计算机科学基础'
})

const { data, loading, error, status, load } = useEvaluationTreeData()
const isDemoData = computed(() => status.value === 'demo' || data.value?.dataSource === 'demo-fixture')
const hasEvaluationSnapshot = computed(() => Boolean(data.value && (data.value.capabilities.length || data.value.modules.length || isDemoData.value)))
const hasKnowledgeEvidence = computed(() => Boolean(data.value?.modules.some((module) => module.units.some((unit) => unit.points.length > 0))))
const reducedMotion = ref(false)
const timeRange = ref('7d')
const selectedTreePoint = ref<KnowledgePoint | null>(null)
const detailRefreshKey = ref(0)
const appliedIncomingActionKey = ref('')
const analysisPanelKey = computed(() => selectedTreePoint.value?.id ?? 'overview')

onMounted(async () => {
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  await load()
  applyIncomingConstellationFocus()
})

function getQueryText(value: unknown) {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' && first.trim() ? first.trim() : ''
}

function resolveCourseNameAlias(value: string) {
  const normalized = normalizeKnowledgeKey(value)
  if (!normalized) return ''

  const exactCourse = courses.find((course) => normalizeKnowledgeKey(course.name) === normalized)
  if (exactCourse) return exactCourse.name

  const aliases: Record<string, number> = {
    math: 15,
    数学基础: 15,
    微积分: 15,
    概率论: 15,
    概率统计: 15,
    矩阵运算: 15,
    特征值与分解: 15,
    凸优化: 15,
    算法与数据结构: 5,
    数据结构: 5,
    排序与查找: 5,
    图算法: 5,
    动态规划: 6,
    机器学习: 17,
    监督学习: 17,
    无监督学习: 17,
    集成学习: 17,
    深度学习: 18,
    神经网络: 18,
    cnn: 18,
    rnnlstm: 18,
    transformer: 18,
    attention: 18,
    nlp应用: 19,
    nlp与应用: 19,
    llm: 19,
    词向量: 19,
    微调与对齐: 19,
    检索增强: 19,
    工程实践: 12,
    python工程: 2,
    版本控制: 12,
    模型部署: 12,
  }

  const courseId = Object.entries(aliases).find(([key]) => normalized.includes(normalizeKnowledgeKey(key)))?.[1]
  return courses.find((course) => course.id === courseId)?.name || value
}

function directionLabel(direction: string) {
  return galaxies.find((galaxy) => galaxy.id === direction)?.name || '课程体系'
}

function courseProgress(courseId: number) {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('universe-learning-progress')
      const state = raw ? JSON.parse(raw)?.[courseId] : null
      if (state === 'completed') return 96
      if (state === 'locked') return 22
    } catch {}
  }

  return Math.min(92, 38 + ((courseId * 13) % 55))
}

function masteryStatusFromProgress(progress: number): KnowledgePoint['status'] {
  if (progress >= 90) return 'mastered'
  if (progress >= 78) return 'proficient'
  if (progress >= 60) return 'basic'
  if (progress >= 45) return 'beginner'
  if (progress > 0) return 'weak'
  return 'none'
}

function createCourseTreePoint(course: (typeof courses)[number]): KnowledgePoint {
  const mastery = courseProgress(course.id)
  return {
    id: `course-${course.id}`,
    name: course.name,
    module: directionLabel(course.direction),
    unit: course.difficulty,
    mastery,
    previousMastery: Math.max(0, mastery - 8),
    confidence: 82,
    weight: 1,
    status: masteryStatusFromProgress(mastery),
    recentChange: 4,
    agentEvidence: [],
    evidenceCount: course.knowledgePoints.length,
    prerequisiteIds: course.prerequisites.map((id) => `course-${id}`),
    relatedIds: [],
    lastEvaluatedAt: new Date().toISOString(),
    recommendation: `${course.name} 下包含 ${course.knowledgePoints.length} 个核心知识点，可从课程页继续学习。`,
    issue: mastery < 60 ? '该课程还有若干知识点需要继续巩固。' : undefined,
  }
}

async function onReload() {
  await load()
  applyIncomingConstellationFocus()
}

const allPoints = computed<KnowledgePoint[]>(() => {
  const backendPoints = data.value?.modules
    ? data.value.modules.flatMap((m) => m.units.flatMap((u) => u.points)).map((point) => {
      return {
        ...point,
        // Local task completion is evidence for a future assessment, not a mastery score.
        status: masteryStatusFromProgress(point.mastery),
      }
    })
    : []
  return backendPoints
})

const incomingKnowledgePointId = computed(() => getQueryText(route.query.knowledgePointId) || getQueryText(route.query.nodeId))
const incomingTopicName = computed(() => getQueryText(route.query.topic) || getQueryText(route.query.knowledgePoint))
const incomingCourseName = computed(() => courseName.value)
const isConstellationLightAction = computed(() => (
  getQueryText(route.query.constellationAction) === 'light' ||
  getQueryText(route.query.light) === '1'
))

const courseTreePoints = computed<KnowledgePoint[]>(() => isDemoData.value ? courses.map(createCourseTreePoint) : [])

const incomingEvaluationPoint = computed(() => (
  allPoints.value.find((point) => matchesIncomingPoint(point)) ??
  courseTreePoints.value.find((point) => matchesIncomingPoint(point)) ??
  (
    !incomingKnowledgePointId.value && !incomingTopicName.value && recentFocus.value
      ? allPoints.value.find((point) => point.id === recentFocus.value?.pointId) ?? null
      : null
  )
))

const treeHighlightNames = computed(() => {
  if (selectedTreePoint.value) return [selectedTreePoint.value.name]
  return incomingEvaluationPoint.value ? [incomingEvaluationPoint.value.name] : []
})

const allKnowledgePoints = computed(() => {
  const treePoints = [
    ...allPoints.value,
    ...courseTreePoints.value,
  ]
  return treePoints.map((pt) => {
    const activated = isActivatedIncomingPoint(pt)
    const shouldLabel = activated || labeledPointIds.value.has(pt.id) || labeledCoursePointIds.value.has(pt.id)
    return {
      name: pt.name,
      status: activated ? 'mastered' : pt.status,
      progress: activated ? Math.max(95, Math.round(pt.mastery)) : Math.round(pt.mastery),
      course: pt.module,
      labelBadge: shouldLabel ? pt.name : undefined,
      labelTone: activated ? 'success' : labelToneForPoint(pt),
    }
  })
})

const labeledCoursePointIds = computed(() => {
  return new Set(
    [...courseTreePoints.value]
      .filter((pt) => isActivatedIncomingPoint(pt) || pt.mastery < 55 || pt.status === 'weak' || pt.status === 'none')
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 7)
      .map((pt) => pt.id),
  )
})

const labeledPointIds = computed(() => {
  return new Set(
    [...allPoints.value]
      .filter((pt) => pt.mastery < 65 || pt.status === 'weak' || pt.status === 'none')
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 8)
      .map((pt) => pt.id),
  )
})

function labelBadgeForPoint(pt: KnowledgePoint) {
  if (!labeledPointIds.value.has(pt.id)) return undefined
  if (pt.status === 'none' || pt.mastery < 30) return '先学'
  if (pt.status === 'weak' || pt.mastery < 50) return '补弱'
  if (pt.mastery < 65) return '巩固'
  return '练习'
}

function labelToneForPoint(pt: KnowledgePoint) {
  if (pt.status === 'none' || pt.mastery < 50) return 'danger'
  if (pt.mastery < 65) return 'warning'
  return 'info'
}

function normalizeKnowledgeKey(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s/_\-·・（）()]+/g, '')
}

function matchesIncomingPoint(point: KnowledgePoint) {
  const queryId = incomingKnowledgePointId.value
  const queryCourse = getQueryText(route.query.course)
  if (
    (queryId && (point.id === queryId || point.id === `course-${queryId}` || String((point as any).knowledgePointId || '') === queryId)) ||
    (queryCourse && (point.id === queryCourse || point.id === `course-${queryCourse}`))
  ) {
    return true
  }

  const queryTopic = incomingTopicName.value
  const mappedTopic = queryTopic ? resolveCourseNameAlias(queryTopic) : ''
  const mappedCourse = incomingCourseName.value ? resolveCourseNameAlias(incomingCourseName.value) : ''
  return Boolean(
    (queryTopic && normalizeKnowledgeKey(point.name) === normalizeKnowledgeKey(queryTopic)) ||
    (mappedTopic && normalizeKnowledgeKey(point.name) === normalizeKnowledgeKey(mappedTopic)) ||
    (mappedCourse && normalizeKnowledgeKey(point.name) === normalizeKnowledgeKey(mappedCourse)),
  )
}

function isActivatedIncomingPoint(point: KnowledgePoint) {
  return isConstellationLightAction.value && matchesIncomingPoint(point)
}

function applyIncomingConstellationFocus() {
  const point = incomingEvaluationPoint.value
  if (!point) return

  let nextPoint = point
  if (isConstellationLightAction.value) {
    const targetMastery = Number(getQueryText(route.query.targetMastery) || 100)
    const actionKey = `${point.id}-${targetMastery}`
    if (appliedIncomingActionKey.value !== actionKey) {
      appliedIncomingActionKey.value = actionKey
      const synced = recordKnowledgeAction({
        id: incomingKnowledgePointId.value || point.id,
        label: incomingTopicName.value || point.name,
        domainId: getQueryText(route.query.domain),
        domainName: point.module,
        baseMastery: point.mastery,
        targetMastery,
        action: 'light-star',
        source: 'evaluation-route',
      })
      nextPoint = {
        ...point,
        mastery: synced.mastery,
        previousMastery: synced.previousMastery,
        status: masteryStatusFromProgress(synced.mastery),
        recentChange: synced.mastery - synced.previousMastery,
      }
    }
  }

  if (selectedTreePoint.value?.id !== nextPoint.id || selectedTreePoint.value.mastery !== nextPoint.mastery) {
    selectedTreePoint.value = nextPoint
    detailRefreshKey.value += 1
  }
}

watch([data, incomingKnowledgePointId, incomingTopicName, incomingCourseName, isConstellationLightAction], applyIncomingConstellationFocus)

const totalStats = computed(() => {
  const points = allPoints.value
  const total = points.length
  const mastered = points.filter((p) => p.mastery >= 80).length
  const mid = points.filter((p) => p.mastery >= 50 && p.mastery < 80).length
  const weak = points.filter((p) => p.mastery < 50).length
  const avgMastery = total ? points.reduce((s, p) => s + p.mastery, 0) / total : 0
  return { total, mastered, mid, weak, avgMastery }
})

const analysisPoints = computed(() => {
  if (!selectedTreePoint.value) return allPoints.value
  const modulePoints = allPoints.value.filter((point) => point.module === selectedTreePoint.value?.module)
  return modulePoints.length ? modulePoints : [selectedTreePoint.value]
})

const analysisStats = computed(() => {
  const points = analysisPoints.value
  const total = points.length
  const mastered = points.filter((p) => p.mastery >= 80).length
  const mid = points.filter((p) => p.mastery >= 50 && p.mastery < 80).length
  const weak = points.filter((p) => p.mastery < 50).length
  const avgMastery = total ? points.reduce((s, p) => s + p.mastery, 0) / total : 0
  return { total, mastered, mid, weak, avgMastery }
})

const focusLine = computed(() => {
  if (!selectedTreePoint.value) return `${learnerName.value} · ${courseName.value}`
  return `${selectedTreePoint.value.module} · ${selectedTreePoint.value.name} · 已切换苹果诊断`
})

const focusStatusLabel = computed(() => {
  const point = selectedTreePoint.value
  if (!point) return ''
  if (point.mastery < 30) return '高风险'
  if (point.mastery < 50) return '重点补弱'
  if (point.mastery < 65) return '需要巩固'
  if (point.mastery < 80) return '继续练习'
  return '已掌握'
})

const trend = computed(() => data.value?.trends ?? [])

const currentMastery = computed<number | null>(() => (
  selectedTreePoint.value?.mastery ??
  (data.value?.modules.length ? data.value.overallMastery : null) ??
  trend.value[trend.value.length - 1]?.mastery ?? null
))
const masteryChange = computed(() => {
  if (selectedTreePoint.value) return selectedTreePoint.value.recentChange
  if (trend.value.length > 1) return trend.value[trend.value.length - 1].mastery - trend.value[0].mastery
  if (data.value?.modules.length) return data.value.overallMastery - data.value.previousOverallMastery
  return 0
})

const detailRefreshStrength = computed(() => {
  const point = selectedTreePoint.value
  if (!point) return 0
  const gap = Math.max(0, 100 - point.mastery)
  const confidenceGap = Math.max(0, 100 - point.confidence)
  const volatility = Math.abs(point.recentChange ?? 0)
  return clamp(26 + gap * 0.46 + confidenceGap * 0.16 + volatility * 1.4)
})

const selectedLearningDetails = computed(() => {
  const point = selectedTreePoint.value
  if (!point) return []
  return [
    { label: '掌握度', value: `${Math.round(point.mastery)}%`, hint: focusStatusLabel.value },
    { label: '本次变化', value: `${formatSigned(point.recentChange ?? 0)}%`, hint: '较上次评估' },
    { label: '诊断置信度', value: `${Math.round(point.confidence)}%`, hint: `${point.evidenceCount || 1} 条证据` },
    { label: '所属模块', value: point.module, hint: point.unit || '知识单元' },
  ]
})

const selectedPointIssue = computed(() => selectedTreePoint.value?.issue || selectedTreePoint.value?.recentError || '当前知识点需要通过练习继续观察稳定性。')
const selectedPointRecommendation = computed(() => selectedTreePoint.value?.recommendation || '进入学习资源完成一组专项练习，再回到评估页刷新掌握度。')

const weakPoints = computed(() => (
  [...analysisPoints.value]
    .filter((p) => p.mastery < 60)
    .sort((a, b) => a.mastery - b.mastery)
))

const focusedDomainTopics = computed(() => {
  const selected = selectedTreePoint.value
  if (!selected) return weakPoints.value
  const sameModule = allPoints.value.filter((point) => point.module === selected.module)
  return [
    selected,
    ...sameModule
      .filter((point) => point.id !== selected.id)
      .sort((a, b) => a.mastery - b.mastery),
  ].slice(0, 5)
})

const summaryCards = computed<SummaryCard[]>(() => {
  const masteryValue = currentMastery.value ?? 0
  if (selectedTreePoint.value) {
    return [
      {
        label: '当前苹果知识点',
        value: `${Math.round(selectedTreePoint.value.mastery)}%`,
        sub: focusStatusLabel.value,
        tone: selectedTreePoint.value.mastery < 50 ? 'amber' : 'cyan',
        icon: CheckCircle2,
      },
      {
        label: '所属模块',
        value: `${analysisStats.value.total}`,
        sub: selectedTreePoint.value.module,
        tone: 'blue',
        icon: BookOpen,
      },
      {
        label: '同模块待提升',
        value: `${weakPoints.value.length}`,
        sub: `高风险 ${highRiskCount.value} 个`,
        tone: 'amber',
        icon: AlertTriangle,
      },
      {
        label: '本周变化',
        value: `${formatSigned(masteryChange.value)}%`,
        sub: selectedTreePoint.value.mastery < 50 ? '建议立即补弱' : '继续强化',
        tone: 'green',
        icon: TrendingUp,
      },
    ]
  }

  return [
    {
      label: '综合掌握度',
      value: currentMastery.value === null ? '暂无' : `${Math.round(masteryValue)}%`,
      sub: `较上周 ${formatSigned(masteryChange.value)}`,
      tone: 'cyan',
      icon: CheckCircle2,
    },
    {
      label: '已评估知识点',
      value: `${totalStats.value.total}`,
      sub: `覆盖率 ${coveragePercent.value}%`,
      tone: 'blue',
      icon: BookOpen,
    },
    {
      label: '待提升知识点',
      value: `${weakPoints.value.length}`,
      sub: `高风险 ${highRiskCount.value} 个`,
      tone: 'amber',
      icon: AlertTriangle,
    },
    {
      label: '本周提升',
      value: `${formatSigned(masteryChange.value)}%`,
      sub: '较上周',
      tone: 'green',
      icon: TrendingUp,
    },
  ]
})

const coveragePercent = computed(() => {
  const total = totalStats.value.total
  if (!total) return 0
  const evaluated = allPoints.value.filter((p) => p.mastery > 0).length
  return Math.round((evaluated / total) * 100)
})

const highRiskCount = computed(() => weakPoints.value.filter((p) => p.mastery < 35).length)

const distribution = computed<DistributionItem[]>(() => {
  const stats = analysisStats.value
  const total = Math.max(stats.total, 1)
  return [
    { label: '掌握良好（≥80%）', percent: Math.round((stats.mastered / total) * 1000) / 10, color: '#12d7c8' },
    { label: '中等掌握（50%~80%）', percent: Math.round((stats.mid / total) * 1000) / 10, color: '#3f74ff' },
    { label: '掌握较弱（<50%）', percent: Math.max(0, Math.round((stats.weak / total) * 1000) / 10), color: '#a86f13' },
  ]
})

const radarMetrics = computed<RadarMetric[]>(() => {
  return (data.value?.capabilities ?? []).slice(0, 4).map((metric) => ({
    label: metric.label,
    value: clamp(metric.value),
  }))
})

const topUpgradeTopics = computed<UpgradeTopic[]>(() => {
  const source = selectedTreePoint.value ? focusedDomainTopics.value : weakPoints.value
  return source.slice(0, 5).map((point) => {
    const domain = DOMAINS.find((item) => item.name === point.module)
    return {
      id: point.id,
      name: point.name,
      mastery: Math.round(point.mastery),
      risk: point.mastery < 30 ? '高风险' : point.mastery < 45 ? '中风险' : '低风险',
      action: point.mastery < 30 ? '重点复习' : point.mastery < 45 ? '巩固练习' : '加强理解',
      route: point.mastery < 30 ? '/learning-path' : '/resources',
      domainId: domain?.id,
      domainName: domain?.name,
    }
  })
})

const trendPolyline = computed(() => {
  const points = trend.value
  if (!points.length) return ''
  const maxX = 520
  const maxY = 260
  return points.map((p, i) => {
    const x = points.length === 1 ? maxX : (i / (points.length - 1)) * maxX
    const y = maxY - (p.mastery / 100) * maxY
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
})

const trendArea = computed(() => trendPolyline.value ? `0,260 ${trendPolyline.value} 520,260` : '')

const latestTrendPoint = computed(() => {
  const points = trend.value
  if (!points.length) return { x: 0, y: 260 }
  const mastery = points[points.length - 1]?.mastery ?? 0
  return { x: 520, y: 260 - (mastery / 100) * 260 }
})

const radarPolygon = computed(() => {
  const center = { x: 140, y: 126 }
  const radius = 94
  return radarMetrics.value.map((m, i) => {
    const angle = -Math.PI / 2 + i * (Math.PI * 2 / radarMetrics.value.length)
    const r = radius * (m.value / 100)
    return `${(center.x + Math.cos(angle) * r).toFixed(1)},${(center.y + Math.sin(angle) * r).toFixed(1)}`
  }).join(' ')
})

const aiDiagnosis = computed(() => {
  if (status.value === 'unavailable') return 'AI 诊断：评估服务不可用，未生成掌握度或历史趋势。'
  if (status.value === 'error') return 'AI 诊断：评估数据加载失败，请重试。'
  if (status.value === 'no-data') return 'AI 诊断：暂无真实测评证据，完成练习后再进行评估。'
  if (!analysisStats.value.total) return 'AI 诊断：正在等待评估数据写入。'
  if (selectedTreePoint.value) {
    if (selectedTreePoint.value.mastery < 50) return `AI 诊断：${selectedTreePoint.value.name} 是当前薄弱苹果，建议右侧清单立即进入补弱路径。`
    if (selectedTreePoint.value.mastery < 80) return `AI 诊断：${selectedTreePoint.value.name} 已有基础，需要通过专项练习巩固迁移。`
    return `AI 诊断：${selectedTreePoint.value.name} 状态稳定，可作为关联知识点的支撑节点。`
  }
  if ((currentMastery.value ?? 0) < 50) return 'AI 诊断：基础巩固不足，建议优先复习高频薄弱知识点。'
  if (weakPoints.value.length > 3) return 'AI 诊断：局部知识点波动明显，建议按 Top 5 清单逐个补强。'
  return 'AI 诊断：整体状态稳定，建议继续推进实战应用与迁移练习。'
})

const diagnosticSummary = computed(() => {
  if (status.value === 'unavailable') return '评估服务当前不可用，页面不会用模拟成绩替代真实结果。'
  if (status.value === 'error') return '评估数据加载失败，请重试。'
  if (status.value === 'no-data') return '暂无真实测评数据；课程完成率不会被当作知识掌握度。'
  if (currentMastery.value === null && !radarMetrics.value.length) return '当前响应未提供可展示的能力评分。'
  if (selectedTreePoint.value) {
    if (selectedTreePoint.value.mastery < 50) {
      return `当前选中「${selectedTreePoint.value.name}」，掌握度 ${Math.round(selectedTreePoint.value.mastery)}%，会直接影响「${selectedTreePoint.value.module}」模块的后续学习。建议先看讲解，再做 2 轮针对练习。`
    }
    return `当前选中「${selectedTreePoint.value.name}」，模块内状态相对稳定。建议用同模块题目保持手感，并把关联薄弱点一起扫掉。`
  }
  if ((currentMastery.value ?? 0) < 50) {
    return '基础巩固能力相对薄弱，影响整体掌握度。建议加强基础概念与原理的复习。'
  }
  return '能力结构较均衡，薄弱点集中在少量知识点。建议保持节奏，并通过专项练习拉高短板。'
})

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function formatSigned(value: number) {
  const rounded = Math.round(value * 10) / 10
  return `${rounded >= 0 ? '+' : ''}${rounded}`
}

function openTopic(topic: UpgradeTopic) {
  router.push({
    path: topic.route,
    query: {
      source: 'evaluation-cockpit',
      knowledgePointId: topic.id,
      topic: topic.name,
      domain: topic.domainName || topic.domainId || '',
    },
  })
}

function onTreeMarkerSelect(marker: any) {
  const point =
    courseTreePoints.value.find((item) => item.name === marker?.label) ||
    allPoints.value.find((item) => item.name === marker?.label)
  selectedTreePoint.value = point ?? null
  if (point) detailRefreshKey.value += 1
  nextTick(() => {
    document.querySelector('.cockpit-shell')?.scrollTo({ top: 0 })
  })
}

function openSelectedTreePoint() {
  if (!selectedTreePoint.value) return
  router.push({
    path: selectedTreePoint.value.mastery < 50 ? '/learning-path' : '/resources',
    query: {
      source: 'evaluation-tree',
      knowledgePointId: selectedTreePoint.value.id,
      topic: selectedTreePoint.value.name,
      domain: selectedTreePoint.value.module,
    },
  })
}

function openPrimaryAction() {
  if (selectedTreePoint.value) {
    openSelectedTreePoint()
    return
  }
  router.push('/learning-path')
}
</script>

<template>
  <div class="evaluation-page" :class="{ 'reduced-motion': reducedMotion }">
    <main class="cockpit-shell">
      <header class="cockpit-header breathe-subtle">
        <div>
          <p class="eyebrow">EVALUATION COCKPIT</p>
          <h1>学习分析</h1>
          <div class="course-badge" :title="courseName">
            <BookOpen :size="16" />
            <span>当前课程</span>
            <strong>{{ courseName }}</strong>
          </div>
          <div class="ai-note">
            <span class="bot-badge"><Bot :size="24" /></span>
            <strong>{{ aiDiagnosis }}</strong>
          </div>
          <p class="course-line">{{ focusLine }}</p>
        </div>

        <div class="range-select">
          <CalendarDays :size="18" />
          <select v-model="timeRange" aria-label="选择时间范围">
            <option value="7d">近 7 天</option>
            <option value="30d">近 30 天</option>
            <option value="today">今天</option>
          </select>
          <ChevronDown :size="18" />
        </div>
      </header>

      <div v-if="loading" class="state-card breathe-subtle">评估数据加载中...</div>
      <div v-else-if="status === 'unavailable'" class="state-card error breathe-subtle">
        评估暂不可用：{{ error || '服务未提供真实评估数据。' }}
        <button type="button" @click="onReload">重试</button>
      </div>
      <div v-else-if="status === 'no-data'" class="state-card breathe-subtle">
        暂无真实测评数据。完成学习任务后，需要经过服务端评估才会显示掌握度。
        <button type="button" @click="onReload">刷新</button>
      </div>
      <div v-else-if="status === 'error'" class="state-card error breathe-subtle">
        数据加载失败：{{ error }}
        <button type="button" @click="onReload">重试</button>
      </div>

      <section
        v-if="selectedTreePoint && hasEvaluationSnapshot"
        :key="`point-detail-${detailRefreshKey}`"
        class="selected-point-panel panel breathe"
        :style="{ '--refresh-strength': `${detailRefreshStrength}%` }"
      >
        <div class="selected-point-head">
          <div>
            <span class="selected-point-kicker">当前苹果知识点</span>
            <h2>{{ selectedTreePoint.name }}</h2>
            <p>{{ selectedTreePoint.module }} · {{ selectedTreePoint.unit || '知识单元' }}</p>
          </div>
          <div class="refresh-orbit" aria-label="诊断刷新力度">
            <span>{{ detailRefreshStrength }}%</span>
          </div>
        </div>
        <div class="refresh-meter-label">
          <span>诊断刷新力度</span>
          <b>{{ detailRefreshStrength }}%</b>
        </div>
        <div class="refresh-meter">
          <i />
        </div>
        <div class="selected-detail-grid">
          <div v-for="item in selectedLearningDetails" :key="item.label">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <em>{{ item.hint }}</em>
          </div>
        </div>
        <div class="selected-learning-note">
          <p><b>薄弱表现</b>{{ selectedPointIssue }}</p>
          <p><b>提升建议</b>{{ selectedPointRecommendation }}</p>
        </div>
        <button type="button" class="selected-point-action" @click="openSelectedTreePoint">
          去提升这个知识点 →
        </button>
      </section>

      <section v-if="hasEvaluationSnapshot" class="summary-grid" :key="`summary-${analysisPanelKey}`">
        <article
          v-for="card in summaryCards"
          :key="card.label"
          class="summary-card"
          :class="`tone-${card.tone}`"
        >
          <div class="summary-icon"><component :is="card.icon" :size="28" /></div>
          <div>
            <span>{{ card.label }}</span>
            <strong>{{ card.value }}</strong>
            <em>{{ card.sub }}</em>
          </div>
        </article>
      </section>

      <section v-if="hasKnowledgeEvidence" class="tree-panel panel breathe-glow">
        <div class="tree-panel-head">
          <div>
            <h2>知识树状态</h2>
            <p>保留大树主视图，点击节点查看当前知识点诊断。</p>
          </div>
          <div class="tree-legend">
            <span><i style="background:#22c55e" />已掌握</span>
            <span><i style="background:#ef4444" />待掌握</span>
            <span><i style="background:#f59e0b" />需巩固</span>
          </div>
        </div>
        <div class="tree-stage">
          <div v-if="loading" class="tree-state">知识树加载中...</div>
          <div v-else-if="error && !data" class="tree-state error">知识树加载失败：{{ error }}</div>
          <ThreeKnowledgeTree
            v-if="data"
            fill
            :height="'100%'"
            :knowledge-points="(allKnowledgePoints as any)"
            :highlight-names="treeHighlightNames"
            :show-background-stage="true"
            background-stage-variant="diagnostic"
            @marker-select="onTreeMarkerSelect"
          />
        </div>
      </section>

      <section v-if="hasEvaluationSnapshot" class="main-grid" :key="`main-${analysisPanelKey}`">
        <article class="panel trend-panel breathe">
          <div class="panel-title">
            <h2>掌握度变化趋势</h2>
            <Info :size="17" />
          </div>
          <div class="chart-legend">
            <span><i class="solid" />掌握度</span>
            <span><i class="dash" />目标线</span>
          </div>
          <div class="trend-chart">
            <div v-if="trend.length">
            <svg viewBox="0 0 520 300" preserveAspectRatio="none" aria-label="掌握度趋势图">
              <defs>
                <linearGradient id="trendArea" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.28" />
                  <stop offset="100%" stop-color="#22d3ee" stop-opacity="0" />
                </linearGradient>
                <filter id="trendGlow">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <g class="grid-lines">
                <line v-for="y in [0, 65, 130, 195, 260]" :key="y" x1="0" x2="520" :y1="y" :y2="y" />
              </g>
              <line class="target-line" x1="0" x2="520" y1="118" y2="100" />
              <polygon :points="trendArea" fill="url(#trendArea)" />
              <polyline :points="trendPolyline" class="trend-line" filter="url(#trendGlow)" />
              <circle
                v-for="(point, i) in trend"
                :key="`${point.date}-${i}`"
                class="trend-dot"
                :cx="trend.length === 1 ? 520 : (i / (trend.length - 1)) * 520"
                :cy="260 - (point.mastery / 100) * 260"
                r="5"
              />
              <g class="latest-badge" :transform="`translate(${latestTrendPoint.x - 34}, ${latestTrendPoint.y - 42})`">
                <rect width="58" height="32" rx="7" />
                <text x="29" y="21" text-anchor="middle">{{ Math.round(currentMastery ?? 0) }}%</text>
              </g>
            </svg>
            <div class="y-axis">
              <span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span>
            </div>
            <div class="x-axis">
              <span v-for="item in trend" :key="item.date">{{ item.date }}</span>
            </div>
            </div>
            <div v-else class="empty-chart">暂无真实历史趋势数据</div>
          </div>
          <div v-if="trend.length" class="trend-tip">
            <CheckCircle2 :size="20" />
            <span>本周掌握度上升 <b>{{ formatSigned(masteryChange) }}%</b>，继续保持，稳步提升中！</span>
          </div>
        </article>

        <article class="panel radar-panel breathe">
          <div class="panel-title">
            <h2>能力诊断</h2>
            <Info :size="17" />
          </div>
          <div class="radar-wrap">
            <svg viewBox="0 0 280 252" aria-label="能力雷达图">
              <g class="radar-grid">
                <polygon points="140,32 234,126 140,220 46,126" />
                <polygon points="140,56 210,126 140,196 70,126" />
                <polygon points="140,80 186,126 140,172 94,126" />
                <line x1="140" y1="32" x2="140" y2="220" />
                <line x1="46" y1="126" x2="234" y2="126" />
              </g>
              <polygon v-if="radarMetrics.length" class="radar-shape" :points="radarPolygon" />
              <circle
                v-for="(metric, i) in radarMetrics"
                :key="metric.label"
                :cx="140 + Math.cos(-Math.PI / 2 + i * Math.PI / 2) * 94 * (metric.value / 100)"
                :cy="126 + Math.sin(-Math.PI / 2 + i * Math.PI / 2) * 94 * (metric.value / 100)"
                r="5"
              />
              <text x="140" y="20" text-anchor="middle">基础巩固</text>
              <text x="246" y="131">实战应用</text>
              <text x="140" y="244" text-anchor="middle">深度学习</text>
              <text x="34" y="131" text-anchor="end">核心技能</text>
            </svg>
            <p v-if="!radarMetrics.length" class="empty-chart">暂无能力评估数据</p>
          </div>
          <div class="diagnosis-box">
            <h3>诊断总结</h3>
            <p>{{ diagnosticSummary }}</p>
            <button type="button" @click="openPrimaryAction">
              {{ selectedTreePoint ? '去提升当前知识点 →' : '查看能力详情 →' }}
            </button>
          </div>
        </article>
      </section>

      <section v-if="hasKnowledgeEvidence" class="panel distribution-panel breathe" :key="`distribution-${analysisPanelKey}`">
        <div class="panel-title">
          <h2>知识点掌握度分布</h2>
          <Info :size="17" />
        </div>
        <div class="distribution-bar">
          <span
            v-for="item in distribution"
            :key="item.label"
            :style="{ width: `${item.percent}%`, background: item.color }"
          >
            <b v-if="item.percent >= 6">{{ item.percent }}%</b>
          </span>
        </div>
        <div class="distribution-labels">
          <span v-for="item in distribution" :key="item.label">{{ item.label }}</span>
        </div>
      </section>

      <section v-if="hasKnowledgeEvidence" class="panel topic-panel breathe" :key="`topic-${analysisPanelKey}`">
        <div class="topic-head">
          <h2>Top 5 待提升知识点</h2>
          <span>按掌握度升序</span>
        </div>
        <div class="topic-table">
          <div class="topic-row topic-header">
            <span>知识点</span>
            <span>掌握度</span>
            <span>风险等级</span>
            <span>建议行动</span>
          </div>
          <button
            v-for="(topic, index) in topUpgradeTopics"
            :key="topic.id"
            type="button"
            class="topic-row"
            @click="openTopic(topic)"
          >
            <span class="topic-name"><i>{{ index + 1 }}</i>{{ topic.name }}</span>
            <span class="mastery-cell">{{ topic.mastery }}% <b><em :style="{ width: `${topic.mastery}%` }" /></b></span>
            <span class="risk-pill" :class="topic.risk">{{ topic.risk }}</span>
            <span class="action-pill">{{ topic.action }}</span>
          </button>
          <div v-if="!topUpgradeTopics.length" class="empty-topics">暂无待提升知识点</div>
        </div>
      </section>

      <footer v-if="hasEvaluationSnapshot" class="cockpit-footer">
        <span><CheckCircle2 :size="16" /> 数据更新于 {{ data?.evaluatedAt || '暂无' }}</span>
        <button type="button" @click="onReload"><RefreshCw :size="16" /> 刷新</button>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.evaluation-page {
  height: calc(100vh - 48px);
  min-height: 720px;
  overflow: hidden;
  color: #eef7ff;
  background:
    radial-gradient(circle at 18% 12%, rgba(0, 212, 255, 0.08), transparent 30%),
    radial-gradient(circle at 80% 36%, rgba(49, 93, 255, 0.07), transparent 30%),
    linear-gradient(145deg, rgba(2, 7, 19, 0.18) 0%, rgba(6, 22, 42, 0.12) 48%, rgba(2, 8, 20, 0.22) 100%);
  font-family: 'Outfit', 'PingFang SC', sans-serif;
}

.evaluation-page::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(rgba(124, 180, 255, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(124, 180, 255, 0.028) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: linear-gradient(180deg, #000 0%, transparent 88%);
}

.cockpit-shell {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 14px 14px 14px calc(66.666vw + 7px);
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.cockpit-header {
  display: grid;
  align-items: start;
  justify-content: space-between;
  gap: 10px;
  min-height: 0;
  padding: 14px 16px;
  border: 1px solid rgba(133, 213, 255, 0.18);
  border-radius: 18px;
  background:
    radial-gradient(circle at 18% 6%, rgba(61, 204, 255, 0.12), transparent 36%),
    linear-gradient(145deg, rgba(7, 24, 48, 0.34), rgba(3, 10, 24, 0.46));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.045), 0 18px 56px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(12px) saturate(1.18);
}

.eyebrow {
  margin: 0 0 5px;
  color: #68aaff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.cockpit-header h1 {
  margin: 0;
  font-size: 30px;
  line-height: 1;
  font-weight: 780;
  letter-spacing: 0;
  text-shadow: 0 16px 44px rgba(0, 0, 0, 0.55);
}

.course-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 100%;
  min-height: 32px;
  margin-top: 10px;
  padding: 6px 10px;
  border: 1px solid rgba(45, 232, 255, 0.28);
  border-radius: 999px;
  background: rgba(8, 25, 47, 0.36);
  color: #dff8ff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.045);
}

.course-badge span {
  flex: 0 0 auto;
  color: rgba(174, 202, 232, 0.76);
  font-size: 12px;
}

.course-badge strong {
  overflow: hidden;
  min-width: 0;
  color: #ffffff;
  font-size: 13px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-note {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  color: #9bdcff;
  font-size: 12px;
  line-height: 1.5;
}

.bot-badge {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: #26d9ff;
  border: 1px solid rgba(38, 217, 255, 0.35);
  background: radial-gradient(circle, rgba(38, 217, 255, 0.24), rgba(13, 45, 76, 0.38));
  box-shadow: 0 0 28px rgba(38, 217, 255, 0.18);
}

.course-line {
  margin: 8px 0 0;
  color: rgba(184, 202, 226, 0.62);
  font-size: 12px;
}

.range-select {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(143, 177, 225, 0.22);
  background: rgba(8, 18, 34, 0.34);
  color: #dce9fb;
}

.range-select select {
  flex: 1;
  appearance: none;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.state-card {
  margin-bottom: 12px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid rgba(69, 212, 255, 0.22);
  background: rgba(8, 18, 34, 0.38);
  color: #b7cae7;
  backdrop-filter: blur(10px) saturate(1.15);
}

.state-card.error {
  border-color: rgba(255, 104, 125, 0.32);
  color: #ff9aaa;
}

.state-card button {
  margin-left: 12px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 0;
}

.summary-card,
.panel {
  border: 1px solid rgba(133, 213, 255, 0.15);
  background:
    radial-gradient(circle at 18% 6%, rgba(61, 204, 255, 0.12), transparent 36%),
    linear-gradient(145deg, rgba(8, 24, 47, 0.3), rgba(3, 10, 23, 0.42));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 18px 58px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(10px) saturate(1.18);
}

.summary-card {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 112px;
  padding: 16px;
  border-radius: 14px;
}

.summary-icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.035);
}

.summary-card span,
.summary-card em {
  display: block;
  color: #aebed7;
  font-size: 13px;
  font-style: normal;
}

.summary-card strong {
  display: block;
  margin: 8px 0 10px;
  font-size: 30px;
  line-height: 0.9;
}

.summary-card em {
  font-size: 12px;
}

.selected-point-panel {
  position: relative;
  margin-bottom: 12px;
  overflow: hidden;
  border-color: rgba(61, 220, 255, 0.28);
  background:
    radial-gradient(circle at 16% 0%, rgba(45, 232, 255, 0.18), transparent 40%),
    linear-gradient(142deg, rgba(7, 28, 54, 0.38), rgba(4, 12, 28, 0.5));
  animation: pointPanelRefresh 760ms cubic-bezier(0.18, 0.9, 0.24, 1);
}

.selected-point-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(110deg, transparent 0%, rgba(118, 237, 255, 0.2) 40%, transparent 68%);
  transform: translateX(-120%);
  animation: refreshSweep 920ms ease-out;
}

.selected-point-head {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.selected-point-kicker {
  display: block;
  margin-bottom: 8px;
  color: #64e4ff;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.selected-point-head h2 {
  margin: 0;
  font-size: 26px;
  line-height: 1.08;
}

.selected-point-head p {
  margin: 8px 0 0;
  color: rgba(193, 216, 244, 0.78);
  font-size: 13px;
}

.refresh-orbit {
  position: relative;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  color: #e8fbff;
  background:
    conic-gradient(from 0deg, #2ee8ff var(--refresh-strength), rgba(58, 91, 130, 0.28) 0),
    radial-gradient(circle, rgba(4, 16, 32, 0.58) 58%, transparent 60%);
  box-shadow: 0 0 34px rgba(46, 232, 255, 0.22);
}

.refresh-orbit span {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: rgba(3, 12, 26, 0.52);
  font-size: 16px;
  font-weight: 850;
  backdrop-filter: blur(8px);
}

.refresh-meter {
  position: relative;
  z-index: 1;
  height: 9px;
  margin: 7px 0 14px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(68, 102, 146, 0.24);
}

.refresh-meter-label {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  margin-top: 15px;
  color: rgba(193, 216, 244, 0.76);
  font-size: 12px;
}

.refresh-meter-label b {
  color: #8af6ff;
}

.refresh-meter i {
  display: block;
  width: var(--refresh-strength);
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #22d3ee, #5eead4, #facc15);
  box-shadow: 0 0 22px rgba(46, 232, 255, 0.48);
  animation: meterFill 820ms cubic-bezier(0.2, 0.8, 0.22, 1);
}

.selected-detail-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.selected-detail-grid > div {
  min-height: 86px;
  padding: 12px;
  border: 1px solid rgba(145, 195, 255, 0.12);
  border-radius: 12px;
  background: rgba(3, 13, 29, 0.28);
}

.selected-detail-grid span,
.selected-detail-grid em {
  display: block;
  color: rgba(182, 204, 232, 0.78);
  font-size: 12px;
  font-style: normal;
}

.selected-detail-grid strong {
  display: block;
  margin: 8px 0 6px;
  color: #f5fdff;
  font-size: 21px;
  line-height: 1.05;
}

.selected-learning-note {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 8px;
  margin-top: 12px;
  color: rgba(211, 226, 246, 0.82);
  font-size: 12px;
  line-height: 1.55;
}

.selected-learning-note p {
  margin: 0;
}

.selected-learning-note b {
  margin-right: 8px;
  color: #7deaff;
}

.selected-point-action {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  width: 100%;
  margin-top: 14px;
  justify-content: center;
  border-color: rgba(71, 222, 255, 0.36);
  background: linear-gradient(135deg, rgba(19, 161, 255, 0.38), rgba(17, 224, 180, 0.25));
  color: #ecfeff;
  font-weight: 800;
}

@keyframes pointPanelRefresh {
  0% {
    opacity: 0.55;
    transform: translateY(10px) scale(0.985);
    box-shadow: 0 0 0 rgba(46, 232, 255, 0);
  }
  56% {
    opacity: 1;
    transform: translateY(0) scale(1.01);
    box-shadow: 0 0 44px rgba(46, 232, 255, 0.16);
  }
  100% {
    transform: translateY(0) scale(1);
  }
}

@keyframes refreshSweep {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(120%); }
}

@keyframes meterFill {
  0% { width: 0; }
}

.tone-cyan .summary-icon,
.tone-cyan strong { color: #22d3ee; }
.tone-blue .summary-icon,
.tone-blue strong { color: #76a7ff; }
.tone-amber .summary-icon,
.tone-amber strong { color: #ffb84d; }
.tone-green .summary-icon,
.tone-green strong { color: #11e0b4; }

.tree-panel {
  position: fixed;
  top: 62px;
  bottom: 14px;
  left: 14px;
  width: calc(66.666vw - 21px);
  margin-bottom: 0;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 22px;
  background:
    radial-gradient(circle at 72% 8%, rgba(129, 211, 255, 0.16), transparent 30%),
    radial-gradient(circle at 28% 22%, rgba(35, 228, 213, 0.12), transparent 36%),
    linear-gradient(180deg, rgba(5, 27, 50, 0.72), rgba(1, 8, 18, 0.98));
  box-shadow: 0 26px 90px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.tree-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background:
    radial-gradient(circle at 50% 18%, rgba(148, 233, 255, 0.12), transparent 44%),
    linear-gradient(90deg, rgba(12, 180, 255, 0.08), transparent 18%, transparent 82%, rgba(93, 130, 255, 0.08));
}

.tree-panel-head {
  position: absolute;
  top: 16px;
  right: 18px;
  z-index: 4;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 7px;
  border: 1px solid rgba(154, 206, 255, 0.12);
  border-radius: 999px;
  background: rgba(2, 11, 24, 0.36);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 18px 44px rgba(0, 0, 0, 0.16);
  backdrop-filter: blur(16px) saturate(1.15);
}

.tree-panel-head > div:not(.tree-legend) {
  display: none;
}

.tree-legend {
  display: flex;
  flex-wrap: nowrap;
  justify-content: flex-end;
  gap: 8px;
  color: rgba(213, 229, 248, 0.78);
  font-size: 12px;
}

.tree-legend span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 9px;
  border-radius: 999px;
  border: 1px solid rgba(144, 184, 236, 0.12);
  background: rgba(3, 13, 27, 0.34);
}

.tree-legend i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 14px currentColor;
}

.tree-stage {
  position: relative;
  z-index: 1;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border-radius: 22px;
  border: 0;
  background:
    radial-gradient(circle at 52% 18%, rgba(90, 222, 255, 0.2), transparent 35%),
    radial-gradient(circle at 20% 40%, rgba(40, 180, 146, 0.12), transparent 44%),
    linear-gradient(180deg, rgba(9, 36, 66, 0.94), rgba(2, 10, 20, 0.99));
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.012),
    inset 0 -60px 110px rgba(0, 0, 0, 0.3),
    inset 0 0 70px rgba(34, 211, 238, 0.08);
}

.tree-stage::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(2, 9, 20, 0.02) 0%, transparent 36%, rgba(2, 9, 20, 0.08) 76%, rgba(2, 9, 20, 0.2) 100%),
    radial-gradient(circle at center, transparent 54%, rgba(0, 0, 0, 0.08) 100%);
}

.tree-stage :deep(.three-tree-wrapper) {
  border-radius: 22px;
  background: transparent;
}

.tree-stage :deep(.tree-vignette) {
  z-index: 3;
  background:
    radial-gradient(circle at center, transparent 52%, rgba(1, 7, 16, 0.16) 100%),
    linear-gradient(180deg, rgba(6, 28, 49, 0.03), rgba(1, 7, 16, 0.12));
  opacity: 0.38;
}

.tree-state {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  color: rgba(213, 230, 248, 0.75);
  background: rgba(3, 12, 24, 0.72);
  backdrop-filter: blur(10px);
}

.tree-state.error {
  color: #ff9aaa;
}

.main-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-bottom: 0;
}

.panel:not(.tree-panel) {
  border-radius: 18px;
  padding: 14px;
}

.panel-title,
.topic-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

.panel-title h2,
.topic-head h2 {
  margin: 0;
  font-size: 20px;
  line-height: 1.1;
}

.chart-legend {
  display: flex;
  gap: 18px;
  margin-bottom: 8px;
  color: #b6c7e0;
  font-size: 12px;
}

.chart-legend span {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chart-legend i {
  width: 34px;
  height: 3px;
  border-radius: 999px;
  background: #22d3ee;
}

.chart-legend .dash {
  height: 0;
  border-top: 3px dashed #4f86ff;
  background: transparent;
}

.trend-chart {
  position: relative;
  height: 190px;
  padding-left: 42px;
  padding-bottom: 32px;
}

.trend-chart svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.grid-lines line {
  stroke: rgba(122, 156, 206, 0.12);
}

.target-line {
  stroke: #4e83ff;
  stroke-width: 2;
  stroke-dasharray: 8 10;
}

.trend-line {
  fill: none;
  stroke: #2ee8ff;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.trend-dot {
  fill: #2ee8ff;
  stroke: #dffcff;
  stroke-width: 2;
}

.latest-badge rect {
  fill: rgba(19, 47, 77, 0.96);
  stroke: rgba(46, 232, 255, 0.28);
}

.latest-badge text {
  fill: #eaf8ff;
  font-size: 18px;
  font-weight: 800;
}

.y-axis {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 40px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: #93a8c8;
}

.x-axis {
  position: absolute;
  left: 42px;
  right: 0;
  bottom: 2px;
  display: flex;
  justify-content: space-between;
  color: #a7b9d2;
  font-size: 12px;
}

.trend-tip {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 46px;
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(38, 217, 255, 0.14);
  background: rgba(14, 35, 61, 0.28);
  color: #c4d4eb;
  font-size: 12px;
  backdrop-filter: blur(8px) saturate(1.15);
}

.trend-tip svg,
.trend-tip b {
  color: #11e0b4;
}

.radar-wrap {
  display: grid;
  place-items: center;
  min-height: 170px;
}

.radar-wrap svg {
  width: min(220px, 100%);
  height: auto;
  overflow: visible;
}

.radar-grid polygon,
.radar-grid line {
  fill: none;
  stroke: rgba(128, 165, 220, 0.26);
}

.radar-shape {
  fill: rgba(34, 211, 238, 0.28);
  stroke: #22d3ee;
  stroke-width: 4;
}

.radar-wrap circle {
  fill: #22d3ee;
}

.radar-wrap text {
  fill: #c8d6ec;
  font-size: 14px;
}

.diagnosis-box {
  margin-top: 8px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid rgba(143, 177, 225, 0.15);
  background: rgba(7, 19, 37, 0.28);
  backdrop-filter: blur(8px) saturate(1.15);
}

.diagnosis-box h3 {
  margin: 0 0 8px;
  font-size: 16px;
}

.diagnosis-box p {
  margin: 0;
  color: #b9c7dc;
  line-height: 1.65;
  font-size: 13px;
}

.diagnosis-box button,
.cockpit-footer button,
.topic-row .action-pill,
.state-card button {
  border: 1px solid rgba(70, 160, 255, 0.28);
  border-radius: 10px;
  background: rgba(23, 72, 126, 0.3);
  color: #75bdff;
  cursor: pointer;
}

.diagnosis-box button {
  display: block;
  margin: 14px 0 0 auto;
  padding: 8px 10px;
  font-size: 13px;
}

.distribution-panel,
.topic-panel {
  margin-bottom: 0;
}

.distribution-panel {
  margin-top: 12px;
}

.topic-panel {
  margin-top: 12px;
  min-height: 0;
  overflow: hidden;
}

.distribution-bar {
  display: flex;
  height: 40px;
  overflow: hidden;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.06);
}

.distribution-bar span {
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 14px;
  font-weight: 760;
}

.distribution-bar b {
  font: inherit;
}

.distribution-labels {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
  margin-top: 10px;
  color: #b9c7dc;
  text-align: left;
  font-size: 12px;
}

.topic-head {
  justify-content: space-between;
}

.topic-head span {
  color: #9dafc9;
  font-size: 12px;
}

.topic-table {
  border: 1px solid rgba(143, 177, 225, 0.13);
  border-radius: 14px;
  max-height: 350px;
  overflow: auto;
  background: rgba(3, 12, 25, 0.16);
  backdrop-filter: blur(8px);
}

.topic-row {
  display: grid;
  grid-template-columns: 1fr;
  align-items: center;
  width: 100%;
  gap: 9px;
  min-height: auto;
  padding: 14px;
  border: 0;
  border-bottom: 1px solid rgba(143, 177, 225, 0.12);
  background: rgba(5, 16, 32, 0.22);
  color: #d9e6f7;
  text-align: left;
  font: inherit;
}

button.topic-row {
  cursor: pointer;
}

button.topic-row:hover {
  background: rgba(15, 43, 74, 0.36);
}

.topic-header {
  display: none;
}

.topic-name {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 14px;
}

.topic-name i {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(170, 190, 220, 0.15);
  font-style: normal;
  font-weight: 800;
}

.mastery-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.mastery-cell b {
  position: relative;
  display: block;
  flex: 1;
  width: auto;
  height: 10px;
  border-radius: 999px;
  background: rgba(157, 177, 210, 0.16);
  overflow: hidden;
}

.mastery-cell em {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #22d3ee;
  box-shadow: 0 0 16px rgba(34, 211, 238, 0.32);
}

.risk-pill,
.action-pill {
  justify-self: start;
  padding: 7px 10px;
  border-radius: 9px;
  font-size: 12px;
  font-weight: 700;
}

.risk-pill.高风险 {
  color: #ff7777;
  background: rgba(255, 80, 80, 0.16);
}

.risk-pill.中风险 {
  color: #ffc35b;
  background: rgba(255, 184, 77, 0.16);
}

.risk-pill.低风险 {
  color: #15dfac;
  background: rgba(17, 224, 180, 0.14);
}

.action-pill {
  color: #75bdff;
}

.empty-topics {
  padding: 24px;
  color: #9dafc9;
}

.cockpit-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 28px;
  color: #899bb6;
  font-size: 12px;
}

.cockpit-footer span,
.cockpit-footer button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.cockpit-footer button {
  padding: 8px 10px;
  background: transparent;
}

:global(.global-pet),
:global(.pet-chat-panel) {
  display: none !important;
}

@media (max-width: 980px) {
  .cockpit-shell {
    width: min(100% - 28px, 720px);
    height: auto;
    min-height: 100%;
    margin: 0 auto;
    padding: 28px 0 24px;
    overflow: visible;
  }

  .summary-grid,
  .tree-panel,
  .main-grid,
  .distribution-panel,
  .topic-panel {
    grid-column: 1;
    grid-row: auto;
  }

  .tree-panel {
    position: relative;
    inset: auto;
    width: auto;
    margin-bottom: 20px;
  }

  .cockpit-header,
  .main-grid {
    grid-template-columns: 1fr;
    display: grid;
  }

  .summary-grid {
    grid-template-columns: 1fr 1fr;
  }

  .tree-panel-head {
    display: grid;
  }

  .tree-legend {
    justify-content: flex-start;
  }

  .topic-row {
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 16px;
  }

  .topic-header {
    display: none;
  }
}

@media (max-width: 620px) {
  .summary-grid,
  .distribution-labels {
    grid-template-columns: 1fr;
  }

  .summary-card {
    min-height: 120px;
  }

  .range-select {
    width: 100%;
  }

  .tree-panel {
    padding: 0;
  }

  .tree-stage {
    height: 430px;
  }
}

.reduced-motion * {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
}
</style>
