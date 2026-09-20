import { runProfileAgent } from './profile-agent.js'
import { runResourceAgent } from './resource-agent.js'
import { runPathAgent } from './path-agent.js'
import { runTutorAgent } from './tutor-agent.js'
import { runEvaluationAgent } from './evaluation-agent.js'
import { runReflectionAgent } from './reflection-agent.js'
import { runKnowledgePathAgent } from './knowledge-path-agent.js'
import { buildTrace, recordTrace } from '../evidence/recorder.js'
import { AGENT_NAMES } from '../schemas.js'
import { generateStructuredJson } from '../llm/provider.js'
import { applyProfileUpdates } from '../learning-cycle.js'

export async function orchestrateProfileAnalysis(answers) {
  const start = Date.now()
  const profileResult = await runProfileAgent(answers)
  const durationMs = Date.now() - start

  const trace = buildTrace({
    requestId: `profile-${Date.now()}`,
    agents: [AGENT_NAMES.PROFILE],
    inputsSummary: `画像问卷: ${Object.keys(answers || {}).length} 个字段`,
    outputsSummary: `综合评分: ${profileResult.output?.totalScore || 'N/A'}`,
    evidence: profileResult.evidence,
    riskFlags: profileResult.confidence < 0.7 ? ['低置信度'] : [],
    fallbackUsed: profileResult.fallbackUsed,
    durationMs,
    agentResults: [profileResult],
  })
  recordTrace(trace)

  return {
    profile: profileResult.output,
    agentResults: [profileResult],
    trace,
  }
}

export async function orchestrateResourceGeneration({ profile, weaknesses, topic, resourceType }) {
  const start = Date.now()

  const profileResult = await runProfileAgent({ dimensions: profile?.dimensions, totalScore: profile?.totalScore })
  const resourceResult = await runResourceAgent({ profile, weaknesses, topic, resourceType })
  const durationMs = Date.now() - start

  const trace = buildTrace({
    requestId: `resource-${Date.now()}`,
    agents: [AGENT_NAMES.PROFILE, AGENT_NAMES.RESOURCE],
    inputsSummary: `主题: ${topic}, 类型: ${resourceType}`,
    outputsSummary: `资源包: ${Object.keys(resourceResult.output || {}).join(', ')}`,
    evidence: [...profileResult.evidence, ...resourceResult.evidence],
    riskFlags: resourceResult.confidence < 0.7 ? ['资源生成置信度低'] : [],
    fallbackUsed: profileResult.fallbackUsed || resourceResult.fallbackUsed,
    durationMs,
    agentResults: [profileResult, resourceResult],
  })
  recordTrace(trace)

  return {
    resourcePackage: resourceResult.output,
    agentResults: [profileResult, resourceResult],
    trace,
  }
}

export async function orchestratePathReplan({ profile, evaluation, currentPath }) {
  const start = Date.now()

  const evalResult = await runEvaluationAgent({ profile, evaluation })
  const pathResult = await runPathAgent({ profile, evaluation, currentPath, replan: true })
  const durationMs = Date.now() - start

  const trace = buildTrace({
    requestId: `path-replan-${Date.now()}`,
    agents: [AGENT_NAMES.EVALUATION, AGENT_NAMES.PATH],
    inputsSummary: `重规划路径, 评分: ${profile?.totalScore || 'N/A'}`,
    outputsSummary: `路径阶段: ${pathResult.output?.phases?.length || 0} 个`,
    evidence: [...evalResult.evidence, ...pathResult.evidence],
    riskFlags: [],
    fallbackUsed: evalResult.fallbackUsed || pathResult.fallbackUsed,
    durationMs,
    agentResults: [evalResult, pathResult],
  })
  recordTrace(trace)

  return {
    path: pathResult.output,
    evaluation: evalResult.output,
    agentResults: [evalResult, pathResult],
    trace,
  }
}

