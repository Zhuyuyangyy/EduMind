<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  ArrowRight,
  BrainCircuit,
  Check,
  ChevronRight,
  Clock,
  Database,
  FileText,
  Play,
  RotateCcw,
  ShieldCheck,
  Zap,
} from 'lucide-vue-next'
import MultiAgentReverseUpdateMap from '@/components/evaluation/MultiAgentReverseUpdateMap.vue'
import { saveProfile } from '@/lib/api'
import { useLearningProgressSync, type LearningProgressEvent } from '@/composables/useLearningProgressSync'
import type { ProfileResult } from '@/composables/useProfileSurvey'
import {
  knowledgeMastery,
  loadReverseRun,
  reportExtraDeltas,
  reverseAgents,
  reverseDimensions,
  reverseEngineMeta,
  reverseEvidenceSources,
  reverseHistoryReports,
  reversePathStages,
  reverseRoundMeta,
  reverseRunChecklist,
  reverseStudent,
  reverseSummaryDeltas,
  saveReverseRun,
  type ReverseAgentId,
} from '@/composables/useReverseUpdate'

const route = useRoute()
const {
  progressPoints,
  recentEvents,
  recentFocus,
  recordKnowledgeAction,
} = useLearningProgressSync()

type ViewMode = 'board' | 'panorama'
type RunState = 'idle' | 'running' | 'done'

const viewMode = ref<ViewMode>('board')
const runState = ref<RunState>('idle')
const progress = ref(0)
const newReportTime = ref('')
const focusStep = ref<number | null>(null)
const entryHint = ref('')
const runNotice = ref('')
const writebackState = ref<'idle' | 'written' | 'skipped'>('idle')

let runTimer: number | null = null

const flowSteps = [
  { title: '检查当前学习进度', desc: '获取学习进度与行为数据' },
  { title: '分析掌握 / 薄弱知识点', desc: '识别优势、薄弱与关键成因' },
  { title: '反向评估并更新画像', desc: '生成最新画像与能力评估' },
  { title: '同步到历史画像报告', desc: '写入画像生成模块新版本' },
]

const engineCapabilities = [
  { label: '学习进度识别', desc: '解析学习路径、任务完成度与时间分布' },
  { label: '知识点掌握分析', desc: '评估掌握程度，识别薄弱与知识盲区' },
  { label: '薄弱环节归因', desc: '多维度归因分析，定位失分短板原因' },
  { label: '学习画像更新', desc: '生成最新画像增量，更新多维度模型' },
]

const portraitRoute = { path: '/dialogue', query: { tab: 'portrait-report', from: 'reverse' } }

const isRunning = computed(() => runState.value === 'running')
const isDone = computed(() => runState.value === 'done')
const completedResourceEvents = computed(() => (
  recentEvents.value.filter(event => event.action === 'complete-resource')
))
const hasCompletedResourceEvidence = computed(() => (
  completedResourceEvents.value.length > 0 ||
  progressPoints.value.some(point => point.completedResources.length > 0)
))
const isProfileWritten = computed(() => isDone.value && writebackState.value === 'written')
const latestCompletedResource = computed(() => completedResourceEvents.value[0] ?? null)

const currentStep = computed(() => {
  if (runState.value === 'idle') return 0
  if (runState.value === 'done') return 4
  if (progress.value < 25) return 1
  if (progress.value < 55) return 2
  if (progress.value < 85) return 3
  return 4
})

const engineStateLabel = computed(() => {
  if (isRunning.value) return '运行中'
  if (isDone.value && writebackState.value === 'skipped') return '未回写画像'
  if (isDone.value) return '本轮完成'
  return '待命'
})

const confidence = computed(() => {
  if (progress.value < 55) return 0
  return Math.min(92, Math.round(((progress.value - 55) / 45) * 92))
})

const displayVersion = computed(() => (isProfileWritten.value ? 'V2' : 'V1'))

/** 运行中的任务下标：驱动能力卡与"写入画像报告"箭头的联动点亮 */
const currentTaskIndex = computed(() => {
  if (!isRunning.value) return -1
  return reverseRunChecklist.findIndex(
    task => progress.value >= task.from && progress.value < task.to,
  )
})

const historyList = computed(() => {
  if (!isProfileWritten.value) return reverseHistoryReports
  return [
    { version: 'V2', time: newReportTime.value, note: '学习画像报告' },
    ...reverseHistoryReports,
  ]
})

const dynamicKnowledgeMastery = computed(() => {
  if (!progressPoints.value.length) return knowledgeMastery
  return [...progressPoints.value]
    .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt)
    .slice(0, 5)
    .map((point) => ({
      name: point.label,
      status: point.mastery >= 80 ? 'mastered' as const : point.mastery >= 60 ? 'improve' as const : 'weak' as const,
    }))
})

const optimizeLinks = computed(() => {
  const ids: ReverseAgentId[] = ['path', 'resource', 'tutor']
  const agentLinks = ids.map(id => {
    const agent = reverseAgents[id]
    return {
      key: id as string,
      label: agent.route?.label ?? agent.name,
      note: agent.emit,
      tone: agent.tone,
      to: agent.route ? { path: agent.route.path, query: agent.route.query } : portraitRoute,
    }
  })
  return [
    ...agentLinks,
    { key: 'report', label: '打开画像报告', note: `历史版本 ${displayVersion.value}`, tone: '#8d84d6', to: portraitRoute },
  ]
})

const RING_R = 46
const RING_C = 2 * Math.PI * RING_R
const ringOffset = computed(() => RING_C * (1 - Math.min(100, progress.value) / 100))

function taskStatus(task: { from: number; to: number }) {
  if (isDone.value || progress.value >= task.to) return { state: 'done' as const, pct: 100 }
  if (progress.value >= task.from) {
    return {
      state: 'running' as const,
      pct: Math.round(((progress.value - task.from) / (task.to - task.from)) * 100),
    }
  }
  return { state: 'pending' as const, pct: 0 }
}

function summaryValue(item: { before: number; after: number }) {
  return isProfileWritten.value ? item.after : item.before
}

function summaryRingPct(item: { before: number; after: number; unit: string }) {
  const value = summaryValue(item)
  if (item.unit === 'x') return Math.min(100, Math.round(value * 40))
  return Math.min(100, Math.round(value))
}

/* --- 雷达图 --- */
const RADAR_CENTER = 92
const RADAR_R = 64

function radarPoint(index: number, value: number) {
  const angle = ((-90 + index * 60) * Math.PI) / 180
  const r = (value / 100) * RADAR_R
  return `${(RADAR_CENTER + r * Math.cos(angle)).toFixed(1)},${(RADAR_CENTER + r * Math.sin(angle)).toFixed(1)}`
}

function radarPolygon(key: 'before' | 'after') {
  return reverseDimensions.map((dim, i) => radarPoint(i, dim[key])).join(' ')
}

function radarLabelPos(index: number) {
  const angle = ((-90 + index * 60) * Math.PI) / 180
  const r = RADAR_R + 17
  return {
    x: RADAR_CENTER + r * Math.cos(angle),
    y: RADAR_CENTER + r * Math.sin(angle) + 3,
  }
}

const radarGrid = [0.25, 0.5, 0.75, 1].map(scale =>
  reverseDimensions.map((_, i) => radarPoint(i, scale * 100)).join(' '),
)

/* --- 运行控制 --- */
function clearRunTimer() {
  if (runTimer !== null) {
    window.clearInterval(runTimer)
    runTimer = null
  }
}

function startRun() {
  if (isRunning.value) return
  runState.value = 'running'
  progress.value = 0
  focusStep.value = null
  runNotice.value = ''
  writebackState.value = 'idle'
  clearRunTimer()
  runTimer = window.setInterval(() => {
    progress.value = Math.min(100, progress.value + 0.9 + Math.random() * 1.7)
    if (progress.value >= 100) {
      clearRunTimer()
      completeRun()
    }
  }, 90)
}

function formatProfileDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function resourceEvidenceNames() {
  const names: string[] = []
  for (const event of completedResourceEvents.value) {
    const name = event.resourceTitle || event.label
    if (name) names.push(name)
  }
  for (const point of progressPoints.value) {
    names.push(...point.completedResources)
  }
  return [...new Set(names)].slice(0, 6)
}

