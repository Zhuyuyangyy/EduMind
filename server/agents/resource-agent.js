import { callLlm, safeParseJson } from '../llm/provider.js'
import { createAgentResult, AGENT_NAMES } from '../schemas.js'
import RESOURCE_LIBRARY from '../content/resources.json' with { type: 'json' }

const SYSTEM_PROMPT = `你是一个个性化学习资源生成专家。根据用户画像、薄弱点和主题，生成包含以下内容的资源包：
1. concept: 概念讲解
2. example: 例题
3. exercise: 练习题（含题目、选项、答案、解析）
4. errorTip: 常见错因提醒
5. recommendReason: 推荐理由
6. profileEvidence: 适配画像证据

7. resources: 至少 6 条可直接交付的资源，类型必须覆盖 video、doc、mindmap、exercise、code、audio 六类；每条包含 type、title、description、difficulty、estimatedMinutes、tags、formatReason 字段。

请以 JSON 格式返回，包含以上七个字段。每个字段是字符串、对象或数组。`

export async function runResourceAgent({ profile, weaknesses, topic, resourceType }) {
  const start = Date.now()
  const input = { profile, weaknesses, topic, resourceType }

  const userPrompt = `用户画像: ${JSON.stringify(profile?.dimensions || [])}
薄弱点: ${JSON.stringify(weaknesses || [])}
主题: ${topic}
资源类型: ${resourceType || 'all'}

请生成个性化学习资源包。`

  const llmResult = await callLlm(SYSTEM_PROMPT, userPrompt, { jsonMode: true })
  let output
  let fallbackUsed = false
  const evidence = []

  if (llmResult.content && !llmResult.fallbackUsed) {
    const parsed = safeParseJson(llmResult.content)
    if (isCompleteResourcePackage(parsed)) {
      output = normalizeResourcePackage(parsed, { profile, weaknesses, topic })
      evidence.push('LLM 生成个性化资源')
    } else {
      fallbackUsed = true
    }
  } else {
    fallbackUsed = true
  }

  if (fallbackUsed) {
    output = fallbackResourcePackage({ profile, weaknesses, topic })
    evidence.push('本地规则 fallback 生成资源包')
  }

  const durationMs = Date.now() - start
  return createAgentResult({
    agentName: AGENT_NAMES.RESOURCE,
    input,
    output,
    confidence: fallbackUsed ? 0.65 : 0.88,
    evidence,
    durationMs,
    fallbackUsed,
  })
}

function fallbackResourcePackage({ profile, weaknesses, topic }) {
  const rawWeakest = weaknesses?.[0] || topic || '基础知识'
  const weakest = typeof rawWeakest === 'string' ? rawWeakest : rawWeakest?.tag || rawWeakest?.label || topic || '基础知识'
  const level = profile?.totalScore > 70 ? '进阶' : profile?.totalScore > 40 ? '中级' : '入门'

  return {
    concept: `${topic}是当前学习重点。从基本定义出发：${topic}的核心思想是将复杂问题分解为可操作的步骤。${level}学习者应重点关注概念间的关联和实际应用场景。`,
    example: {
      title: `${topic} — 典型例题`,
      description: `已知条件：与${topic}相关的标准问题场景。求解：运用${topic}的核心方法，逐步推导出结果。`,
      steps: ['理解题意，识别关键信息', `选择合适的${topic}方法`, '逐步计算并验证', '总结规律，举一反三'],
    },
    exercise: {
      title: `${topic} — 练习题`,
      questions: [
        { question: `关于${topic}的基本概念，以下哪项描述最准确？`, options: ['A. 核心定义', 'B. 错误描述', 'C. 部分正确', 'D. 无关描述'], correctAnswer: 'A', explanation: `${topic}的核心定义是...` },
        { question: `在${topic}的应用中，以下哪种方法最有效？`, options: ['A. 方法一', 'B. 方法二', 'C. 方法三', 'D. 方法四'], correctAnswer: 'B', explanation: `方法二最适合${level}水平的学习者。` },
        { question: `关于${topic}的常见误区，以下哪项需要特别注意？`, options: ['A. 误区一', 'B. 误区二', 'C. 误区三', 'D. 误区四'], correctAnswer: 'C', explanation: `这是${weakest}相关的常见错误。` },
      ],
    },
    errorTip: `学习${topic}时常见错误：1) 概念混淆，把${topic}与相关概念混淆；2) 步骤遗漏，忽略中间验证环节；3) 边界条件处理不当。建议针对"${weakest}"做专项训练。`,
    recommendReason: `该资源包针对你的薄弱点“${weakest}”定制，难度适配${level}水平，内容覆盖概念理解、例题演示和实战练习三个层次。`,
    profileEvidence: `画像分析显示你在${weakest}方面得分偏低，综合评分${profile?.totalScore || 50}分，推荐从基础概念开始巩固。`,
    resources: createResourceItems({ topic, weakest, level }),
  }
}

