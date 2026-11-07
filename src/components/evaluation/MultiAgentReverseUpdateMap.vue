<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

type NodeId = 'eval' | 'reflect' | 'profile' | 'path' | 'resource' | 'tutor'
type ToneName = 'cyan' | 'teal' | 'blue' | 'purple' | 'violet' | 'emerald' | 'amber' | 'magenta' | 'rose' | 'orange'
type LinkKind = 'engine' | 'writeback' | 'drive'

interface LoopNode {
  id: NodeId
  cn: string
  en: string
  icon: NodeId
  color: ToneName
  x: number
  y: number
  r: number
  phase: number
  role: string
  emit: string
  engine?: boolean
  hub?: boolean
  img?: string
  route?: {
    path: string
    query?: Record<string, string>
    label: string
  }
}

interface LoopLink {
  from: NodeId
  to: NodeId
  kind: LinkKind
  label: string
  phase: number
  bow: number
  hero?: boolean
}

interface AgentUpdateAction {
  label: string
  before: string
  after: string
  impact: string
}

interface AgentUpdateDetail {
  summary: string
  current: string
  target: string
  next: string
  confidence: number
  evidence: string[]
  tips: string[]
  actions: AgentUpdateAction[]
  history: string[]
}

const stage = { w: 1600, h: 980 }

const palette = {
  bg: '#05070f',
  ink: '#070b18',
  cyan: '#5fb5da',
  teal: '#5fb3a6',
  blue: '#6f9dd8',
  purple: '#8d84d6',
  violet: '#a89fdd',
  emerald: '#55b18e',
  amber: '#d8b36c',
  gold: '#fcd34d',
  magenta: '#c583a6',
  rose: '#d98aa4',
  orange: '#fb923c',
  text: '#eaf4ff',
  textSub: '#9bb4d4',
  textTri: '#5a6f92',
}

const nodes: Record<NodeId, LoopNode> = {
  eval: {
    id: 'eval',
    cn: '评估智能体',
    en: 'EVALUATION AGENT',
    icon: 'eval',
    color: 'magenta',
    x: 360,
    y: 320,
    r: 86,
    phase: 1,
    img: '/reverse-evaluation/agent-evaluation.jpg',
    role: '判断掌握度 / 错因 / 薄弱点',
    emit: '生成结构化评估证据',
    route: { path: '/evaluation', label: '进入评估页' },
  },
  reflect: {
    id: 'reflect',
    cn: '反思智能体',
    en: 'REFLECTION ENGINE',
    icon: 'reflect',
    color: 'orange',
    x: 690,
    y: 320,
    r: 104,
    phase: 2,
    engine: true,
    img: '/reverse-evaluation/agent-reflection.jpg',
    role: '反思评估结果 / 触发反向回写',
    emit: '决定回写哪些画像维度',
  },
  profile: {
    id: 'profile',
    cn: '画像智能体',
    en: 'PROFILE AGENT',
    icon: 'profile',
    color: 'purple',
    x: 1080,
    y: 374,
    r: 132,
    phase: 3,
    hub: true,
    img: '/reverse-evaluation/agent-profile.jpg',
    role: '学生模型 / 唯一真相源',
    emit: '画像 6 维度被更新',
    route: { path: '/dialogue', query: { tab: 'portrait-report' }, label: '打开画像报告' },
  },
  path: {
    id: 'path',
    cn: '路径智能体',
    en: 'PATH AGENT',
    icon: 'path',
    color: 'cyan',
    x: 760,
    y: 690,
    r: 84,
    phase: 4,
    img: '/reverse-evaluation/agent-path.jpg',
    role: '重排学习路径',
    emit: '插入 1 个补救节点',
    route: { path: '/learning-path', label: '查看学习路径' },
  },
  resource: {
    id: 'resource',
    cn: '资源智能体',
    en: 'RESOURCE AGENT',
    icon: 'resource',
    color: 'emerald',
    x: 1080,
    y: 722,
    r: 84,
    phase: 4,
    img: '/reverse-evaluation/agent-resource.jpg',
    role: '替换 / 推荐资源',
    emit: '重配 3 个资源',
    route: { path: '/resources', query: { tab: 'resources' }, label: '进入资源中心' },
  },
  tutor: {
    id: 'tutor',
    cn: '辅导智能体',
    en: 'TUTOR AGENT',
    icon: 'tutor',
    color: 'amber',
    x: 1400,
    y: 690,
    r: 84,
    phase: 4,
    img: '/reverse-evaluation/agent-tutor.jpg',
    role: '调整讲解与练习策略',
    emit: '调整 2 处策略',
    route: {
      path: '/tutoring',
      query: { topic: 'BFS visited 标记时机', module: '图结构', unit: '广度优先搜索', mastery: '42' },
      label: '进入智能辅导',
    },
  },
}

const nodeOrder: NodeId[] = ['eval', 'reflect', 'profile', 'path', 'resource', 'tutor']

const evidenceSources = [
  { label: '学习行为', color: 'teal' as ToneName },
  { label: '测评作答', color: 'magenta' as ToneName },
  { label: '资源完成度', color: 'emerald' as ToneName },
  { label: '对话记录', color: 'cyan' as ToneName },
]

const links: LoopLink[] = [
  { from: 'eval', to: 'reflect', kind: 'engine', label: '评估结论', phase: 2, bow: 0 },
  { from: 'reflect', to: 'profile', kind: 'writeback', label: '反向回写 / 更新画像', phase: 3, bow: -26, hero: true },
  { from: 'profile', to: 'path', kind: 'drive', label: '驱动重排', phase: 4, bow: 30 },
  { from: 'profile', to: 'resource', kind: 'drive', label: '驱动重配', phase: 4, bow: 0 },
  { from: 'profile', to: 'tutor', kind: 'drive', label: '驱动调整', phase: 4, bow: -30 },
]

const dimensions = [
  { name: '知识广度', before: 42, after: 58, color: 'cyan' as ToneName },
  { name: '知识深度', before: 52, after: 76, color: 'blue' as ToneName },
  { name: '应用能力', before: 35, after: 61, color: 'emerald' as ToneName },
  { name: '创新力', before: 52, after: 74, color: 'violet' as ToneName },
  { name: '工程实践', before: 57, after: 82, color: 'amber' as ToneName },
  { name: '知识迁移', before: 33, after: 48, color: 'rose' as ToneName, weak: true },
]

const phases = [
  { id: 0, k: 'IDLE', cn: '待机', desc: '四类学习证据持续汇入评估智能体。' },
  { id: 1, k: 'EVALUATE', cn: '评估', desc: '评估智能体判断掌握度、错因与薄弱点，产出结构化证据。' },
  { id: 2, k: 'REFLECT', cn: '反思', desc: '反思智能体研判评估结果，决定回写哪些画像维度。' },
  { id: 3, k: 'WRITE-BACK', cn: '画像校准', desc: '画像完成校准，6 个维度发生跳变。' },
  { id: 4, k: 'FAN-OUT', cn: '扇出重排', desc: '画像驱动路径重排、资源重配与辅导策略调整，闭环完成。' },
]

