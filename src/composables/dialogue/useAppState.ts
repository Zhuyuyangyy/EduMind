import { ref, computed } from 'vue'
import type { DimensionMap, ChatMessage, StudyReport, ThemeAccent, VirtualStyle, RecommendCategory, RecommendedCourse, HistoryPreset } from '@/types/dialogue'
import { courses } from '@/data/dialogue/courseData'

const HISTORY_KEY = 'edumind_portrait_history'

export const activeMenu = ref<'chat' | 'portrait-report' | 'history' | 'recommend'>('chat')
export const isSidebarCollapsed = ref(false)
export const isRightSidebarCollapsed = ref(true)
export const isMetricCollapsed = ref(false)
export const themeAccent = ref<ThemeAccent>('blue')

export const dimensions = ref<DimensionMap>({
  identity: null,
  domain: null,
  level: null,
  experience: null,
  goal: null,
  motivation: null,
  period: null,
  weeklyHours: null,
  method: null,
})

export const chats = ref<ChatMessage[]>([
  {
    id: 'welcome', sender: 'ai',
    text: '你好呀！我是你的 AI 学习导师\n我会通过和你聊天，帮你绘制专属的学习星图。\n先从简单的问题开始吧~',
    time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    source: 'chat',
    suggestChips: ['我是在校学生，学计算机的', '我是程序员，工作3年了', '我刚开始学AI，想转行'],
  },
])
export const inputText = ref('')
export const isAiLoading = ref(false)
export const selectedDimensionInfo = ref<string | null>(null)
export const report = ref<StudyReport | null>(null)
export const showReport = ref(false)
export const exportNotification = ref<string | null>(null)
export const hasGeneratedReport = ref(false)

export const recommendCategory = ref<RecommendCategory>('all')
export const recommendQaInput = ref('')
export const recommendQaMessages = ref<Array<{ sender: 'user' | 'ai'; text: string }>>([
  {
    sender: 'ai',
    text: '👋 您好！我是您的自适应学情推荐专属答疑助理。在此您可以获得由多智能体大语言模型为您提供的自学规划及推荐资源解惑。\n\n您可以选择下方的快速预置问题，或者手动输入您想了解的疑虑（例如："这三个推荐我应该按什么顺序学？"、"Gradio项目零基础可以自学吗？"），我会根据您的学业画像为您量身解答！',
  },
])
export const isRecommendQaLoading = ref(false)

export const isAiSidebarOpen = ref(true)
export const isVirtualMuted = ref(false)
export const virtualStyle = ref<VirtualStyle>('hologram')
export const isAiConnecting = ref(false)
export const isAiSpeaking = ref(false)
export const isAiListening = ref(false)
export const showAiHint = ref(false)
export const aiSubtitle = ref('你好！我是智学星枢智能虚拟导师。点击下方连麦，开启高阶语音会话。')
export const aiVolume = ref(80)
export const aiLanguage = ref('zh-CN')
export const syncToMainChat = ref(true)
export const textInput = ref('')
export const useNlp = ref(true)

export const collectedCount = computed(() =>
  Object.values(dimensions.value).filter(v => v !== null).length
)
export const canUnlockReport = computed(() => collectedCount.value >= 4)

const colorsMap = {
  blue: { text: 'text-blue-300', textHover: 'hover:text-blue-200', indicator: 'bg-blue-400', accentGlow: 'blue-400', bgBtn: 'bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white border border-blue-500/25 shadow-lg', bgBadge: 'bg-blue-950/50 text-blue-300 border-blue-800/40' },
  teal: { text: 'text-teal-400', textHover: 'hover:text-teal-300', indicator: 'bg-teal-400', accentGlow: 'teal-400', bgBtn: 'bg-gradient-to-r from-teal-600 to-emerald-500 hover:from-teal-700 hover:to-emerald-600 text-white border border-teal-500/25 shadow-lg', bgBadge: 'bg-teal-950/50 text-teal-400 border-teal-800/40' },
  ruby: { text: 'text-indigo-400', textHover: 'hover:text-indigo-300', indicator: 'bg-indigo-400', accentGlow: 'indigo-400', bgBtn: 'bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600 text-white border border-indigo-500/25 shadow-lg', bgBadge: 'bg-indigo-950/50 text-indigo-400 border-indigo-800/40' },
  cyan: { text: 'text-cyan-400', textHover: 'hover:text-cyan-300', indicator: 'bg-cyan-400', accentGlow: 'cyan-400', bgBtn: 'bg-gradient-to-r from-cyan-600 to-sky-500 hover:from-cyan-700 hover:to-sky-600 text-white border border-cyan-500/25 shadow-lg', bgBadge: 'bg-cyan-950/50 text-cyan-400 border-cyan-800/40' },
}

