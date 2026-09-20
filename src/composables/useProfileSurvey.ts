import { ref, computed } from 'vue'
import { analyzeProfile as analyzeProfileRequest, fetchLatestProfile, agentProfileAnalyze, triggerKnowledgePath } from '@/lib/api'

export interface SurveyAnswers {
  role: string
  field: string
  customField: string
  level: string
  experience: string
  shortTermGoal: string
  shortTermDetail: string
  longTermGoal: string
  motivation: string
  knowledgeBase: number
  learningSpeed: number
  logicalThinking: number
  creativity: number
  focus: number
  selfDiscipline: number
  bestTime: string
  resourcePreference: string
  weeklyHours: string
  learningPace: string
}

export interface ProfileDimension {
  label: string
  value: number
  color: string
}

export interface StatsCard {
  label: string
  value: string
  icon: string
  color: string
}

export interface WeaknessItem {
  tag: string
  count: number
}

export interface SkillItem {
  name: string
  level: number
}

export interface SkillGroup {
  category: string
  color: string
  skills: SkillItem[]
}

export interface TimelineItem {
  date: string
  event: string
  score?: string
  type?: 'up' | 'down' | ''
}

export interface PrefItem {
  label: string
  value: string
}

export interface ProfileResult {
  dimensions: ProfileDimension[]
  totalScore: number
  stats: StatsCard[]
  weaknesses: WeaknessItem[]
  skillTree: SkillGroup[]
  preferences: PrefItem[]
  timeline: TimelineItem[]
  recommendations: string[]
}

export type Phase = 'survey' | 'analyzing' | 'results'

const STORAGE_KEY = 'edumind-profile-result'

const DIMENSION_COLORS = ['#00d4ff', '#3b82f6', '#7c3aed', '#06d6a0', '#f59e0b', '#f43f5e']

export const roleOptions = [
  { value: 'student', label: '在校学生' },
  { value: 'professional', label: '职场人士' },
  { value: 'freelancer', label: '自由职业者' },
  { value: 'other', label: '其他' },
]

export const fieldOptions = [
  { value: 'cs', label: '计算机科学' },
  { value: 'data-science', label: '数据科学' },
  { value: 'ai', label: '人工智能' },
  { value: 'software-eng', label: '软件工程' },
  { value: 'other', label: '其他（请注明）' },
]

export const levelOptions = [
  { value: 'beginner', label: '初级' },
  { value: 'intermediate', label: '中级' },
  { value: 'advanced', label: '高级' },
  { value: 'expert', label: '专家' },
]

export const experienceOptions = [
  { value: 'less-than-1', label: '< 1 年' },
  { value: '1-3', label: '1 ~ 3 年' },
  { value: '3-5', label: '3 ~ 5 年' },
  { value: 'more-than-5', label: '5 年以上' },
]

export const goalOptions = [
  { value: 'skill', label: '掌握某项技能' },
  { value: 'project', label: '完成一个项目' },
  { value: 'exam', label: '准备考试/认证' },
  { value: 'other', label: '其他' },
]

export const longTermGoalOptions = [
  { value: 'career-change', label: '职业转型' },
  { value: 'skill-up', label: '技能深造' },
  { value: 'academic', label: '学术研究' },
  { value: 'other', label: '其他' },
]

export const motivationOptions = [
  { value: 'interest', label: '兴趣驱动' },
  { value: 'work', label: '工作需求' },
  { value: 'academic', label: '学业要求' },
  { value: 'growth', label: '自我成长' },
]

export const timeOptions = [
  { value: 'morning', label: '清晨 6:00-8:00' },
  { value: 'afternoon', label: '下午 14:00-17:00' },
  { value: 'evening', label: '晚间 20:00-23:00' },
  { value: 'night', label: '深夜 23:00-2:00' },
]

export const resourceOptions = [
  { value: 'video', label: '视频课程', icon: 'Video' },
  { value: 'reading', label: '阅读文档/书籍', icon: 'FileText' },
  { value: 'practice', label: '动手练习/习题', icon: 'Terminal' },
  { value: 'project', label: '项目实战', icon: 'Target' },
]

export const weeklyHourOptions = [
  { value: 'less-than-5', label: '< 5 小时' },
  { value: '5-10', label: '5 ~ 10 小时' },
  { value: '10-20', label: '10 ~ 20 小时' },
  { value: 'more-than-20', label: '20 小时以上' },
]

