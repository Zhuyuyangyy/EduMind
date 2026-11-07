import {
  chats, dimensions, inputText, isAiLoading, report, showReport, activeMenu, canUnlockReport,
  recommendQaInput, recommendQaMessages, isRecommendQaLoading,
  isAiConnecting, isAiListening, isAiSpeaking,
  aiSubtitle, isVirtualMuted, aiLanguage, aiVolume, syncToMainChat,
  hasGeneratedReport, saveProfileToHistory, matchRecommendedCourses,
} from './useAppState'
import { avatarStatus, avatarWriteText, setAvatarNlpHandler, setAvatarAsrHandler, getAvatarInstance } from './useAvatarSdk'
import type { ChatMessage, StudyReport, DimensionMap } from '@/types/dialogue'
import { apiPost, createChatIdempotencyKey } from '@/lib/api'

/* ───────── DeepSeek API 配置 ───────── */
const DEEPSEEK_API_URL = '/api/chat'
const DEEPSEEK_MODEL = 'deepseek-v4-flash'

const SYSTEM_PROMPT = `你是 智学星枢智能学习助手，专注于帮助学生进行学习规划和课程咨询。你必须通过对话主动收集以下 9 个画像维度。

## 9 个画像维度
- identity: 身份（大学生/研究生/自学者/职场人等）
- domain: 学科方向（计算机科学/人工智能/软件工程等）
- level: 当前水平（零基础/初级/中级/高级）
- experience: 项目/实践经验（无经验/有小项目/有工作经验等）
- goal: 学习目标（就业/考研/做项目/转行等）
- motivation: 学习动机（兴趣/学业要求/职业需要等）
- period: 计划学习周期（1个月/3个月/半年/1年等）
- weeklyHours: 每周可投入时间（5小时以下/5-10小时/10-20小时/20小时以上等）
- method: 偏好学习方式（看视频/读文档/做项目/刷题等）

## 关键规则
1. 用中文回复，语气亲切专业
2. **每次回复末尾必须输出维度标签，格式严格为 [维度:xxx=值]**
   - 例如：[维度:identity=大学生] [维度:domain=人工智能]
3. 用户说的每句话都可能包含维度信息，仔细分析
4. 如果本轮没有新维度，也要追问缺失的维度
5. 每次回复末尾给出 2-3 个建议追问短句（每条 10 字以内）

## 维度标签输出要求（非常重要！）
**必须在回复的最后一行输出所有识别到的维度标签**，格式：
[维度:identity=值] [维度:domain=值] [维度:level=值] ...
即使只有一个新维度也要输出标签！这是系统自动采集数据的关键！`

interface DeepSeekChoice {
  message: { content: string; role: string }
  finish_reason: string
}

interface DeepSeekResponse {
  choices: DeepSeekChoice[]
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  model?: string
}

/** 调用 DeepSeek Chat API */
async function callDeepSeek(messages: { role: string; content: string }[]): Promise<string> {
  const data = await apiPost<DeepSeekResponse & { reply?: string }>(DEEPSEEK_API_URL, {
      model: DEEPSEEK_MODEL,
      messages,
      max_tokens: 1024,
      temperature: 0.7,
      idempotencyKey: createChatIdempotencyKey(),
  })
  const content = data.reply || data.choices?.[0]?.message?.content
  if (!content) throw new Error('DeepSeek 返回内容为空')
  console.log(`[DeepSeek] model=${data.model} tokens=${data.usage?.total_tokens}`)
  return content
}

/** 从 AI 回复中解析维度标签 [维度:xxx=值] */
function parseDimensions(text: string): Partial<DimensionMap> {
  const extracted: Partial<DimensionMap> = {}
  // 支持多种格式: [维度:key=value], [维度: key=value], 【维度:key=值】
  const regex = /[【\[]维度[：:]\s*(\w+)\s*[=＝]\s*(.+?)[】\]]/g
  let match
  while ((match = regex.exec(text)) !== null) {
    const key = match[1] as keyof DimensionMap
    if (key in dimensions.value) {
      extracted[key] = match[2].trim()
    }
  }
  return extracted
}