export const colors = computed(() => ({
  ...colorsMap[themeAccent.value],
  textDark: 'text-slate-100',
  bgLight: 'bg-slate-900/40 backdrop-blur-md',
  border: 'border-slate-800/40',
  borderFocus: 'focus-within:border-cyan-500/80 focus-within:ring-cyan-950/40',
  glow: 'shadow-cyan-950/50',
}))

function loadHistoryFromStorage(): HistoryPreset[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveHistoryToStorage(items: HistoryPreset[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items))
  } catch { /* ignore quota errors */ }
}

const storedHistory = ref<HistoryPreset[]>(loadHistoryFromStorage())

export const historyPresets = computed<HistoryPreset[]>(() => {
  return [...storedHistory.value].sort((a, b) => b.date.localeCompare(a.date))
})

export function saveProfileToHistory(profileReport: StudyReport) {
  const dims = dimensions.value
  const title = generateTitle(dims)
  const entry: HistoryPreset = {
    id: `hist-${Date.now()}`,
    title,
    score: profileReport.score,
    date: new Date().toISOString().slice(0, 10),
    evaluation: profileReport.evaluation,
    dimensions: { ...dims },
    report: JSON.parse(JSON.stringify(profileReport)),
  }
  const existing = loadHistoryFromStorage()
  existing.unshift(entry)
  const trimmed = existing.slice(0, 20)
  saveHistoryToStorage(trimmed)
  storedHistory.value = trimmed
}

function generateTitle(dims: DimensionMap): string {
  const parts: string[] = []
  if (dims.level) parts.push(dims.level)
  if (dims.domain) parts.push(dims.domain)
  if (dims.goal) parts.push(`→${dims.goal}`)
  return parts.length > 0 ? parts.join(' ') : '学习画像'
}

export function matchRecommendedCourses(rep: StudyReport): RecommendedCourse[] {
  const skillNames = [
    ...(rep.skills?.core || []),
    ...(rep.skills?.foundation || []),
  ].map(s => s.toLowerCase())

  const scored = courses.map(c => {
    let score = 0
    const nameLower = c.name.toLowerCase()
    for (const sk of skillNames) {
      if (nameLower.includes(sk.slice(0, 3)) || sk.includes(c.name.slice(0, 2))) score += 2
    }
    for (const w of rep.weaknesses || []) {
      if (w.includes('编程') || w.includes('代码') || w.includes('语法')) {
        if (c.id === 'python' || c.id === 'c-lang') score += 3
      }
      if (w.includes('算法') || w.includes('数据结构')) {
        if (c.id === 'data-structures' || c.id === 'algorithm-design') score += 3
      }
      if (w.includes('数学') || w.includes('统计') || w.includes('概率')) {
        if (c.id === 'discrete-math' || c.id === 'probability') score += 3
      }
      if (w.includes('项目') || w.includes('实战') || w.includes('工程')) {
        if (c.difficulty === '进阶' || c.difficulty === '高级') score += 2
      }
      if (w.includes('机器') || w.includes('深度学习') || w.includes('AI')) {
        if (c.id === 'ml' || c.id === 'dl' || c.id === 'ai-intro') score += 3
      }
    }
    const level = dimensions.value.level
    if (level === '零基础' && c.difficulty === '入门') score += 2
    if ((level === '初级' || level === '中级') && c.difficulty !== '高级') score += 1
    if (level === '高级') score += c.difficulty === '高级' ? 2 : 0
    return { course: c, score }
  })

  scored.sort((a, b) => b.score - a.score)
  const top3 = scored.slice(0, 3).filter(s => s.score > 0)

  const reasons = [
    '根据你的画像，这门课是当前最佳起点',
    '你的薄弱项可以通过这门课系统补强',
    '结合你的学习目标，推荐先修这门课',
  ]

  if (top3.length < 3) {
    const defaults = [
      courses.find(c => c.id === 'python')!,
      courses.find(c => c.id === 'data-structures')!,
      courses.find(c => c.id === 'ai-intro')!,
    ]
    for (const dc of defaults) {
      if (top3.length >= 3) break
      if (!top3.find(t => t.course.id === dc.id)) {
        top3.push({ course: dc, score: 0 })
      }
    }
  }

  return top3.slice(0, 3).map((s, i) => ({
    id: s.course.id,
    name: s.course.name,
    difficulty: s.course.difficulty,
    color: s.course.color,
    reason: reasons[i] || '推荐课程',
    icon: s.course.icon,
  }))
}