export const paceOptions = [
  { value: 'steady', label: '稳健型 — 扎实稳步推进' },
  { value: 'moderate', label: '均衡型 — 速度与深度平衡' },
  { value: 'fast', label: '速成型 — 快速迭代突破' },
]

export const stepLabels = ['开始', '背景', '目标', '技能', '偏好']

const defaultAnswers = (): SurveyAnswers => ({
  role: '',
  field: '',
  customField: '',
  level: '',
  experience: '',
  shortTermGoal: '',
  shortTermDetail: '',
  longTermGoal: '',
  motivation: '',
  knowledgeBase: 50,
  learningSpeed: 50,
  logicalThinking: 50,
  creativity: 50,
  focus: 50,
  selfDiscipline: 50,
  bestTime: '',
  resourcePreference: '',
  weeklyHours: '',
  learningPace: '',
})

function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function generateResult(answers: SurveyAnswers): ProfileResult {
  const { field, level, experience, motivation } = answers

  const dims = {
    knowledgeBase: adjustByLevel(answers.knowledgeBase, level),
    learningSpeed: adjustByLevel(answers.learningSpeed, level),
    logicalThinking: adjustByLevel(answers.logicalThinking, level),
    creativity: adjustByLevel(answers.creativity, level),
    focus: adjustByLevel(answers.focus, level),
    selfDiscipline: adjustByLevel(answers.selfDiscipline, level),
  }

  const entries = Object.entries(dims)
  const avg = Math.round(entries.reduce((s, [, v]) => s + v, 0) / entries.length)
  const variance = entries.reduce((s, [, v]) => s + (v - avg) ** 2, 0) / entries.length
  const consistencyBonus = variance < 150 ? 3 : 0
  const totalScore = Math.min(100, avg + consistencyBonus)

  const dimensions: ProfileDimension[] = [
    { label: '知识基础', value: dims.knowledgeBase, color: DIMENSION_COLORS[0] },
    { label: '学习速度', value: dims.learningSpeed, color: DIMENSION_COLORS[1] },
    { label: '逻辑思维', value: dims.logicalThinking, color: DIMENSION_COLORS[2] },
    { label: '创造力', value: dims.creativity, color: DIMENSION_COLORS[3] },
    { label: '专注力', value: dims.focus, color: DIMENSION_COLORS[4] },
    { label: '自律性', value: dims.selfDiscipline, color: DIMENSION_COLORS[5] },
  ]

  const weaknessMap: Record<string, string[]> = {
    'cs': ['数据结构', '算法分析', '操作系统', '计算机网络', '编译原理'],
    'data-science': ['概率论', '统计学', 'Python 数据处理', '特征工程', 'SQL'],
    'ai': ['机器学习算法', '深度学习', '自然语言处理', '计算机视觉', '大模型应用', '模型部署'],
    'software-eng': ['系统设计', '设计模式', '架构演进', 'CI/CD', '测试策略'],
  }

  const fieldTopics = weaknessMap[field] || ['基础理论', '实践应用', '算法思维', '工程方法']

  const dimensionTopicMap: Record<string, string[]> = {
    knowledgeBase: fieldTopics.slice(0, 2),
    logicalThinking: [fieldTopics[2], fieldTopics[1]],
    creativity: [fieldTopics[3], '创新方法'],
    focus: ['深度工作', '任务管理'],
    selfDiscipline: ['学习计划', '时间管理'],
    learningSpeed: [fieldTopics[0], '快速阅读'],
  }

  const weaknesses: WeaknessItem[] = []
  for (const [key, value] of Object.entries(dims)) {
    if (value < 45) {
      const topics = dimensionTopicMap[key] || []
      topics.forEach((topic, i) => {
        weaknesses.push({
          tag: topic,
          count: Math.round((50 - value) / 8 + (1 - i) * 2),
        })
      })
    }
  }

  const sortedDims = [...dimensions].sort((a, b) => a.value - b.value)
  const lowest = sortedDims.slice(0, 2)
  lowest.forEach(d => {
    if (!weaknesses.some(w => w.tag.includes(d.label.slice(0, 2)))) {
      weaknesses.push({ tag: `${d.label}提升`, count: Math.round((50 - d.value) / 6) })
    }
  })

  weaknesses.sort((a, b) => b.count - a.count)
  const deduped = weaknesses.filter((w, i) => weaknesses.findIndex(x => x.tag === w.tag) === i)
  const finalWeaknesses = deduped.slice(0, 10).map(w => ({
    ...w,
    count: Math.max(1, Math.min(15, w.count)),
  }))

  const skillGroups = generateSkillTree(field, dims)

  const preferences = [
    { label: '最佳时段', value: getLabel(answers.bestTime, timeOptions) },
    { label: '资源偏好', value: getLabel(answers.resourcePreference, resourceOptions) },
    { label: '每周投入', value: getLabel(answers.weeklyHours, weeklyHourOptions) },
    { label: '学习节奏', value: getLabel(answers.learningPace, paceOptions)?.split(' — ')[0] || '' },
  ]

  const today = getToday()
  const timeline: TimelineItem[] = [
    { date: today, event: '完成个人学习画像评估', score: `${totalScore}分`, type: 'up' },
  ]

  if (motivation) {
    timeline.push({
      date: yesterday(),
      event: `明确学习动机：${getLabel(motivation, motivationOptions)}`,
      type: '',
    })
  }

  const statValues: StatsCard[] = [
    {
      label: '综合评分', value: `${totalScore}`, icon: 'Brain', color: DIMENSION_COLORS[0],
    },
    {
      label: '最强维度', value: getStrongest(dimensions), icon: 'Zap', color: DIMENSION_COLORS[1],
    },
    {
      label: '待提升', value: `${finalWeaknesses.length} 项`, icon: 'BarChart3', color: DIMENSION_COLORS[4],
    },
    {
      label: '学习阶段', value: getLabel(level, levelOptions) || '', icon: 'BookOpen', color: DIMENSION_COLORS[3],
    },
  ]

  const fieldLabel = getLabel(field, fieldOptions) || ''
  const recommendations = generateRecommendations(answers, dimensions, fieldLabel)

  return {
    dimensions,
    totalScore,
    stats: statValues,
    weaknesses: finalWeaknesses,
    skillTree: skillGroups,
    preferences,
    timeline,
    recommendations,
  }
}