/** 关键词自动提取：从文本中识别维度信息（作为标签提取的补充） */
function extractByKeywords(text: string): Partial<DimensionMap> {
  const extracted: Partial<DimensionMap> = {}
  const t = text.toLowerCase()

  // identity
  if (!dimensions.value.identity) {
    if (t.includes('学生') || t.includes('在校') || t.includes('大学')) extracted.identity = '在校学生'
    else if (t.includes('程序员') || t.includes('开发') || t.includes('工程师') || t.includes('工作')) extracted.identity = '职场人'
    else if (t.includes('研究生') || t.includes('硕士') || t.includes('博士')) extracted.identity = '研究生'
    else if (t.includes('自学者') || t.includes('自学')) extracted.identity = '自学者'
    else if (t.includes('老师') || t.includes('教师') || t.includes('教授')) extracted.identity = '教育工作者'
  }

  // domain
  if (!dimensions.value.domain) {
    if (t.includes('人工智能') || t.includes(' ai ') || t.includes('ai')) extracted.domain = '人工智能'
    else if (t.includes('计算机') || t.includes('cs') || t.includes('编程')) extracted.domain = '计算机科学'
    else if (t.includes('软件') || t.includes('开发') || t.includes('前端') || t.includes('后端')) extracted.domain = '软件工程'
    else if (t.includes('数据') || t.includes('分析') || t.includes('统计')) extracted.domain = '数据科学'
    else if (t.includes('数学')) extracted.domain = '数学'
  }

  // level
  if (!dimensions.value.level) {
    if (t.includes('零基础') || t.includes('初学') || t.includes('刚开始') || t.includes('不会')) extracted.level = '零基础'
    else if (t.includes('初级') || t.includes('入门')) extracted.level = '初级'
    else if (t.includes('中级') || t.includes('有一些') || t.includes('了解')) extracted.level = '中级'
    else if (t.includes('高级') || t.includes('精通') || t.includes('深入')) extracted.level = '高级'
  }

  // experience
  if (!dimensions.value.experience) {
    if (t.includes('没经验') || t.includes('无经验') || t.includes('没做过')) extracted.experience = '无经验'
    else if (t.includes('小项目') || t.includes('练手') || t.includes('课程项目')) extracted.experience = '有小项目'
    else if (t.includes('工作经验') || t.includes('工作了') || t.includes('年经验')) extracted.experience = '有工作经验'
  }

  // goal
  if (!dimensions.value.goal) {
    if (t.includes('就业') || t.includes('找工作') || t.includes('求职')) extracted.goal = '就业'
    else if (t.includes('考研') || t.includes('考博') || t.includes('升学')) extracted.goal = '考研'
    else if (t.includes('做项目') || t.includes('项目') || t.includes('作品')) extracted.goal = '做项目'
    else if (t.includes('转行') || t.includes('转型')) extracted.goal = '转行'
    else if (t.includes('兴趣') || t.includes('爱好')) extracted.goal = '兴趣学习'
  }

  // motivation
  if (!dimensions.value.motivation) {
    if (t.includes('兴趣') || t.includes('好奇') || t.includes('喜欢')) extracted.motivation = '兴趣驱动'
    else if (t.includes('学业') || t.includes('课程') || t.includes('考试')) extracted.motivation = '学业要求'
    else if (t.includes('职业') || t.includes('工作需要') || t.includes('升职')) extracted.motivation = '职业需要'
  }

  // period
  if (!dimensions.value.period) {
    if (t.includes('1个月') || t.includes('一个月') || t.includes('很快')) extracted.period = '1个月'
    else if (t.includes('3个月') || t.includes('三个月') || t.includes('一个季度')) extracted.period = '3个月'
    else if (t.includes('半年') || t.includes('6个月')) extracted.period = '半年'
    else if (t.includes('1年') || t.includes('一年') || t.includes('长期')) extracted.period = '1年'
  }

  // weeklyHours
  if (!dimensions.value.weeklyHours) {
    if (t.includes('5小时以下') || t.includes('很少') || t.includes('每天半小时')) extracted.weeklyHours = '5小时以下'
    else if (t.includes('5-10') || t.includes('每天1小时') || t.includes('一小时')) extracted.weeklyHours = '5-10小时'
    else if (t.includes('10-20') || t.includes('每天2小时') || t.includes('两小时')) extracted.weeklyHours = '10-20小时'
    else if (t.includes('20小时') || t.includes('很多时间') || t.includes('全职')) extracted.weeklyHours = '20小时以上'
  }

  // method
  if (!dimensions.value.method) {
    if (t.includes('看视频') || t.includes('视频课') || t.includes('网课')) extracted.method = '看视频'
    else if (t.includes('读文档') || t.includes('看书') || t.includes('阅读')) extracted.method = '读文档'
    else if (t.includes('做项目') || t.includes('实战') || t.includes('动手')) extracted.method = '做项目'
    else if (t.includes('刷题') || t.includes('做题') || t.includes('练习')) extracted.method = '刷题'
  }

  return extracted
}