function buildReverseProfilePayload(focus: LearningProgressEvent | null): ProfileResult & { source: string } {
  const dimensions = reverseDimensions.map(dim => ({
    label: dim.name,
    value: dim.after,
    color: dim.tone,
  }))
  const totalScore = Math.round(dimensions.reduce((sum, dim) => sum + dim.value, 0) / dimensions.length)
  const strongest = [...dimensions].sort((a, b) => b.value - a.value)[0]
  const weakDims = reverseDimensions
    .filter(dim => dim.weak || dim.after < 65)
    .map(dim => ({ tag: `${dim.name}专项巩固`, count: Math.max(1, Math.round((72 - dim.after) / 8)) }))
  const evidenceNames = resourceEvidenceNames()
  const latestResource = evidenceNames[0] || focus?.resourceTitle || focus?.label || '已完成学习资源'
  const delta = focus ? Math.max(1, focus.after - focus.before) : 6
  const now = new Date()

  return {
    source: 'reverse-evaluation',
    dimensions,
    totalScore,
    stats: [
      { label: '综合评分', value: `${totalScore}`, icon: 'Brain', color: '#5fb5da' },
      { label: '最强维度', value: strongest?.label || '知识掌握', icon: 'Zap', color: '#55b18e' },
      { label: '待提升', value: `${weakDims.length} 项`, icon: 'BarChart3', color: '#d8b36c' },
      { label: '学习阶段', value: '反向更新后', icon: 'BookOpen', color: '#8d84d6' },
    ],
    weaknesses: weakDims.length ? weakDims : [{ tag: `${focus?.label || '当前知识点'}复测巩固`, count: 1 }],
    skillTree: [
      {
        category: '画像能力增量',
        color: '#8d84d6',
        skills: dimensions.slice(0, 3).map(dim => ({ name: dim.label, level: dim.value })),
      },
      {
        category: '已完成资源证据',
        color: '#55b18e',
        skills: evidenceNames.slice(0, 3).map((name, index) => ({
          name,
          level: Math.min(98, (focus?.after ?? 78) + index * 2),
        })),
      },
    ],
    preferences: [
      { label: '画像来源', value: '反向评估' },
      { label: '完成资源', value: `${evidenceNames.length} 项` },
      { label: '最近资源', value: latestResource },
      { label: '回写策略', value: '已完成学习证据驱动' },
    ],
    timeline: [
      {
        date: formatProfileDate(now),
        event: `反向评估完成，已将 ${evidenceNames.length} 项学习资源证据写入画像`,
        score: `+${delta}%`,
        type: 'up',
      },
      {
        date: formatProfileDate(now),
        event: `阶段完成：${latestResource}`,
        score: focus ? `+${focus.after - focus.before}%` : '+6%',
        type: 'up',
      },
    ],
    recommendations: [
      `已完成「${latestResource}」，画像已纳入现阶段完成证据。`,
      '下一轮资源推荐会优先围绕仍低于 65% 的维度安排补弱练习。',
      '建议完成一组阶段测评后再次执行反向评估，验证画像更新是否稳定。',
      '路径与辅导模块已可读取新画像，后续讲解会更偏向已暴露的薄弱知识点。',
    ],
  }
}

async function persistReverseProfileUpdate(focus: LearningProgressEvent | null) {
  const payload = buildReverseProfilePayload(focus)
  await saveProfile(payload)
}