function normalizeProfileResult(raw: Partial<ProfileResult> & Record<string, any>): ProfileResult {
  const dimensions = (raw.dimensions?.length ? raw.dimensions : raw.radarPoints || []).map((item: any, index: number) => ({
    label: item.label || item.dimension || `维度 ${index + 1}`,
    value: Number(item.value ?? item.score ?? 0),
    color: item.color || DIMENSION_COLORS[index % DIMENSION_COLORS.length],
  }))
  const totalScore = Number(raw.totalScore ?? raw.score ?? 0)
  const weaknesses = (raw.weaknesses || []).map((item: any) =>
    typeof item === 'string' ? { tag: item, count: 1 } : item,
  )
  const skillGroups = raw.skillTree || Object.entries(raw.skills || {}).map(([category, skills]: [string, any]) => ({
    category,
    color: DIMENSION_COLORS[0],
    skills: (skills || []).map((name: string) => ({ name, level: totalScore })),
  }))

  return {
    ...raw,
    dimensions,
    totalScore,
    stats: raw.stats || [
      { label: '综合评分', value: `${totalScore}`, icon: '◈', color: '#00d4ff' },
      { label: '最强维度', value: `${dimensions[0]?.label || '暂无'}`, icon: '↗', color: '#06d6a0' },
      { label: '待提升', value: `${weaknesses.length}`, icon: '△', color: '#f59e0b' },
      { label: '学习阶段', value: raw.evaluation || '待评估', icon: '◎', color: '#7c3aed' },
    ],
    weaknesses,
    skillTree: skillGroups,
    preferences: raw.preferences || [],
    timeline: raw.timeline || [],
    recommendations: raw.recommendations || raw.suggestions || [],
  }
}

function adjustByLevel(value: number, level: string): number {
  const boosts: Record<string, number> = { beginner: 0, intermediate: 5, advanced: 10, expert: 15 }
  return Math.min(100, value + (boosts[level] || 0))
}

function getLabel(value: string, options: { value: string; label: string }[]): string {
  return options.find(o => o.value === value)?.label || value
}