const agentUpdateDetails: Record<NodeId, AgentUpdateDetail> = {
  eval: {
    summary: '把本轮智能对话、测评作答和资源完成情况合并成可回写的证据包。',
    current: '正在校准错因、掌握度和薄弱知识点，等待反思智能体判断是否写回画像。',
    target: '评估证据包',
    next: '交给反思智能体判断回写范围',
    confidence: 88,
    evidence: ['测评错题 2/3', '对话追问 3 次', '资源停留 18 分钟'],
    tips: ['错题证据命中 BFS visited 标记时机', '对话追问被归入“图结构理解不稳”', '资源完成率低的节点被标记为待复测'],
    actions: [
      { label: '错因聚类', before: '普通图遍历错误', after: 'BFS visited 标记时机错误', impact: '让画像更新指向更小的知识颗粒' },
      { label: '掌握度校准', before: '图结构 68%', after: '图结构 42%', impact: '触发路径重排和补弱资源' },
      { label: '证据绑定', before: '零散学习日志', after: '测评 2/3 错题 + 对话追问 3 次', impact: '给后续回写提供可追溯依据' },
    ],
    history: ['写入评估快照 #EVAL-0512-R2', '生成 4 条证据标签', '输出置信度 0.88'],
  },
  reflect: {
    summary: '把评估结论反向翻译成“哪些画像字段要改、改多少、为什么改”。',
    current: '正在对比历史画像和新证据，决定本轮是否进入画像回写。',
    target: '画像更新指令',
    next: '写入画像版本并记录依据',
    confidence: 83,
    evidence: ['新证据高于阈值', '历史偏好出现冲突', '弱项连续命中 2 轮'],
    tips: ['短期薄弱点优先写入', '长期学习偏好保留但加上新证据', '置信度超过阈值后自动触发回写'],
    actions: [
      { label: '回写判定', before: '只有评估报告', after: '画像更新指令', impact: '从报告展示变成真正影响后续学习' },
      { label: '冲突处理', before: '偏好：文字讲解', after: '偏好：思维导图 + 例题拆解', impact: '让辅导方式随本轮表现调整' },
      { label: '范围收敛', before: '泛化补弱', after: '锁定指针传参与 BFS 标记', impact: '避免把路径改得过散' },
    ],
    history: ['追加反思记录 #REFLECT-0512-R2', '确认 6 个画像字段可更新', '输出置信度 0.83'],
  },
  profile: {
    summary: '把反思智能体给出的更新指令写入智能对话画像历史，形成新的学生画像版本。',
    current: '正在保存本轮画像版本，并把变化同步给路径、资源和辅导智能体。',
    target: '画像版本 #0512-R2',
    next: '向路径、资源、辅导三个下游广播变更',
    confidence: 91,
    evidence: ['6 个字段可回放', '3 个下游订阅成功', '弱项标签已细化'],
    tips: ['知识深度 +24', '应用能力 +26', '知识迁移仍为弱项', '新增“图示 + 例题拆解”学习偏好'],
    actions: [
      { label: '历史版本', before: '画像版本 #0512-R1', after: '画像版本 #0512-R2', impact: '保留可回放的画像演变历史' },
      { label: '弱项字段', before: '图结构理解薄弱', after: 'BFS visited 标记薄弱', impact: '把薄弱点细化到可练习任务' },
      { label: '偏好字段', before: '文字讲解', after: '思维导图 + 例题拆解', impact: '驱动资源与辅导风格一起调整' },
    ],
    history: ['写入画像历史 #PROFILE-0512-R2', '更新 6 个维度', '同步下游智能体 3 个'],
  },
  path: {
    summary: '读取新画像后，把下一轮学习路径从“继续推进”改成“先补弱再推进”。',
    current: '正在重排路径，把补弱节点插入下一轮学习流。',
    target: '下一轮学习路径',
    next: '等待补弱节点完成后复测画像变化',
    confidence: 86,
    evidence: ['BFS 专项插入成功', '主路径延后 2 节', '复测入口已生成'],
    tips: ['插入 BFS visited 标记专项', '二级指针传参前置复习', '已掌握节点从主路径降权'],
    actions: [
      { label: '路径插入', before: '图基础复习', after: 'BFS visited 标记专项', impact: '把时间花在真正失分点上' },
      { label: '顺序调整', before: '先上新知识', after: '先完成 20 分钟补弱', impact: '降低下一轮学习断点' },
      { label: '复测节点', before: '无复测', after: '无提示复测', impact: '验证画像更新是否有效' },
    ],
    history: ['生成路径版本 #PATH-0512-R2', '插入 1 个补救节点', '延后 2 个低优先级节点'],
  },
  resource: {
    summary: '根据画像变化替换学习材料，把泛化资源换成可直接修复薄弱点的资源。',
    current: '正在重配推荐资源，并把推荐理由绑定到画像证据。',
    target: '资源推荐包',
    next: '根据完成率决定是否继续降权理论长文',
    confidence: 84,
    evidence: ['替换资源 3 个', '新增推荐理由 2 条', '绑定画像字段 4 个'],
    tips: ['新增 BFS 队列快照动画', '新增二级指针调用栈图', '下架泛化图论长文'],
    actions: [
      { label: '资源重配', before: '图论概念长文', after: 'BFS 队列快照动画', impact: '让学生看到标记时机变化' },
      { label: '练习替换', before: '综合题 3 道', after: 'visited 专项 6 题', impact: '提高补弱命中率' },
      { label: '推荐解释', before: '按课程推荐', after: '按画像证据推荐', impact: '让推荐原因可追溯' },
    ],
    history: ['生成资源包 #RESOURCE-0512-R2', '替换 3 个资源', '新增 2 条推荐理由'],
  },
  tutor: {
    summary: '读取新画像后，调整下一次智能对话的讲解方式、追问顺序和练习提示。',
    current: '正在生成新的辅导策略，下一次对话会先验证薄弱点再讲新内容。',
    target: '下一次辅导策略',
    next: '进入对话时先触发弱项验证',
    confidence: 87,
    evidence: ['讲解策略调整 2 处', '新增复测入口 1 个', '提示强度已下调'],
    tips: ['先问 visited 标记时机', '减少纯文字讲解', '增加图示推演和例题拆解'],
    actions: [
      { label: '讲解风格', before: '文字说明', after: '图示推演 + 例题拆解', impact: '贴合本轮新偏好' },
      { label: '追问顺序', before: '开放式追问', after: '先问标记时机再问边界', impact: '快速定位是否真正掌握' },
      { label: '提示策略', before: '直接给思路', after: '分步提示 + 无提示复测', impact: '减少对提示的依赖' },
    ],
    history: ['更新辅导策略 #TUTOR-0512-R2', '调整 2 处讲解策略', '新增 1 个复测入口'],
  },
}

const stars = Array.from({ length: 130 }, (_, index) => {
  const seed = (index + 9) * 9301 + 49297
  const x = (seed % 1600)
  const y = ((seed * 17) % 980)
  const r = 0.4 + ((seed * 31) % 15) / 10
  const o = 0.08 + ((seed * 13) % 36) / 100
  const d = ((seed * 7) % 50) / 10
  return { x, y, r, o, d }
})

const wrapRef = ref<HTMLElement | null>(null)
const router = useRouter()
const stageScale = ref(1)
let resizeObserver: ResizeObserver | null = null

const phase = ref(0)
const playing = ref(true)
const timers: number[] = []
const selectedAgentId = ref<NodeId>('profile')
const selectedTipIndex = ref<number | null>(null)
const routeRequestVisible = ref(false)

const currentPhase = computed(() => phases[phase.value] ?? phases[0])
const profileDelta = computed(() => dimensions.reduce((sum, dim) => sum + dim.after - dim.before, 0))
const selectedNode = computed(() => nodes[selectedAgentId.value])
const selectedAgentDetail = computed(() => agentUpdateDetails[selectedAgentId.value])
const selectedAgentStatus = computed(() => agentRuntimeStatus(selectedAgentId.value))
const selectedRoute = computed(() => selectedNode.value.route)
const phaseProgress = computed(() => Math.round((phase.value / (phases.length - 1)) * 100))
const selectedWritebackCount = computed(() => selectedAgentDetail.value.actions.length + selectedAgentDetail.value.history.length)
const selectedTip = computed(() => {
  if (selectedTipIndex.value === null) return null
  return selectedAgentDetail.value.tips[selectedTipIndex.value] ?? null
})
const selectedTipAction = computed(() => {
  if (selectedTipIndex.value === null) return null
  const actionIndex = Math.min(selectedTipIndex.value, selectedAgentDetail.value.actions.length - 1)
  return selectedAgentDetail.value.actions[actionIndex] ?? null
})

const phaseFocusNode: Record<number, NodeId> = {
  1: 'eval',
  2: 'reflect',
  3: 'profile',
  4: 'path',
}

