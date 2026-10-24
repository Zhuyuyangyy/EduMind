import { ref, computed } from 'vue'
import type {
  EvaluationTreeData,
  KnowledgeModule,
  KnowledgePoint,
  KnowledgeUnit,
  CapabilityMetric,
  WeakPointItem,
  TrendPoint,
} from '@/types/knowledge-tree'
import type { EvaluationDashboardMetric, EvaluationDashboardWeakness } from '@/types/api'
import { fetchEvaluation } from '@/lib/api'
import { FALLBACK_DOMAINS } from './useKnowledgeGraphData'
import { classifyEvaluationResponse, isEvaluationDemoEnabled, type EvaluationLoadState } from './evaluationDataPolicy'

function masteryToStatus(mastery: number) {
  if (mastery === 0) return 'none'
  if (mastery < 40) return 'weak'
  if (mastery < 60) return 'beginner'
  if (mastery < 80) return 'basic'
  if (mastery < 95) return 'proficient'
  return 'mastered'
}

function createKnowledgePoint(moduleName: string, unitId: string, unitName: string, topicId: string, topicLabel: string, masteryPct: number, synthetic = false): KnowledgePoint {
  const previous = synthetic ? Math.max(0, Math.min(100, masteryPct + (Math.random() - 0.5) * 16)) : masteryPct
  const confidence = synthetic ? 55 + Math.random() * 40 : 0
  const weight = synthetic ? 0.8 + Math.random() * 1.2 : 1
  const change = masteryPct - previous
  const issues = [
    '基础概念记忆不牢，需要重复练习',
    '复杂场景迁移能力不足',
    '边界条件处理经常出错',
    '理论与实践结合较弱',
    '解题步骤不够规范',
  ]
  const recommendations = [
    '完成 3 道针对性基础练习题',
    '回顾前置知识点后重新评估',
    '观看微课并做概念辨析',
    '参与协作任务加深理解',
    '整理错题本并复盘反思',
  ]
  const point: KnowledgePoint = {
    id: topicId,
    name: topicLabel,
    module: moduleName,
    unit: unitName,
    parentId: unitId,
    mastery: masteryPct,
    previousMastery: previous,
    confidence,
    weight,
    status: masteryToStatus(masteryPct),
    recentChange: change,
    agentEvidence: [],
    evidenceCount: 0,
    prerequisiteIds: [],
    relatedIds: [],
    lastEvaluatedAt: new Date().toISOString(),
    recommendation: synthetic && masteryPct < 60 ? recommendations[Math.floor(Math.random() * recommendations.length)] : undefined,
    issue: synthetic && masteryPct < 60 ? issues[Math.floor(Math.random() * issues.length)] : undefined,
    recentError: synthetic && masteryPct < 70 ? '最近一次练习中出现了理解性错误' : undefined,
    reasonAnalysis: synthetic ? '演示夹具：综合行为证据与任务结果，智能体判断该知识点掌握尚不稳定。' : undefined,
  }
  ;(point as any).knowledgePointId = topicId
  return point
}

function generateMockModules(): KnowledgeModule[] {
  return FALLBACK_DOMAINS.map((domain) => {
    const units: KnowledgeUnit[] = domain.topics.map((topic) => {
      const masteryPct = Math.round(topic.mastery * 100)
      const point = createKnowledgePoint(domain.name, topic.id, topic.label, topic.id, topic.label, masteryPct, true)
      ;(point as any).knowledgePointId = topic.id
      return {
        id: topic.id,
        name: topic.label,
        module: domain.name,
        avgMastery: point.mastery,
        points: [point],
      }
    })
    return {
      id: domain.id,
      name: domain.name,
      color: domain.color,
      agentColor: domain.color,
      avgMastery: units.length > 0 ? units.reduce((s, u) => s + u.avgMastery, 0) / units.length : 0,
      units,
    }
  })
}

const DOMAIN_COLORS = ['#46b5d1', '#5b8def', '#45c486', '#e9a23b', '#7c5cfc', '#e66a6a', '#f59e0b', '#06d6a0']

