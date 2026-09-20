import { callLlm, safeParseJson } from '../llm/provider.js'
import { createAgentResult, AGENT_NAMES } from '../schemas.js'

const SYSTEM_PROMPT = `你是一个学习路径规划专家。根据用户画像、评估结果和当前进度，规划或重规划学习路径。
请以 JSON 格式返回，包含：phases(数组，每项含title/period/progress/status/nodes)、weeklyGoals(数组)、replanReason(字符串，如果是重规划)。`

export async function runPathAgent({ profile, evaluation, currentPath, replan }) {
  const start = Date.now()
  const input = { profile, evaluation, replan }

  const userPrompt = `用户画像: ${JSON.stringify(profile?.dimensions || [])}
评估结果: ${JSON.stringify(evaluation?.stats || [])}
当前路径: ${JSON.stringify(currentPath?.phases?.map(p => p.title) || [])}
是否重规划: ${replan ? '是' : '否'}

请${replan ? '重新' : ''}规划学习路径。`

  const llmResult = await callLlm(SYSTEM_PROMPT, userPrompt, { jsonMode: true })
  let output
  let fallbackUsed = false
  const evidence = []

  if (llmResult.content && !llmResult.fallbackUsed) {
    const parsed = safeParseJson(llmResult.content)
    if (parsed) {
      output = parsed
      evidence.push('LLM 生成学习路径')
    } else {
      fallbackUsed = true
    }
  } else {
    fallbackUsed = true
  }

  if (fallbackUsed) {
    output = fallbackPathPlan({ profile, evaluation, replan })
    evidence.push('本地规则 fallback 生成学习路径')
  }

  const durationMs = Date.now() - start
  return createAgentResult({
    agentName: AGENT_NAMES.PATH,
    input,
    output,
    confidence: fallbackUsed ? 0.6 : 0.85,
    evidence,
    durationMs,
    fallbackUsed,
  })
}

function fallbackPathPlan({ profile, evaluation, replan }) {
  const score = profile?.totalScore || 50
  const weakTags = (profile?.weaknesses || [])
    .map(item => typeof item === 'string' ? item : item?.tag || item?.label || item?.name)
    .filter(Boolean)

  const phases = [
    {
      title: '基础夯实',
      period: '第 1-4 周',
      progress: score > 60 ? 100 : 65,
      status: score > 60 ? 'completed' : 'active',
      color: '#00d4ff',
      nodes: [
        { name: '核心概念梳理', progress: score > 60 ? 100 : 70, duration: '1 周', resources: 4 },
        { name: '基础技能训练', progress: score > 60 ? 100 : 50, duration: '1.5 周', resources: 5 },
        { name: '薄弱点专项', progress: score > 60 ? 100 : 30, duration: '1.5 周', resources: 3 },
      ],
    },
    {
      title: '核心进阶',
      period: '第 5-10 周',
      progress: score > 70 ? 60 : 25,
      status: 'active',
      color: '#7c3aed',
      nodes: [
        { name: '进阶概念理解', progress: 40, duration: '2 周', resources: 6 },
        { name: '实战项目练习', progress: 20, duration: '2 周', resources: 4 },
        { name: '综合能力提升', progress: 10, duration: '2 周', resources: 5 },
      ],
    },
    {
      title: '专题深入',
      period: '第 11-16 周',
      progress: 0,
      status: 'locked',
      color: '#06d6a0',
      nodes: [
        { name: '前沿技术探索', progress: 0, duration: '2 周', resources: 4 },
        { name: '独立项目实战', progress: 0, duration: '2 周', resources: 3 },
      ],
    },
  ]

  if (replan && weakTags.length > 0) {
    phases[0].nodes.push({
      name: `补弱: ${weakTags.slice(0, 2).join('、')}`,
      progress: 0,
      duration: '1 周',
      resources: 3,
    })
  }

  return {
    phases,
    weeklyGoals: [
      { label: '完成基础训练', progress: 60, target: '3 节' },
      { label: '薄弱点练习', progress: 30, target: '10 题' },
      { label: '项目实战', progress: 0, target: '1 个' },
    ],
    replanReason: replan ? `根据评估结果，重点补强${weakTags.slice(0, 2).join('、')}，调整学习节奏` : '',
  }
}