function getStrongest(dimensions: ProfileDimension[]): string {
  return dimensions.reduce((a, b) => (a.value > b.value ? a : b)).label
}

function yesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function generateSkillTree(field: string, dims: Record<string, number>): SkillGroup[] {
  const trees: Record<string, SkillGroup[]> = {
    cs: [
      {
        category: '编程基础', color: DIMENSION_COLORS[0],
        skills: [
          { name: 'Python/Java', level: clampAvg(dims.knowledgeBase, dims.learningSpeed) },
          { name: '数据结构', level: clampAvg(dims.logicalThinking, dims.knowledgeBase) },
          { name: '算法', level: clampVal(dims.logicalThinking) },
        ],
      },
      {
        category: '系统知识', color: DIMENSION_COLORS[1],
        skills: [
          { name: '操作系统', level: clampVal(dims.knowledgeBase - 5) },
          { name: '计算机网络', level: clampVal(dims.knowledgeBase - 10) },
          { name: '数据库', level: clampAvg(dims.logicalThinking, dims.focus) },
        ],
      },
      {
        category: '工程实践', color: DIMENSION_COLORS[2],
        skills: [
          { name: '设计模式', level: clampAvg(dims.logicalThinking, dims.creativity) },
          { name: '系统设计', level: clampAvg(dims.creativity, dims.logicalThinking) },
          { name: 'DevOps', level: clampVal(dims.focus - 5) },
        ],
      },
    ],
    'data-science': [
      {
        category: '基础工具', color: DIMENSION_COLORS[0],
        skills: [
          { name: 'Python', level: clampAvg(dims.knowledgeBase, dims.learningSpeed) },
          { name: 'SQL', level: clampAvg(dims.logicalThinking, dims.focus) },
          { name: 'Excel/BI', level: clampVal(dims.knowledgeBase - 5) },
        ],
      },
      {
        category: '数据分析', color: DIMENSION_COLORS[1],
        skills: [
          { name: 'NumPy/Pandas', level: clampAvg(dims.knowledgeBase, dims.learningSpeed) },
          { name: '数据可视化', level: clampAvg(dims.creativity, dims.knowledgeBase) },
          { name: '统计分析', level: clampVal(dims.logicalThinking) },
        ],
      },
      {
        category: '机器学习', color: DIMENSION_COLORS[2],
        skills: [
          { name: '监督学习', level: clampAvg(dims.logicalThinking, dims.learningSpeed) },
          { name: '特征工程', level: clampAvg(dims.creativity, dims.knowledgeBase) },
          { name: '模型评估', level: clampVal(dims.logicalThinking - 5) },
        ],
      },
    ],
    ai: [
      {
        category: '数学与编程', color: DIMENSION_COLORS[0],
        skills: [
          { name: '线性代数', level: clampAvg(dims.logicalThinking, dims.knowledgeBase) },
          { name: '概率论', level: clampVal(dims.logicalThinking) },
          { name: 'Python 编程', level: clampAvg(dims.knowledgeBase, dims.learningSpeed) },
        ],
      },
      {
        category: '机器学习', color: DIMENSION_COLORS[1],
        skills: [
          { name: '监督学习', level: clampAvg(dims.logicalThinking, dims.learningSpeed) },
          { name: '无监督学习', level: clampAvg(dims.creativity, dims.logicalThinking) },
          { name: '模型评估与调优', level: clampVal(dims.logicalThinking - 3) },
        ],
      },
      {
        category: '深度学习', color: DIMENSION_COLORS[2],
        skills: [
          { name: '神经网络', level: clampAvg(dims.learningSpeed, dims.knowledgeBase) },
          { name: 'CNN/RNN', level: clampVal(dims.learningSpeed - 5) },
          { name: 'Transformer', level: clampVal(dims.creativity - 3) },
        ],
      },
      {
        category: 'NLP 与 CV', color: DIMENSION_COLORS[3],
        skills: [
          { name: '自然语言处理', level: clampAvg(dims.learningSpeed, dims.creativity) },
          { name: '计算机视觉', level: clampVal(dims.creativity - 5) },
          { name: '多模态学习', level: clampVal(dims.creativity - 10) },
        ],
      },
      {
        category: '前沿应用', color: DIMENSION_COLORS[4],
        skills: [
          { name: '大模型应用', level: clampAvg(dims.creativity, dims.learningSpeed) },
          { name: 'AI Agent', level: clampVal(dims.creativity - 8) },
          { name: '模型部署', level: clampVal(dims.focus - 5) },
        ],
      },
    ],
    'software-eng': [
      {
        category: '语言与框架', color: DIMENSION_COLORS[0],
        skills: [
          { name: '主流语言', level: clampAvg(dims.knowledgeBase, dims.learningSpeed) },
          { name: 'Web 框架', level: clampAvg(dims.knowledgeBase, dims.creativity) },
          { name: 'API 设计', level: clampAvg(dims.logicalThinking, dims.knowledgeBase) },
        ],
      },
      {
        category: '架构与设计', color: DIMENSION_COLORS[1],
        skills: [
          { name: '设计模式', level: clampAvg(dims.logicalThinking, dims.selfDiscipline) },
          { name: '系统架构', level: clampAvg(dims.creativity, dims.logicalThinking) },
          { name: '微服务', level: clampVal(dims.learningSpeed) },
        ],
      },
      {
        category: '质量与工程', color: DIMENSION_COLORS[2],
        skills: [
          { name: '测试策略', level: clampVal(dims.focus) },
          { name: 'CI/CD', level: clampAvg(dims.selfDiscipline, dims.focus) },
          { name: '性能优化', level: clampAvg(dims.logicalThinking, dims.creativity) },
        ],
      },
    ],
  }

  const fallback: SkillGroup[] = [
    {
      category: '核心能力', color: DIMENSION_COLORS[0],
      skills: [
        { name: '理论基础', level: clampVal(dims.knowledgeBase) },
        { name: '实践技能', level: clampAvg(dims.creativity, dims.learningSpeed) },
        { name: '问题解决', level: clampVal(dims.logicalThinking) },
      ],
    },
    {
      category: '通用素养', color: DIMENSION_COLORS[1],
      skills: [
        { name: '持续学习', level: clampAvg(dims.learningSpeed, dims.selfDiscipline) },
        { name: '专注深度', level: clampVal(dims.focus) },
        { name: '自律规划', level: clampVal(dims.selfDiscipline) },
      ],
    },
  ]

  return trees[field] || fallback
}