function color(name: ToneName) {
  return palette[name]
}

function hexAlpha(hex: string, alpha: number) {
  const next = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0')
  return `${hex}${next}`
}

function clearTimers() {
  while (timers.length) {
    window.clearTimeout(timers.pop())
  }
}

function startPlayback() {
  clearTimers()
  if (!playing.value) return
  ;[
    [1, 700],
    [2, 2100],
    [3, 3600],
    [4, 5200],
  ].forEach(([nextPhase, delay]) => {
    timers.push(window.setTimeout(() => {
      phase.value = nextPhase
    }, delay))
  })
}

function startLearningPathUpdate() {
  selectedAgentId.value = 'eval'
  selectedTipIndex.value = null
  routeRequestVisible.value = false
  phase.value = 0
  playing.value = false
  window.setTimeout(() => {
    playing.value = true
    startPlayback()
  }, 80)
}

function replay() {
  startLearningPathUpdate()
}

function jump(nextPhase: number) {
  playing.value = false
  clearTimers()
  phase.value = nextPhase
}

function selectAgent(id: NodeId) {
  selectedAgentId.value = id
  selectedTipIndex.value = null
  routeRequestVisible.value = false
  jump(nodes[id].phase)
}

function selectTip(index: number) {
  selectedTipIndex.value = index
  routeRequestVisible.value = false
}

function requestSelectedRoute() {
  if (!selectedRoute.value) return
  routeRequestVisible.value = true
}

function cancelRouteRequest() {
  routeRequestVisible.value = false
}

function confirmSelectedRoute() {
  if (!selectedRoute.value) return
  router.push(selectedRoute.value)
}

function agentRuntimeStatus(id: NodeId) {
  const agentPhase = nodes[id].phase
  if (phase.value < agentPhase) {
    return { label: '待触发', tone: 'pending', text: '等待上游证据进入当前节点。' }
  }
  if (phase.value === agentPhase) {
    return { label: '当前执行', tone: 'running', text: '正在处理本节点的画像更新任务。' }
  }
  return { label: '已完成', tone: 'done', text: '本节点更新已写入闭环结果。' }
}

function posX(x: number) {
  return `${x}px`
}

function posY(y: number) {
  return `${y}px`
}

function nodeStyle(node: LoopNode) {
  const tone = color(node.color)
  const size = node.r * 2
  return {
    left: posX(node.x),
    top: posY(node.y),
    width: `${size}px`,
    height: `${size}px`,
    '--tone': tone,
    '--tone-soft': hexAlpha(tone, 0.22),
  }
}

function tagStyle(node: LoopNode) {
  const below = node.id === 'path' || node.id === 'resource' || node.id === 'tutor'
  return {
    left: posX(node.x),
    top: posY(below ? node.y + node.r + 14 : node.y - node.r - 58),
    '--tone': color(node.color),
  }
}

