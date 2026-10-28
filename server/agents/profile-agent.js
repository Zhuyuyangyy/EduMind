import { callLlm, safeParseJson } from '../llm/provider.js'
import { createAgentResult, AGENT_NAMES } from '../schemas.js'

const SYSTEM_PROMPT = `你是一个学习画像分析专家。根据用户的问卷回答，分析其学习能力、薄弱点和学习偏好。

请以 JSON 格式返回，包含以下所有字段：
{
  "score": 0-100的综合评分,
  "evaluation": "一句话总评（如 优秀/良好/一般/需加强）",
  "radarPoints": [
    { "dimension": "知识基础", "score": 0-100 },
    { "dimension": "学习速度", "score": 0-100 },
    { "dimension": "逻辑思维", "score": 0-100 },
    { "dimension": "创造力", "score": 0-100 },
    { "dimension": "专注力", "score": 0-100 },
    { "dimension": "自律力", "score": 0-100 }
  ],
  "weaknesses": ["弱点描述1", "弱点描述2", "弱点描述3"],
  "suggestions": ["建议1", "建议2", "建议3"],
  "skills": {
    "core": ["核心技能1", "核心技能2", "核心技能3"],
    "foundation": ["基础技能1", "基础技能2"],
    "additional": ["拓展技能1", "拓展技能2"]
  },
  "recommendedPath": [
    { "step": 1, "title": "阶段标题", "description": "描述" },
    { "step": 2, "title": "阶段标题", "description": "描述" },
    { "step": 3, "title": "阶段标题", "description": "描述" },
    { "step": 4, "title": "阶段标题", "description": "描述" }
  ]
}`

export async function runProfileAgent(answers) {
  const start = Date.now()
  const input = { answers }

  const userPrompt = `分析以下学习画像问卷回答：${JSON.stringify(answers)}`
  const llmResult = await callLlm(SYSTEM_PROMPT, userPrompt, { jsonMode: true })
  let output
  let fallbackUsed = false
  const evidence = []

  if (llmResult.content && !llmResult.fallbackUsed) {
    const parsed = safeParseJson(llmResult.content)
    if (parsed && parsed.radarPoints) {
      output = normalizeProfileOutput(parsed)
      evidence.push('LLM 生成画像分析')
    } else {
      fallbackUsed = true
    }
  } else {
    fallbackUsed = true
  }

  if (fallbackUsed) {
    output = fallbackProfileAnalysis(answers)
    evidence.push('本地规则 fallback 生成画像分析')
  }

  const durationMs = Date.now() - start
  return createAgentResult({
    agentName: AGENT_NAMES.PROFILE,
    input,
    output,
    confidence: fallbackUsed ? 0.7 : 0.9,
    evidence,
    durationMs,
    fallbackUsed,
  })
}

/** 规范化 LLM 输出，补充缺失字段，同时保留下游 Agent 所需的兼容字段 */
function normalizeProfileOutput(parsed) {
  const score = parsed.score ?? 75
  const evaluation = parsed.evaluation ?? '良好'
  const radarPoints = parsed.radarPoints ?? []
  const weaknesses = Array.isArray(parsed.weaknesses) ? parsed.weaknesses : []
  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : []
  const skills = parsed.skills ?? { core: [], foundation: [], additional: [] }
  const recommendedPath = parsed.recommendedPath ?? []

  // 兼容下游 Agent 的字段
  const dimensions = radarPoints.map((rp, i) => ({
    label: rp.dimension,
    value: rp.score,
    color: ['#00d4ff', '#3b82f6', '#7c3aed', '#06d6a0', '#f59e0b', '#f43f5e'][i % 6],
  }))
  const totalScore = score

  return { score, evaluation, radarPoints, weaknesses, suggestions, skills, recommendedPath, dimensions, totalScore }
}

function fallbackProfileAnalysis(answers) {
  const levelBoost = { beginner: 0, intermediate: 5, advanced: 10, expert: 15 }
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

  const radarPoints = [
    { dimension: '知识基础', score: clamp((answers.knowledgeBase ?? 50) + (levelBoost[answers.level] || 0), 0, 100) },
    { dimension: '学习速度', score: clamp((answers.learningSpeed ?? 50) + 2, 0, 100) },
    { dimension: '逻辑思维', score: clamp(answers.logicalThinking ?? 50, 0, 100) },
    { dimension: '创造力', score: clamp(answers.creativity ?? 50, 0, 100) },
    { dimension: '专注力', score: clamp(answers.focus ?? 50, 0, 100) },
    { dimension: '自律力', score: clamp(answers.selfDiscipline ?? 50, 0, 100) },
  ]

  const totalScore = Math.round(radarPoints.reduce((s, d) => s + d.score, 0) / radarPoints.length)
  const sorted = [...radarPoints].sort((a, b) => a.score - b.score)
  const weakest = sorted.slice(0, 3)
  const strongest = sorted[sorted.length - 1]

  const evaluation = totalScore >= 85 ? '优秀' : totalScore >= 70 ? '良好' : totalScore >= 50 ? '一般' : '需加强'

  // 兼容下游 Agent 的 dimensions 字段
  const dimensions = radarPoints.map((rp, i) => ({
    label: rp.dimension,
    value: rp.score,
    color: ['#00d4ff', '#3b82f6', '#7c3aed', '#06d6a0', '#f59e0b', '#f43f5e'][i],
  }))

  return {
    score: totalScore,
    evaluation,
    radarPoints,
    weaknesses: [
      `${weakest[0].dimension}薄弱（${weakest[0].score}分），需要重点提升`,
      `${weakest[1].dimension}有待加强（${weakest[1].score}分），建议专项训练`,
      `${weakest[2].dimension}有提升空间（${weakest[2].score}分），可通过实践巩固`,
    ],
    suggestions: [
      `优先巩固${weakest[0].dimension}，每天安排 20 分钟专项训练。`,
      `继续发挥${strongest.dimension}优势，以此带动其他维度提升。`,
      '建议每两周复盘一次学习进度，动态调整资源和节奏。',
    ],
    skills: {
      core: ['Python', '机器学习', '数据分析'],
      foundation: ['算法基础', '数学基础'],
      additional: ['项目实战', '工程化部署'],
    },
    recommendedPath: [
      { step: 1, title: '夯实基础', description: `巩固${weakest[0].dimension}等薄弱环节` },
      { step: 2, title: '核心突破', description: '掌握核心技能，建立知识体系' },
      { step: 3, title: '实战演练', description: '通过项目实践巩固所学' },
      { step: 4, title: '持续优化', description: '定期复盘，动态调整学习路径' },
    ],
    // 兼容下游 Agent
    dimensions,
    totalScore,
  }
}