function clampVal(v: number): number {
  return Math.max(10, Math.min(98, Math.round(v)))
}

function clampAvg(...vals: number[]): number {
  return clampVal(vals.reduce((s, v) => s + v, 0) / vals.length)
}

function generateRecommendations(
  answers: SurveyAnswers,
  dimensions: ProfileDimension[],
  fieldLabel: string,
): string[] {
  const recs: string[] = []

  const sorted = [...dimensions].sort((a, b) => a.value - b.value)
  const weakest = sorted[0]
  const strongest = sorted[sorted.length - 1]

  recs.push(`发挥 ${strongest.label} 优势，将其作为学习 ${fieldLabel || '专业领域'} 的核心驱动力`)

  if (weakest.value < 40) {
    recs.push(`重点加强 ${weakest.label} 训练，推荐每日 15-20 分钟专项练习`)
  }

  if (answers.selfDiscipline < 40) {
    recs.push('采用番茄工作法提升学习自律性，从 25 分钟专注单元开始')
  }

  if (answers.focus < 45) {
    recs.push('优化学习环境，减少干扰源，尝试深度工作时段')
  }

  if (answers.weeklyHours === 'less-than-5') {
    recs.push('将学习拆解为 15-20 分钟微单元，利用碎片时间积累')
  } else if (answers.weeklyHours === 'more-than-20') {
    recs.push('注意学习疲劳管理，每周安排至少半天完全休息')
  }

  if (answers.bestTime === 'morning') {
    recs.push('利用清晨高认知效率时段攻克最难概念')
  } else if (answers.bestTime === 'evening' || answers.bestTime === 'night') {
    recs.push('晚间适合复习巩固，将新知识学习安排在精力更好的时段')
  }

  const styleMap: Record<string, string> = {
    video: '结合视频课程与动手实践，观看后立即编码加深理解',
    reading: '采用费曼学习法，阅读后用自己的语言复述核心概念',
    practice: '通过刻意练习巩固，重点关注错题与薄弱环节',
    project: '以项目驱动学习，在实践中构建知识体系',
  }
  if (answers.resourcePreference && styleMap[answers.resourcePreference]) {
    recs.push(styleMap[answers.resourcePreference])
  }

  recs.push(`每 2-4 周进行一次学习回顾，动态调整学习策略`)

  return recs.slice(0, 6)
}