function linkPath(link: LoopLink) {
  const from = nodes[link.from]
  const to = nodes[link.to]
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const x1 = from.x + ux * from.r
  const y1 = from.y + uy * from.r
  const x2 = to.x - ux * to.r
  const y2 = to.y - uy * to.r
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const cx = mx - uy * link.bow
  const cy = my + ux * link.bow
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`
}

function linkLabelStyle(link: LoopLink) {
  const from = nodes[link.from]
  const to = nodes[link.to]
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const x1 = from.x + ux * from.r
  const y1 = from.y + uy * from.r
  const x2 = to.x - ux * to.r
  const y2 = to.y - uy * to.r
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const cx = mx - uy * link.bow
  const cy = my + ux * link.bow
  return {
    left: posX(0.25 * x1 + 0.5 * cx + 0.25 * x2),
    top: posY(0.25 * y1 + 0.5 * cy + 0.25 * y2),
  }
}

function evidencePath(index: number) {
  const ev = nodes.eval
  const baseX = 120
  const y = 200 + index * 64
  return `M ${baseX + 96} ${y} C ${baseX + 200} ${y}, ${ev.x - 160} ${ev.y}, ${ev.x - ev.r} ${ev.y}`
}

function evidenceStyle(index: number, tone: ToneName) {
  return {
    left: posX(120),
    top: posY(200 + index * 64),
    '--tone': color(tone),
  }
}

function linkTone(link: LoopLink) {
  if (link.kind === 'writeback') return palette.magenta
  if (link.kind === 'engine') return palette.orange
  return palette.cyan
}

watch(phase, nextPhase => {
  if (!playing.value) return
  const nextFocus = phaseFocusNode[nextPhase]
  if (!nextFocus) return
  selectedAgentId.value = nextFocus
  selectedTipIndex.value = null
  routeRequestVisible.value = false
})

onMounted(() => {
  const updateScale = () => {
    const width = wrapRef.value?.clientWidth || stage.w
    stageScale.value = Math.min(1, width / stage.w)
  }
  updateScale()
  resizeObserver = new ResizeObserver(updateScale)
  if (wrapRef.value) {
    resizeObserver.observe(wrapRef.value)
  }
  startPlayback()
})

onBeforeUnmount(() => {
  clearTimers()
  resizeObserver?.disconnect()
})
</script>

<template>
  <section ref="wrapRef" class="reverse-loop" aria-label="反向评估画像回写闭环">
    <div
      class="scaled-stage"
      :style="{ width: `${stage.w * stageScale}px`, height: `${stage.h * stageScale}px` }"
    >
      <div class="fixed-stage" :style="{ transform: `scale(${stageScale})` }">
      <button class="replay-btn" type="button" @click="startLearningPathUpdate">学习路径更新</button>

      <nav class="step-rail" aria-label="演示阶段">
        <template v-for="(item, index) in phases" :key="item.id">
          <button
            type="button"
            :class="{ active: phase === item.id, done: phase > item.id }"
            @click="jump(item.id)"
          >
            <i />
            <span>{{ item.cn }}</span>
          </button>
          <b v-if="index < phases.length - 1" :class="{ done: phase > item.id }" />
        </template>
      </nav>

      <svg class="stage-svg" :viewBox="`0 0 ${stage.w} ${stage.h}`" aria-hidden="true">
        <defs>
          <radialGradient id="loop-aura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" :stop-color="hexAlpha(palette.purple, 0.16)" />
            <stop offset="55%" :stop-color="hexAlpha(palette.purple, 0.05)" />
            <stop offset="100%" :stop-color="hexAlpha(palette.purple, 0)" />
          </radialGradient>
          <marker id="arr-engine" markerWidth="12" markerHeight="12" refX="7" refY="6" orient="auto">
            <path d="M0 1 L11 6 L0 11 Z" :fill="palette.orange" />
          </marker>
          <marker id="arr-writeback" markerWidth="12" markerHeight="12" refX="7" refY="6" orient="auto">
            <path d="M0 1 L11 6 L0 11 Z" :fill="palette.magenta" />
          </marker>
          <marker id="arr-drive" markerWidth="12" markerHeight="12" refX="7" refY="6" orient="auto">
            <path d="M0 1 L11 6 L0 11 Z" :fill="palette.cyan" />
          </marker>
        </defs>

        <rect width="1600" height="980" fill="transparent" />
        <ellipse cx="1080" cy="374" rx="520" ry="430" fill="url(#loop-aura)" />
        <circle
          v-for="(star, index) in stars"
          :key="index"
          :cx="star.x"
          :cy="star.y"
          :r="star.r"
          fill="#cfe6ff"
          :opacity="star.o"
          class="star"
          :style="{ '--delay': `${star.d}s` }"
        />
        <ellipse
          cx="880"
          cy="540"
          rx="640"
          ry="350"
          fill="none"
          :stroke="hexAlpha(palette.blue, 0.08)"
          stroke-width="1.4"
          stroke-dasharray="2 12"
        />
        <text x="250" y="190" :fill="hexAlpha(palette.textTri, 0.8)" font-size="12" letter-spacing="3">
          正向学习流（画像→路径→资源→辅导→评估）
        </text>

        <g v-for="(source, index) in evidenceSources" :key="source.label">
          <path
            :d="evidencePath(index)"
            fill="none"
            :stroke="hexAlpha(color(source.color), 0.3)"
            stroke-width="1.6"
            stroke-dasharray="6 5"
          />
          <path
            v-if="phase >= 1"
            :d="evidencePath(index)"
            fill="none"
            :stroke="color(source.color)"
            stroke-width="1.6"
            stroke-dasharray="2 14"
            class="flow-line"
          />
        </g>

        <g
          v-for="link in links"
          :key="`${link.from}-${link.to}`"
          :class="{ on: phase >= link.phase, running: phase === link.phase }"
          class="beam"
        >
          <path
            :d="linkPath(link)"
            fill="none"
            :stroke="hexAlpha(linkTone(link), 0.16)"
            :stroke-width="link.kind === 'writeback' ? 12 : 8"
            stroke-linecap="round"
          />
          <path
            :d="linkPath(link)"
            fill="none"
            :stroke="hexAlpha(linkTone(link), phase >= link.phase ? 0.78 : 0.36)"
            :stroke-width="link.kind === 'writeback' ? 3.6 : 2.4"
            :stroke-dasharray="link.kind === 'writeback' ? '0' : '8 6'"
            stroke-linecap="round"
            :marker-end="`url(#arr-${link.kind})`"
          />
          <path
            v-if="phase >= link.phase"
            :d="linkPath(link)"
            fill="none"
            stroke="#fff"
            :stroke-width="link.kind === 'writeback' ? 2.4 : 1.6"
            stroke-dasharray="2 16"
            stroke-linecap="round"
            class="flow-line"
          />
        </g>
      </svg>

      <div
        v-for="(source, index) in evidenceSources"
        :key="`${source.label}-pill`"
        class="evidence-pill"
        :style="evidenceStyle(index, source.color)"
      >
        <i />{{ source.label }}
      </div>
      <span class="evidence-title">学习证据汇入</span>

      <div
        v-for="(id, index) in nodeOrder"
        :key="id"
        :class="['agent-core', id, { active: phase >= nodes[id].phase, running: phase === nodes[id].phase, selected: selectedAgentId === id, hub: nodes[id].hub, engine: nodes[id].engine }]"
        :style="{ ...nodeStyle(nodes[id]), '--delay': `${index * 0.24}s` }"
        role="button"
        tabindex="0"
        :aria-label="`查看${nodes[id].cn}的画像更新详情`"
        @click="selectAgent(id)"
        @keydown.enter.prevent="selectAgent(id)"
        @keydown.space.prevent="selectAgent(id)"
      >
        <span v-if="phase === nodes[id].phase" class="run-badge">运行中</span>
        <div class="core-halo" />
        <div v-if="phase === nodes[id].phase" class="run-sweep" />
        <svg class="identity-rings" viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="94" />
          <circle v-if="nodes[id].hub" cx="100" cy="100" r="99" />
          <circle v-if="nodes[id].engine && phase >= nodes[id].phase" cx="100" cy="100" r="88" />
          <circle v-if="phase >= nodes[id].phase" class="pulse-ring" cx="100" cy="100" r="86" />
        </svg>

        <img
          v-if="nodes[id].img"
          class="core-image"
          :src="nodes[id].img"
          :alt="nodes[id].cn"
          draggable="false"
        >
        <template v-else>
          <svg class="core-orb" viewBox="0 0 200 200" aria-hidden="true">
            <defs>
              <radialGradient :id="`core-${nodes[id].id}`" cx="42%" cy="38%" r="62%">
                <stop offset="0%" :stop-color="hexAlpha(color(nodes[id].color), phase >= nodes[id].phase ? 0.5 : 0.28)" />
                <stop offset="60%" :stop-color="hexAlpha(color(nodes[id].color), 0.12)" />
                <stop offset="100%" :stop-color="hexAlpha(palette.ink, 0.85)" />
              </radialGradient>
            </defs>
            <circle cx="100" cy="100" r="74" :fill="`url(#core-${nodes[id].id})`" />
          </svg>
          <svg class="core-icon" viewBox="0 0 100 100" aria-hidden="true">
            <g v-if="nodes[id].icon === 'eval'">
              <circle cx="44" cy="44" r="22" />
              <line x1="60" y1="60" x2="76" y2="76" />
              <path d="M35 44 L42 51 L55 36" />
            </g>
            <g v-else-if="nodes[id].icon === 'profile'">
              <circle cx="50" cy="50" r="11" class="filled" />
              <ellipse cx="50" cy="50" rx="34" ry="15" transform="rotate(-25 50 50)" />
              <ellipse cx="50" cy="50" rx="34" ry="15" transform="rotate(35 50 50)" />
              <circle cx="80" cy="38" r="4" class="filled" />
              <circle cx="22" cy="60" r="4" class="filled" />
              <circle cx="58" cy="20" r="3.4" class="filled" />
            </g>
            <g v-else-if="nodes[id].icon === 'path'">
              <circle cx="26" cy="50" r="6" class="filled" />
              <path d="M32 50 H50" />
              <path d="M50 50 C62 50 60 28 74 28" />
              <path d="M50 50 C62 50 60 72 74 72" />
              <circle cx="78" cy="28" r="6" class="filled" />
              <circle cx="78" cy="72" r="6" class="filled" />
            </g>
            <g v-else-if="nodes[id].icon === 'resource'">
              <rect x="26" y="40" width="40" height="30" rx="4" />
              <rect x="34" y="32" width="40" height="30" rx="4" opacity="0.75" />
              <line x1="40" y1="52" x2="60" y2="52" />
            </g>
            <g v-else>
              <path d="M24 32 H76 A6 6 0 0 1 82 38 V60 A6 6 0 0 1 76 66 H44 L32 76 V66 H24 A6 6 0 0 1 18 60 V38 A6 6 0 0 1 24 32 Z" />
              <line x1="34" y1="49" x2="34" y2="55" />
              <line x1="44" y1="44" x2="44" y2="60" />
              <line x1="54" y1="46" x2="54" y2="58" />
              <line x1="64" y1="49" x2="64" y2="55" />
            </g>
          </svg>
        </template>
      </div>

      <div
        v-for="id in nodeOrder"
        :key="`${id}-tag`"
        :class="['agent-tag', id, { active: phase >= nodes[id].phase, running: phase === nodes[id].phase, selected: selectedAgentId === id }]"
        :style="tagStyle(nodes[id])"
      >
        <strong>
          <em v-if="nodes[id].engine">引擎</em>
          <em v-if="nodes[id].hub">核心</em>
          {{ nodes[id].cn }}
        </strong>
        <span>{{ nodes[id].role }}</span>
        <span v-if="nodes[id].route" class="route-hint">{{ nodes[id].route?.label }}</span>
        <small v-if="phase >= nodes[id].phase">→ {{ nodes[id].emit }}</small>
      </div>

      <div
        v-for="link in links"
        :key="`${link.from}-${link.to}-label`"
        :class="['link-chip', link.kind, { hero: link.hero, on: phase >= link.phase }]"
        :style="linkLabelStyle(link)"
      >
        <strong>{{ link.label }}</strong>
        <small v-if="link.hero">画像校准</small>
      </div>

      <aside class="profile-panel" :class="{ active: phase >= 3 }">
        <div class="panel-head">
          <span>画像变化 · 六维跳变</span>
          <strong>{{ phase >= 3 ? `+${profileDelta}` : '-' }}</strong>
        </div>
        <div
          v-for="dim in dimensions"
          :key="dim.name"
          class="dim-row"
          :style="{ '--tone': color(dim.color), '--before': `${dim.before}%`, '--after': `${phase >= 3 ? dim.after : dim.before}%` }"
        >
          <span>{{ dim.name }}<i v-if="dim.weak">弱</i></span>
          <b><em /></b>
          <strong>{{ phase >= 3 ? dim.after : dim.before }}</strong>
        </div>
      </aside>

      <aside
        class="agent-inspector"
        :class="selectedAgentStatus.tone"
        :style="{ '--tone': color(selectedNode.color) }"
        aria-live="polite"
      >
        <div class="inspector-head">
          <div>
            <span>智能体联动详情</span>
            <strong>{{ selectedNode.cn }}</strong>
          </div>
          <div class="inspector-actions">
            <b>{{ selectedAgentStatus.label }}</b>
            <button
              v-if="selectedRoute"
              type="button"
              @click="requestSelectedRoute"
            >
              请求跳转
            </button>
          </div>
        </div>
        <div
          v-if="routeRequestVisible && selectedRoute"
          class="route-request"
          role="dialog"
          aria-label="是否跳转对应模块"
        >
          <span>是否跳转到对应模块：{{ selectedRoute.label }}？</span>
          <div>
            <button type="button" @click="confirmSelectedRoute">跳转</button>
            <button type="button" @click="cancelRouteRequest">暂不</button>
          </div>
        </div>
        <p class="inspector-summary">{{ selectedAgentDetail.summary }}</p>
        <div class="inspector-meta" aria-label="本轮回写包摘要">
          <div>
            <span>写入对象</span>
            <strong>{{ selectedAgentDetail.target }}</strong>
          </div>
          <div>
            <span>置信度</span>
            <strong>{{ selectedAgentDetail.confidence }}%</strong>
          </div>
          <div>
            <span>变更条目</span>
            <strong>{{ selectedWritebackCount }}</strong>
          </div>
        </div>
        <div class="inspector-status">
          <i />
          <span>
            <strong>{{ selectedAgentStatus.text }}</strong>
            {{ selectedAgentDetail.current }}
          </span>
        </div>

        <div class="evidence-pack">
          <span class="section-label">证据链</span>
          <div>
            <em v-for="item in selectedAgentDetail.evidence" :key="item">{{ item }}</em>
          </div>
        </div>

        <div class="inspector-grid">
          <div>
            <span class="section-label">点击 Tip 查看优化</span>
            <ul class="tip-list">
              <li v-for="(tip, index) in selectedAgentDetail.tips" :key="tip">
                <button
                  type="button"
                  :class="{ active: selectedTipIndex === index }"
                  @click="selectTip(index)"
                >
                  {{ tip }}
                </button>
              </li>
            </ul>
          </div>
          <div class="tip-optimization" :class="{ empty: !selectedTipAction }">
            <span class="section-label">对应反向优化</span>
            <template v-if="selectedTip && selectedTipAction">
              <strong>{{ selectedTip }}</strong>
              <p>
                <em>{{ selectedTipAction.before }}</em>
                <b />
                {{ selectedTipAction.after }}
              </p>
              <small>{{ selectedTipAction.impact }}</small>
            </template>
            <div v-else class="optimization-empty">
              先点击左侧某条 Tip，这里会显示它触发的画像回写、路径重排或策略调整。
            </div>
          </div>
        </div>
        <div class="history-strip">
          <span>{{ selectedAgentDetail.next }}</span>
          <em v-for="item in selectedAgentDetail.history.slice(0, 2)" :key="item">{{ item }}</em>
        </div>
      </aside>

      <aside class="loop-narration">
        <span>第 {{ phase + 1 }} 步 / 共 5 步</span>
        <strong>{{ currentPhase.cn }}</strong>
        <p>{{ currentPhase.desc }}</p>
        <div class="phase-meter" aria-hidden="true"><i :style="{ width: `${phaseProgress}%` }" /></div>
      </aside>

      <div class="loop-legend">
        <span><i class="evidence" />证据汇入</span>
        <span><i class="engine" />反思链路</span>
        <span><i class="writeback" />画像校准</span>
        <span><i class="drive" />画像驱动下游</span>
      </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.reverse-loop {
  width: 100%;
  min-height: 720px;
  padding: 18px;
  overflow: hidden;
  border: 1px solid rgba(132, 190, 220, 0.22);
  border-radius: 18px;
  background:
    linear-gradient(135deg, rgba(95, 181, 218, 0.055), transparent 28%),
    linear-gradient(315deg, rgba(216, 179, 108, 0.05), transparent 26%);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.035),
    0 18px 54px rgba(0, 0, 0, 0.16);
}

.scaled-stage {
  position: relative;
  margin: 0 auto;
  overflow: hidden;
  border-radius: 14px;
  background:
    radial-gradient(circle at 20% 8%, rgba(95, 181, 218, 0.045), transparent 30%),
    radial-gradient(circle at 82% 86%, rgba(85, 177, 142, 0.04), transparent 34%);
}

.fixed-stage {
  position: absolute;
  top: 0;
  left: 0;
  width: 1600px;
  height: 980px;
  overflow: hidden;
  transform-origin: top left;
  font-family: "Outfit", "PingFang SC", "Microsoft YaHei", sans-serif;
  color: #eaf4ff;
}

.stage-svg,
.step-rail,
.replay-btn,
.evidence-pill,
.evidence-title,
.agent-core,
.agent-tag,
.link-chip,
.profile-panel,
.agent-inspector,
.loop-narration,
.loop-legend {
  position: absolute;
}

.stage-svg {
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
}

.star {
  animation: twinkle 4s ease-in-out var(--delay) infinite;
}

.flow-line {
  animation: flow 1.35s linear infinite;
  opacity: 0.95;
}

.beam {
  opacity: 0.18;
  transition: opacity 0.55s ease;
}

.beam.on {
  opacity: 1;
}

.beam.running path:first-child {
  stroke-opacity: 0.9;
  filter: drop-shadow(0 0 16px currentColor);
}

.beam.running path:nth-child(2) {
  stroke-width: 5;
  filter: drop-shadow(0 0 12px currentColor);
}

.beam.running .flow-line {
  stroke-width: 3;
  animation-duration: 0.62s;
}

.replay-btn {
  top: 28px;
  right: 2.5%;
  z-index: 9;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 134px;
  height: 40px;
  padding: 0 18px;
  border: 1px solid rgba(95, 181, 218, 0.48);
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(95, 181, 218, 0.18), rgba(85, 177, 142, 0.12));
  color: #9cd3ea;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 0 22px rgba(95, 181, 218, 0.18);
  transition: border-color 0.22s ease, background 0.22s ease, box-shadow 0.22s ease, transform 0.22s ease;
}

