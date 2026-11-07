import { computed, ref } from 'vue'

export type ReverseAgentId = 'eval' | 'reflect' | 'profile' | 'path' | 'resource' | 'tutor'
export type ReverseStageId = 'intake' | 'evaluate' | 'reflect' | 'writeback' | 'fanout'

export interface ReverseRouteTarget {
  path: string
  query?: Record<string, string>
  label: string
}

export interface ReverseAction {
  label: string
  before: string
  after: string
  impact: string
}

export interface ReverseAgent {
  id: ReverseAgentId
  name: string
  en: string
  tone: string
  stage: ReverseStageId
  role: string
  emit: string
  summary: string
  confidence: number
  evidence: string[]
  actions: ReverseAction[]
  history: string[]
  img: string
  route?: ReverseRouteTarget
}

export interface ReverseStage {
  id: ReverseStageId
  code: string
  name: string
  desc: string
  agents: ReverseAgentId[]
}

export interface ReverseDimension {
  name: string
  before: number
  after: number
  tone: string
  weak?: boolean
}

export const reverseRoundMeta = {
  version: '#0512-R2',
  credibility: 86,
  writebackDims: 6,
  downstream: 3,
}

export const reverseEvidenceSources = [
  { label: '学习行为', tone: '#5fb3a6', count: '1,568 条' },
  { label: '测评作答', tone: '#c583a6', count: '57 次' },
  { label: '资源完成度', tone: '#55b18e', count: '312 项' },
  { label: '对话记录', tone: '#5fb5da', count: '128 条' },
]

/** 左栏学习路径进度（与学习路径页的阶段命名保持一致） */
export const reversePathStages = [
  { name: '基础巩固', state: 'done' as const },
  { name: '能力提升', state: 'running' as const },
  { name: '综合应用', state: 'locked' as const },
  { name: '拓展拔高', state: 'locked' as const },
]

export const reverseDimensions: ReverseDimension[] = [
  { name: '知识广度', before: 42, after: 58, tone: '#5fb5da' },
  { name: '知识深度', before: 52, after: 76, tone: '#6f9dd8' },
  { name: '应用能力', before: 35, after: 61, tone: '#55b18e' },
  { name: '创新力', before: 52, after: 74, tone: '#a89fdd' },
  { name: '工程实践', before: 57, after: 82, tone: '#d8b36c' },
  { name: '知识迁移', before: 33, after: 48, tone: '#d98aa4', weak: true },
]

export const reverseStages: ReverseStage[] = [
  {
    id: 'intake',
    code: 'INTAKE',
    name: '证据汇入',
    desc: '学习行为、测评作答、资源完成度与对话记录四类证据持续汇入评估智能体。',
    agents: ['eval'],
  },
  {
    id: 'evaluate',
    code: 'EVALUATE',
    name: '评估定位',
    desc: '评估智能体判断掌握度、错因与薄弱点，产出结构化、可追溯的评估证据。',
    agents: ['eval'],
  },
  {
    id: 'reflect',
    code: 'REFLECT',
    name: '反思研判',
    desc: '反思智能体研判评估结论，决定回写哪些画像维度、更新幅度是多少、依据来自哪里。',
    agents: ['reflect'],
  },
  {
    id: 'writeback',
    code: 'WRITE-BACK',
    name: '画像回写',
    desc: '更新指令写入学生画像，形成新版本，六个维度发生跳变并保留可回放历史。',
    agents: ['profile'],
  },
  {
    id: 'fanout',
    code: 'FAN-OUT',
    name: '下游联动',
    desc: '新画像驱动路径重排、资源重配与辅导策略调整，评估结果真正改变后续学习。',
    agents: ['path', 'resource', 'tutor'],
  },
]