function isCompleteResourcePackage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const requiredFields = ['concept', 'example', 'exercise', 'errorTip', 'recommendReason', 'profileEvidence', 'resources']
  return requiredFields.every(field => Object.hasOwn(value, field)) && Array.isArray(value.resources)
}

function normalizeResourcePackage(output, context) {
  const fallback = fallbackResourcePackage(context)
  const resources = Array.isArray(output.resources) ? output.resources.filter(isResourceItem) : []
  return {
    ...fallback,
    ...output,
    example: { ...fallback.example, ...(output.example || {}) },
    exercise: { ...fallback.exercise, ...(output.exercise || {}) },
    resources: ensureResourceCoverage(resources, fallback.resources),
  }
}

function isResourceItem(resource) {
  return resource && typeof resource === 'object' && typeof resource.type === 'string' && typeof resource.title === 'string'
}

function ensureResourceCoverage(resources, fallbackResources) {
  const supportedTypes = ['video', 'doc', 'mindmap', 'exercise', 'code', 'audio']
  const byType = new Map(resources.map(item => [item.type, item]))
  return supportedTypes.map(type => ({ ...fallbackResources.find(item => item.type === type), ...byType.get(type) }))
}

function createResourceItems({ topic, weakest, level }) {
  const base = {
    difficulty: level,
    tags: [topic, weakest, '个性化推荐'],
    formatReason: `围绕薄弱点“${weakest}”选择${level}难度与短时反馈形式`,
  }

  const localItems = selectLocalResources(topic)
  const types = ['video', 'doc', 'mindmap', 'exercise', 'code']

  return [
    ...types.map(type => toGeneratedResource(localItems[type], type, base)),
    {
      ...base,
      type: 'audio',
      title: `${topic} 听读复盘`,
      description: `根据“${weakest}”生成的 2 分钟听读稿，可使用浏览器语音朗读功能复盘本次学习重点。`,
      estimatedMinutes: 2,
      assetKind: 'browser-speech',
      speechText: `请复盘${topic}。重点关注${weakest}，先说清概念，再完成一题练习，最后总结常见误区。`,
    },
  ]
}

function selectLocalResources(topic) {
  const keywords = String(topic || '').toLowerCase().split(/[\s、，,。；;：:]+/).filter(word => word.length > 1)
  const score = item => {
    const haystack = `${item.title} ${(item.tags || []).join(' ')} ${item.desc || ''}`.toLowerCase()
    return keywords.reduce((sum, keyword) => sum + (haystack.includes(keyword) ? 10 : 0), 0) + (item.reads || 0) / 1000
  }
  const byType = {}
  for (const type of ['video', 'doc', 'mindmap', 'exercise', 'code']) {
    byType[type] = RESOURCE_LIBRARY
      .filter(item => item.type === type)
      .sort((left, right) => score(right) - score(left))[0]
  }
  return byType
}

function toGeneratedResource(resource, type, base) {
  if (!resource) {
    return {
      ...base,
      type,
      title: `${type} 学习资源`,
      description: '资源库中暂未匹配到该类型资源。',
      estimatedMinutes: 10,
      assetKind: 'unavailable',
    }
  }
  return {
    ...base,
    type,
    title: resource.title,
    description: resource.desc,
    difficulty: resource.difficulty || base.difficulty,
    estimatedMinutes: Number.parseInt(resource.estTime, 10) || 15,
    tags: resource.tags || base.tags,
    formatReason: resource.reason || base.formatReason,
    sourceResourceId: resource.id,
    source: 'local-resource-library',
    assetKind: resource.slides?.length ? 'interactive-slides' : 'catalog-item',
    slides: resource.slides || [],
  }
}