/** 从 AI 回复末尾提取建议追问 chips（最后几行以数字开头的短句） */
function parseSuggestChips(text: string): string[] {
  const lines = text.split('\n').map(l => l.replace(/^[\d]+[.、）)]\s*/, '').trim()).filter(Boolean)
  const chips: string[] = []
  for (let i = lines.length - 1; i >= 0 && chips.length < 3; i--) {
    const line = lines[i]
    if (line.length <= 15 && !line.includes('。') && !line.includes('！') && !line.includes('，')) {
      chips.unshift(line)
    } else break
  }
  return chips
}

/** 清理回复文本，移除维度标签和 chips 行 */
function cleanReply(text: string): string {
  return text
    .replace(/\[维度:\w+=.+?\]/g, '')
    .split('\n')
    .filter(line => {
      const stripped = line.replace(/^[\d]+[.、）)]\s*/, '').trim()
      return !(stripped.length <= 15 && stripped.length > 0 && !stripped.includes('。') && !stripped.includes('！') && !stripped.includes('，'))
    })
    .join('\n')
    .trim()
}

function getTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function appendChatError(message: string) {
  chats.value = [
    ...chats.value,
    {
      id: `msg-${Date.now()}-ai-error`,
      sender: 'ai',
      text: message,
      time: getTime(),
      source: 'chat',
    },
  ]
}

setAvatarNlpHandler((data: any) => {
  if (!syncToMainChat.value) return
  const text = data?.payload?.choices?.text?.[0]?.content || data?.text || ''
  if (!text) return
  isAiSpeaking.value = true

  const last = chats.value[chats.value.length - 1]
  if (last?.sender === 'ai' && last?.source === 'chat' && last.text === text) return
  if (last?.source === 'ai' && last?.sender === 'ai') {
    chats.value = [...chats.value.slice(0, -1), { ...last, text }]
  } else {
    chats.value = [
      ...chats.value,
      { id: `ai-${Date.now()}`, sender: 'ai', text, time: getTime(), source: 'ai' },
    ]
  }
})

setAvatarAsrHandler((data: any) => {
  if (!syncToMainChat.value) return
  const text = data?.payload?.result?.text || data?.text || ''
  if (!text) return

  const last = chats.value[chats.value.length - 1]
  if (last?.source === 'asr') {
    chats.value = [...chats.value.slice(0, -1), { ...last, text }]
  } else {
    chats.value = [
      ...chats.value,
      { id: `xf-user-${Date.now()}`, sender: 'user', text, time: getTime(), source: 'asr' },
    ]
  }
})