function buildModulesFromKnowledgePath(pathData: any): KnowledgeModule[] | null {
  const phases = pathData?.phases
  if (!Array.isArray(phases) || phases.length === 0) return null

  return phases.map((phase: any, pi: number) => {
    const moduleId = phase.id || `phase-${pi}`
    const moduleName = phase.name || `阶段 ${pi + 1}`
    const color = phase.color || DOMAIN_COLORS[pi % DOMAIN_COLORS.length]
    const topics: any[] = Array.isArray(phase.topics) ? phase.topics : []

    const units: KnowledgeUnit[] = []
    if (topics.length > 0) {
      // Group topics into logical units of up to 4 items to avoid overly flat trees
      const unitSize = Math.min(4, Math.max(2, Math.ceil(topics.length / 3)))
      for (let i = 0; i < topics.length; i += unitSize) {
        const slice = topics.slice(i, i + unitSize)
        const unitId = `${moduleId}-unit-${Math.floor(i / unitSize)}`
        const unitName = `单元 ${Math.floor(i / unitSize) + 1}`
        const points = slice.map((topic: any, ti: number) => {
          const rawMastery = typeof topic.mastery === 'number' ? topic.mastery : typeof topic.progress === 'number' ? topic.progress / 100 : 0
          const masteryPct = Math.round(rawMastery * 100)
          return createKnowledgePoint(moduleName, unitId, unitName, topic.id || `${unitId}-topic-${ti}`, topic.name || topic.label || `知识点 ${ti + 1}`, masteryPct)
        })
        units.push({
          id: unitId,
          name: unitName,
          module: moduleName,
          avgMastery: points.reduce((s, p) => s + p.mastery, 0) / points.length,
          points,
        })
      }
    }

    return {
      id: moduleId,
      name: moduleName,
      color,
      agentColor: color,
      avgMastery: units.length > 0 ? units.reduce((s, u) => s + u.avgMastery, 0) / units.length : 0,
      units,
    }
  })
}

function generateCapabilities(): CapabilityMetric[] {
  return [
    { key: 'concept', label: '概念理解', value: 72, previousValue: 66 },
    { key: 'analysis', label: '问题分析', value: 58, previousValue: 52 },
    { key: 'tools', label: '工具使用', value: 81, previousValue: 78 },
    { key: 'collab', label: '协作能力', value: 65, previousValue: 60 },
    { key: 'reflection', label: '反思能力', value: 70, previousValue: 64 },
    { key: 'transfer', label: '知识迁移', value: 54, previousValue: 48 },
  ]
}

function generateTrends(): TrendPoint[] {
  return Array.from({ length: 7 }).map((_, i) => ({
    date: `06-${String(12 + i).padStart(2, '0')}`,
    mastery: 55 + i * 3 + Math.random() * 5,
  }))
}

export function createMockData(): EvaluationTreeData {
  const modules = generateMockModules()
  const allPoints = modules.flatMap((m) => m.units.flatMap((u) => u.points))
  const overallMastery = allPoints.reduce((s, p) => s + p.mastery * p.weight, 0) / allPoints.reduce((s, p) => s + p.weight, 0)
  const previousOverallMastery = Math.max(0, overallMastery - 6.2)
  const weakPoints = allPoints
    .filter((p) => p.mastery < 60)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      name: p.name,
      module: p.module,
      mastery: p.mastery,
      confidence: p.confidence,
      issue: p.issue || '掌握度偏低',
      action: p.recommendation || '针对性练习',
    }))
  return {
    learnerName: '学习者 A',
    courseName: '计算机科学基础',
    evaluatedAt: new Date().toLocaleString('zh-CN'),
    status: 'completed',
    dataSource: 'demo-fixture',
    overallMastery,
    previousOverallMastery,
    modules,
    capabilities: generateCapabilities(),
    weakPoints,
    agentContributions: [],
    agentConclusion: '基于当前学习路径的知识掌握情况，建议优先巩固薄弱知识点并完成针对性练习。',
    trends: generateTrends(),
  }
}