export function navigateToCourse(courseId: string) {
  window.open(`/resources?courseId=${courseId}&tab=课程`, '_blank')
}

export function showNotification(msg: string, duration = 2500) {
  exportNotification.value = msg
  setTimeout(() => { exportNotification.value = null }, duration)
}

export function resetConversation() {
  dimensions.value = {
    identity: null, domain: null, level: null, experience: null,
    goal: null, motivation: null, period: null, weeklyHours: null, method: null,
  }
  chats.value = [{
    id: `reset-${Date.now()}`, sender: 'ai',
    text: '你好呀！我是你的 AI 学习导师\n关于您的专属 AI 学习星图，让我们重新梳理一下吧！\n能跟我透露一下，您当前的工作或学习背景吗？',
    time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    source: 'chat',
    suggestChips: ['我是在校学生，学计算机的', '我是程序员，工作3年了', '目前零基础，想要跨界学习AI'],
  }]
  showReport.value = false
  report.value = null
  hasGeneratedReport.value = false
  activeMenu.value = 'chat'
}

export function handleChipClick(chipText: string) {
  inputText.value = chipText
}

export function handleQuickSandboxDeduce() {
  activeMenu.value = 'chat'
  const currentTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  chats.value = [
    ...chats.value,
    {
      id: `quick-sandbox-${Date.now()}`,
      sender: 'ai',
      text: '画像报告还需要至少 4 个维度信息。你可以先告诉我身份、学习领域、当前基础和学习目标，我会继续补全画像后生成报告。',
      time: currentTime,
      source: 'chat',
      suggestChips: ['我是学生，想学人工智能', '我有编程基础，想做项目', '我零基础，想系统入门'],
    },
  ]
  showNotification('画像维度还不够，已回到对话区继续收集信息')
}

export function restoreHistory(preset: HistoryPreset) {
  dimensions.value = { ...preset.dimensions }
  report.value = JSON.parse(JSON.stringify(preset.report)) as StudyReport
  const dateStr = preset.date
  chats.value = [
    { id: `msg-hist-${Date.now()}-ai-1`, sender: 'ai', source: 'chat', text: `🕰️ 正在载入您于 ${dateStr} 归档的「${preset.title}」画像。`, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) },
    { id: `msg-hist-${Date.now()}-ai-2`, sender: 'ai', source: 'chat', text: `✅ 属性特征已重组：\n• 身份: ${preset.dimensions.identity || '未知'}\n• 领域: ${preset.dimensions.domain || '未知'}\n• 阶段: ${preset.dimensions.level || '未知'}\n• 目标: ${preset.dimensions.goal || '未知'}\n\n您可点击「画像报告」查看详细内容，或继续与导师对话！`, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) },
  ]
  showReport.value = true
  hasGeneratedReport.value = true
  activeMenu.value = 'portrait-report'
  showNotification(`已加载历史存档: ${preset.title}`)
}

export function handleExportPDF() {
  showNotification('正在生成本页学习画像报告 PDF...')
  setTimeout(() => {
    window.print()
    exportNotification.value = null
  }, 1200)
}

export function handleShare() {
  navigator.clipboard.writeText(window.location.href)
  showNotification('页面链接已复制，可分享此画像报告给好友！')
}

export function selectNodeDetail(nodeLabel: string) {
  selectedDimensionInfo.value = nodeLabel
}