export async function orchestrateTutoring({ question, mode, profile, resources, hintLevel, attempts, learningHistory }) {
  const start = Date.now()

  const profileResult = await runProfileAgent({ dimensions: profile?.dimensions, totalScore: profile?.totalScore })
  const tutorResult = await runTutorAgent({ question, mode, profile, resources, hintLevel, attempts, learningHistory })
  const durationMs = Date.now() - start
  const fallbackAgents = [profileResult, tutorResult].filter(result => result.fallbackUsed).map(result => result.agentName)

  const trace = buildTrace({
    requestId: `tutor-${Date.now()}`,
    agents: [AGENT_NAMES.PROFILE, AGENT_NAMES.TUTOR],
    inputsSummary: `问题: ${question?.slice(0, 50)}, 模式: ${mode}`,
    outputsSummary: `回答长度: ${(tutorResult.output?.answer || '').length} 字符`,
    evidence: [...profileResult.evidence, ...tutorResult.evidence],
    riskFlags: tutorResult.riskFlags || [],
    fallbackUsed: profileResult.fallbackUsed || tutorResult.fallbackUsed,
    durationMs,
    agentResults: [profileResult, tutorResult],
  })
  recordTrace(trace)

  return {
    answer: tutorResult.output?.answer || '',
    scaffolding: tutorResult.output?.scaffolding,
    riskFlags: tutorResult.riskFlags || [],
    securityRefused: tutorResult.securityRefused || false,
    fallbackAgents,
    agentResults: [profileResult, tutorResult],
    trace,
  }
}

export async function orchestrateFullEvaluation({ profile, learningData, exerciseResults, knowledgeContext }) {
  const start = Date.now()

  const evalResult = await runEvaluationAgent({ profile, learningData, exerciseResults, knowledgeContext })
  const reflectResult = await runReflectionAgent({ profile, evaluation: evalResult.output })
  const durationMs = Date.now() - start

  const trace = buildTrace({
    requestId: `eval-${Date.now()}`,
    agents: [AGENT_NAMES.EVALUATION, AGENT_NAMES.REFLECTION],
    inputsSummary: `综合评估, 评分: ${profile?.totalScore || 'N/A'}`,
    outputsSummary: `掌握度: ${evalResult.output?.mastery?.length || 0} 项, 风险: ${reflectResult.output?.riskAssessment?.level || 'N/A'}`,
    evidence: [...evalResult.evidence, ...reflectResult.evidence],
    riskFlags: reflectResult.output?.riskAssessment?.level === 'high' ? ['高风险'] : [],
    fallbackUsed: evalResult.fallbackUsed || reflectResult.fallbackUsed,
    durationMs,
    agentResults: [evalResult, reflectResult],
  })
  recordTrace(trace)

  return {
    evaluation: evalResult.output,
    reflection: reflectResult.output,
    agentResults: [evalResult, reflectResult],
    trace,
  }
}