export const reverseAgents: Record<ReverseAgentId, ReverseAgent> = {
  eval: {
    id: 'eval',
    name: '评估智能体',
    en: 'EVALUATION AGENT',
    tone: '#c583a6',
    stage: 'evaluate',
    role: '判断掌握度 / 错因 / 薄弱点',
    emit: '生成结构化评估证据',
    summary: '把本轮智能对话、测评作答和资源完成情况合并成可回写的证据包。',
    confidence: 88,
    evidence: ['测评错题 2/3', '对话追问 3 次', '资源停留 18 分钟'],
    actions: [
      { label: '错因聚类', before: '普通图遍历错误', after: 'BFS visited 标记时机错误', impact: '让画像更新指向更小的知识颗粒' },
      { label: '掌握度校准', before: '图结构 68%', after: '图结构 42%', impact: '触发路径重排和补弱资源' },
      { label: '证据绑定', before: '零散学习日志', after: '测评 2/3 错题 + 对话追问 3 次', impact: '给后续回写提供可追溯依据' },
    ],
    history: ['写入评估快照 #EVAL-0512-R2', '生成 4 条证据标签', '输出置信度 0.88'],
    img: '/reverse-evaluation/agent-evaluation.jpg',
    route: {
      path: '/evaluation',
      query: { learner: '学习者 A', course: '计算机科学基础' },
      label: '进入智能评估',
    },
  },
  reflect: {
    id: 'reflect',
    name: '反思智能体',
    en: 'REFLECTION ENGINE',
    tone: '#fb923c',
    stage: 'reflect',
    role: '反思评估结果 / 触发反向回写',
    emit: '决定回写哪些画像维度',
    summary: '把评估结论反向翻译成"哪些画像字段要改、改多少、为什么改"。',
    confidence: 83,
    evidence: ['新证据高于阈值', '历史偏好出现冲突', '弱项连续命中 2 轮'],
    actions: [
      { label: '回写判定', before: '只有评估报告', after: '画像更新指令', impact: '从报告展示变成真正影响后续学习' },
      { label: '冲突处理', before: '偏好：文字讲解', after: '偏好：思维导图 + 例题拆解', impact: '让辅导方式随本轮表现调整' },
      { label: '范围收敛', before: '泛化补弱', after: '锁定指针传参与 BFS 标记', impact: '避免把路径改得过散' },
    ],
    history: ['追加反思记录 #REFLECT-0512-R2', '确认 6 个画像字段可更新', '输出置信度 0.83'],
    img: '/reverse-evaluation/agent-reflection.jpg',
  },
  profile: {
    id: 'profile',
    name: '画像智能体',
    en: 'PROFILE AGENT',
    tone: '#8d84d6',
    stage: 'writeback',
    role: '学生模型 / 唯一真相源',
    emit: '画像 6 维度被更新',
    summary: '把反思智能体给出的更新指令写入画像历史，形成新的学生画像版本。',
    confidence: 91,
    evidence: ['6 个字段可回放', '3 个下游订阅成功', '弱项标签已细化'],
    actions: [
      { label: '历史版本', before: '画像版本 #0512-R1', after: '画像版本 #0512-R2', impact: '保留可回放的画像演变历史' },
      { label: '弱项字段', before: '图结构理解薄弱', after: 'BFS visited 标记薄弱', impact: '把薄弱点细化到可练习任务' },
      { label: '偏好字段', before: '文字讲解', after: '思维导图 + 例题拆解', impact: '驱动资源与辅导风格一起调整' },
    ],
    history: ['写入画像历史 #PROFILE-0512-R2', '更新 6 个维度', '同步下游智能体 3 个'],
    img: '/reverse-evaluation/agent-profile.jpg',
    route: {
      path: '/dialogue',
      query: { tab: 'portrait-report' },
      label: '打开画像报告',
    },
  },
  path: {
    id: 'path',
    name: '路径智能体',
    en: 'PATH AGENT',
    tone: '#5fb5da',
    stage: 'fanout',
    role: '重排学习路径',
    emit: '插入 1 个补救节点',
    summary: '读取新画像后，把下一轮学习路径从"继续推进"改成"先补弱再推进"。',
    confidence: 86,
    evidence: ['BFS 专项插入成功', '主路径延后 2 节', '复测入口已生成'],
    actions: [
      { label: '路径插入', before: '图基础复习', after: 'BFS visited 标记专项', impact: '把时间花在真正失分点上' },
      { label: '顺序调整', before: '先上新知识', after: '先完成 20 分钟补弱', impact: '降低下一轮学习断点' },
      { label: '复测节点', before: '无复测', after: '无提示复测', impact: '验证画像更新是否有效' },
    ],
    history: ['生成路径版本 #PATH-0512-R2', '插入 1 个补救节点', '延后 2 个低优先级节点'],
    img: '/reverse-evaluation/agent-path.jpg',
    route: {
      path: '/learning-path',
      label: '查看学习路径',
    },
  },
  resource: {
    id: 'resource',
    name: '资源智能体',
    en: 'RESOURCE AGENT',
    tone: '#55b18e',
    stage: 'fanout',
    role: '替换 / 推荐资源',
    emit: '重配 3 个资源',
    summary: '根据画像变化替换学习材料，把泛化资源换成可直接修复薄弱点的资源。',
    confidence: 84,
    evidence: ['替换资源 3 个', '新增推荐理由 2 条', '绑定画像字段 4 个'],
    actions: [
      { label: '资源重配', before: '图论概念长文', after: 'BFS 队列快照动画', impact: '让学生看到标记时机变化' },
      { label: '练习替换', before: '综合题 3 道', after: 'visited 专项 6 题', impact: '提高补弱命中率' },
      { label: '推荐解释', before: '按课程推荐', after: '按画像证据推荐', impact: '让推荐原因可追溯' },
    ],
    history: ['生成资源包 #RESOURCE-0512-R2', '替换 3 个资源', '新增 2 条推荐理由'],
    img: '/reverse-evaluation/agent-resource.jpg',
    route: {
      path: '/resources',
      query: { tab: 'resources' },
      label: '进入资源中心',
    },
  },
  tutor: {
    id: 'tutor',
    name: '辅导智能体',
    en: 'TUTOR AGENT',
    tone: '#d8b36c',
    stage: 'fanout',
    role: '调整讲解与练习策略',
    emit: '调整 2 处策略',
    summary: '读取新画像后，调整下一次智能对话的讲解方式、追问顺序和练习提示。',
    confidence: 87,
    evidence: ['讲解策略调整 2 处', '新增复测入口 1 个', '提示强度已下调'],
    actions: [
      { label: '讲解风格', before: '文字说明', after: '图示推演 + 例题拆解', impact: '贴合本轮新偏好' },
      { label: '追问顺序', before: '开放式追问', after: '先问标记时机再问边界', impact: '快速定位是否真正掌握' },
      { label: '提示策略', before: '直接给思路', after: '分步提示 + 无提示复测', impact: '减少对提示的依赖' },
    ],
    history: ['更新辅导策略 #TUTOR-0512-R2', '调整 2 处讲解策略', '新增 1 个复测入口'],
    img: '/reverse-evaluation/agent-tutor.jpg',
    route: {
      path: '/tutoring',
      query: { topic: 'BFS visited 标记时机', module: '图结构', unit: '广度优先搜索', mastery: '42' },
      label: '进入智能辅导',
    },
  },
}