/** 将聊天记录转为 DeepSeek messages 格式 */
function buildApiMessages(): { role: string; content: string }[] {
  // 纯静态 system prompt — 不动态注入维度，确保前缀缓存稳定
  const msgs: { role: string; content: string; cache_control?: { type: string } }[] = [
    { role: 'system', content: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
  ]
  // 只取最近 20 条避免 token 过多
  const recent = chats.value.slice(-20)
  for (const c of recent) {
    if (c.sender === 'user') msgs.push({ role: 'user', content: c.text })
    else if (c.sender === 'ai' && c.source === 'chat') msgs.push({ role: 'assistant', content: c.text })
  }
  return msgs
}

export async function sendMessage() {
  if (!inputText.value.trim() || isAiLoading.value) return

  const userMsgText = inputText.value.trim()
  const userMsg: ChatMessage = {
    id: `msg-${Date.now()}-user`, sender: 'user', text: userMsgText, time: getTime(), source: 'chat',
  }
  chats.value = [...chats.value, userMsg]
  inputText.value = ''
  isAiLoading.value = true

  try {
    const apiMessages = buildApiMessages()
    const replyText = await callDeepSeek(apiMessages)

    // 解析维度：标签提取（AI回复）+ 关键词提取（仅用户消息）
    const extractedFromTags = parseDimensions(replyText)
    const extractedFromKeywords = extractByKeywords(userMsgText)
    const extracted = { ...extractedFromKeywords, ...extractedFromTags }
    if (Object.keys(extracted).length > 0) {
      dimensions.value = { ...dimensions.value, ...extracted }
    }

    // 提取 chips
    const chips = parseSuggestChips(replyText)

    // 清理回复
    const cleanText = cleanReply(replyText) || replyText

    const aiMsg: ChatMessage = {
      id: `msg-${Date.now()}-ai`, sender: 'ai',
      text: cleanText, time: getTime(),
      capturedTags: Object.entries(extracted).map(([k, v]) => `${k}: ${v}`),
      suggestChips: chips,
      source: 'chat',
    }
    chats.value = [...chats.value, aiMsg]

    // 自动补全逻辑
    if (dimensions.value.identity && dimensions.value.domain && dimensions.value.level && !dimensions.value.goal) {
      dimensions.value = { ...dimensions.value, goal: '做项目' }
    }

    if (syncToMainChat.value && avatarStatus.value === 'connected') {
      avatarWriteText(cleanText, false)
      isAiSpeaking.value = true
    }
  } catch (err) {
    console.error('DeepSeek API error:', err)
    appendChatError(err instanceof Error ? err.message : '消息发送失败，请稍后重试')
  } finally {
    isAiLoading.value = false
  }
}

function appendRecommendCoursesMsg(parsed: StudyReport) {
  const recommended = matchRecommendedCourses(parsed)
  const completionMsg: ChatMessage = {
    id: `msg-${Date.now()}-report-done`, sender: 'ai',
    text: `🎉 画像生成完成！综合评分 ${parsed.score} 分 — ${parsed.evaluation}\n\n根据你的学情画像，我为你精选了以下 3 门推荐课程，点击卡片即可跳转到学习资源页面开始学习：`,
    time: getTime(),
    source: 'chat',
    recommendedCourses: recommended,
  }
  chats.value = [...chats.value, completionMsg]
}

export async function triggerReport() {
  if (!canUnlockReport.value) return
  try {
    const dimSummary = Object.entries(dimensions.value)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')

    const reportPrompt = `当前已收集到的画像维度：\n${dimSummary}\n\n请基于以上信息生成一份学习画像报告，严格按以下 JSON 格式返回（不要包含 markdown 代码块标记）：\n{"score":<0-100总分>,"evaluation":"<一句话总评>","radarPoints":[{"dimension":"知识基础","score":<0-100>},{"dimension":"学习速度","score":<0-100>},{"dimension":"逻辑思维","score":<0-100>},{"dimension":"创造力","score":<0-100>},{"dimension":"专注力","score":<0-100>},{"dimension":"自律力","score":<0-100>}],"weaknesses":["<弱点1>","<弱点2>","<弱点3>"],"suggestions":["<建议1>","<建议2>","<建议3>"],"skills":{"core":["<核心技能1>","<核心技能2>","<核心技能3>"],"foundation":["<基础技能1>","<基础技能2>"],"additional":["<拓展技能1>","<拓展技能2>"]},"recommendedPath":[{"step":1,"title":"<阶段1标题>","description":"<描述>"},{"step":2,"title":"<阶段2标题>","description":"<描述>"},{"step":3,"title":"<阶段3标题>","description":"<描述>"},{"step":4,"title":"<阶段4标题>","description":"<描述>"}]}`

    const apiMessages = [
      { role: 'system', content: '你是一个专业的学习评估系统，请严格按要求的 JSON 格式输出，不要输出任何其他内容。' },
      { role: 'user', content: reportPrompt },
    ]

    const replyText = await callDeepSeek(apiMessages)
    const jsonMatch = replyText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as StudyReport
      report.value = parsed
      showReport.value = true
      hasGeneratedReport.value = true
      saveProfileToHistory(parsed)

      appendRecommendCoursesMsg(parsed)

      try {
        const { saveProfile, triggerKnowledgePath } = await import('@/lib/api')
        await saveProfile({
          score: parsed.score,
          radarPoints: parsed.radarPoints,
          weaknesses: parsed.weaknesses,
          suggestions: parsed.suggestions,
        })
        triggerKnowledgePath().catch(() => {})
      } catch (e) {
        console.warn('Failed to save profile to backend:', e)
      }
    } else {
      throw new Error('无法解析报告 JSON')
    }
  } catch (err) {
    console.error('Report generation error:', err)
    const fallback: StudyReport = {
      score: 75, evaluation: '良好',
      radarPoints: [
        { dimension: '知识基础', score: 72 }, { dimension: '学习速度', score: 80 },
        { dimension: '逻辑思维', score: 78 }, { dimension: '创造力', score: 75 },
        { dimension: '专注力', score: 70 }, { dimension: '自律力', score: 73 },
      ],
      weaknesses: ['基础知识需要系统梳理', '实战经验有待积累', '建议制定规律的学习计划'],
      suggestions: ['从基础课程开始循序渐进', '配合小项目巩固所学', '保持每日固定学习时间'],
      skills: { core: ['Python', '数据结构', '人工智能导论'], foundation: ['编程基础', '数学基础'], additional: ['机器学习入门'] },
      recommendedPath: [
        { step: 1, title: '基础入门', description: '掌握编程基础' }, { step: 2, title: '知识体系', description: '建立系统认知' },
        { step: 3, title: '实战练习', description: '动手做项目' }, { step: 4, title: '持续提升', description: '定期复盘优化' },
      ],
    }
    report.value = fallback
    showReport.value = true
    hasGeneratedReport.value = true
    saveProfileToHistory(fallback)
    appendRecommendCoursesMsg(fallback)

    try {
      const { saveProfile, triggerKnowledgePath } = await import('@/lib/api')
      await saveProfile({
        score: fallback.score,
        radarPoints: fallback.radarPoints,
        weaknesses: fallback.weaknesses,
        suggestions: fallback.suggestions,
      })
      triggerKnowledgePath().catch(() => {})
    } catch { /* ignore */ }
  }
  activeMenu.value = 'portrait-report'
}