export async function orchestrateFullRun({ answers, topic, resourceType, question, mode }) {
  const start = Date.now()

  const profileResult = await runProfileAgent(answers || {})
  const profile = profileResult.output

  const resourceResult = await runResourceAgent({ profile, weaknesses: profile?.weaknesses || [], topic: topic || '核心概念', resourceType: resourceType || 'all' })

  const tutorResult = await runTutorAgent({ question: question || '请帮我梳理学习重点', mode: mode || 'qa', profile, resources: [] })

  const evalResult = await runEvaluationAgent({
    profile,
    learningData: {
      topic: topic || '核心概念',
      resourceTypes: resourceResult.output?.resources?.map(resource => resource.type) || [],
      resourceCount: resourceResult.output?.resources?.length || 0,
      tutoringQuestion: question || '',
    },
    exerciseResults: {
      correctRate: Math.max(0.35, Math.min(0.9, (profile?.totalScore || 50) / 100)),
      attempted: 3,
      completed: 3,
    },
  })

  const pathResult = await runPathAgent({ profile, evaluation: evalResult.output, replan: true })

  const reflectResult = await runReflectionAgent({ profile, evaluation: evalResult.output })

  const durationMs = Date.now() - start
  const allAgentResults = [profileResult, resourceResult, tutorResult, evalResult, pathResult, reflectResult]
  const allEvidence = allAgentResults.flatMap(r => r.evidence || [])
  const anyFallback = allAgentResults.some(r => r.fallbackUsed)
  const fallbackAgents = allAgentResults.filter(result => result.fallbackUsed).map(result => result.agentName)
  const agentRiskFlags = [...new Set(allAgentResults.flatMap(r => r.riskFlags || []))]

  const trace = buildTrace({
    requestId: `full-run-${Date.now()}`,
    agents: [AGENT_NAMES.PROFILE, AGENT_NAMES.RESOURCE, AGENT_NAMES.TUTOR, AGENT_NAMES.EVALUATION, AGENT_NAMES.PATH, AGENT_NAMES.REFLECTION],
    inputsSummary: `完整闭环: 画像+资源+辅导+评估+路径+反思`,
    outputsSummary: `评分: ${profile?.totalScore || 'N/A'}, 路径: ${pathResult.output?.phases?.length || 0} 阶段, 风险: ${reflectResult.output?.riskAssessment?.level || 'N/A'}`,
    evidence: allEvidence,
    riskFlags: [
      ...(reflectResult.output?.riskAssessment?.level === 'high' ? ['高风险'] : []),
      ...agentRiskFlags,
    ],
    fallbackUsed: anyFallback,
    durationMs,
    agentResults: allAgentResults,
  })
  recordTrace(trace)

  return {
    workflowId: `wf-${Date.now()}`,
    securityRefused: tutorResult.securityRefused || false,
    fallbackAgents,
    agentResults: allAgentResults,
    resourcePackage: resourceResult.output,
    tutoringAnswer: tutorResult.output?.answer || '',
    evaluation: evalResult.output,
    path: pathResult.output,
    reflection: reflectResult.output,
    profile,
    trace,
  }
}