export function useEvaluationTreeData() {
  const data = ref<EvaluationTreeData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const status = ref<EvaluationLoadState>('idle')

  const appleDistribution = computed(() => {
    if (!data.value) return []
    const points = data.value.modules.flatMap((m) => m.units.flatMap((u) => u.points))
    return [
      { label: '完全掌握', key: 'mastered', count: points.filter((p) => p.status === 'mastered').length, color: '#e9b949' },
      { label: '熟练掌握', key: 'proficient', count: points.filter((p) => p.status === 'proficient').length, color: '#e66a6a' },
      { label: '基本掌握', key: 'basic', count: points.filter((p) => p.status === 'basic').length, color: '#e9a23b' },
      { label: '初步掌握', key: 'beginner', count: points.filter((p) => p.status === 'beginner').length, color: '#45c486' },
      { label: '掌握较弱', key: 'weak', count: points.filter((p) => p.status === 'weak').length, color: '#46b5d1' },
      { label: '尚未评估', key: 'none', count: points.filter((p) => p.status === 'none').length, color: '#6f8294' },
    ]
  })

  const overallChange = computed(() => {
    if (!data.value) return 0
    return data.value.overallMastery - data.value.previousOverallMastery
  })

  async function load() {
    loading.value = true
    status.value = 'loading'
    error.value = null
    data.value = null
    try {
      const apiData = await fetchEvaluation()
      const state = classifyEvaluationResponse({
        ok: true,
        dataSource: apiData.dataSource,
        simulated: apiData.simulated,
        hasData: Boolean(apiData.dashboard || apiData.stats?.length),
        demoEnabled: isEvaluationDemoEnabled(),
      })
      if (state === 'unavailable') {
        status.value = state
        error.value = apiData.dataSource === 'demo-fixture'
          ? '当前接口只提供演示评估数据；请明确启用演示模式，或先完成真实评估。'
          : '评估服务当前不可用。'
        return
      }
      if (state === 'demo') {
        data.value = createMockData()
        status.value = state
        return
      }
      if (state === 'no-data') {
        status.value = state
        return
      }

      const dashboard = apiData.dashboard
      const capabilities = dashboard?.profileMetrics?.filter((metric: EvaluationDashboardMetric) => metric.key && metric.label).map((metric) => ({
        key: metric.key,
        label: metric.label,
        value: metric.stage2,
        previousValue: metric.stage1,
      })) ?? []
      const weakPoints = dashboard?.weaknesses?.slice(0, 5).map((weakness: EvaluationDashboardWeakness) => ({
        id: weakness.id,
        name: weakness.label,
        module: '综合模块',
        mastery: 0,
        confidence: 0,
        issue: weakness.reason,
        action: weakness.action,
      })) ?? []
      const statSummary = apiData.stats?.map((stat) => `${stat.label}: ${stat.value}`).join('；')
      data.value = {
        learnerName: '当前学习者',
        courseName: '当前课程',
        evaluatedAt: apiData.generatedAt || new Date().toISOString(),
        status: 'completed',
        dataSource: 'real',
        overallMastery: 0,
        previousOverallMastery: 0,
        modules: [],
        capabilities,
        weakPoints,
        agentContributions: [],
        agentConclusion: statSummary ? `当前评估统计：${statSummary}` : '评估已完成，等待更多知识点证据。',
        trends: [],
      }
      status.value = state
    } catch (e) {
      const failure = e as Error & { status?: number; code?: string }
      status.value = classifyEvaluationResponse({ ok: false, status: failure.status, code: failure.code, demoEnabled: isEvaluationDemoEnabled() })
      error.value = failure.status === 503 || failure.code === 'demo-data-disabled'
        ? '评估服务当前不可用，未加载演示成绩。'
        : (failure.message || '评估数据加载失败。')
    } finally {
      loading.value = false
    }
  }

  return { data, loading, error, status, appleDistribution, overallChange, load }
}