/** 学生当前学习状态快照（左栏） */
export const reverseStudent = {
  name: '学习者 A',
  grade: '计算机科学基础',
  level: 'LV.3',
  stats: [
    { label: '学习进度', value: '68%', bar: 68 },
    { label: '已掌握知识点', value: '42 个' },
    { label: '待巩固知识点', value: '8 个' },
    { label: '最近测评', value: '82 分' },
    { label: '连续学习天数', value: '12 天' },
    { label: '路径完成度', value: '68%' },
  ],
}

export type MasteryStatus = 'mastered' | 'improve' | 'weak'

export const knowledgeMastery: { name: string; status: MasteryStatus }[] = [
  { name: '线性结构', status: 'mastered' },
  { name: '排序算法', status: 'mastered' },
  { name: '递归与分治', status: 'improve' },
  { name: '图结构', status: 'weak' },
  { name: 'BFS 标记时机', status: 'weak' },
  { name: '指针与内存', status: 'improve' },
]

/** 一键检查后引擎执行的任务清单，from/to 为总进度区间（0-100） */
export const reverseRunChecklist = [
  { label: '正在分析学习进度数据', from: 0, to: 18 },
  { label: '正在识别掌握与薄弱知识点', from: 18, to: 40 },
  { label: '正在归因薄弱环节', from: 40, to: 68 },
  { label: '正在生成更新学习画像', from: 68, to: 88 },
  { label: '准备同步到画像历史报告', from: 88, to: 100 },
]