export async function orchestrateKnowledgePath({ profile }) {
  const start = Date.now()
  const knowledgePathResult = await runKnowledgePathAgent(profile)
  const durationMs = Date.now() - start

  const trace = buildTrace({
    requestId: `knowledge-path-${Date.now()}`,
    agents: [AGENT_NAMES.KNOWLEDGE_PATH],
    inputsSummary: `画像维度: ${Object.keys(profile?.dimensions || {}).length} 个`,
    outputsSummary: `生成领域: ${knowledgePathResult.output?.phases?.length || 0} 个`,
    evidence: knowledgePathResult.evidence,
    riskFlags: knowledgePathResult.confidence < 0.7 ? ['低置信度'] : [],
    fallbackUsed: knowledgePathResult.fallbackUsed,
    durationMs,
    agentResults: [knowledgePathResult],
  })
  recordTrace(trace)

  return {
    knowledgePath: knowledgePathResult.output,
    agentResults: [knowledgePathResult],
    trace,
  }
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function makeAgentResult(agentId, agentName, inputSummary, outputSummary, confidence, evidence, durationMs, fallbackUsed) {
  return {
    agentId,
    agentName,
    status: 'completed',
    inputSummary,
    outputSummary,
    confidence,
    evidence,
    durationMs,
    fallbackUsed,
  }
}

async function runAgent(agentId, agentName, systemPrompt, userPrompt, fallbackFn) {
  const start = Date.now()
  const result = await generateStructuredJson({
    systemPrompt,
    userPrompt,
    fallback: fallbackFn,
    taskType: agentId,
  })
  return makeAgentResult(
    agentId,
    agentName,
    userPrompt.slice(0, 120),
    typeof result.data === 'object' ? JSON.stringify(result.data).slice(0, 200) : String(result.data).slice(0, 200),
    result.data?.confidence ?? 0.8,
    result.data?.evidence ?? [],
    Date.now() - start,
    result.fallbackUsed,
  )
}

function profileFallback(input) {
  const weaknesses = input.weaknesses || ['学习速度', '专注力', '创造力']
  const strengths = input.strengths || ['逻辑思维']
  return {
    confidence: 0.75,
    evidence: [
      `识别薄弱点: ${weaknesses.join(', ')}`,
      `优势维度: ${strengths.join(', ')}`,
    ],
    profileSummary: {
      level: input.level || 'intermediate',
      totalScore: input.totalScore || 63,
      weaknesses,
      strengths,
      learningStyle: input.learningStyle || '视觉型',
    },
    recommendations: [
      `优先巩固 ${weaknesses[0]}，每天安排 20 分钟专项训练`,
      `继续发挥 ${strengths[0]} 优势，用在关键任务里`,
      '建议每两周复盘一次学习进度',
    ],
  }
}

function resourceFallback(input) {
  const topic = input.topic || '学习主题'
  const rawWeakness = Array.isArray(input.weaknesses) && input.weaknesses.length ? input.weaknesses[0] : '基础概念'
  const weakness = typeof rawWeakness === 'string' ? rawWeakness : rawWeakness?.tag || '基础概念'
  const descriptors = {
    video: ['微课脚本', '3 分钟微课分镜与讲解提纲，可用于录制或课堂讲解。', 3],
    doc: ['核心概念速查卡', '一页式知识卡，梳理定义、关键步骤和边界条件。', 8],
    mindmap: ['知识关系图', '用节点关系展示核心概念、前置知识与易混点。', 10],
    exercise: ['自适应练习', '3 道由浅入深的练习与解析，用于即时检测掌握度。', 15],
    code: ['可运行示例', '最小可运行代码或伪代码，配合逐行注释完成迁移练习。', 20],
    audio: ['听读复盘', '适合通勤场景的 2 分钟听读稿，可由浏览器语音朗读。', 2],
  }
  const resources = Object.entries(descriptors).map(([type, [label, description, estimatedMinutes]]) => ({
    type,
    title: `${topic} ${label}`,
    description,
    difficulty: input.level || 'intermediate',
    estimatedMinutes,
    tags: [topic, weakness, '个性化推荐'],
    formatReason: `针对“${weakness}”采用 ${type} 形式，支持短时反馈与巩固`,
  }))
  return {
    confidence: 0.7,
    evidence: [`基于主题“${topic}”与薄弱点“${weakness}”生成六类个性化资源`],
    resources,
  }
}

export async function orchestrateLearningUpdate({ profile, currentPath, learningData, exerciseResults, learningHistory = [] }) {
  const start = Date.now()
  const evaluationResult = await runEvaluationAgent({ profile, learningData, exerciseResults })
  const writeBack = applyProfileUpdates(profile, evaluationResult.output)
  const evaluationWithMemory = {
    ...evaluationResult.output,
    learningHistory,
  }
  const pathResult = await runPathAgent({
    profile: writeBack.profile,
    evaluation: evaluationWithMemory,
    currentPath,
    replan: true,
  })
  const reflectionResult = await runReflectionAgent({
    profile: writeBack.profile,
    evaluation: evaluationWithMemory,
    learningHistory,
  })
  const durationMs = Date.now() - start
  const agentResults = [evaluationResult, pathResult, reflectionResult]
  const trace = buildTrace({
    requestId: `learning-update-${Date.now()}`,
    agents: [AGENT_NAMES.EVALUATION, AGENT_NAMES.PATH, AGENT_NAMES.REFLECTION],
    inputsSummary: `评估作答 ${exerciseResults?.attempted ?? 0} 题，正确率 ${Math.round((exerciseResults?.correctRate ?? 0) * 100)}%`,
    outputsSummary: `画像更新 ${writeBack.changes.length} 维，路径重规划 ${pathResult.output?.phases?.length || 0} 阶段`,
    evidence: [
      ...agentResults.flatMap(result => result.evidence || []),
      ...writeBack.changes.map(change => `${change.dimension}: ${change.before} -> ${change.after}; ${change.reason}`),
      `学习者长期记忆: 已读取最近 ${learningHistory.length} 个学习周期`,
    ],
    riskFlags: writeBack.changes.length === 0 ? ['无可应用的画像维度更新'] : [],
    fallbackUsed: agentResults.some(result => result.fallbackUsed),
    durationMs,
    agentResults,
  })
  recordTrace(trace)

  return {
    workflowId: `update-${Date.now()}`,
    profileBefore: profile,
    profile: writeBack.profile,
    profileChanges: writeBack.changes,
    evaluation: evaluationWithMemory,
    path: pathResult.output,
    reflection: reflectionResult.output,
    agentResults,
    trace,
  }
}

function ensureResourceTypes(resources, fallbackResources) {
  const expectedTypes = ['video', 'doc', 'mindmap', 'exercise', 'code', 'audio']
  const generated = Array.isArray(resources) ? resources.filter(item => item && typeof item.type === 'string' && typeof item.title === 'string') : []
  const byType = new Map(generated.map(item => [item.type, item]))
  return expectedTypes.map(type => ({ ...fallbackResources.find(item => item.type === type), ...byType.get(type) }))
}

function legacyResourceFallback(input) {
  const topic = input.topic || '机器学习'
  return {
    confidence: 0.7,
    evidence: [`基于主题 "${topic}" 生成个性化资源`],
    resources: [
      { type: 'video', title: `${topic} 入门精讲`, difficulty: 'beginner', estimatedMinutes: 45, tags: [topic, '基础'] },
      { type: 'doc', title: `${topic} 核心概念速查`, difficulty: 'intermediate', estimatedMinutes: 20, tags: [topic, '概念'] },
      { type: 'exercise', title: `${topic} 实战练习集`, difficulty: 'intermediate', estimatedMinutes: 60, tags: [topic, '练习'] },
      { type: 'project', title: `${topic} 小项目实战`, difficulty: 'advanced', estimatedMinutes: 120, tags: [topic, '实战'] },
    ],
  }
}

function pathFallback(input) {
  const currentPhase = input.currentPhase || '核心进阶'
  return {
    confidence: 0.72,
    evidence: [`当前阶段: ${currentPhase}`, '基于画像分析调整路径'],
    pathAdjustment: {
      action: 'replan',
      reason: `基于学习画像，建议在 "${currentPhase}" 阶段增加薄弱点专项训练`,
      adjustedNodes: [
        { name: '薄弱点专项训练', duration: '1 周', priority: 'high' },
        { name: '核心概念巩固', duration: '1.5 周', priority: 'medium' },
        { name: '进阶内容推进', duration: '2 周', priority: 'normal' },
      ],
    },
  }
}

function tutorFallback(input) {
  const question = input.question || '当前学习问题'
  return {
    confidence: 0.7,
    evidence: [`问题: ${question}`],
    explanation: `关于 "${question}"，建议从定义、例子、应用三个层次理解：\n\n1. 定义：用一句话说清楚核心概念\n2. 例子：找一个最小例子验证理解\n3. 应用：说明它在实际场景中解决什么问题`,
    followUpQuestions: [
      '用更简单的话解释一下',
      '给我一个代码示例',
      '出几道相关练习题',
    ],
  }
}

function evaluationFallback(input) {
  const accuracy = input.accuracy ?? 82
  return {
    confidence: 0.68,
    evidence: [`当前正确率: ${accuracy}%`],
    evaluation: {
      overallScore: accuracy,
      strengths: ['概念理解', '基础应用'],
      weaknesses: ['综合运用', '边界情况处理'],
      suggestions: [
        '增加综合练习频率',
        '关注边界情况和异常处理',
        '定期回顾已学内容',
      ],
    },
  }
}

function reflectionFallback(input) {
  return {
    confidence: 0.65,
    evidence: ['基于本次学习闭环的总结'],
    summary: '本次学习闭环已完成画像分析、资源推荐、路径规划和评估反馈四个环节。',
    nextActions: [
      { action: '开始薄弱点专项训练', priority: 'high', estimatedTime: '20 分钟/天' },
      { action: '完成推荐资源中的入门精讲', priority: 'medium', estimatedTime: '45 分钟' },
      { action: '一周后重新评估学习进度', priority: 'normal', estimatedTime: '15 分钟' },
    ],
  }
}

export async function runLearningWorkflow(input = {}) {
  const workflowId = uid()
  const traceId = `trace-${uid()}`
  const workflowStart = Date.now()

  const profileInput = {
    level: input.level || 'intermediate',
    totalScore: input.totalScore || 63,
    weaknesses: input.weaknesses || ['学习速度', '专注力'],
    strengths: input.strengths || ['逻辑思维'],
    learningStyle: input.learningStyle || '视觉型',
  }

  const profileResult = await runAgent(
    'profile-agent',
    'ProfileAgent',
    '你是一个学习画像分析专家。根据用户的学习数据，分析学习画像并识别薄弱点。返回 JSON 格式结果，包含 confidence, evidence, profileSummary, recommendations 字段。',
    `分析以下学习画像数据: ${JSON.stringify(profileInput)}`,
    () => profileFallback(profileInput),
  )

  const profileData = profileResult.fallbackUsed
    ? profileFallback(profileInput)
    : (await extractData(profileResult)) || profileFallback(profileInput)

  const resourceInput = {
    topic: input.topic || '机器学习',
    weaknesses: profileData.profileSummary?.weaknesses || profileInput.weaknesses,
    level: profileData.profileSummary?.level || profileInput.level,
  }

  const resourceResult = await runAgent(
    'resource-agent',
    'ResourceAgent',
    '你是一个个性化学习资源推荐专家。根据用户画像和薄弱点，生成个性化学习资源。返回 JSON 格式结果，包含 confidence, evidence, resources 字段。每个 resource 包含 type, title, difficulty, estimatedMinutes, tags。',
    `为以下学习者生成个性化资源: ${JSON.stringify(resourceInput)}`,
    () => resourceFallback(resourceInput),
  )

  const resourceData = resourceResult.fallbackUsed
    ? resourceFallback(resourceInput)
    : (await extractData(resourceResult)) || resourceFallback(resourceInput)

  const pathInput = {
    currentPhase: input.currentPhase || '核心进阶',
    weaknesses: profileData.profileSummary?.weaknesses || profileInput.weaknesses,
    completedTopics: input.completedTopics || ['Python 基础', '数据结构入门'],
  }

  const pathResult = await runAgent(
    'path-agent',
    'PathAgent',
    '你是一个学习路径规划专家。根据用户画像和当前进度，规划或调整学习路径。返回 JSON 格式结果，包含 confidence, evidence, pathAdjustment 字段。pathAdjustment 包含 action, reason, adjustedNodes。',
    `为以下学习者调整学习路径: ${JSON.stringify(pathInput)}`,
    () => pathFallback(pathInput),
  )

  const pathData = pathResult.fallbackUsed
    ? pathFallback(pathInput)
    : (await extractData(pathResult)) || pathFallback(pathInput)

  const tutorInput = {
    question: input.question || input.topic || '当前学习问题',
    mode: input.tutorMode || 'explain',
    level: profileData.profileSummary?.level || profileInput.level,
  }

  const tutorResult = await runAgent(
    'tutor-agent',
    'TutorAgent',
    '你是一个教学讲解专家。根据学生的问题和水平，提供清晰的讲解和答疑。返回 JSON 格式结果，包含 confidence, evidence, explanation, followUpQuestions 字段。',
    `回答以下学习问题: ${JSON.stringify(tutorInput)}`,
    () => tutorFallback(tutorInput),
  )

  const evaluationInput = {
    accuracy: input.accuracy ?? 82,
    completedLessons: input.completedLessons ?? 47,
    totalScore: profileData.profileSummary?.totalScore || profileInput.totalScore,
  }

  const evaluationResult = await runAgent(
    'evaluation-agent',
    'EvaluationAgent',
    '你是一个学习评估专家。根据学习数据评估学习效果并给出反馈。返回 JSON 格式结果，包含 confidence, evidence, evaluation 字段。evaluation 包含 overallScore, strengths, weaknesses, suggestions。',
    `评估以下学习数据: ${JSON.stringify(evaluationInput)}`,
    () => evaluationFallback(evaluationInput),
  )

  const evalData = evaluationResult.fallbackUsed
    ? evaluationFallback(evaluationInput)
    : (await extractData(evaluationResult)) || evaluationFallback(evaluationInput)

  const reflectionInput = {
    profileSummary: profileData.profileSummary || profileInput,
    resourceCount: resourceData.resources?.length || 4,
    pathAdjustment: pathData.pathAdjustment?.action || 'replan',
    evaluationScore: evalData.evaluation?.overallScore || evaluationInput.accuracy,
  }

  const reflectionResult = await runAgent(
    'reflection-agent',
    'ReflectionAgent',
    '你是一个学习反思专家。根据整个学习闭环的结果，总结并规划下一步行动。返回 JSON 格式结果，包含 confidence, evidence, summary, nextActions 字段。每个 nextAction 包含 action, priority, estimatedTime。',
    `总结本次学习闭环并规划下一步: ${JSON.stringify(reflectionInput)}`,
    () => reflectionFallback(reflectionInput),
  )

  const reflectionData = reflectionResult.fallbackUsed
    ? reflectionFallback(reflectionInput)
    : (await extractData(reflectionResult)) || reflectionFallback(reflectionInput)

  const agents = [profileResult, resourceResult, pathResult, tutorResult, evaluationResult, reflectionResult]

  const anyFallbackUsed = agents.some(a => a.fallbackUsed)

  return {
    workflowId,
    decision: anyFallbackUsed ? 'fallback-completed' : 'llm-completed',
    agents,
    personalizedResources: resourceData.resources || [],
    pathAdjustment: pathData.pathAdjustment || null,
    evaluationUpdate: evalData.evaluation || null,
    nextActions: reflectionData.nextActions || [],
    traceId,
    durationMs: Date.now() - workflowStart,
    fallbackUsed: anyFallbackUsed,
  }
}

function extractData(agentResult) {
  try {
    const raw = agentResult.outputSummary
    if (typeof raw === 'string') {
      return JSON.parse(raw)
    }
    return raw
  } catch {
    return null
  }
}

export async function runResourceGeneration(input = {}) {
  const start = Date.now()
  const profile = input.profile || {
    totalScore: input.level === 'advanced' ? 80 : input.level === 'beginner' ? 45 : 60,
    dimensions: [],
    weaknesses: input.weaknesses || [],
  }
  const result = await runResourceAgent({
    profile,
    weaknesses: input.weaknesses || profile.weaknesses || [],
    topic: input.topic || '学习主题',
    resourceType: input.resourceType || 'all',
  })
  return {
    resources: result.output?.resources || [],
    provider: result.fallbackUsed ? 'fallback' : 'llm',
    model: result.fallbackUsed ? 'fallback' : process.env.LLM_MODEL || 'configured-model',
    fallbackUsed: result.fallbackUsed,
    durationMs: Date.now() - start,
    evidence: result.evidence,
  }
}

async function legacyRunResourceGeneration(input = {}) {
  const resourceInput = {
    topic: input.topic || '机器学习',
    weaknesses: input.weaknesses || ['学习速度', '专注力'],
    level: input.level || 'intermediate',
    resourceTypes: input.resourceTypes || ['video', 'doc', 'mindmap', 'exercise', 'code', 'audio'],
  }

  const start = Date.now()
  const result = await generateStructuredJson({
    systemPrompt: '你是一个个性化学习资源生成专家。根据用户需求生成学习资源。返回 JSON 格式结果，包含 resources 数组，每个 resource 包含 type, title, description, difficulty, estimatedMinutes, tags 字段。',
    userPrompt: `生成学习资源: ${JSON.stringify(resourceInput)}`,
    fallback: () => resourceFallback(resourceInput),
    taskType: 'resource-generation',
  })

  return {
    resources: ensureResourceTypes(result.data?.resources, resourceFallback(resourceInput).resources),
    provider: result.provider,
    model: result.model,
    fallbackUsed: result.fallbackUsed,
    durationMs: Date.now() - start,
  }
}