.replay-btn:hover,
.replay-btn:focus-visible {
  border-color: rgba(85, 177, 142, 0.82);
  background: linear-gradient(135deg, rgba(95, 181, 218, 0.26), rgba(85, 177, 142, 0.2));
  box-shadow: 0 0 34px rgba(95, 181, 218, 0.32);
  outline: none;
  transform: translateY(-1px);
}

.replay-btn:active {
  transform: translateY(0) scale(0.98);
}

.step-rail {
  top: 22px;
  left: 50%;
  z-index: 9;
  display: flex;
  align-items: center;
  padding: 10px 20px;
  border: 1px solid rgba(90, 160, 220, 0.18);
  border-radius: 999px;
  background: rgba(6, 10, 22, 0.72);
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(12px);
  transform: translateX(-50%);
}

.step-rail button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 58px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #5a6f92;
  font-size: 11px;
  cursor: pointer;
  transition: color 0.2s ease, transform 0.2s ease;
}

.step-rail button:hover,
.step-rail button:focus-visible {
  color: #eaf4ff;
  outline: none;
  transform: translateY(-1px);
}

.step-rail i {
  width: 13px;
  height: 13px;
  border: 1.5px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
}

.step-rail button.active {
  color: #fff;
}

.step-rail button.active i {
  border-color: #fb923c;
  background: #fb923c;
  box-shadow: 0 0 12px rgba(251, 146, 60, 0.8);
}

.step-rail button.done i {
  border-color: rgba(95, 181, 218, 0.7);
  background: rgba(95, 181, 218, 0.45);
}