function completeRun() {
  runState.value = 'done'
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  newReportTime.value = `${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  const focus = latestCompletedResource.value
  if (!hasCompletedResourceEvidence.value) {
    writebackState.value = 'skipped'
    runNotice.value = '本轮已完成反向检查，但没有检测到“已学完”的学习资源证据，因此不会生成新画像版本。请先到学习资源中完成并标记资源，再回来一键更新。'
    return
  }

  writebackState.value = 'written'
  runNotice.value = '已检测到学习资源完成记录，本轮反向评估已写入最新学习画像，并同步生成 V2 画像报告。'
  saveReverseRun({ version: 'V2', time: newReportTime.value, savedAt: Date.now() })
  if (focus) {
    recordKnowledgeAction({
      id: focus.pointId,
      label: focus.label,
      domainId: focus.domainId,
      domainName: focus.domainName,
      baseMastery: focus.after,
      masteryDelta: 6,
      action: 'reverse-update',
      source: 'reverse-evaluation',
    })
  }
  persistReverseProfileUpdate(focus).catch((err) => {
    runNotice.value = '本轮画像已在页面内更新，但同步到后端画像存储失败，请稍后重试。'
    console.warn('Failed to persist reverse profile update:', err)
  })
}

function restorePersistedRun() {
  const record = loadReverseRun()
  if (!record) return
  runState.value = 'done'
  writebackState.value = 'written'
  progress.value = 100
  newReportTime.value = record.time
}

const ctaLabel = computed(() => {
  if (isRunning.value) return '反向评估进行中…'
  if (isDone.value && writebackState.value === 'skipped') return '完成资源后重新评估'
  if (isDone.value) return '再次检查学习进度'
  return '一键检查当前学习进度'
})

/* --- 入站深链：老参数映射到新流程步骤 --- */
const agentStepMap: Record<string, number> = {
  eval: 2, reflect: 3, profile: 3, path: 4, resource: 4, tutor: 4,
}
const stageStepMap: Record<string, number> = {
  intake: 1, evaluate: 2, reflect: 3, writeback: 3, fanout: 4,
}
const agentHintMap: Record<string, string> = {
  eval: '从智能评估进入：本轮评估证据将驱动第 2 步的薄弱点分析。',
  reflect: '反思智能体决定回写范围，对应第 3 步"反向评估并更新画像"。',
  profile: '画像回写发生在第 3 步，完成后写入右侧历史画像报告。',
  path: '路径重排属于画像更新后的下游联动，见底部"优化输出"。',
  resource: '资源重配属于画像更新后的下游联动，见底部"优化输出"。',
  tutor: '辅导策略调整属于画像更新后的下游联动，见底部"优化输出"。',
}

function applyInboundQuery() {
  if (route.query.mode === 'panorama') {
    viewMode.value = 'panorama'
    return
  }
  const agent = route.query.agent
  if (typeof agent === 'string' && agentStepMap[agent]) {
    focusStep.value = agentStepMap[agent]
    entryHint.value = agentHintMap[agent] ?? ''
    return
  }
  const stage = route.query.stage
  if (typeof stage === 'string' && stageStepMap[stage]) {
    focusStep.value = stageStepMap[stage]
  }
}

onMounted(() => {
  document.body.classList.add('reverse-evaluation-active')
  restorePersistedRun()
  applyInboundQuery()
})

onBeforeUnmount(() => {
  clearRunTimer()
  document.body.classList.remove('reverse-evaluation-active')
})
</script>

<template>
  <div class="rev-page">
    <div class="rev-bg" aria-hidden="true" />
    <span class="ghost-glyph" aria-hidden="true">逆</span>

    <header class="rev-head reveal" style="--d: 0s">
      <div class="head-copy">
        <span class="head-kicker"><i />REVERSE UPDATE · {{ reverseRoundMeta.version }}</span>
        <h1>学习画像反向更新</h1>
        <p>基于当前学习进度与已掌握知识点，系统进行反向评估，更新学习画像，并同步写入画像生成模块的历史画像报告。</p>
      </div>

      <div class="head-cta">
        <button
          type="button"
          class="cta-btn"
          :class="{ running: isRunning, done: isDone }"
          :disabled="isRunning"
          @click="startRun"
        >
          <span class="cta-inner">
            <span class="cta-pulse" aria-hidden="true" />
            <Zap v-if="!isDone" :size="17" stroke-width="2.2" />
            <RotateCcw v-else :size="16" stroke-width="2.2" />
            {{ ctaLabel }}
          </span>
        </button>
        <small>点击后自动执行反向评估并更新画像</small>
      </div>

      <div class="head-side">
        <nav class="crumbs" aria-label="当前位置">
          <span>当前位置：</span>
          <b>反向更新</b>
          <ChevronRight :size="12" stroke-width="2" />
          <RouterLink :to="portraitRoute">画像生成</RouterLink>
          <ChevronRight :size="12" stroke-width="2" />
          <RouterLink :to="portraitRoute">历史画像报告</RouterLink>
        </nav>
        <div class="mode-switch" role="tablist" aria-label="视图模式">
          <button type="button" role="tab" :aria-selected="viewMode === 'board'" :class="{ active: viewMode === 'board' }" @click="viewMode = 'board'">工作台</button>
          <button type="button" role="tab" :aria-selected="viewMode === 'panorama'" :class="{ active: viewMode === 'panorama' }" @click="viewMode = 'panorama'">全景推演</button>
        </div>
      </div>
    </header>

    <template v-if="viewMode === 'board'">
      <p v-if="entryHint" class="entry-hint reveal" style="--d: 0.05s">
        <ShieldCheck :size="14" stroke-width="2" />
        {{ entryHint }}
      </p>
      <p v-if="runNotice" class="entry-hint writeback-notice reveal" :class="writebackState" style="--d: 0.06s">
        <ShieldCheck :size="14" stroke-width="2" />
        {{ runNotice }}
      </p>

      <ol class="flow-steps reveal" style="--d: 0.08s" aria-label="反向更新流程">
        <li
          v-for="(step, index) in flowSteps"
          :key="step.title"
          :class="{
            active: currentStep === index + 1 && isRunning,
            done: currentStep > index + 1 || isDone,
            focused: focusStep === index + 1,
          }"
        >
          <span class="node">
            <Check v-if="currentStep > index + 1 || isDone" :size="13" stroke-width="3" />
            <b v-else>{{ index + 1 }}</b>
          </span>
          <div class="node-copy">
            <strong>{{ step.title }}</strong>
            <small>{{ step.desc }}</small>
          </div>
        </li>
      </ol>

      <div class="rev-grid">
        <!-- 左：当前学习状态 -->
        <section class="panel panel-breathe state-panel reveal" style="--d: 0.14s" aria-label="当前学习状态">
          <header class="panel-head">
            <h2><i class="accent" />当前学习状态</h2>
            <small><Clock :size="11" stroke-width="2" /> 数据更新：刚刚</small>
          </header>

          <div class="student-chip">
            <span class="avatar">{{ reverseStudent.name.slice(0, 1) }}</span>
            <div>
              <strong>{{ reverseStudent.name }}</strong>
              <small>{{ reverseStudent.grade }}</small>
            </div>
            <em>{{ reverseStudent.level }}</em>
          </div>

          <div class="stat-grid">
            <div v-for="stat in reverseStudent.stats" :key="stat.label">
              <strong>{{ stat.value }}</strong>
              <small>{{ stat.label }}</small>
              <i v-if="stat.bar" class="stat-bar"><em :style="{ width: `${stat.bar}%` }" /></i>
            </div>
          </div>

          <div class="mastery-block">
            <header>
              <h3>知识点掌握地图</h3>
              <RouterLink :to="{ path: '/evaluation' }">查看全部 <ChevronRight :size="11" stroke-width="2" /></RouterLink>
            </header>
            <div class="mastery-body">
              <ul class="mastery-list">
                <li v-for="point in dynamicKnowledgeMastery" :key="point.name">
                  <span>{{ point.name }}</span>
                  <em :class="point.status">
                    {{ point.status === 'mastered' ? '已掌握' : point.status === 'improve' ? '待提升' : '薄弱' }}
                  </em>
                </li>
              </ul>
              <figure class="radar-figure">
                <svg viewBox="0 0 184 184" aria-label="能力雷达图">
                  <polygon v-for="grid in radarGrid" :key="grid" :points="grid" class="radar-grid" />
                  <line
                    v-for="(dim, i) in reverseDimensions"
                    :key="`axis-${dim.name}`"
                    :x1="RADAR_CENTER"
                    :y1="RADAR_CENTER"
                    :x2="radarPoint(i, 100).split(',')[0]"
                    :y2="radarPoint(i, 100).split(',')[1]"
                    class="radar-axis"
                  />
                  <polygon :points="radarPolygon('before')" class="radar-before" />
                  <polygon v-if="isProfileWritten" :points="radarPolygon('after')" class="radar-after" />
                  <text
                    v-for="(dim, i) in reverseDimensions"
                    :key="`label-${dim.name}`"
                    :x="radarLabelPos(i).x"
                    :y="radarLabelPos(i).y"
                    text-anchor="middle"
                  >
                    {{ dim.name }}
                  </text>
                </svg>
                <figcaption>
                  <span><i class="dot before" />更新前</span>
                  <span :class="{ dim: !isProfileWritten }"><i class="dot after" />更新后</span>
                </figcaption>
              </figure>
            </div>
          </div>

          <div class="path-progress">
            <header>
              <h3>学习路径进度</h3>
              <RouterLink :to="{ path: '/learning-path' }">68% <ChevronRight :size="11" stroke-width="2" /></RouterLink>
            </header>
            <div class="path-track" aria-hidden="true"><i /></div>
            <ol>
              <li v-for="stage in reversePathStages" :key="stage.name" :class="stage.state">
                <i class="stage-dot" />
                <span>{{ stage.name }}</span>
                <small>{{ stage.state === 'done' ? '已完成' : stage.state === 'running' ? '进行中' : '待解锁' }}</small>
              </li>
            </ol>
          </div>
        </section>

        <!-- 中：反向评估引擎 -->
        <section class="panel panel-breathe engine-panel reveal" style="--d: 0.2s" :class="runState" aria-label="反向评估引擎" aria-live="polite">
          <header class="panel-head">
            <h2><i class="accent" />反向评估引擎</h2>
            <em class="engine-state" :class="[runState, writebackState]">{{ engineStateLabel }}</em>
          </header>

          <div class="intake-strip" :class="{ live: isRunning }" aria-label="证据汇入">
            <span class="intake-label">证据汇入</span>
            <em
              v-for="source in reverseEvidenceSources"
              :key="source.label"
              :style="{ '--tone': source.tone }"
            >
              <i />{{ source.label }}<b>{{ source.count }}</b>
            </em>
            <small>多源数据持续汇聚</small>
          </div>

          <div class="engine-stage">
            <i class="crosshair-x" aria-hidden="true" /><i class="crosshair-y" aria-hidden="true" />
            <div class="capability tl" :class="{ live: currentTaskIndex === 0 }">
              <strong>{{ engineCapabilities[0].label }}</strong>
              <small>{{ engineCapabilities[0].desc }}</small>
            </div>
            <div class="capability tr" :class="{ live: currentTaskIndex === 1 }">
              <strong>{{ engineCapabilities[1].label }}</strong>
              <small>{{ engineCapabilities[1].desc }}</small>
            </div>

            <i class="engine-dais d1" aria-hidden="true" />
            <i class="engine-dais d2" aria-hidden="true" />
            <div class="engine-core" :class="{ spinning: isRunning }">
              <svg class="core-arc" viewBox="0 0 200 200" aria-hidden="true">
                <defs>
                  <linearGradient id="rev-arc" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#5fb5da" />
                    <stop offset="55%" stop-color="#8d84d6" />
                    <stop offset="100%" stop-color="#5fb5da" stop-opacity="0.1" />
                  </linearGradient>
                </defs>
                <circle cx="100" cy="100" r="92" class="arc-faint" />
                <circle cx="100" cy="100" r="78" class="arc-dash" />
                <circle cx="100" cy="100" r="92" class="arc-main" stroke="url(#rev-arc)" />
              </svg>
              <span class="orbit" aria-hidden="true"><i /></span>
              <span class="core-glow" />
              <BrainCircuit :size="44" stroke-width="1.3" class="core-icon" />
              <b>AI 反向评估引擎</b>
            </div>

            <div class="capability bl" :class="{ live: currentTaskIndex === 2 }">
              <strong>{{ engineCapabilities[2].label }}</strong>
              <small>{{ engineCapabilities[2].desc }}</small>
            </div>
            <div class="capability br" :class="{ live: currentTaskIndex === 3 }">
              <strong>{{ engineCapabilities[3].label }}</strong>
              <small>{{ engineCapabilities[3].desc }}</small>
            </div>

            <div class="writeback-arrow" :class="{ on: isProfileWritten || currentTaskIndex === 4 }">
              <span>写入画像报告</span>
              <ArrowRight :size="15" stroke-width="2.4" />
            </div>
          </div>

          <div class="engine-console">
            <div class="progress-ring" role="img" :aria-label="`总进度 ${Math.round(progress)}%`">
              <svg viewBox="0 0 110 110">
                <circle cx="55" cy="55" :r="RING_R" class="ring-track" />
                <circle
                  cx="55" cy="55" :r="RING_R"
                  class="ring-value"
                  :stroke-dasharray="RING_C"
                  :stroke-dashoffset="ringOffset"
                />
              </svg>
              <div class="ring-text">
                <strong>{{ Math.round(progress) }}<i>%</i></strong>
                <small>{{ isRunning ? '评估中…' : isDone ? '已完成' : '待启动' }}</small>
              </div>
            </div>

            <ul class="task-list">
              <li v-for="task in reverseRunChecklist" :key="task.label" :class="taskStatus(task).state">
                <i>
                  <Check v-if="taskStatus(task).state === 'done'" :size="11" stroke-width="3" />
                </i>
                <span>{{ task.label }}</span>
                <b v-if="taskStatus(task).state === 'done'">完成</b>
                <b v-else-if="taskStatus(task).state === 'running'">{{ taskStatus(task).pct }}%</b>
                <b v-else class="wait">等待</b>
              </li>
            </ul>
          </div>

          <div class="confidence-row">
            <span>评估置信度</span>
            <div class="confidence-bar"><i :style="{ width: `${confidence}%` }" /></div>
            <strong :class="{ show: confidence > 0 }">{{ confidence > 0 ? `高 ${confidence}%` : '—' }}</strong>
          </div>
        </section>

        <!-- 右：画像生成 / 历史画像报告 -->
        <section class="panel panel-breathe report-panel reveal" style="--d: 0.26s" aria-label="画像生成与历史画像报告">
          <header class="panel-head">
            <h2><i class="accent violet" />画像生成 / 历史画像报告</h2>
            <RouterLink class="head-link" :to="portraitRoute">进入画像生成 <ChevronRight :size="12" stroke-width="2" /></RouterLink>
          </header>

          <div class="history-block">
            <h3>历史记录</h3>
            <ul class="history-list">
              <li
                v-for="(item, index) in historyList"
                :key="`${item.version}-${item.time}`"
                :class="{ latest: index === 0 && isProfileWritten, fresh: index === 0 && isProfileWritten }"
              >
                <i class="node" />
                <div>
                  <strong>{{ item.time }}</strong>
                  <small>{{ item.note }}（{{ item.version }}）</small>
                </div>
                <em v-if="index === 0 && isProfileWritten">新版本</em>
              </li>
            </ul>
          </div>

          <article class="latest-report" :class="{ updated: isProfileWritten }">
            <header>
              <FileText :size="15" stroke-width="1.8" />
              <strong>最新画像报告（{{ displayVersion }}）</strong>
              <em v-if="isProfileWritten">新版本</em>
              <em v-else class="wait">待更新</em>
            </header>
            <div class="report-rows">
              <div class="row-head">
                <span />
                <small>更新前</small>
                <small>更新后</small>
              </div>
              <div v-for="dim in reverseDimensions" :key="dim.name" class="report-row">
                <span>{{ dim.name }}</span>
                <small>{{ dim.before }}%</small>
                <strong :class="{ pending: !isProfileWritten }">{{ isProfileWritten ? `${dim.after}%` : '—' }}</strong>
                <b v-if="isProfileWritten" class="up">↑{{ dim.after - dim.before }}</b>
              </div>
              <div v-for="row in reportExtraDeltas" :key="row.label" class="report-row">
                <span>{{ row.label }}</span>
                <small>{{ row.before }}</small>
                <strong :class="{ pending: !isProfileWritten }">{{ isProfileWritten ? row.after : '—' }}</strong>
                <b v-if="isProfileWritten" class="up">↑</b>
              </div>
            </div>
            <p class="report-note">
              {{ isProfileWritten ? '本次更新基于最新学习数据与反向评估结果，已同步至画像生成模块。' : writebackState === 'skipped' ? '本轮缺少已学完资源证据，画像保持旧版本；完成学习资源后再执行即可生成新报告。' : '点击顶部按钮执行反向评估后，此处将生成新版本报告。' }}
            </p>
            <RouterLink class="report-cta" :to="portraitRoute">
              查看全部报告
              <ArrowRight :size="14" stroke-width="2.2" />
            </RouterLink>
          </article>
        </section>
      </div>

      <!-- 本次画像更新结果 -->
      <section class="summary-section reveal" style="--d: 0.32s" :class="{ on: isProfileWritten }" aria-label="本次画像更新结果">
        <header>
          <h2><i class="accent" />本次画像更新结果</h2>
          <small>{{ isProfileWritten ? '更新前后对比' : writebackState === 'skipped' ? '暂无可回写的学习资源完成证据' : '执行反向评估后展示更新前后对比' }}</small>
        </header>
        <div class="summary-grid">
          <article
            v-for="(item, i) in reverseSummaryDeltas"
            :key="item.label"
            :style="{ '--tone': item.tone, '--i': i }"
          >
            <span class="sum-label">{{ item.label }}</span>
            <div class="sum-body">
              <div class="sum-before">
                <strong>{{ item.before }}<i>{{ item.unit }}</i></strong>
                <small>更新前</small>
              </div>
              <ArrowRight :size="15" stroke-width="2.2" class="sum-arrow" />
              <div class="sum-ring" :style="{ '--val': `${summaryRingPct(item)}%` }">
                <strong>{{ summaryValue(item) }}<i>{{ item.unit }}</i></strong>
                <small>{{ isProfileWritten ? '更新后' : '待更新' }}</small>
              </div>
            </div>
            <b class="sum-delta" :class="{ show: isProfileWritten }">↑ {{ (item.after - item.before).toFixed(item.unit === 'x' ? 1 : 0) }}{{ item.unit }}</b>
          </article>
        </div>
      </section>

      <!-- 优化输出：跨页联动 -->
      <section class="optimize-section reveal" style="--d: 0.38s" aria-label="优化输出">
        <header>
          <h2><i class="accent violet" />优化输出</h2>
          <small>画像更新后同步驱动下游模块</small>
        </header>
        <div class="optimize-grid">
          <RouterLink
            v-for="(link, i) in optimizeLinks"
            :key="link.key"
            :to="link.to"
            class="optimize-card"
            :class="{ pending: !isProfileWritten }"
            :style="{ '--tone': link.tone, '--i': i }"
          >
            <i class="opt-dot" />
            <div>
              <strong>{{ link.label }}</strong>
              <small>{{ link.note }}</small>
            </div>
            <ArrowRight :size="14" stroke-width="2" />
          </RouterLink>
        </div>
      </section>

      <footer class="meta-strip reveal" style="--d: 0.44s">
        <span><Clock :size="12" stroke-width="2" /> 最近一次反向更新：{{ isProfileWritten ? newReportTime : reverseEngineMeta.lastRun }}</span>
        <span><Database :size="12" stroke-width="2" /> 数据来源：{{ reverseEngineMeta.dataSource }}</span>
        <span><Zap :size="12" stroke-width="2" /> 评估引擎：{{ reverseEngineMeta.engine }}</span>
        <span class="sync" :class="{ on: isProfileWritten }">
          <Check :size="12" stroke-width="2.6" />
          {{ isProfileWritten ? `已写入画像历史报告（V2）` : writebackState === 'skipped' ? '无资源完成证据，未写入画像' : '待同步' }}
        </span>
        <span><Play :size="12" stroke-width="2" /> 下次建议更新：{{ reverseEngineMeta.nextSuggested }}</span>
      </footer>
    </template>

    <section v-else class="panorama-shell">
      <MultiAgentReverseUpdateMap />
    </section>
  </div>
</template>

<style scoped>
.rev-page {
  --hairline: rgba(210, 224, 240, 0.13);
  --ink-1: #f2f0e9;
  --ink-2: #b3bfce;
  --ink-3: #7a89a0;
  --cyan: #5fb5da;
  --violet: #8d84d6;
  --ok: #55b18e;
  position: relative;
  z-index: 1;
  min-height: calc(100vh - var(--header-height));
  padding: 30px clamp(16px, 3vw, 48px) 48px;
  overflow: hidden;
  color: var(--ink-1);
  font-family: 'Noto Sans SC', var(--font-body), system-ui, sans-serif;
  background:
    radial-gradient(1100px 480px at 14% -6%, rgba(111, 179, 216, 0.06), transparent 60%),
    radial-gradient(900px 520px at 92% 8%, rgba(141, 132, 214, 0.08), transparent 62%),
    linear-gradient(180deg, rgba(7, 11, 22, 0.5), rgba(7, 12, 24, 0.32));
}

.rev-bg {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(95, 181, 218, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(95, 181, 218, 0.04) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(circle at 50% 22%, #000 0, transparent 76%);
}

.ghost-glyph {
  position: absolute;
  top: -46px;
  right: clamp(8px, 6vw, 120px);
  z-index: -1;
  color: transparent;
  font-family: 'Noto Serif SC', serif;
  font-size: clamp(200px, 24vw, 340px);
  font-weight: 900;
  line-height: 1;
  pointer-events: none;
  user-select: none;
  -webkit-text-stroke: 1px rgba(141, 132, 214, 0.14);
  mask-image: linear-gradient(200deg, #000 22%, transparent 78%);
}

/* 入场级联 + 呼吸辉光 */
.reveal {
  animation: rise-in 0.7s cubic-bezier(0.22, 0.9, 0.24, 1) both;
  animation-delay: var(--d, 0s);
}

.panel.reveal,
.flow-steps.reveal,
.meta-strip.reveal {
  animation:
    rise-in 0.7s cubic-bezier(0.22, 0.9, 0.24, 1) var(--d, 0s) both,
    panel-breathe 5.4s ease-in-out calc(var(--d, 0s) + 1.5s) infinite;
}

.summary-grid article,
.optimize-card {
  animation: panel-breathe 5.4s ease-in-out calc(var(--i, 0) * 0.7s + 1.8s) infinite;
}

@keyframes panel-breathe {
  0%, 100% {
    border-color: var(--hairline);
    box-shadow: 0 0 0 rgba(95, 181, 218, 0);
  }
  50% {
    border-color: rgba(95, 181, 218, 0.34);
    box-shadow: 0 0 22px rgba(95, 181, 218, 0.09), inset 0 0 14px rgba(95, 181, 218, 0.03);
  }
}

@keyframes rise-in {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .reveal,
  .panel.reveal,
  .flow-steps.reveal,
  .meta-strip.reveal,
  .summary-grid article,
  .optimize-card,
  .engine-dais {
    animation: none !important;
  }
}

/* ============ 顶部 ============ */
.rev-head {
  display: grid;
  grid-template-columns: minmax(300px, 1fr) auto minmax(260px, auto);
  gap: 22px;
  align-items: center;
  margin-bottom: 22px;
}

.head-kicker {
  display: inline-flex;
  gap: 10px;
  align-items: center;
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.22em;
}

.head-kicker i {
  width: 26px;
  height: 1px;
  background: linear-gradient(90deg, var(--cyan), transparent);
}

.head-copy h1 {
  margin: 8px 0 6px;
  font-family: 'Noto Serif SC', 'Noto Sans SC', serif;
  font-size: clamp(27px, 2.6vw, 38px);
  font-weight: 700;
  line-height: 1.1;
  background: linear-gradient(115deg, #fff 30%, #9fd4f0 60%, #b39cf5 90%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.head-copy p {
  max-width: 480px;
  margin: 0;
  color: var(--ink-2);
  font-size: 13px;
  line-height: 1.75;
}

.head-cta {
  display: grid;
  gap: 8px;
  justify-items: center;
}

/* 渐变描边 CTA */
.cta-btn {
  position: relative;
  padding: 1.5px;
  overflow: hidden;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(110deg, #5fb5da, #6f9dd8 45%, #8d84d6 80%, #5fb5da);
  background-size: 220% 100%;
  cursor: pointer;
  box-shadow: 0 0 36px rgba(111, 157, 216, 0.35), 0 4px 22px rgba(0, 0, 0, 0.4);
  transition: box-shadow 0.25s ease, transform 0.2s ease;
  animation: cta-hue 5s linear infinite;
}

@keyframes cta-hue {
  to { background-position: 220% 0; }
}

.cta-btn:hover:not(:disabled),
.cta-btn:focus-visible {
  box-shadow: 0 0 52px rgba(95, 181, 218, 0.5), 0 4px 24px rgba(0, 0, 0, 0.45);
  outline: none;
  transform: translateY(-1px);
}

.cta-btn:disabled {
  cursor: wait;
}

.cta-inner {
  position: relative;
  display: inline-flex;
  gap: 10px;
  align-items: center;
  min-height: 50px;
  padding: 0 34px;
  overflow: hidden;
  border-radius: inherit;
  background: linear-gradient(180deg, rgba(14, 24, 46, 0.92), rgba(8, 13, 28, 0.96));
  color: #eef8ff;
  font-size: 15.5px;
  font-weight: 900;
  letter-spacing: 0.02em;
}

.cta-pulse {
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, transparent 32%, rgba(163, 230, 255, 0.2) 50%, transparent 68%);
  transform: translateX(-100%);
  animation: cta-sweep 2.8s ease-in-out infinite;
  pointer-events: none;
}

.cta-btn.running .cta-pulse {
  animation-duration: 1s;
}

@keyframes cta-sweep {
  0% { transform: translateX(-100%); }
  55%, 100% { transform: translateX(100%); }
}

.head-cta small {
  color: var(--ink-3);
  font-size: 11px;
  letter-spacing: 0.04em;
}

.head-side {
  display: grid;
  gap: 10px;
  justify-items: end;
}

.crumbs {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
  color: var(--ink-3);
  font-size: 11.5px;
}

.crumbs b {
  color: var(--ink-1);
  font-weight: 800;
}

.crumbs a {
  color: var(--cyan);
  text-decoration: none;
}

.crumbs a:hover {
  text-decoration: underline;
}

.mode-switch {
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--hairline);
  border-radius: 999px;
  background: rgba(6, 10, 22, 0.66);
}

.mode-switch button {
  padding: 6px 15px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ink-3);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: color 0.2s ease, background 0.2s ease;
}

.mode-switch button.active {
  background: linear-gradient(135deg, rgba(95, 181, 218, 0.2), rgba(141, 132, 214, 0.2));
  color: #fff;
}

.entry-hint {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 0 0 14px;
  padding: 9px 14px;
  border: 1px solid rgba(95, 181, 218, 0.26);
  border-radius: 6px;
  background: rgba(95, 181, 218, 0.06);
  color: #9fdcf0;
  font-size: 12.5px;
}

.entry-hint.writeback-notice {
  margin-top: -6px;
}

.entry-hint.writeback-notice.written {
  border-color: rgba(85, 177, 142, 0.34);
  background: rgba(85, 177, 142, 0.08);
  color: #aee8d3;
}

.entry-hint.writeback-notice.skipped {
  border-color: rgba(216, 179, 108, 0.4);
  background: rgba(216, 179, 108, 0.08);
  color: #ead4a8;
}

/* ============ 流程导轨 ============ */
.flow-steps {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin: 0 0 18px;
  padding: 16px 18px 14px;
  border: 1px solid var(--hairline);
  border-radius: 16px;
  background: rgba(7, 12, 26, 0.5);
  list-style: none;
}

.flow-steps::before {
  position: absolute;
  top: 33px;
  right: 9%;
  left: 9%;
  height: 1.5px;
  background: linear-gradient(90deg, rgba(95, 181, 218, 0.3), rgba(141, 132, 214, 0.35), rgba(95, 181, 218, 0.3));
  content: '';
  opacity: 0.5;
}

.flow-steps li {
  position: relative;
  display: grid;
  gap: 9px;
  justify-items: center;
  text-align: center;
  transition: transform 0.3s ease;
}

.flow-steps .node {
  position: relative;
  z-index: 1;
  display: grid;
  place-content: center;
  width: 34px;
  height: 34px;
  border: 1.5px solid rgba(148, 196, 232, 0.35);
  border-radius: 10px;
  background: #0a1120;
  color: var(--ink-3);
  transform: rotate(45deg);
  transition: border-color 0.3s ease, background 0.3s ease, box-shadow 0.3s ease, color 0.3s ease;
}

.flow-steps .node > * {
  transform: rotate(-45deg);
}

.flow-steps .node b {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 900;
}

.flow-steps li.active .node {
  border-color: var(--cyan);
  color: #04121c;
  background: var(--cyan);
  box-shadow: 0 0 22px rgba(95, 181, 218, 0.65);
  animation: node-pop 0.9s ease-in-out infinite alternate;
}

@keyframes node-pop {
  from { transform: rotate(45deg) scale(1); }
  to { transform: rotate(45deg) scale(1.1); }
}

.flow-steps li.done .node {
  border-color: rgba(85, 177, 142, 0.6);
  background: rgba(85, 177, 142, 0.14);
  color: var(--ok);
}

.flow-steps li.focused .node {
  border-color: var(--violet);
  box-shadow: 0 0 20px rgba(141, 132, 214, 0.5);
}

.node-copy strong {
  display: block;
  color: var(--ink-2);
  font-size: 13px;
  font-weight: 800;
  transition: color 0.3s ease;
}

.flow-steps li.active .node-copy strong,
.flow-steps li.done .node-copy strong {
  color: #fff;
}

.node-copy small {
  display: block;
  margin-top: 2px;
  color: var(--ink-3);
  font-size: 10.5px;
}

/* ============ 面板（蓝图角标卡片） ============ */
.rev-grid {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr) 318px;
  gap: 14px;
  align-items: stretch;
}

.state-panel {
  display: flex;
  flex-direction: column;
}

.panel {
  position: relative;
  padding: 18px;
  border: 1px solid var(--hairline);
  border-radius: 4px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 18%),
    rgba(7, 12, 26, 0.52);
  backdrop-filter: blur(8px);
}

.panel::before {
  position: absolute;
  inset: -1px;
  pointer-events: none;
  background:
    linear-gradient(var(--cyan), var(--cyan)) left 0 top 0 / 16px 1.5px,
    linear-gradient(var(--cyan), var(--cyan)) left 0 top 0 / 1.5px 16px,
    linear-gradient(var(--cyan), var(--cyan)) right 0 top 0 / 16px 1.5px,
    linear-gradient(var(--cyan), var(--cyan)) right 0 top 0 / 1.5px 16px,
    linear-gradient(var(--cyan), var(--cyan)) left 0 bottom 0 / 16px 1.5px,
    linear-gradient(var(--cyan), var(--cyan)) left 0 bottom 0 / 1.5px 16px,
    linear-gradient(var(--cyan), var(--cyan)) right 0 bottom 0 / 16px 1.5px,
    linear-gradient(var(--cyan), var(--cyan)) right 0 bottom 0 / 1.5px 16px;
  background-repeat: no-repeat;
  content: '';
  opacity: 0.4;
  transition: opacity 0.3s ease;
}

.panel:hover::before {
  opacity: 0.85;
}

.report-panel::before {
  filter: hue-rotate(60deg);
}

.panel-head {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.panel-head h2,
.summary-section h2,
.optimize-section h2 {
  display: inline-flex;
  gap: 9px;
  align-items: center;
  margin: 0;
  color: #fff;
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 0.02em;
}

.accent {
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--cyan), transparent);
  box-shadow: 0 0 8px rgba(95, 181, 218, 0.6);
}

.accent.violet {
  background: linear-gradient(180deg, var(--violet), transparent);
  box-shadow: 0 0 8px rgba(141, 132, 214, 0.6);
}

.panel-head small {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  color: var(--ink-3);
  font-size: 10.5px;
}

.head-link {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  color: var(--cyan);
  font-size: 11.5px;
  font-weight: 800;
  text-decoration: none;
  white-space: nowrap;
}

.head-link:hover {
  text-decoration: underline;
}

/* --- 左栏 --- */
.student-chip {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 11px;
  align-items: center;
  padding: 11px 13px;
  border: 1px solid var(--hairline);
  border-radius: 6px;
  background: linear-gradient(120deg, rgba(95, 181, 218, 0.06), rgba(141, 132, 214, 0.05));
}

.student-chip .avatar {
  display: grid;
  place-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(95, 181, 218, 0.5);
  border-radius: 50%;
  background: radial-gradient(circle at 34% 30%, rgba(95, 181, 218, 0.36), rgba(141, 132, 214, 0.24));
  color: #fff;
  font-size: 16px;
  font-weight: 900;
}

.student-chip strong {
  display: block;
  color: #fff;
  font-size: 14px;
}

.student-chip small {
  color: var(--ink-3);
  font-size: 11px;
}

.student-chip em {
  padding: 3px 9px;
  border: 1px solid rgba(216, 179, 108, 0.4);
  border-radius: 999px;
  background: rgba(216, 179, 108, 0.08);
  color: #d8b36c;
  font-family: var(--font-mono);
  font-size: 10px;
  font-style: normal;
  font-weight: 800;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.stat-grid > div {
  padding: 9px 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
  transition: border-color 0.2s ease, background 0.2s ease;
}

.stat-grid > div:hover {
  border-color: rgba(95, 181, 218, 0.3);
  background: rgba(95, 181, 218, 0.04);
}

.stat-grid strong {
  color: #fff;
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 800;
}

.stat-grid small {
  display: block;
  margin-top: 2px;
  color: var(--ink-3);
  font-size: 10px;
}

.stat-bar {
  display: block;
  height: 4px;
  margin-top: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.07);
}

.stat-bar em {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--cyan), var(--violet));
  box-shadow: 0 0 8px rgba(95, 181, 218, 0.5);
}

.mastery-block {
  margin-top: 14px;
}

.mastery-block > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 9px;
}

.mastery-block h3 {
  margin: 0;
  color: var(--ink-2);
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.mastery-block header a {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--ink-3);
  font-size: 11px;
  text-decoration: none;
  transition: color 0.2s ease;
}

.mastery-block header a:hover {
  color: var(--cyan);
}

.mastery-body {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.mastery-body .radar-figure {
  justify-self: center;
}

.mastery-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.mastery-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  padding: 6px 9px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.015);
  color: #c6d4e8;
  font-size: 11.5px;
}

.mastery-list li > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mastery-list em {
  flex: none;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 9.5px;
  font-style: normal;
  font-weight: 800;
}

.mastery-list em.mastered {
  background: rgba(85, 177, 142, 0.13);
  color: var(--ok);
}

.mastery-list em.improve {
  background: rgba(216, 179, 108, 0.13);
  color: #d8b36c;
}

.mastery-list em.weak {
  background: rgba(217, 138, 164, 0.15);
  color: #d98aa4;
}

.radar-figure {
  margin: 0;
  text-align: center;
}

.radar-figure svg {
  width: 138px;
  height: 138px;
}

.radar-grid {
  fill: none;
  stroke: rgba(148, 196, 232, 0.14);
  stroke-width: 1;
}

.radar-axis {
  stroke: rgba(148, 196, 232, 0.1);
  stroke-width: 1;
}

.radar-before {
  fill: rgba(148, 196, 232, 0.12);
  stroke: rgba(148, 178, 214, 0.55);
  stroke-width: 1.2;
}

.radar-after {
  fill: rgba(95, 181, 218, 0.18);
  stroke: var(--cyan);
  stroke-width: 1.6;
  filter: drop-shadow(0 0 8px rgba(95, 181, 218, 0.5));
  animation: radar-in 0.9s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes radar-in {
  from { opacity: 0; transform: scale(0.7); transform-origin: 92px 92px; }
  to { opacity: 1; transform: scale(1); }
}

.radar-figure text {
  fill: var(--ink-3);
  font-size: 9px;
}

.radar-figure figcaption {
  display: flex;
  gap: 10px;
  justify-content: center;
  color: var(--ink-3);
  font-size: 10px;
}

.radar-figure figcaption .dim {
  opacity: 0.4;
}

.radar-figure .dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 4px;
  border-radius: 50%;
}

.radar-figure .dot.before {
  background: rgba(148, 178, 214, 0.7);
}

.radar-figure .dot.after {
  background: var(--cyan);
}

/* 学习路径进度（左栏底部） */
.path-progress {
  margin-top: auto;
  padding-top: 14px;
}

.path-progress > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.path-progress h3 {
  margin: 0;
  color: var(--ink-2);
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.path-progress header a {
  display: inline-flex;
  gap: 2px;
  align-items: center;
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 11.5px;
  font-weight: 800;
  text-decoration: none;
}

.path-progress header a:hover {
  text-decoration: underline;
}

.path-track {
  height: 5px;
  overflow: hidden;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.07);
}

.path-track i {
  display: block;
  width: 68%;
  height: 100%;
  background: linear-gradient(90deg, var(--ok), var(--cyan));
  box-shadow: 0 0 8px rgba(95, 181, 218, 0.5);
}

.path-progress ol {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin: 9px 0 0;
  padding: 0;
  list-style: none;
}

.path-progress li {
  display: grid;
  gap: 3px;
  justify-items: center;
  padding: 7px 4px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.015);
  text-align: center;
}

.path-progress li.running {
  border-color: color-mix(in srgb, var(--cyan), transparent 55%);
  background: color-mix(in srgb, var(--cyan), transparent 93%);
}

.stage-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
}

.path-progress li.done .stage-dot {
  background: var(--ok);
  box-shadow: 0 0 7px color-mix(in srgb, var(--ok), transparent 40%);
}

.path-progress li.running .stage-dot {
  background: var(--cyan);
  box-shadow: 0 0 8px var(--cyan);
  animation: live-blink 1s ease-in-out infinite alternate;
}

.path-progress li span {
  color: #ccd8e8;
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
}

.path-progress li.locked span {
  color: var(--ink-3);
}

.path-progress li small {
  color: var(--ink-3);
  font-size: 9px;
}

.path-progress li.running small {
  color: var(--cyan);
}

.path-progress li.done small {
  color: var(--ok);
}

/* --- 中栏：引擎 --- */
.engine-panel {
  display: grid;
  grid-template-rows: auto auto 1fr auto auto;
  min-height: 640px;
}

/* 证据汇入统计条 */
.intake-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
  padding: 9px 12px;
  border: 1px solid var(--hairline);
  border-radius: 6px;
  background: rgba(10, 17, 34, 0.6);
}

.intake-label {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.intake-strip em {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 4px 10px;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 66%);
  border-radius: 999px;
  background: color-mix(in srgb, var(--tone), transparent 94%);
  color: #cfdbe9;
  font-size: 11px;
  font-style: normal;
}

.intake-strip em i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--tone);
  box-shadow: 0 0 6px var(--tone);
}

.intake-strip.live em i {
  animation: live-blink 0.7s ease-in-out infinite alternate;
}

.intake-strip em b {
  color: #fff;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 800;
}

.intake-strip small {
  margin-left: auto;
  color: var(--ink-3);
  font-size: 10px;
}

.engine-panel.running {
  border-color: rgba(95, 181, 218, 0.4);
  box-shadow: 0 0 44px rgba(95, 181, 218, 0.1);
}

.engine-state {
  padding: 3px 11px;
  border: 1px solid var(--hairline);
  border-radius: 999px;
  color: var(--ink-3);
  font-size: 10.5px;
  font-style: normal;
  font-weight: 800;
}

.engine-state.running {
  border-color: rgba(85, 177, 142, 0.55);
  background: rgba(85, 177, 142, 0.08);
  color: var(--ok);
  animation: live-blink 1s ease-in-out infinite alternate;
}

.engine-state.done {
  border-color: rgba(85, 177, 142, 0.55);
  color: var(--ok);
}

.engine-state.skipped {
  border-color: rgba(216, 179, 108, 0.55);
  background: rgba(216, 179, 108, 0.08);
  color: #ead4a8;
}

@keyframes live-blink {
  from { opacity: 0.55; }
  to { opacity: 1; }
}

.engine-stage {
  position: relative;
  display: grid;
  grid-template-areas:
    'tl core tr'
    'bl core br';
  grid-template-columns: 1fr auto 1fr;
  gap: 12px 16px;
  align-content: center;
  align-items: center;
  padding: 8px 0 16px;
}

.crosshair-x,
.crosshair-y {
  position: absolute;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, rgba(148, 196, 232, 0.12), transparent);
}

.crosshair-x {
  top: 50%;
  right: 4%;
  left: 4%;
  height: 1px;
}

.crosshair-y {
  top: 6%;
  bottom: 6%;
  left: 50%;
  width: 1px;
  background: linear-gradient(180deg, transparent, rgba(148, 196, 232, 0.12), transparent);
}

.capability {
  padding: 10px 12px;
  border: 1px solid var(--hairline);
  border-radius: 6px;
  background: rgba(10, 17, 34, 0.78);
  transition: border-color 0.25s ease, transform 0.25s ease;
}

.capability:hover {
  border-color: rgba(95, 181, 218, 0.4);
  transform: translateY(-2px);
}

.capability.live {
  border-color: color-mix(in srgb, var(--cyan), transparent 32%);
  background: color-mix(in srgb, var(--cyan), transparent 93%);
  box-shadow: 0 0 22px color-mix(in srgb, var(--cyan), transparent 74%);
  transform: translateY(-2px);
}

.capability.live strong {
  color: #fff;
}

.capability.live::after {
  margin-left: 7px;
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.1em;
  content: '● RUN';
  animation: live-blink 0.8s ease-in-out infinite alternate;
}

.capability.tl { grid-area: tl; }
.capability.tr { grid-area: tr; }
.capability.bl { grid-area: bl; }
.capability.br { grid-area: br; }

.capability strong {
  display: block;
  color: #d3e7ff;
  font-size: 12px;
  font-weight: 800;
}

.capability small {
  display: block;
  margin-top: 3px;
  color: var(--ink-3);
  font-size: 10px;
  line-height: 1.55;
}

.engine-dais {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 0;
  border-radius: 50%;
  pointer-events: none;
  transform: translate(-50%, -6%);
}

.engine-dais.d1 {
  width: 240px;
  height: 62px;
  border: 1px solid rgba(95, 181, 218, 0.28);
  background: radial-gradient(closest-side, rgba(95, 181, 218, 0.16), rgba(95, 181, 218, 0.03) 70%, transparent);
  animation: dais-breathe 3.8s ease-in-out infinite;
}

.engine-dais.d2 {
  width: 330px;
  height: 84px;
  border: 1px solid rgba(141, 132, 214, 0.14);
  background: radial-gradient(closest-side, rgba(141, 132, 214, 0.07), transparent 74%);
}

@keyframes dais-breathe {
  0%, 100% { box-shadow: 0 0 18px rgba(95, 181, 218, 0.12); opacity: 0.8; }
  50% { box-shadow: 0 0 40px rgba(95, 181, 218, 0.28); opacity: 1; }
}

.engine-core {
  position: relative;
  z-index: 1;
  grid-area: core;
  display: grid;
  place-content: center;
  width: 190px;
  height: 190px;
  justify-items: center;
}

.core-arc {
  position: absolute;
  inset: 0;
  overflow: visible;
}

.arc-faint {
  fill: none;
  stroke: rgba(148, 196, 232, 0.12);
  stroke-width: 1;
}

.arc-dash {
  fill: none;
  stroke: rgba(141, 132, 214, 0.35);
  stroke-dasharray: 3 9;
  stroke-width: 1.4;
  transform-origin: 100px 100px;
  animation: spin 22s linear infinite reverse;
}

.arc-main {
  fill: none;
  stroke-dasharray: 400 178;
  stroke-linecap: round;
  stroke-width: 2.4;
  transform-origin: 100px 100px;
  animation: spin 9s linear infinite;
  filter: drop-shadow(0 0 6px rgba(95, 181, 218, 0.55));
}

.engine-core.spinning .arc-main {
  animation-duration: 2.2s;
}

.engine-core.spinning .arc-dash {
  animation-duration: 6s;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.orbit {
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  animation: spin 7s linear infinite;
  pointer-events: none;
}

.engine-core.spinning .orbit {
  animation-duration: 1.8s;
}

.orbit i {
  position: absolute;
  top: -3px;
  left: 50%;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a5f3fc;
  box-shadow: 0 0 12px rgba(95, 181, 218, 0.9);
}

.core-glow {
  position: absolute;
  inset: 26%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(111, 157, 216, 0.36), rgba(95, 181, 218, 0.08) 55%, transparent 72%);
  filter: blur(7px);
  animation: glow-breathe 3.2s ease-in-out infinite;
}

.engine-core.spinning .core-glow {
  animation-duration: 1.1s;
}

@keyframes glow-breathe {
  0%, 100% { opacity: 0.5; transform: scale(0.95); }
  50% { opacity: 1; transform: scale(1.06); }
}

.core-icon {
  position: relative;
  color: #b8ecfa;
  filter: drop-shadow(0 0 14px rgba(95, 181, 218, 0.7));
}

.engine-core b {
  position: relative;
  margin-top: 9px;
  color: var(--ink-1);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-shadow: 0 0 14px rgba(111, 157, 216, 0.9);
}

.writeback-arrow {
  position: absolute;
  top: 50%;
  right: -15px;
  display: inline-flex;
  gap: 5px;
  align-items: center;
  padding: 5px 11px;
  border: 1px solid rgba(141, 132, 214, 0.35);
  border-radius: 999px;
  background: rgba(141, 132, 214, 0.09);
  color: var(--ink-3);
  font-size: 10.5px;
  font-weight: 800;
  white-space: nowrap;
  opacity: 0.45;
  transform: translateY(-50%);
  transition: opacity 0.4s ease, color 0.4s ease, box-shadow 0.4s ease;
}

.writeback-arrow.on {
  color: #c4b5fd;
  opacity: 1;
  box-shadow: 0 0 20px rgba(141, 132, 214, 0.35);
  animation: nudge 1.2s ease-in-out infinite;
}

@keyframes nudge {
  0%, 100% { transform: translate(0, -50%); }
  50% { transform: translate(4px, -50%); }
}

.engine-console {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 18px;
  align-items: center;
  padding-top: 6px;
}

.progress-ring {
  position: relative;
  width: 104px;
  height: 104px;
}

.progress-ring svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring-track {
  fill: none;
  stroke: rgba(255, 255, 255, 0.07);
  stroke-width: 8;
}

.ring-value {
  fill: none;
  stroke: var(--cyan);
  stroke-linecap: round;
  stroke-width: 8;
  filter: drop-shadow(0 0 8px rgba(95, 181, 218, 0.6));
  transition: stroke-dashoffset 0.25s linear;
}

.ring-text {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  text-align: center;
}

.ring-text strong {
  color: #fff;
  font-family: var(--font-mono);
  font-size: 21px;
  line-height: 1;
}

.ring-text strong i {
  font-size: 12px;
  font-style: normal;
  opacity: 0.7;
}

.ring-text small {
  margin-top: 3px;
  color: var(--ink-3);
  font-size: 9.5px;
}

.task-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.task-list li {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 9px;
  align-items: center;
  color: var(--ink-3);
  font-size: 12px;
  transition: color 0.3s ease;
}

.task-list li i {
  display: grid;
  place-content: center;
  width: 16px;
  height: 16px;
  border: 1.5px solid rgba(148, 196, 232, 0.32);
  border-radius: 50%;
  color: #04121c;
  transition: background 0.3s ease, border-color 0.3s ease;
}

.task-list li.running {
  color: var(--ink-1);
}

.task-list li.running i {
  border-color: var(--cyan);
  box-shadow: 0 0 10px rgba(95, 181, 218, 0.6);
  animation: live-blink 0.8s ease-in-out infinite alternate;
}

.task-list li.done {
  color: #c6d4e8;
}

.task-list li.done i {
  border-color: var(--ok);
  background: var(--ok);
  animation: value-pop 0.4s cubic-bezier(0.2, 0.9, 0.3, 1);
}

.task-list li b {
  color: var(--ok);
  font-family: var(--font-mono);
  font-size: 10.5px;
}

.task-list li.running b {
  color: var(--cyan);
}

.task-list li b.wait {
  color: var(--ink-3);
}

.confidence-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
  margin-top: 13px;
  padding: 10px 14px;
  border: 1px solid var(--hairline);
  border-radius: 999px;
  background: rgba(10, 17, 34, 0.6);
}

.confidence-row span {
  color: var(--ink-2);
  font-size: 11.5px;
  font-weight: 700;
}

.confidence-bar {
  height: 7px;
  overflow: hidden;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.06);
}

.confidence-bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--cyan), var(--violet));
  box-shadow: 0 0 10px rgba(111, 157, 216, 0.6);
  transition: width 0.3s ease;
}

.confidence-row strong {
  min-width: 56px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 12px;
  text-align: right;
}

.confidence-row strong.show {
  color: var(--ok);
}

/* --- 右栏：历史画像报告 --- */
.history-block h3 {
  margin: 0 0 8px;
  color: #a89fdd;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.history-list {
  position: relative;
  display: grid;
  gap: 4px;
  margin: 0 0 14px;
  padding: 0;
  list-style: none;
}

.history-list::before {
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 5px;
  width: 1.5px;
  background: linear-gradient(180deg, rgba(141, 132, 214, 0.4), rgba(141, 132, 214, 0.1));
  content: '';
}

.history-list li {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 11px;
  align-items: center;
  padding: 6px 9px 6px 0;
  border-radius: 8px;
  transition: background 0.2s ease;
}

.history-list li:hover {
  background: rgba(141, 132, 214, 0.05);
}

.history-list .node {
  position: relative;
  z-index: 1;
  width: 11px;
  height: 11px;
  border: 2px solid rgba(141, 132, 214, 0.5);
  border-radius: 50%;
  background: #0a1122;
}

.history-list strong {
  display: block;
  color: #d7e5f7;
  font-family: var(--font-mono);
  font-size: 11.5px;
}

.history-list small {
  color: var(--ink-3);
  font-size: 10.5px;
}

.history-list li.latest {
  border: 1px solid rgba(141, 132, 214, 0.45);
  background: rgba(141, 132, 214, 0.06);
  box-shadow: 0 0 18px rgba(141, 132, 214, 0.14);
}

.history-list li.latest .node {
  border-color: var(--violet);
  background: var(--violet);
  box-shadow: 0 0 10px rgba(141, 132, 214, 0.8);
}

.history-list li.fresh {
  animation: fresh-in 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes fresh-in {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.history-list em {
  padding: 2px 8px;
  border: 1px solid rgba(141, 132, 214, 0.5);
  border-radius: 999px;
  background: rgba(141, 132, 214, 0.12);
  color: #c9c2ee;
  font-size: 9.5px;
  font-style: normal;
  font-weight: 800;
}

.latest-report {
  padding: 14px;
  border: 1px solid rgba(141, 132, 214, 0.26);
  border-radius: 6px;
  background:
    linear-gradient(160deg, rgba(141, 132, 214, 0.07), transparent 46%),
    rgba(10, 17, 34, 0.6);
  transition: border-color 0.4s ease, box-shadow 0.4s ease;
}

.latest-report.updated {
  border-color: rgba(141, 132, 214, 0.5);
  box-shadow: 0 0 26px rgba(141, 132, 214, 0.14);
}

.latest-report > header {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
  color: #a89fdd;
}

.latest-report header strong {
  flex: 1;
  color: #fff;
  font-size: 13px;
  font-weight: 800;
}

.latest-report header em {
  padding: 2px 8px;
  border: 1px solid rgba(141, 132, 214, 0.5);
  border-radius: 999px;
  background: rgba(141, 132, 214, 0.12);
  color: #c9c2ee;
  font-size: 9.5px;
  font-style: normal;
  font-weight: 800;
}

.latest-report header em.wait {
  border-color: var(--hairline);
  background: transparent;
  color: var(--ink-3);
}

.report-rows {
  display: grid;
  gap: 5px;
}

.row-head,
.report-row {
  display: grid;
  grid-template-columns: 1fr 44px 48px 34px;
  gap: 6px;
  align-items: center;
}

.row-head small {
  color: var(--ink-3);
  font-size: 9px;
  text-align: right;
}

.report-row {
  padding: 5px 7px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.02);
  transition: background 0.2s ease;
}

.report-row:hover {
  background: rgba(141, 132, 214, 0.07);
}

.report-row span {
  color: #c6d4e8;
  font-size: 11px;
}

.report-row small {
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 10.5px;
  text-align: right;
}

.report-row strong {
  color: #fff;
  font-family: var(--font-mono);
  font-size: 11.5px;
  text-align: right;
}

.report-row strong.pending {
  color: var(--ink-3);
}

.report-row .up {
  color: var(--ok);
  font-family: var(--font-mono);
  font-size: 10px;
  text-align: right;
}

.report-note {
  margin: 10px 0;
  color: var(--ink-3);
  font-size: 10.5px;
  line-height: 1.65;
}

.report-cta {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 34px;
  border: 1px solid rgba(141, 132, 214, 0.45);
  border-radius: 999px;
  background: rgba(141, 132, 214, 0.1);
  color: #c4b5fd;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
  transition: box-shadow 0.2s ease, background 0.2s ease;
}

.report-cta:hover,
.report-cta:focus-visible {
  background: rgba(141, 132, 214, 0.2);
  box-shadow: 0 0 20px rgba(141, 132, 214, 0.3);
  outline: none;
}

/* ============ 更新结果 ============ */
.summary-section,
.optimize-section {
  margin-top: 18px;
}

.summary-section > header,
.optimize-section > header {
  display: flex;
  gap: 12px;
  align-items: baseline;
  margin-bottom: 11px;
}

.summary-section header small,
.optimize-section header small {
  color: var(--ink-3);
  font-size: 11px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.summary-grid article {
  position: relative;
  padding: 13px 14px;
  border: 1px solid var(--hairline);
  border-radius: 6px;
  background: rgba(7, 12, 26, 0.5);
  opacity: 0.62;
  transition: opacity 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease, transform 0.25s ease;
}

/* 色彩预算收紧：对比卡统一雾蓝主色，不再五彩各异 */
.summary-section.on .summary-grid article {
  border-color: color-mix(in srgb, var(--cyan), transparent 66%);
  box-shadow: 0 0 20px color-mix(in srgb, var(--cyan), transparent 88%);
  opacity: 1;
}

.summary-section.on .summary-grid article:hover {
  transform: translateY(-3px);
}

.sum-label {
  display: block;
  margin-bottom: 10px;
  color: #c6d4e8;
  font-size: 12px;
  font-weight: 800;
}

.sum-body {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.sum-before strong,
.sum-ring strong {
  color: #fff;
  font-family: var(--font-mono);
  font-size: 16px;
  line-height: 1;
}

/* 更新前数字弱化，主次分明 */
.sum-before strong {
  color: var(--ink-2);
  font-size: 14px;
}

.sum-before strong i,
.sum-ring strong i {
  font-size: 10px;
  font-style: normal;
  opacity: 0.7;
}

.sum-before small,
.sum-ring small {
  display: block;
  margin-top: 3px;
  color: var(--ink-3);
  font-size: 9px;
}

.sum-before {
  opacity: 0.72;
}

.sum-arrow {
  flex: none;
  color: var(--ink-3);
}

.sum-ring {
  display: grid;
  place-content: center;
  width: 66px;
  height: 66px;
  border-radius: 50%;
  background:
    radial-gradient(closest-side, #0a1122 76%, transparent 77% 100%),
    conic-gradient(var(--cyan) var(--val), rgba(255, 255, 255, 0.07) 0);
  text-align: center;
  transition: background 0.5s ease;
}

.sum-delta {
  position: absolute;
  top: 12px;
  right: 13px;
  color: var(--ok);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 800;
  opacity: 0;
  transition: opacity 0.4s ease;
}

.sum-delta.show {
  opacity: 1;
}

.summary-section.on .sum-ring strong {
  animation: value-pop 0.5s cubic-bezier(0.2, 0.9, 0.3, 1);
}

@keyframes value-pop {
  0% { transform: scale(0.6); }
  70% { transform: scale(1.12); }
  100% { transform: scale(1); }
}

/* ============ 优化输出 ============ */
.optimize-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.optimize-card {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 11px;
  align-items: center;
  padding: 12px 14px;
  border: 1px solid var(--hairline);
  border-radius: 6px;
  background: rgba(10, 17, 34, 0.5);
  color: var(--ink-3);
  text-decoration: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease, opacity 0.3s ease;
}

.optimize-card:hover,
.optimize-card:focus-visible {
  border-color: color-mix(in srgb, var(--tone), transparent 44%);
  box-shadow: 0 0 20px color-mix(in srgb, var(--tone), transparent 76%);
  outline: none;
  transform: translateY(-2px);
}

.optimize-card.pending {
  opacity: 0.6;
}

.opt-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tone);
  box-shadow: 0 0 9px var(--tone);
}

.optimize-card strong {
  display: block;
  color: #fff;
  font-size: 12.5px;
  font-weight: 800;
}

.optimize-card small {
  display: block;
  overflow: hidden;
  color: var(--ink-3);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ============ 底部元信息 ============ */
.meta-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 22px;
  align-items: center;
  margin-top: 18px;
  padding: 11px 16px;
  border: 1px solid var(--hairline);
  border-radius: 6px;
  background: rgba(7, 12, 26, 0.5);
}

.meta-strip span {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  color: var(--ink-3);
  font-size: 11px;
}

.meta-strip .sync {
  color: var(--ink-3);
}

.meta-strip .sync.on {
  color: var(--ok);
}

/* ============ 全景模式 ============ */
.panorama-shell {
  position: relative;
}

:global(body.reverse-evaluation-active .global-pet) {
  transform: translateX(86px) scale(0.9);
  opacity: 0.78;
}

/* ============ 响应式 ============ */
@media (max-width: 1320px) {
  .rev-grid {
    grid-template-columns: 280px minmax(0, 1fr);
  }

  .report-panel {
    grid-column: 1 / -1;
  }

  .summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 1100px) {
  .rev-head {
    grid-template-columns: 1fr;
  }

  .head-cta,
  .head-side {
    justify-items: start;
  }

  .ghost-glyph {
    display: none;
  }
}

@media (max-width: 920px) {
  .rev-grid {
    grid-template-columns: 1fr;
  }

  .flow-steps {
    grid-template-columns: repeat(2, 1fr);
  }

  .flow-steps::before {
    display: none;
  }

  .engine-panel {
    min-height: 0;
  }

  .engine-stage {
    grid-template-areas:
      'core core'
      'tl tr'
      'bl br';
    grid-template-columns: 1fr 1fr;
    justify-items: stretch;
  }

  .crosshair-x,
  .crosshair-y {
    display: none;
  }

  .engine-core {
    justify-self: center;
  }

  .writeback-arrow {
    position: static;
    justify-self: center;
    margin-top: 6px;
    transform: none;
  }

  .writeback-arrow.on {
    animation: none;
  }

  .optimize-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .rev-page {
    padding-inline: 12px;
  }

  .cta-btn {
    width: 100%;
  }

  .cta-inner {
    justify-content: center;
    width: 100%;
    font-size: 14.5px;
  }

  .flow-steps {
    grid-template-columns: 1fr;
  }

  .flow-steps li {
    grid-template-columns: auto 1fr;
    justify-items: start;
    text-align: left;
  }

  .engine-console {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .path-progress ol {
    grid-template-columns: repeat(2, 1fr);
  }

  .intake-strip small {
    display: none;
  }

  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .mastery-body {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .summary-grid,
  .optimize-grid {
    grid-template-columns: 1fr;
  }
}
</style>