export function handleSendRecommendQa(customText?: string) {
  const textToSend = customText || recommendQaInput.value
  if (!textToSend.trim() || isRecommendQaLoading.value) return

  recommendQaMessages.value = [...recommendQaMessages.value, { sender: 'user', text: textToSend }]
  recommendQaInput.value = ''
  isRecommendQaLoading.value = true

  if (avatarStatus.value === 'connected') {
    avatarWriteText(textToSend, true)
    isAiSpeaking.value = true

    const nlpHandler = (data: any) => {
      const response = data?.payload?.choices?.text?.[0]?.content || data?.text || ''
      if (response) {
        recommendQaMessages.value = [...recommendQaMessages.value, { sender: 'ai', text: response }]
        isRecommendQaLoading.value = false
        isAiSpeaking.value = false
      }
      const instance = getAvatarInstance()
      if (instance) instance.off('nlp', nlpHandler)
    }

    const instance = getAvatarInstance()
    if (instance) instance.on('nlp', nlpHandler)
  } else {
    setTimeout(() => {
      let response = ''
      const query = textToSend.toLowerCase()
      if (query.includes('顺序') || query.includes('规划') || query.includes('学习路径')) {
        response = `💡 **学习路径规划建议：**\n\n智学星枢课程体系推荐以下学习路径：\n\n**入门阶段（零基础）：**\n1. **Python程序设计** → 入门编程基础，无前置要求\n2. **C语言程序设计** → 打下扎实的底层编程功底\n3. **人工智能导论** → 建立 AI 整体认知\n\n**进阶阶段（有基础）：**\n4. **数据结构** → 掌握核心数据组织方式\n5. **机器学习** → 深入 AI 核心算法\n6. **深度学习** → 掌握神经网络与 CNN\n\n**高级阶段（专项突破）：**\n7. **自然语言处理** 或 **计算机视觉** → 按兴趣选择方向\n8. **强化学习 / 生成式AI** → 前沿技术拓展\n9. **大数据与云计算** → 工程化部署能力`
      } else if (query.includes('零基础') || query.includes('新手') || query.includes('没有基础') || query.includes('入门')) {
        response = `🌱 **零基础学习指南：**\n\n别担心！智学星枢课程体系为零基础同学设计了清晰的入门路径：\n\n**推荐课程（按顺序）：**\n1. **Python程序设计** — 语法简洁，上手快，适合编程启蒙\n2. **C语言程序设计** — 理解底层原理，夯实基础\n3. **人工智能导论** — 建立 AI 整体知识框架\n4. **数据结构** — 培养算法思维\n\n**学习建议：**\n- Python 入门可从列表、字典等数据结构开始，配合小项目练习\n- 每天保持 1-2 小时编码实践，比纯看书效果好 3 倍\n- 每学完一门课，尝试做一个综合小项目巩固知识`
      } else if (query.includes('课程') || query.includes('介绍') || query.includes('学科') || query.includes('内容')) {
        response = `🎓 **智学星枢课程体系概览：**\n\n共 **5 大方向、24 门课程**，由浅入深覆盖计算机核心知识：\n\n**1. 编程与算法基础（7门）：**\nC/Python/Java/C++ 编程语言 → 数据结构 → 算法设计 → 编译原理\n\n**2. 计算机系统（4门）：**\n计算机组成原理 → 操作系统 → 计算机网络 → 数据库系统原理\n\n**3. 软件工程（2门）：**\n软件工程 → 软件测试\n\n**4. 人工智能方向（8门）：**\n离散数学 → 概率统计 → AI 导论 → 机器学习 → 深度学习 → NLP → 计算机视觉 → 强化学习/生成式AI\n\n**5. 前沿与应用（3门）：**\n计算机图形学 → 信息安全 → 大数据与云计算\n\n每门课都包含核心知识点、代码示例和预设问答，可点击课程卡片展开查看。`
      } else {
        response = `🤖 **智学星枢课程答疑：**\n\n收到您对课程的提问！针对【${dimensions.value.identity || '学习者'}】的身份，我的建议是：\n\n1. 根据当前水平选择起点：零基础从 **Python程序设计** 开始，有基础可直接进入 **数据结构** 或 **机器学习**\n2. 建议按 "基础 → 核心 → 方向" 的三层结构推进学习\n3. 每门课都配有**核心知识点**、**代码示例**和**预设问答**，可展开课程卡片查看详情\n4. 如需进一步了解某门课程的具体内容，点击课程卡片上的「连麦咨询」按钮，我可以为你详细讲解`
      }
      recommendQaMessages.value = [...recommendQaMessages.value, { sender: 'ai', text: response }]
      isRecommendQaLoading.value = false
    }, 1005)
  }
}