.step-rail b {
  width: 34px;
  height: 2px;
  margin: 0 2px 16px;
  background: rgba(255, 255, 255, 0.1);
}

.step-rail b.done {
  background: rgba(95, 181, 218, 0.5);
}

.evidence-title {
  top: 15.1%;
  left: 7.5%;
  z-index: 4;
  color: #5a6f92;
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  transform: translateX(-50%);
}

.evidence-pill {
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 13px;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 58%);
  border-radius: 999px;
  background: rgba(7, 12, 26, 0.86);
  color: #eaf4ff;
  font-size: 13px;
  white-space: nowrap;
  transform: translate(-50%, -50%);
}

.evidence-pill i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tone);
  box-shadow: 0 0 7px var(--tone);
}

.agent-core {
  z-index: 5;
  cursor: pointer;
  transform: translate(-50%, -50%);
  transition: filter 0.28s ease, transform 0.28s ease;
}

.agent-core::before,
.agent-core::after {
  position: absolute;
  inset: -16%;
  z-index: 0;
  border-radius: 50%;
  pointer-events: none;
  content: "";
  opacity: 0;
}

.agent-core::before {
  border: 2px solid var(--tone);
  box-shadow: 0 0 34px color-mix(in srgb, var(--tone), transparent 25%);
}

.agent-core::after {
  background:
    conic-gradient(from 0deg, transparent 0 58%, color-mix(in srgb, var(--tone), #fff 18%) 66%, transparent 78%),
    radial-gradient(circle, transparent 58%, color-mix(in srgb, var(--tone), transparent 70%) 64%, transparent 72%);
  mix-blend-mode: screen;
}

.agent-core:hover,
.agent-core:focus-visible {
  filter: brightness(1.12) saturate(1.12);
  outline: none;
}

.agent-core:focus-visible .core-halo {
  box-shadow: 0 0 0 2px var(--tone), 0 0 34px color-mix(in srgb, var(--tone), transparent 26%);
}

.agent-core:active {
  transform: translate(-50%, -50%) scale(0.98);
}

.agent-core.running {
  z-index: 12;
  filter: brightness(1.34) saturate(1.38);
}

.agent-core.running::before {
  opacity: 0.9;
  animation: running-pulse 1.05s ease-out infinite;
}

.agent-core.running::after {
  opacity: 0.85;
  animation: running-scan 1.15s linear infinite;
}

.agent-core.running .core-halo {
  background: radial-gradient(circle, color-mix(in srgb, var(--tone), transparent 18%), rgba(255, 255, 255, 0.08) 34%, transparent 70%);
  filter: blur(10px);
  animation: energy-glow 1.1s ease-in-out infinite;
}

.agent-core.running .identity-rings circle {
  stroke-width: 3;
  stroke-dasharray: 9 4;
  animation-duration: 4s;
}

.agent-core.running .pulse-ring {
  stroke-width: 3.5;
  animation-duration: 0.95s;
}

.agent-core.running .core-image,
.agent-core.running .core-icon {
  filter:
    saturate(1.45)
    contrast(1.16)
    drop-shadow(0 0 18px var(--tone))
    drop-shadow(0 0 34px color-mix(in srgb, var(--tone), transparent 18%));
}

.run-sweep {
  position: absolute;
  inset: -24%;
  z-index: 4;
  border-radius: 50%;
  background: conic-gradient(from 30deg, transparent 0 68%, rgba(255, 255, 255, 0.85) 72%, transparent 78%);
  mix-blend-mode: screen;
  pointer-events: none;
  animation: running-scan 0.88s linear infinite;
}

.run-badge {
  position: absolute;
  top: -18px;
  left: 50%;
  z-index: 9;
  padding: 4px 9px;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 26%);
  border-radius: 999px;
  background: color-mix(in srgb, var(--tone), #06101d 68%);
  color: #fff;
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.14em;
  white-space: nowrap;
  box-shadow: 0 0 18px color-mix(in srgb, var(--tone), transparent 28%);
  transform: translateX(-50%);
  animation: run-badge-pop 0.8s ease-in-out infinite alternate;
}

.agent-core.selected .core-halo {
  background: radial-gradient(circle, color-mix(in srgb, var(--tone), transparent 52%), rgba(255, 255, 255, 0.04) 38%, transparent 68%);
  filter: blur(12px);
}

.agent-core.selected .identity-rings circle:first-child {
  stroke: var(--tone);
  stroke-width: 2.4;
  stroke-dasharray: 8 5;
}

.agent-core.hub {
  z-index: 7;
}

.agent-core.engine {
  z-index: 6;
}

.core-halo {
  position: absolute;
  inset: -42%;
  border-radius: 50%;
  background: radial-gradient(circle, var(--tone-soft), rgba(255, 255, 255, 0.02) 38%, transparent 66%);
  filter: blur(16px);
}

.identity-rings,
.core-orb,
.core-icon,
.core-image {
  position: absolute;
}

.identity-rings,
.core-orb {
  inset: 0;
  width: 100%;
  height: 100%;
}

.identity-rings {
  z-index: 1;
  overflow: visible;
}

.identity-rings circle {
  fill: none;
  stroke: color-mix(in srgb, var(--tone), transparent 48%);
  stroke-width: 1.5;
  stroke-dasharray: 4 7;
  transform-origin: 100px 100px;
  animation: spin 17s linear infinite;
}

.agent-core.engine .identity-rings circle {
  stroke-dasharray: 4 5;
  animation-duration: 9s;
}

.identity-rings .pulse-ring {
  stroke: var(--tone);
  stroke-width: 2;
  stroke-dasharray: none;
  animation: ring 1.8s ease-out infinite;
}

.core-orb {
  z-index: 2;
}

.core-orb circle {
  stroke: color-mix(in srgb, var(--tone), transparent 32%);
  stroke-width: 1.5;
}

.core-icon {
  top: 50%;
  left: 50%;
  z-index: 3;
  width: 48%;
  height: 48%;
  overflow: visible;
  fill: none;
  stroke: color-mix(in srgb, #fff, var(--tone) 18%);
  stroke-width: 3.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 0 8px var(--tone));
  transform: translate(-50%, -50%);
  animation: bob 5s ease-in-out var(--delay) infinite;
}

.core-icon .filled {
  fill: currentColor;
  stroke: none;
  color: color-mix(in srgb, #fff, var(--tone) 12%);
}

.core-image {
  inset: -8%;
  z-index: 3;
  width: 116%;
  height: 116%;
  object-fit: contain;
  object-position: center;
  mix-blend-mode: normal;
  opacity: 0.96;
  filter: saturate(1.18) contrast(1.08) drop-shadow(0 0 18px color-mix(in srgb, var(--tone), transparent 24%));
  animation: image-bob 5.5s ease-in-out var(--delay) infinite;
  mask-image: radial-gradient(circle at 50% 48%, #000 68%, transparent 89%);
}

.agent-tag {
  z-index: 8;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 230px;
  gap: 5px;
  pointer-events: none;
  transform: translate(-50%, 0);
}

.agent-tag strong {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 5px 15px 5px 7px;
  border: 1.5px solid color-mix(in srgb, var(--tone), transparent 52%);
  border-radius: 999px;
  background: rgba(6, 10, 22, 0.42);
  backdrop-filter: blur(6px);
  color: #fff;
  font-family: "Noto Serif SC", serif;
  font-size: clamp(14px, 1.15vw, 20px);
  font-weight: 600;
  white-space: nowrap;
}

.agent-tag.active strong {
  border-color: color-mix(in srgb, var(--tone), transparent 20%);
  box-shadow: 0 0 24px color-mix(in srgb, var(--tone), transparent 58%);
}

.agent-tag.running strong {
  border-color: var(--tone);
  background: color-mix(in srgb, var(--tone), #05070f 72%);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--tone), transparent 44%),
    0 0 30px color-mix(in srgb, var(--tone), transparent 32%);
  animation: label-running 0.9s ease-in-out infinite alternate;
}

.agent-tag.selected strong {
  border-color: var(--tone);
  background: color-mix(in srgb, var(--tone), #060a16 82%);
}

.agent-tag.selected small {
  color: #fff;
}

.agent-tag em {
  padding: 1px 6px;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 54%);
  border-radius: 4px;
  background: color-mix(in srgb, var(--tone), transparent 84%);
  color: var(--tone);
  font-family: "JetBrains Mono", monospace;
  font-size: 9px;
  font-style: normal;
  letter-spacing: 0.1em;
}

.agent-tag span {
  max-width: 100%;
  padding: 2px 11px;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 84%);
  border-radius: 6px;
  background: color-mix(in srgb, var(--tone), transparent 94%);
  color: #9bb4d4;
  font-size: 10px;
  white-space: nowrap;
}

.agent-tag .route-hint {
  border-color: color-mix(in srgb, var(--tone), transparent 56%);
  background: color-mix(in srgb, var(--tone), transparent 88%);
  color: color-mix(in srgb, #fff, var(--tone) 35%);
  font-weight: 700;
}

.agent-tag small {
  color: var(--tone);
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  white-space: nowrap;
}

.link-chip {
  z-index: 6;
  padding: 5px 13px;
  border: 1px solid rgba(95, 181, 218, 0.3);
  border-radius: 999px;
  background: rgba(6, 10, 22, 0.38);
  backdrop-filter: blur(6px);
  color: #5fb5da;
  font-size: 12px;
  opacity: 0.2;
  transform: translate(-50%, -50%);
  transition: opacity 0.45s ease, filter 0.45s ease;
}

.link-chip.on {
  opacity: 1;
}

.link-chip.running {
  opacity: 1;
  filter: drop-shadow(0 0 18px currentColor);
  animation: link-chip-running 0.9s ease-in-out infinite alternate;
}

.link-chip.engine {
  border-color: rgba(251, 146, 60, 0.44);
  color: #fb923c;
}

.link-chip.writeback {
  border-color: rgba(85, 177, 142, 0.46);
  color: #55b18e;
}

.link-chip.hero {
  width: 190px;
  padding: 10px 12px;
  border-radius: 0;
  text-align: center;
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  filter: drop-shadow(0 0 12px rgba(85, 177, 142, 0.32));
}

.link-chip strong,
.link-chip small {
  display: block;
}

.link-chip small {
  margin-top: 2px;
  font-family: "JetBrains Mono", monospace;
  font-size: 9px;
  letter-spacing: 0.12em;
}

.profile-panel {
  top: 38.2%;
  left: 77.4%;
  z-index: 9;
  width: 250px;
  padding: 14px 16px;
  border: 1px solid rgba(141, 132, 214, 0.32);
  border-radius: 14px;
  background: rgba(8, 15, 32, 0.36);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.26);
  backdrop-filter: blur(7px);
  transform: translate(0, -50%);
}

.profile-panel::before {
  position: absolute;
  top: 0;
  right: 16px;
  left: 16px;
  height: 2px;
  background: linear-gradient(90deg, transparent, #8d84d6, transparent);
  content: "";
}

.profile-panel.active {
  border-color: rgba(141, 132, 214, 0.58);
  box-shadow: 0 0 28px rgba(141, 132, 214, 0.3);
}

.panel-head,
.dim-row {
  display: grid;
  align-items: center;
}

.panel-head {
  grid-template-columns: 1fr auto;
  margin-bottom: 11px;
}

.panel-head span {
  color: #a89fdd;
  font-family: "JetBrains Mono", monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.11em;
}

.panel-head strong {
  color: #55b18e;
  font-family: "Noto Serif SC", serif;
  font-size: 18px;
}

.dim-row {
  grid-template-columns: 58px 1fr 30px;
  gap: 8px;
  margin-top: 7px;
}

.dim-row span {
  display: flex;
  align-items: center;
  gap: 3px;
  color: #eaf4ff;
  font-size: 10px;
  white-space: nowrap;
}

.dim-row i {
  padding: 0 3px;
  border-radius: 3px;
  background: rgba(217, 138, 164, 0.18);
  color: #d98aa4;
  font-size: 7px;
  font-style: normal;
}

.dim-row b {
  position: relative;
  height: 7px;
  overflow: hidden;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
}

.dim-row b::before,
.dim-row em {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  content: "";
}

.dim-row b::before {
  width: var(--before);
  background: rgba(255, 255, 255, 0.14);
}

.dim-row em {
  width: var(--after);
  background: linear-gradient(90deg, color-mix(in srgb, var(--tone), transparent 48%), var(--tone));
  box-shadow: 0 0 8px color-mix(in srgb, var(--tone), transparent 42%);
  transition: width 1.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.dim-row strong {
  color: var(--tone);
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  text-align: right;
}

.agent-inspector {
  top: 43.2%;
  left: 2.5%;
  z-index: 10;
  width: 430px;
  max-height: 398px;
  padding: 14px;
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 64%);
  border-radius: 14px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--tone), transparent 92%), rgba(8, 15, 32, 0.28)),
    rgba(8, 15, 32, 0.26);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 18px 44px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(7px);
}

.agent-inspector::before {
  position: absolute;
  top: 0;
  right: 18px;
  left: 18px;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--tone), transparent);
  content: "";
}

