import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { callLlm, isLlmAvailable } from './llm/provider.js'
import { getProfileResult as getMySqlProfileResult, saveProfileResult as saveMySqlProfileResult } from './store/mysql.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const contentDir = path.join(__dirname, 'content')
const storePath = path.join(__dirname, 'store.json')

function readJsonFile(filename) {
  const filePath = path.join(contentDir, filename)
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function nowTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function defaultStore() {
  return {
    profileResult: null,
    knowledgePathResult: null,
    chatHistory: [],
    tutoringHistory: [],
  }
}

function readStore() {
  if (!fs.existsSync(storePath)) {
    return defaultStore()
  }

  try {
    return { ...defaultStore(), ...JSON.parse(fs.readFileSync(storePath, 'utf8')) }
  } catch {
    return defaultStore()
  }
}

function writeStore(store) {
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8')
}

function keepLast(items, limit = 20) {
  return items.slice(-limit)
}

export function getResources() {
  return readJsonFile('resources.json')
}

export function getRecommendedResources() {
  return readJsonFile('recommended-resources.json')
}

export function getLearningPathPayload() {
  return readJsonFile('learning-path.json')
}

export function getEvaluationPayload() {
  const payload = readJsonFile('evaluation.json')
  return {
    ...payload,
    generatedAt: today(),
  }
}

export function getTutoringTopics() {
  return readJsonFile('tutoring-topics.json')
}

export async function getLatestProfileResult(accountId = 'default') {
  return getMySqlProfileResult(accountId)
}

export async function saveProfileResult(profileResult, accountId = 'default') {
  return saveMySqlProfileResult(accountId, profileResult)
}

export function getLatestKnowledgePath() {
  return readStore().knowledgePathResult
}

export function saveKnowledgePathResult(result) {
  const store = readStore()
  store.knowledgePathResult = result
  writeStore(store)
}

export function getChatHistory() {
  return readStore().chatHistory
}

export function saveChatHistoryEntry(userMessage, reply, multimodalContents) {
  const store = readStore()
  const timestamp = nowTime()
  const historyItems = [
    ...store.chatHistory,
    {
      id: Date.now(),
      role: 'user',
      content: userMessage,
      time: timestamp,
      multimodalContents: multimodalContents || [],
    },
    {
      id: Date.now() + 1,
      role: 'assistant',
      content: reply.content,
      time: timestamp,
      resources: reply.resources ?? [],
      suggestions: reply.suggestions ?? [],
    },
  ]
  store.chatHistory = keepLast(historyItems, 30)
  writeStore(store)
}

export function getTutoringHistory() {
  return readStore().tutoringHistory
}

export function saveTutoringHistoryEntry({ question, answer, mode, scenario, multimodalContents }) {
  const store = readStore()
  store.tutoringHistory = keepLast(
    [
      ...store.tutoringHistory,
      {
        q: question,
        a: answer,
        time: nowTime(),
        mode,
        scenario: scenario || 'preview',
        multimodalContents: multimodalContents || [],
      },
    ],
    20,
  )
  writeStore(store)
}

const CHAT_SYSTEM_PROMPT = `你是智学星枢个性化学习智能体系统的 AI 学习导师。你的职责是：

1. 理解学生的学习问题，提供清晰、耐心的解答
2. 根据学生的水平调整讲解的深度和方式
3. 给出具体的学习建议和资源推荐
4. 引导学生进行思考，而不是直接给出答案
5. 保持友好、鼓励的语气

请用中文回答，回答要具体、实用，避免空洞的套话。`

export async function buildChatReplyAsync(message, multimodalContents) {
  const text = String(message || '').trim()
  const topic = text || '当前学习问题'

  const hasImages = multimodalContents && multimodalContents.some(c => c.type === 'image')

  if (isLlmAvailable()) {
    try {
      const llmResult = await callLlm(CHAT_SYSTEM_PROMPT, text, { temperature: 0.7, maxTokens: 1024 })
      if (llmResult.content) {
        return {
          content: llmResult.content,
          resources: [
            { type: 'doc', title: '相关概念速查', color: '#00d4ff' },
            { type: 'mindmap', title: '知识脉络图', color: '#7c3aed' },
            { type: 'exercise', title: '配套练习', color: '#06d6a0' },
          ],
          suggestions: ['用更简单的话解释', '给我一个代码示例', '顺便出 3 道练习题'],
        }
      }
    } catch (err) {
      console.error('LLM call failed, using fallback:', err)
    }
  }

  return buildChatReply(message, multimodalContents)
}

export function buildChatReply(message, multimodalContents) {
  const text = String(message || '').trim()
  const topic = text || '当前学习问题'

  const hasImages = multimodalContents && multimodalContents.some(c => c.type === 'image')

  if (hasImages) {
    return {
      content:
        `我看到你上传了图片！虽然我是模拟的多模态助手，现在帮你分析一下：\n\n` +
        '1. 首先观察图片内容，可能是公式、图表、代码截图或其他学习资料。\n' +
        '2. 如果你能补充一些文字说明，我能更好地帮助你。\n' +
        '3. 我们可以从概念理解、解题思路或实践应用三个维度来探讨。\n\n' +
        '你希望我帮你做什么呢？比如讲解图片中的内容、帮你分析问题、还是给出相关知识点？',
      resources: [
        { type: 'doc', title: '图片分析指南', color: '#00d4ff' },
        { type: 'mindmap', title: '知识点关联', color: '#7c3aed' },
        { type: 'exercise', title: '相关练习', color: '#06d6a0' },
      ],
      suggestions: ['详细描述图片内容', '给我相关知识点', '出几道相关题目'],
    }
  }

  return {
    content:
      `我先帮你把问题拆开来看：${topic}\n\n` +
      '1. 先确认你现在卡住的是概念、实现还是练习。\n' +
      '2. 如果是概念问题，就抓住定义、例子和适用场景。\n' +
      '3. 如果是实现问题，就优先理清输入、输出和边界条件。\n\n' +
      '如果你愿意，我下一步可以继续把它拆成步骤、代码示例，或者配套练习题。',
    resources: [
      { type: 'doc', title: '相关概念速查', color: '#00d4ff' },
      { type: 'mindmap', title: '知识脉络图', color: '#7c3aed' },
      { type: 'exercise', title: '配套练习', color: '#06d6a0' },
    ],
    suggestions: ['用更简单的话解释', '给我一个代码示例', '顺便出 3 道练习题'],
  }
}

export function buildTutoringReply(question, mode = 'qa', multimodalContents) {
  const titleMap = {
    qa: '自由问答',
    solve: '解题助手',
    explain: '概念精讲',
    brainstorm: '举一反三',
    'concept-overview': '概念总览',
    'case-intro': '案例引入',
    'step-solve': '分步解题',
    'debug-guide': '调试指导',
  }

  const q = String(question || '').trim() || '未提供问题'
  const title = titleMap[mode] || '自由问答'
  const hasImages = multimodalContents && multimodalContents.some(c => c.type === 'image')

  if (hasImages) {
    return {
      answer:
        `当前模式：${title}\n\n` +
        '我看到你上传了图片。我们可以先从图中的题目、公式、代码或图表里提取关键信息，再一步步分析。\n\n' +
        '1. 先确认图片里的核心问题。\n' +
        '2. 再拆解相关概念、已知条件和目标。\n' +
        '3. 最后给出解题思路、讲解步骤或练习建议。\n\n' +
        '你也可以补充一句：希望我重点讲哪一部分？',
      time: '即时返回',
    }
  }

  return {
    answer:
      `当前模式：${title}\n\n` +
      `问题：${q}\n\n` +
      '建议先抓住“定义、例子、应用”三个层次。\n\n' +
      '1. 定义：把核心概念用一句话说清楚。\n' +
      '2. 例子：找一个最小例子验证理解。\n' +
      '3. 应用：说明它在题目或项目里解决什么问题。\n\n' +
      '如果你愿意，我可以继续把它拆成步骤、代码示例或配套练习。',
    time: '即时返回',
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function getAgentWorkflow() {
  return {
    workflowId: 'wf-demo-001',
    startTime: '2026-05-28T14:32:00',
    endTime: '2026-05-28T14:32:25',
    summary: '完整学习闭环：画像分析→资源生成→路径规划→辅导→评估→反馈',
    profileSnapshot: { pointerMastery: 42, graphMastery: 38, overallProgress: 68 },
    agents: [
      { agentId: 'profile', agentName: '画像智能体', role: 'PROFILE', input: '学生答题记录 + 历史画像', process: '分析 24 维画像向量', output: '识别指针与图结构薄弱', confidence: 0.92, evidenceTags: ['画像分析', '薄弱识别'], timestamp: '2026-05-28T14:32:17', status: 'completed' },
      { agentId: 'resource', agentName: '资源推荐智能体', role: 'RESOURCE', input: '薄弱知识点 + 偏好', process: '匹配资源库 + LLM 生成', output: '5 个个性化资源', confidence: 0.87, evidenceTags: ['资源匹配', 'LLM生成'], timestamp: '2026-05-28T14:32:19', status: 'completed' },
      { agentId: 'path', agentName: '路径规划智能体', role: 'PATH', input: '画像 + 评估反馈', process: '路径规划 + 节点插入', output: '插入 2 个补弱节点', confidence: 0.85, evidenceTags: ['路径重排', '补弱插入'], timestamp: '2026-05-28T14:32:18', status: 'completed' },
      { agentId: 'tutor', agentName: 'AI 辅导智能体', role: 'TUTOR', input: '学生提问 + 上下文', process: '多模式辅导生成', output: '概念讲解 + 代码示例', confidence: 0.90, evidenceTags: ['辅导生成', '多模式'], timestamp: '2026-05-28T14:32:23', status: 'completed' },
      { agentId: 'eval', agentName: '评估智能体', role: 'EVAL', input: '练习结果 + 资源完成度', process: '多维评估 + 错因分析', output: '4 个盲点 + 错因归类', confidence: 0.88, evidenceTags: ['效果评估', '错因分析'], timestamp: '2026-05-28T14:32:20', status: 'completed' },
      { agentId: 'feedback', agentName: '反馈智能体', role: 'FEEDBACK', input: '评估结果 + 画像变化', process: '反向传播 + 路径修正', output: '画像更新 + 路径触发', confidence: 0.83, evidenceTags: ['反向传播', '路径触发'], timestamp: '2026-05-28T14:32:21', status: 'completed' },
    ],
  }
}

export function generateResourcesPayload(topic) {
  const t = topic || '指针与图结构'
  return {
    items: [
      { id: 'gen-1', concept: '二级指针传参原理', example: 'swap 函数中二级指针的使用', exercise: '实现 createNode 函数使用二级指针', mistakeReminder: '混淆修改指针变量和修改指针指向的值', recommendReason: `画像显示${t}掌握度仅 42%，需要强化二级指针理解`, evidence: { profileSource: 'ProfileAgent 识别指针薄弱', evaluationReason: '测评正确率 41%', pathStage: '课后巩固阶段', formatReason: '学生偏好思维导图+例题' } },
      { id: 'gen-2', concept: 'BFS 队列推进与 visited 标记', example: 'BFS 遍历邻接表', exercise: '实现 BFS 并正确标记 visited', mistakeReminder: '入队前后标记时机不稳定导致重复访问', recommendReason: `图结构搜索掌握度 38%，BFS visited 是核心盲点`, evidence: { profileSource: 'EvaluationAgent 发现 BFS 盲点', evaluationReason: 'BFS 相关题目正确率 38%', pathStage: '搜索训练阶段', formatReason: '队列快照动画更直观' } },
      { id: 'gen-3', concept: '悬空指针与内存释放', example: 'free 后继续访问指针', exercise: '检测并修复悬空指针代码', mistakeReminder: '释放后未置 NULL 导致悬空引用', recommendReason: '释放后悬空指针掌握度 36%', evidence: { profileSource: 'EvaluationAgent 错因分析', evaluationReason: '悬空引用相关题目 0/3 正确', pathStage: '课后微训练', formatReason: '代码追踪练习更有效' } },
    ],
  }
}

export function getEvidenceTraces() {
  return {
    traces: [
      { traceId: 't1', workflowId: 'wf-demo-001', agentId: 'profile', agentName: '画像智能体', input: '学生答题记录 + 历史画像', output: '识别指针与图结构薄弱', confidence: 0.92, evidenceTags: ['画像分析', '薄弱识别'], timestamp: '2026-05-28T14:32:17', duration: 320 },
      { traceId: 't2', workflowId: 'wf-demo-001', agentId: 'resource', agentName: '资源推荐智能体', input: '薄弱知识点 + 偏好', output: '5 个个性化资源', confidence: 0.87, evidenceTags: ['资源匹配', 'LLM生成'], timestamp: '2026-05-28T14:32:19', duration: 480 },
      { traceId: 't3', workflowId: 'wf-demo-001', agentId: 'path', agentName: '路径规划智能体', input: '画像 + 评估反馈', output: '插入 2 个补弱节点', confidence: 0.85, evidenceTags: ['路径重排', '补弱插入'], timestamp: '2026-05-28T14:32:18', duration: 290 },
      { traceId: 't4', workflowId: 'wf-demo-001', agentId: 'tutor', agentName: 'AI 辅导智能体', input: '学生提问 + 上下文', output: '概念讲解 + 代码示例', confidence: 0.90, evidenceTags: ['辅导生成', '多模式'], timestamp: '2026-05-28T14:32:23', duration: 560 },
      { traceId: 't5', workflowId: 'wf-demo-001', agentId: 'eval', agentName: '评估智能体', input: '练习结果 + 资源完成度', output: '4 个盲点 + 错因归类', confidence: 0.88, evidenceTags: ['效果评估', '错因分析'], timestamp: '2026-05-28T14:32:20', duration: 410 },
      { traceId: 't6', workflowId: 'wf-demo-001', agentId: 'feedback', agentName: '反馈智能体', input: '评估结果 + 画像变化', output: '画像更新 + 路径触发', confidence: 0.83, evidenceTags: ['反向传播', '路径触发'], timestamp: '2026-05-28T14:32:21', duration: 350 },
    ],
  }
}

export function getEvidenceSummary() {
  return {
    workflowId: 'wf-demo-001',
    totalAgents: 6,
    completedAgents: 6,
    totalDuration: 3200,
    traceCount: 14,
    keyFindings: [
      '指针与内存掌握度仅 42%，标记为薄弱域',
      '图结构搜索存在 BFS visited 标记时机问题',
      '学生偏好从文本讲解转向思维导图+例题拆解',
    ],
    profileUpdates: [
      { field: '图结构掌握度', before: '68%', after: '42%', evidence: '阶段测评错题 2/3 来自图结构' },
      { field: '指针掌握度', before: '65%', after: '42%', evidence: '指针练习正确率下降至 42%' },
      { field: '学习偏好', before: '文本讲解', after: '思维导图 + 例题拆解', evidence: '连续 3 次追问图解类资源' },
    ],
    pathAdjustments: [
      { reason: '评估发现 4 个盲点', addedNodes: ['二级指针专项训练', 'BFS visited 标记专项'], removedNodes: [] },
      { reason: '已掌握节点优化', addedNodes: [], removedNodes: ['C语言基础复习'] },
    ],
  }
}

function labelOf(value, options) {
  const match = options.find(item => item.value === value)
  return match ? match.label : value
}

export function analyzeProfile(answers = {}) {
  const levelBoost = {
    beginner: 0,
    intermediate: 5,
    advanced: 10,
    expert: 15,
  }

  const dimensions = [
    { key: 'knowledgeBase', label: '知识基础', value: clamp((answers.knowledgeBase || 50) + (levelBoost[answers.level] || 0), 0, 100), color: '#00d4ff' },
    { key: 'learningSpeed', label: '学习速度', value: clamp((answers.learningSpeed || 50) + 2, 0, 100), color: '#3b82f6' },
    { key: 'logicalThinking', label: '逻辑思维', value: clamp(answers.logicalThinking || 50, 0, 100), color: '#7c3aed' },
    { key: 'creativity', label: '创造力', value: clamp(answers.creativity || 50, 0, 100), color: '#06d6a0' },
    { key: 'focus', label: '专注力', value: clamp(answers.focus || 50, 0, 100), color: '#f59e0b' },
    { key: 'selfDiscipline', label: '自律性', value: clamp(answers.selfDiscipline || 50, 0, 100), color: '#f43f5e' },
  ]

  const totalScore = Math.round(dimensions.reduce((sum, item) => sum + item.value, 0) / dimensions.length)
  const strongest = [...dimensions].sort((a, b) => b.value - a.value)[0]
  const weakest = [...dimensions].sort((a, b) => a.value - b.value).slice(0, 3)

  const preferences = [
    { label: '最佳时段', value: labelOf(answers.bestTime, [{ value: 'morning', label: '清晨' }, { value: 'afternoon', label: '下午' }, { value: 'evening', label: '晚上' }, { value: 'night', label: '深夜' }]) },
    { label: '资源偏好', value: labelOf(answers.resourcePreference, [{ value: 'video', label: '视频课程' }, { value: 'reading', label: '阅读文档' }, { value: 'practice', label: '练习题' }, { value: 'project', label: '项目实战' }]) },
    { label: '每周投入', value: labelOf(answers.weeklyHours, [{ value: 'less-than-5', label: '小于 5 小时' }, { value: '5-10', label: '5-10 小时' }, { value: '10-20', label: '10-20 小时' }, { value: 'more-than-20', label: '20 小时以上' }]) },
    { label: '学习节奏', value: labelOf(answers.learningPace, [{ value: 'steady', label: '稳扎稳打' }, { value: 'moderate', label: '均衡推进' }, { value: 'fast', label: '快速突破' }]) },
  ]

  return {
    dimensions: dimensions.map(({ label, value, color }) => ({ label, value, color })),
    totalScore,
    stats: [
      { label: '综合评分', value: String(totalScore), icon: 'Brain', color: '#00d4ff' },
      { label: '最强维度', value: strongest.label, icon: 'Zap', color: '#3b82f6' },
      { label: '待提升', value: `${weakest.length} 项`, icon: 'BarChart3', color: '#f59e0b' },
      { label: '学习阶段', value: labelOf(answers.level, [{ value: 'beginner', label: '初级' }, { value: 'intermediate', label: '中级' }, { value: 'advanced', label: '高级' }, { value: 'expert', label: '专家' }]), icon: 'BookOpen', color: '#06d6a0' },
    ],
    weaknesses: weakest.map((item, index) => ({ tag: `${item.label}提升`, count: 8 - index * 2 })),
    skillTree: [
      {
        category: '核心能力',
        color: '#00d4ff',
        skills: [
          { name: '理论基础', level: dimensions[0].value },
          { name: '问题拆解', level: dimensions[2].value },
          { name: '持续学习', level: dimensions[5].value },
        ],
      },
    ],
    preferences,
    timeline: [
      { date: today(), event: '完成学习画像评估', score: `${totalScore} 分`, type: 'up' },
    ],
    recommendations: [
      `优先巩固 ${weakest[0].label}，每天安排 20 分钟专项训练。`,
      `继续发挥 ${strongest.label} 优势，把它用在当前学习方向的关键任务里。`,
      '建议每两周复盘一次学习进度，动态调整资源和节奏。',
    ],
  }
}
