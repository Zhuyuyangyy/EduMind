import { callLlm, safeParseJson } from '../llm/provider.js'
import { createAgentResult, AGENT_NAMES } from '../schemas.js'
import { searchKnowledgeBase } from '../knowledge-base/vector-store.js'

const SYSTEM_PROMPT = `你是一个学习效果评估专家。根据用户的学习数据、练习结果和画像变化，评估学习效果并给出反馈。
请以 JSON 格式返回，包含：mastery(各知识点掌握度)、suggestions(建议列表)、profileUpdates(画像更新建议)。`

export async function runEvaluationAgent({ profile, learningData, exerciseResults, knowledgeContext }) {
  const start = Date.now()
  const resolvedKnowledgeContext = knowledgeContext || searchKnowledgeBase({
    profile,
    learningData,
    exerciseResults,
    query: 'learning evaluation weakness diagnosis profile update path replan',
  })
  const safeKnowledgeMatches = resolvedKnowledgeContext.outOfKnowledgeBase ? [] : (resolvedKnowledgeContext.matches || [])
  const input = {
    profile,
    learningData,
    exerciseResults,
    knowledgeContext: { ...resolvedKnowledgeContext, matches: safeKnowledgeMatches },
  }

  const userPrompt = `用户画像: ${JSON.stringify(profile?.dimensions || [])}
学习数据: ${JSON.stringify(learningData || {})}
练习结果: ${JSON.stringify(exerciseResults || {})}

请评估学习效果并给出反馈。`

  const llmResult = await callLlm(
    SYSTEM_PROMPT,
    `${userPrompt}\nKnowledge context: ${JSON.stringify(safeKnowledgeMatches)}`,
    { jsonMode: true },
  )
  let output
  let fallbackUsed = false
  const evidence = ['本地知识库 + embedding 向量检索已注入 EvaluationAgent']

  if (llmResult.content && !llmResult.fallbackUsed) {
    const parsed = safeParseJson(llmResult.content)
    if (parsed) {
      output = parsed
      evidence.push('LLM 生成评估反馈')
    } else {
      fallbackUsed = true
    }
  } else {
    fallbackUsed = true
  }

  if (fallbackUsed) {
    output = fallbackEvaluation({ profile, exerciseResults, knowledgeContext: { ...resolvedKnowledgeContext, matches: safeKnowledgeMatches } })
    evidence.push('本地规则 fallback 生成评估反馈')
  }

  output = {
    ...output,
    knowledgeContext: {
      matches: safeKnowledgeMatches,
      ...(resolvedKnowledgeContext.outOfKnowledgeBase ? { candidateMatches: resolvedKnowledgeContext.matches || [] } : {}),
      outOfKnowledgeBase: resolvedKnowledgeContext.outOfKnowledgeBase || false,
      embedding: resolvedKnowledgeContext.embedding,
    },
  }

  if (safeKnowledgeMatches.length) {
    evidence.push(`知识库命中 ${safeKnowledgeMatches.length} 条: ${safeKnowledgeMatches.map(item => item.title).join(', ')}`)
  } else if (resolvedKnowledgeContext.outOfKnowledgeBase) {
    evidence.push('知识库外问题：低可信候选仅保留用于诊断，未注入 Agent')
  }

  const durationMs = Date.now() - start
  return {
    ...createAgentResult({
    agentName: AGENT_NAMES.EVALUATION,
    input,
    output,
    confidence: fallbackUsed ? 0.65 : 0.85,
    evidence,
    riskFlags: resolvedKnowledgeContext.outOfKnowledgeBase ? ['knowledge-base-out-of-scope'] : [],
    durationMs,
    fallbackUsed,
    }),
    output,
  }
}

function fallbackEvaluation({ profile, exerciseResults, knowledgeContext }) {
  const score = profile?.totalScore || 50
  const weakTags = (profile?.weaknesses || [])
    .map(item => typeof item === 'string' ? item : item?.tag || item?.label || item?.name)
    .filter(Boolean)
  const correctRate = exerciseResults?.correctRate ?? (score > 60 ? 0.75 : 0.55)
  const knowledgeMatches = knowledgeContext?.matches || []
  const profileDimensions = Array.isArray(profile?.dimensions) ? profile.dimensions : []
  const requestedDimension = String(exerciseResults?.dimension || '').trim()
  const matchedDimension = profileDimensions.find(item => item.label === requestedDimension || item.key === requestedDimension)
  const rankedDimensions = [...profileDimensions].sort((left, right) => Number(left.value ?? 0) - Number(right.value ?? 0))
  const affectedDimensions = matchedDimension ? [matchedDimension] : rankedDimensions.slice(0, 2)
  const adjustmentDelta = correctRate >= 0.8 ? 4 : correctRate < 0.6 ? -5 : 0

  const mastery = [
    { name: '核心概念', level: Math.min(100, score + 10) },
    { name: '基础应用', level: Math.min(100, score) },
    { name: '综合分析', level: Math.max(10, score - 15) },
    { name: '创新实践', level: Math.max(10, score - 25) },
  ]

  const suggestions = []
  if (correctRate < 0.6) {
    suggestions.push({ text: '当前正确率偏低，建议回到基础概念重新梳理', type: 'weakness' })
  }
  if (weakTags.length > 0) {
    suggestions.push({ text: `重点加强${weakTags.slice(0, 2).join('、')}的训练`, type: 'action' })
  }
  if (correctRate >= 0.8) {
    suggestions.push({ text: '掌握情况良好，可以尝试更高难度的内容', type: 'strength' })
  }
  suggestions.push({ text: '建议每周做一次综合自测，跟踪进步', type: 'positive' })

  knowledgeMatches.slice(0, 2).forEach(match => {
    suggestions.push({
      text: `${match.title}: ${match.agentHint || match.summary}`,
      type: 'action',
      evidenceSource: match.id,
    })
  })

  return {
    mastery,
    correctRate,
    suggestions,
    profileUpdates: {
      adjustDimensions: adjustmentDelta === 0 ? [] : affectedDimensions.map(item => ({
        dimension: item.label || item.key,
        delta: adjustmentDelta,
        reason: `${exerciseResults?.knowledgePoint || '本轮练习'}正确率${Math.round(correctRate * 100)}%，${adjustmentDelta > 0 ? '稳定提升' : '需要补强'}`,
      })),
    },
  }
}