.inspector-head,
.inspector-status,
.inspector-grid {
  display: grid;
}

.inspector-head {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
}

.inspector-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.inspector-head span,
.section-label {
  display: block;
  color: var(--tone);
  font-family: "JetBrains Mono", monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.inspector-head strong {
  display: block;
  margin-top: 5px;
  color: #fff;
  font-family: "Noto Serif SC", serif;
  font-size: 20px;
  font-weight: 600;
}

.inspector-head b {
  padding: 4px 8px;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 44%);
  border-radius: 999px;
  background: color-mix(in srgb, var(--tone), transparent 88%);
  color: #fff;
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  white-space: nowrap;
}

.inspector-actions button {
  min-height: 26px;
  padding: 0 9px;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 50%);
  border-radius: 7px;
  background: color-mix(in srgb, var(--tone), transparent 86%);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}

.inspector-actions button:hover,
.inspector-actions button:focus-visible {
  background: color-mix(in srgb, var(--tone), transparent 74%);
  outline: none;
  transform: translateY(-1px);
}

.agent-inspector.pending .inspector-head b {
  border-color: rgba(155, 180, 212, 0.32);
  background: rgba(155, 180, 212, 0.08);
  color: #9bb4d4;
}

.agent-inspector.done .inspector-head b {
  border-color: rgba(85, 177, 142, 0.42);
  background: rgba(85, 177, 142, 0.1);
  color: #55b18e;
}

.inspector-summary {
  margin: 9px 0 8px;
  color: #bfd1ea;
  font-size: 12px;
  line-height: 1.5;
}

.inspector-meta {
  display: grid;
  grid-template-columns: 1.15fr 0.75fr 0.75fr;
  gap: 8px;
  margin: 0 0 10px;
}

.inspector-meta div {
  min-width: 0;
  padding: 8px 9px;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 78%);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.035);
}

.inspector-meta span {
  display: block;
  margin-bottom: 4px;
  color: #7f95b5;
  font-size: 9px;
}

.inspector-meta strong {
  display: block;
  overflow: hidden;
  color: #fff;
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspector-status {
  grid-template-columns: 8px 1fr;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
  padding: 7px 9px;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 78%);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
  color: #9bb4d4;
  font-size: 11px;
}

.inspector-status i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tone);
  box-shadow: 0 0 10px var(--tone);
}

.inspector-section {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.evidence-pack {
  margin-bottom: 10px;
}

.evidence-pack div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 7px;
}

.evidence-pack em {
  padding: 4px 7px;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 72%);
  border-radius: 5px;
  background: color-mix(in srgb, var(--tone), transparent 91%);
  color: #c7d6ec;
  font-size: 10px;
  font-style: normal;
}