/** 历史画像报告（画像生成模块）已有版本 */
export const reverseHistoryReports = [
  { version: 'V1', time: '05-12 10:18', note: '学习画像报告' },
  { version: 'V0.3', time: '05-05 09:47', note: '学习画像报告' },
  { version: 'V0.2', time: '04-28 16:22', note: '学习画像报告' },
  { version: 'V0.1', time: '04-20 11:03', note: '学习画像报告' },
]

/** 最新画像报告里的质化字段（六维数值行之外的补充行） */
export const reportExtraDeltas = [
  { label: '学习风险等级', before: '中等', after: '低', good: true },
  { label: '资源偏好匹配', before: '62%', after: '82%', good: true },
]

/** 底部"本次画像更新结果"对比卡 */
export const reverseSummaryDeltas = [
  { label: '知识掌握度', before: 72, after: 81, unit: '%', tone: '#5fb5da' },
  { label: '路径匹配度', before: 68, after: 86, unit: '%', tone: '#a89fdd' },
  { label: '资源偏好匹配度', before: 62, after: 82, unit: '%', tone: '#55b18e' },
  { label: '学习潜力评分', before: 76, after: 88, unit: '分', tone: '#d8b36c' },
  { label: '学习效率', before: 1.2, after: 1.9, unit: 'x', tone: '#c583a6' },
]

export const reverseEngineMeta = {
  engine: 'ReverseEngine v2.3.1',
  dataSource: '学习行为 + 测评作答 + 资源完成度 + 对话记录',
  lastRun: '05-12 10:18',
  nextSuggested: '7 天后',
}

/** 反向更新完成记录：反向更新页写入，画像生成模块读取，实现跨模块打通 */
export interface ReverseRunRecord {
  version: string
  time: string
  savedAt: number
}

export const REVERSE_RUN_STORAGE_KEY = 'edumind-reverse-update-latest'

export function loadReverseRun(): ReverseRunRecord | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(REVERSE_RUN_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ReverseRunRecord
    if (!parsed.version || !parsed.time) return null
    return parsed
  } catch {
    return null
  }
}

export function saveReverseRun(record: ReverseRunRecord) {
  try {
    window.localStorage.setItem(REVERSE_RUN_STORAGE_KEY, JSON.stringify(record))
  } catch {
    // 存储不可用时静默降级：页面内状态仍然生效
  }
}

const stageIndexById = new Map(reverseStages.map((stage, index) => [stage.id, index]))

export function stageIndexOf(id: ReverseStageId) {
  return stageIndexById.get(id) ?? 0
}

/**
 * 单轮反向更新的演算状态：阶段推进、当前聚焦智能体、六维回写结果。
 * 页面（工作台/全景图）与上游入口共用这一份数据，保证跳转前后数字一致。
 */
export function useReverseUpdateRound() {
  const activeStageIndex = ref(0)
  const activeAgentId = ref<ReverseAgentId>('eval')

  const activeStage = computed(() => reverseStages[activeStageIndex.value] ?? reverseStages[0])
  const activeAgent = computed(() => reverseAgents[activeAgentId.value])
  const writebackReached = computed(() => activeStageIndex.value >= stageIndexOf('writeback'))

  const profileDelta = computed(() =>
    reverseDimensions.reduce((sum, dim) => sum + dim.after - dim.before, 0),
  )

  function focusStage(index: number) {
    const clamped = Math.max(0, Math.min(reverseStages.length - 1, index))
    activeStageIndex.value = clamped
    const stage = reverseStages[clamped]
    if (!stage.agents.includes(activeAgentId.value)) {
      activeAgentId.value = stage.agents[0]
    }
  }

  function focusAgent(id: ReverseAgentId) {
    activeAgentId.value = id
    activeStageIndex.value = stageIndexOf(reverseAgents[id].stage)
  }

  return {
    stages: reverseStages,
    agents: reverseAgents,
    dimensions: reverseDimensions,
    evidenceSources: reverseEvidenceSources,
    roundMeta: reverseRoundMeta,
    activeStageIndex,
    activeAgentId,
    activeStage,
    activeAgent,
    writebackReached,
    profileDelta,
    focusStage,
    focusAgent,
  }
}
