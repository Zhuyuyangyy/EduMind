import { callLlm, safeParseJson } from '../llm/provider.js'
import { createAgentResult, AGENT_NAMES } from '../schemas.js'

const SYSTEM_PROMPT = `你是一个学习反思与反馈专家。根据用户的学习历程、评估结果和画像变化，生成反思总结和下一步建议。
请以 JSON 格式返回，包含：reflection(反思总结)、achievements(成就列表)、nextSteps(下一步建议)、riskAssessment(风险评估)。`

export async function runReflectionAgent({ profile, evaluation, learningHistory }) {
  const start = Date.now()
  const input = { profile, evaluation }

  const userPrompt = `用户画像: ${JSON.stringify(profile?.dimensions || [])}
评估结果: ${JSON.stringify(evaluation?.mastery || [])}
学习历史: ${JSON.stringify(learningHistory?.slice?.(-5) || [])}

请生成学习反思与反馈。`

  const llmResult = await callLlm(SYSTEM_PROMPT, userPrompt, { jsonMode: true })
  let output
  let fallbackUsed = false
  const evidence = []

  if (llmResult.content && !llmResult.fallbackUsed) {
    const parsed = safeParseJson(llmResult.content)
    if (parsed) {
      output = parsed
      evidence.push('LLM 生成反思反馈')
    } else {
      fallbackUsed = true
    }
  } else {
    fallbackUsed = true
  }

  if (fallbackUsed) {
    output = fallbackReflection({ profile, evaluation })
    evidence.push('本地规则 fallback 生成反思反馈')
  }

  const durationMs = Date.now() - start
  return createAgentResult({
    agentName: AGENT_NAMES.REFLECTION,
    input,
    output,
    confidence: fallbackUsed ? 0.6 : 0.82,
    evidence,
    durationMs,
    fallbackUsed,
  })
}

function fallbackReflection({ profile, evaluation }) {
  const score = profile?.totalScore || 50
  const weakTags = (profile?.weaknesses || [])

  return {
    reflection: score >= 70
      ? '本阶段学习整体表现良好，核心概念掌握扎实，但部分薄弱环节仍需持续关注。'
      : '本阶段学习存在明显薄弱环节，建议放慢节奏，优先巩固基础再逐步推进。',
    achievements: [
      { title: '完成画像评估', description: '已生成个性化学习画像', unlocked: true },
      { title: '首次资源生成', description: '系统已为你生成个性化资源', unlocked: true },
      { title: '学习路径规划', description: '已规划个性化学习路径', unlocked: score > 40 },
      { title: '知识达人', description: '综合掌握度达到 80%', unlocked: score >= 80 },
    ],
    nextSteps: [
      weakTags.length > 0 ? `优先补强${weakTags[0]}` : '继续当前学习节奏',
      '完成本周练习目标',
      '尝试一个综合小项目',
      '下周做一次自测评估',
    ],
    riskAssessment: {
      level: score < 40 ? 'high' : score < 65 ? 'medium' : 'low',
      factors: [
        ...(score < 40 ? ['综合评分偏低，存在学习困难风险'] : []),
        ...(weakTags.length > 2 ? ['薄弱点较多，需分优先级处理'] : []),
        '建议保持每周至少 5 小时学习时间',
      ],
    },
  }
}
