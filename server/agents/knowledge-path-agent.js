import { callLlm, safeParseJson } from '../llm/provider.js'
import { createAgentResult, AGENT_NAMES } from '../schemas.js'

const SYSTEM_PROMPT = `你是一个个性化学习路径规划智能体。根据用户的学习画像分析结果，为其生成定制化的知识学习路径。

用户画像包含6个维度的能力评分（0-100）：知识基础、学习速度、逻辑思维、创造力、专注力、自律性。
还有弱点描述和学习建议。

请根据画像特点，生成4-6个学习领域，每个领域包含3-5个具体知识点。

要求：
1. 弱点对应的领域要放在前面，权重更高
2. 每个知识点的 mastery 根据用户当前能力推断（0-1之间，0表示完全不会，1表示已掌握）
3. importance 表示该知识点对用户目标的重要程度（0-1）
4. recommended 为 true 表示推荐优先学习

请严格按以下 JSON 格式返回（不要包含 markdown 代码块标记）：
{
  "phases": [
    {
      "id": "领域英文ID（如 math/ml/dl/algo/eng/nlp 或自定义）",
      "name": "领域中文名称",
      "short": "领域英文简称",
      "color": "#十六进制颜色",
      "topics": [
        {
          "id": "知识点ID（如 m1/ml1 等）",
          "name": "知识点名称",
          "mastery": 0.0-1.0,
          "importance": 0.0-1.0,
          "recommended": true/false
        }
      ]
    }
  ]
}`

function normalizeOutput(parsed) {
  // 确保每个 phase 有必要的字段
  const phases = (parsed.phases || []).map((phase, pi) => ({
    id: phase.id || `domain-${pi}`,
    name: phase.name || `领域 ${pi + 1}`,
    short: phase.short || phase.name?.slice(0, 4) || `D${pi}`,
    color: phase.color || ['#00d4ff', '#7c3aed', '#06d6a0', '#f59e0b', '#3b82f6', '#f43f5e'][pi % 6],
    topics: (phase.topics || []).map((topic, ti) => ({
      id: topic.id || `${phase.id || 'd' + pi}-${ti}`,
      name: topic.name || topic.label || `知识点 ${ti + 1}`,
      mastery: typeof topic.mastery === 'number' ? Math.max(0, Math.min(1, topic.mastery)) : 0.3,
      importance: typeof topic.importance === 'number' ? Math.max(0, Math.min(1, topic.importance)) : 0.5,
      recommended: !!topic.recommended,
    })),
  }))
  return { phases }
}

function fallbackKnowledgePath(profile) {
  // 根据 profile 的 weaknesses 和 radarPoints 生成 fallback 路径
  const dims = profile?.dimensions || []
  const dimMap = {}
  dims.forEach(d => { dimMap[d.label] = (d.value || 50) / 100 })

  const weaknesses = profile?.weaknesses || []

  // 根据弱点确定领域优先级
  const domainTemplates = [
    {
      id: 'fundamentals', name: '基础巩固', short: 'FUND', color: '#00d4ff',
      topics: [
        { id: 'f1', name: '编程基础与语法', mastery: dimMap['知识基础'] || 0.5, importance: 0.9, recommended: true },
        { id: 'f2', name: '数据结构入门', mastery: (dimMap['知识基础'] || 0.5) * 0.8, importance: 0.8 },
        { id: 'f3', name: '算法思维培养', mastery: (dimMap['逻辑思维'] || 0.5) * 0.7, importance: 0.7 },
      ],
    },
    {
      id: 'core-skills', name: '核心技能', short: 'CORE', color: '#7c3aed',
      topics: [
        { id: 'c1', name: '机器学习基础概念', mastery: 0.2, importance: 0.95, recommended: true },
        { id: 'c2', name: '数据处理与分析', mastery: 0.3, importance: 0.85 },
        { id: 'c3', name: '模型训练与评估', mastery: 0.15, importance: 0.8 },
        { id: 'c4', name: '特征工程实践', mastery: 0.1, importance: 0.7 },
      ],
    },
    {
      id: 'deep-learning', name: '深度学习', short: 'DL', color: '#06d6a0',
      topics: [
        { id: 'd1', name: '神经网络原理', mastery: 0.1, importance: 0.9, recommended: true },
        { id: 'd2', name: 'CNN 图像处理', mastery: 0.05, importance: 0.7 },
        { id: 'd3', name: 'Transformer 架构', mastery: 0.02, importance: 0.95, recommended: true },
      ],
    },
    {
      id: 'practice', name: '实战应用', short: 'PRACT', color: '#f59e0b',
      topics: [
        { id: 'p1', name: '项目实战练习', mastery: 0.1, importance: 0.85, recommended: true },
        { id: 'p2', name: '代码规范与工程化', mastery: dimMap['自律性'] || 0.4, importance: 0.6 },
        { id: 'p3', name: '部署与上线', mastery: 0.05, importance: 0.5 },
      ],
    },
  ]

  // 如果有弱点，调整推荐
  if (weaknesses.length > 0) {
    domainTemplates[0].topics[0].recommended = true
    domainTemplates[0].topics[0].importance = 1.0
  }

  return { phases: domainTemplates }
}

export async function runKnowledgePathAgent(profile) {
  const start = Date.now()
  const input = { profile }

  const userPrompt = `根据以下学习画像生成个性化知识学习路径：
用户能力评分：${JSON.stringify(profile?.dimensions || [])}
综合评分：${profile?.totalScore || '未知'}
弱点：${JSON.stringify(profile?.weaknesses || [])}
建议：${JSON.stringify(profile?.recommendations || [])}`

  const llmResult = await callLlm(SYSTEM_PROMPT, userPrompt, { maxTokens: 3000, jsonMode: true })
  let output
  let fallbackUsed = false
  const evidence = []

  if (llmResult.content && !llmResult.fallbackUsed) {
    const parsed = safeParseJson(llmResult.content)
    if (parsed && parsed.phases && Array.isArray(parsed.phases)) {
      output = normalizeOutput(parsed)
      evidence.push('LLM 生成个性化知识路径')
    } else {
      fallbackUsed = true
    }
  } else {
    fallbackUsed = true
  }

  if (fallbackUsed) {
    output = fallbackKnowledgePath(profile)
    evidence.push('本地规则 fallback 生成知识路径')
  }

  const durationMs = Date.now() - start

  return createAgentResult({
    agentName: AGENT_NAMES.KNOWLEDGE_PATH,
    input,
    output,
    confidence: fallbackUsed ? 0.6 : 0.85,
    evidence,
    durationMs,
    fallbackUsed,
  })
}