export function useProfileSurvey() {
  const phase = ref<Phase>('survey')
  const currentStep = ref(0)
  const answers = ref<SurveyAnswers>(defaultAnswers())
  const result = ref<ProfileResult | null>(null)
  const analysisProgress = ref(0)
  const analysisMessage = ref('')

  const totalSteps = 5
  const isFirstStep = computed(() => currentStep.value === 0)
  const isLastStep = computed(() => currentStep.value === totalSteps - 1)
  const isWelcomeStep = computed(() => currentStep.value === 0)
  const progressPercent = computed(() => ((currentStep.value) / (totalSteps - 1)) * 100)

  function canProceed(): boolean {
    if (isWelcomeStep.value) return true
    const a = answers.value
    switch (currentStep.value) {
      case 1: return !!a.role && !!a.field && !!a.level && !!a.experience
      case 2: return !!a.shortTermGoal && !!a.longTermGoal && !!a.motivation
      case 3: return true
      case 4: return !!a.bestTime && !!a.resourcePreference && !!a.weeklyHours && !!a.learningPace
      default: return true
    }
  }

  function nextStep() {
    if (isLastStep.value) return
    if (!canProceed()) return
    currentStep.value++
  }

  function prevStep() {
    if (isFirstStep.value) return
    currentStep.value--
  }

  const analysisMessages = [
    '读取你的学习背景信息...',
    '分析能力维度关联...',
    '评估知识体系完整性...',
    '检测潜在薄弱环节...',
    '生成个性化学习画像...',
  ]

  async function startAnalysis() {
    phase.value = 'analyzing'
    analysisProgress.value = 0

    for (let i = 0; i < analysisMessages.length; i++) {
      analysisMessage.value = analysisMessages[i]
      analysisProgress.value = ((i + 1) / analysisMessages.length) * 100
      await delay(500 + Math.random() * 400)
    }

    try {
      const agentResult = await agentProfileAnalyze(answers.value)
      if (agentResult.profile) {
        result.value = normalizeProfileResult(agentResult.profile as ProfileResult & Record<string, any>)
      } else {
        result.value = normalizeProfileResult(await analyzeProfileRequest(answers.value) as ProfileResult & Record<string, any>)
      }
    } catch {
      try {
        result.value = normalizeProfileResult(await analyzeProfileRequest(answers.value) as ProfileResult & Record<string, any>)
      } catch {
        result.value = generateResult(answers.value)
      }
    }
    saveToStorage(result.value)
    triggerKnowledgePath(result.value).catch((err) => {
      console.warn('Failed to generate knowledge path from profile:', err)
    })
    phase.value = 'results'
  }

  function toResults(data: ProfileResult) {
    result.value = normalizeProfileResult(data as ProfileResult & Record<string, any>)
    phase.value = 'results'
  }

  function reset() {
    phase.value = 'survey'
    currentStep.value = 0
    answers.value = defaultAnswers()
    result.value = null
    analysisProgress.value = 0
    analysisMessage.value = ''
  }

  function saveToStorage(r: ProfileResult) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(r))
    } catch { /* ignore */ }
  }

  function loadFromStorage(): ProfileResult | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? normalizeProfileResult(JSON.parse(raw)) : null
    } catch {
      return null
    }
  }

  function clearStorage() {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }

  async function loadLatestSavedResult() {
    try {
      const saved = await fetchLatestProfile()
      return saved ? normalizeProfileResult(saved as ProfileResult & Record<string, any>) : null
    } catch {
      return null
    }
  }

  return {
    phase,
    currentStep,
    answers,
    result,
    analysisProgress,
    analysisMessage,
    totalSteps,
    isFirstStep,
    isLastStep,
    isWelcomeStep,
    progressPercent,
    canProceed,
    nextStep,
    prevStep,
    startAnalysis,
    toResults,
    reset,
    loadFromStorage,
    loadLatestSavedResult,
    clearStorage,
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