.update-row {
  padding: 8px 9px;
  border: 1px solid rgba(255, 255, 255, 0.075);
  border-radius: 10px;
  background: rgba(5, 7, 15, 0.2);
}

.update-row strong {
  display: block;
  color: #fff;
  font-size: 12px;
}

.update-row p {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 4px 0;
  color: color-mix(in srgb, var(--tone), #fff 18%);
  font-size: 11px;
}

.update-row p b {
  width: 18px;
  height: 1px;
  background: color-mix(in srgb, var(--tone), transparent 40%);
}

.update-row em {
  color: #8fa5c4;
  font-style: normal;
}

.update-row small {
  display: block;
  color: #6f84a6;
  font-size: 10px;
  line-height: 1.45;
}

.inspector-grid {
  grid-template-columns: 0.95fr 1.05fr;
  gap: 10px;
  margin-top: 10px;
}

.tip-optimization {
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 72%);
  border-radius: 10px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--tone), transparent 90%), rgba(5, 7, 15, 0.18)),
    rgba(5, 7, 15, 0.2);
}

.tip-optimization.empty {
  border-style: dashed;
  background: rgba(255, 255, 255, 0.025);
}

.tip-optimization strong {
  display: block;
  margin-top: 7px;
  color: #fff;
  font-size: 12px;
  line-height: 1.45;
}

.tip-optimization p {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 7px 0 4px;
  color: color-mix(in srgb, var(--tone), #fff 18%);
  font-size: 11px;
  line-height: 1.45;
}

.tip-optimization p b {
  flex: 0 0 18px;
  height: 1px;
  background: color-mix(in srgb, var(--tone), transparent 40%);
}

.tip-optimization em {
  color: #8fa5c4;
  font-style: normal;
}

.tip-optimization small {
  display: block;
  color: #7f95b5;
  font-size: 10px;
  line-height: 1.45;
}

.optimization-empty {
  margin-top: 8px;
  color: #8396b8;
  font-size: 11px;
  line-height: 1.55;
}

.history-strip {
  display: grid;
  grid-template-columns: 1fr;
  gap: 5px;
  align-items: center;
  margin-top: 10px;
  padding: 8px 9px;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 76%);
  border-radius: 9px;
  background: transparent;
}

.history-strip span {
  color: #9bb4d4;
  font-size: 11px;
  line-height: 1.45;
}

.history-strip em {
  color: #6f84a6;
  font-size: 10px;
  font-style: normal;
  line-height: 1.35;
}

.route-request {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
  margin-top: 9px;
  padding: 9px 10px;
  border: 1px solid rgba(216, 179, 108, 0.28);
  border-radius: 10px;
  background: rgba(216, 179, 108, 0.08);
}

.route-request span {
  color: #f6dca2;
  font-size: 11px;
  line-height: 1.45;
}

.route-request div {
  display: flex;
  gap: 6px;
}

.route-request button {
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid rgba(216, 179, 108, 0.32);
  border-radius: 7px;
  background: rgba(216, 179, 108, 0.12);
  color: #fff2cc;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}

.route-request button:last-child {
  border-color: rgba(155, 180, 212, 0.22);
  background: rgba(155, 180, 212, 0.08);
  color: #a9bad4;
}

.route-request button:hover,
.route-request button:focus-visible {
  outline: none;
  transform: translateY(-1px);
}

.tip-list,
.history-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 0;
  margin: 7px 0 0;
  list-style: none;
}

.tip-list li,
.history-list li {
  position: relative;
  padding-left: 12px;
  color: #9bb4d4;
  font-size: 10px;
  line-height: 1.42;
}

.tip-list li {
  padding-left: 0;
}

.tip-list button {
  position: relative;
  width: 100%;
  padding: 5px 7px 5px 14px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #9bb4d4;
  font-size: 10px;
  line-height: 1.42;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
}

.tip-list button::before {
  position: absolute;
  top: 0.92em;
  left: 6px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--tone);
  content: "";
}

.tip-list button:hover,
.tip-list button:focus-visible,
.tip-list button.active {
  border-color: color-mix(in srgb, var(--tone), transparent 74%);
  background: color-mix(in srgb, var(--tone), transparent 92%);
  color: #fff;
  outline: none;
}

.tip-list li::before,
.history-list li::before {
  position: absolute;
  top: 0.58em;
  left: 0;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--tone);
  content: "";
}

.tip-list li::before {
  content: none;
}

.loop-narration {
  bottom: 3.8%;
  left: 2.5%;
  z-index: 9;
  width: 360px;
  padding: 15px 18px;
  border: 1px solid rgba(90, 160, 220, 0.28);
  border-radius: 14px;
  background: transparent;
  backdrop-filter: none;
}

.loop-narration span {
  color: #5fb5da;
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  letter-spacing: 0.12em;
}

.loop-narration strong {
  margin-left: 8px;
  color: #fff;
  font-size: 15px;
}

.loop-narration p {
  margin: 7px 0 0;
  color: #9bb4d4;
  font-size: 13px;
  line-height: 1.55;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.55);
}

.phase-meter {
  height: 4px;
  margin-top: 12px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.035);
}

.phase-meter i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #5fb5da, #c583a6, #d8b36c);
  box-shadow: 0 0 18px rgba(197, 131, 166, 0.28);
  transition: width 0.42s ease;
}

.loop-legend {
  bottom: 3.1%;
  left: 50%;
  z-index: 9;
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 10px 24px;
  border: 1px solid rgba(90, 160, 220, 0.18);
  border-radius: 999px;
  background: rgba(6, 10, 22, 0.3);
  backdrop-filter: blur(7px);
  transform: translateX(-50%);
}

.loop-legend span {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #9bb4d4;
  font-size: 12px;
  white-space: nowrap;
}

.loop-legend i {
  width: 32px;
  height: 2px;
  background: #5fb3a6;
}

.loop-legend .engine {
  background: repeating-linear-gradient(90deg, #fb923c 0 6px, transparent 6px 10px);
}

.loop-legend .writeback {
  height: 3px;
  background: #c583a6;
}

.loop-legend .drive {
  background: repeating-linear-gradient(90deg, #5fb5da 0 6px, transparent 6px 10px);
}

@keyframes flow {
  to {
    stroke-dashoffset: -18;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes twinkle {
  0%,
  100% {
    opacity: 0.18;
  }
  50% {
    opacity: 1;
  }
}

@keyframes ring {
  from {
    opacity: 0.8;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(1.35);
  }
}

@keyframes running-pulse {
  0% {
    opacity: 0.9;
    transform: scale(0.88);
  }
  100% {
    opacity: 0;
    transform: scale(1.28);
  }
}

@keyframes running-scan {
  to {
    transform: rotate(360deg);
  }
}

@keyframes energy-glow {
  0%,
  100% {
    opacity: 0.72;
    transform: scale(0.96);
  }
  50% {
    opacity: 1;
    transform: scale(1.06);
  }
}

@keyframes run-badge-pop {
  from {
    transform: translateX(-50%) translateY(0);
  }
  to {
    transform: translateX(-50%) translateY(-3px);
  }
}

@keyframes label-running {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-2px);
  }
}

@keyframes link-chip-running {
  from {
    transform: translate(-50%, -50%) scale(1);
  }
  to {
    transform: translate(-50%, -50%) scale(1.04);
  }
}

@keyframes bob {
  0%,
  100% {
    transform: translate(-50%, -50%) translateY(0);
  }
  50% {
    transform: translate(-50%, -50%) translateY(-7px);
  }
}

@keyframes image-bob {
  0%,
  100% {
    transform: translateX(5%) translateY(0) scale(1);
  }
  50% {
    transform: translateX(5%) translateY(-7px) scale(1.015);
  }
}

@media (max-width: 1100px) {
  .reverse-loop {
    padding: 10px;
  }

  .loop-legend {
    gap: 12px;
    padding-inline: 14px;
  }
}
</style>