export function runAiSimulation(customQuestion?: string) {
  if (isAiConnecting.value || isAiListening.value) return
  if (isAiSpeaking.value) {
    try { if ('speechSynthesis' in window) window.speechSynthesis.cancel() } catch { /* ignore */ }
    isAiSpeaking.value = false
    aiSubtitle.value = '你好！已为您停止播报。点击下方问题，随时开启新轮次的高阶对讲！'
    return
  }

  const targetQuestion = customQuestion || '我该如何科学地规划自己的日常AI学习道路呢？'
  isAiListening.value = true
  aiSubtitle.value = `🎙️ [实时收音中...] \n"${targetQuestion}"`

  setTimeout(() => {
    isAiListening.value = false
    isAiConnecting.value = true
    aiSubtitle.value = '⚡「多智能体大语言模型」深度语义分析中...'

    setTimeout(() => {
      isAiConnecting.value = false
      isAiSpeaking.value = true

      let responseText = ''
      if (targetQuestion.includes('Python程序设计') || targetQuestion.includes('C语言') || targetQuestion.includes('数据结构') || (targetQuestion.includes('介绍') && (targetQuestion.includes('课程') || targetQuestion.includes('门')))) {
        responseText = `根据 智学星枢课程体系，我来为您详细介绍！我们拥有 5 大方向共 24 门精品课程。如果您是零基础入门，建议从 **Python程序设计** 开始——它语法简洁、上手快，无前置要求，包含基础语法、数据结构、函数、面向对象等核心内容。学完 Python 后可以继续学习 **C语言程序设计** 来深入理解底层原理，再进入 **数据结构与算法** 的进阶学习。每门课程都配有核心知识点表格、可运行的代码示例以及预设问答环节，你可以随时在课程页面展开查看详情！`
      } else if (targetQuestion.includes('算法') || targetQuestion.includes('大模型')) {
        responseText = '关于当下的大模型，我建议你不仅要通过论文学习 Transformer 核心运作理论，更要把精力投放在 LoRA/QLoRA 高效微调、量化推理提速（比如 vLLM），以及使用 LangChain 或 LlamaIndex 搭建 RAG（检索增强生成）和 AI Agent 智能路由工作流。这是目前一线大厂最欠缺的工程实战技能，求职加分极大！'
      } else if (targetQuestion.includes('零基础') || targetQuestion.includes('项目')) {
        responseText = '零基础学习，切忌陷入死记硬背！最有效的办法是树立"最小项目闭环"。首周先学习 Python 基础并使用 Gradio 调用免费 API 搭建一个带图形页面的 PDF 智能摘要阅读助手，发布到 HuggingFace。有了立竿见影的实战反馈，能极大激发你的自学成就感和内驱力！'
      } else if (targetQuestion.includes('规划') || targetQuestion.includes('星图') || targetQuestion.includes('路径')) {
        responseText = '智学星枢学习路径建议：入门阶段从 Python 和 C 语言开始打基础；进阶阶段学习数据结构和机器学习核心算法；高级阶段按兴趣选择 NLP、计算机视觉或大数据方向。每门课程都配有代码示例和预设问答，你可以随时展开课程卡片查看详情。'
      } else {
        responseText = '收到您对课程的咨询！智学星枢课程体系涵盖 5 大方向共 24 门课程，从编程基础到人工智能前沿均有覆盖。您可以在课程页面浏览所有课程，点击课程卡片展开查看核心知识点、代码示例和预设问答。如需深入了解某门具体课程，我也很乐意为您详细讲解！'
      }

      aiSubtitle.value = `"${responseText}"`

      if (!isVirtualMuted.value) {
        try {
          if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel()
            const utterance = new SpeechSynthesisUtterance(responseText)
            utterance.lang = aiLanguage.value
            utterance.volume = aiVolume.value / 100
            utterance.rate = 1.05
            utterance.onend = () => { isAiSpeaking.value = false }
            utterance.onerror = () => { isAiSpeaking.value = false }
            window.speechSynthesis.speak(utterance)
          } else {
            setTimeout(() => { isAiSpeaking.value = false }, 8000)
          }
        } catch {
          setTimeout(() => { isAiSpeaking.value = false }, 8000)
        }
      } else {
        setTimeout(() => { isAiSpeaking.value = false }, 8000)
      }

      if (syncToMainChat.value) {
        const currentTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
        chats.value = [
          ...chats.value,
          { id: `ai-user-${Date.now()}`, sender: 'user', text: targetQuestion, time: currentTime, source: 'ai' },
          { id: `ai-ai-${Date.now()}`, sender: 'ai', text: responseText, time: currentTime, source: 'ai' },
        ]
      }
    }, 1200)
  }, 2000)
}
