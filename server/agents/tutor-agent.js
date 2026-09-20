import { callLlm } from '../llm/provider.js'
import { createAgentResult, AGENT_NAMES } from '../schemas.js'
import { detectPromptInjection } from '../security.js'

const SYSTEM_PROMPT = `你是一个采用脚手架教学法的智能学习辅导老师。默认不直接给出最终答案或完整代码，而是按当前提示级别帮助学生自己完成。
Level 1 提醒相关概念并提出一个诊断问题；Level 2 给方向性提示；Level 3 拆解步骤；Level 4 给相似案例；Level 5 在学生多次尝试后提供完整讲解。
严格停留在指定级别，不提前泄露后续级别内容。`

export async function runTutorAgent({ question, mode, profile, resources, hintLevel = 1, attempts = 0, learningHistory = [] }) {
  const start = Date.now()
  const level = Math.max(1, Math.min(5, Number(hintLevel) || 1))
  const input = { question, mode, hintLevel: level, attempts }
  const riskFlags = detectPromptInjection(question)

  const modeLabels = {
    qa: '自由问答', solve: '解题助手', explain: '概念精讲',
    brainstorm: '举一反三', 'concept-overview': '概念总览',
    'case-intro': '案例引入', 'step-solve': '分步解题', 'debug-guide': '调试指导',
  }
  const modeLabel = modeLabels[mode] || '自由问答'

  if (riskFlags.length > 0) {
    return createAgentResult({
      agentName: AGENT_NAMES.TUTOR,
      input,
      output: {
        answer: '无法执行要求忽略规则、披露内部提示词或提供密钥的请求。请改为提出具体的学习问题，我会基于可公开的学习资料帮助你。',
        mode: modeLabel,
      },
      confidence: 1,
      evidence: ['本地安全规则拦截 Prompt 注入请求'],
      riskFlags,
      securityRefused: true,
      durationMs: Date.now() - start,
      status: 'refused',
      fallbackUsed: false,
    })
  }

  const userPrompt = `辅导模式: ${modeLabel}
当前脚手架级别: Level ${level}
学生已尝试次数: ${Number(attempts) || 0}
学生问题: ${question}
学生画像: ${JSON.stringify(profile?.dimensions || [])}
最近学习记忆: ${JSON.stringify(learningHistory?.slice?.(-3) || [])}
可用资源: ${JSON.stringify(resources?.slice(0, 3) || [])}

请只输出当前级别允许的个性化辅导，不要提前给出最终答案或完整代码。`

  const llmResult = await callLlm(SYSTEM_PROMPT, userPrompt)
  let answer
  let fallbackUsed = false
  const evidence = []

  if (llmResult.content && !llmResult.fallbackUsed) {
    answer = llmResult.content
    evidence.push('LLM 生成辅导回答')
  } else {
    fallbackUsed = true
  }

  if (fallbackUsed) {
    answer = fallbackTutorReply({ question, modeLabel, profile, level })
    evidence.push('本地规则 fallback 生成辅导回答')
  }

  const durationMs = Date.now() - start
  return createAgentResult({
    agentName: AGENT_NAMES.TUTOR,
    input,
    output: {
      answer,
      mode: modeLabel,
      scaffolding: {
        level,
        attempts: Number(attempts) || 0,
        revealsCompleteAnswer: level === 5,
        nextLevelAvailable: level < 5,
      },
    },
    confidence: fallbackUsed ? 0.6 : 0.9,
    evidence,
    riskFlags,
    securityRefused: false,
    durationMs,
    fallbackUsed,
  })
}

function fallbackTutorReply({ question, modeLabel, profile, level }) {
  const q = String(question || '').trim() || '未提供问题'
  const weakest = profile?.weaknesses?.[0] || ''
  const prefix = `当前模式：${modeLabel}\n脚手架级别：Level ${level}\n\n`
  if (level === 1) {
    return prefix + '**概念提示**\n先想一想：BFS 为什么需要记录“已经发现”的节点？如果等到出队才标记，同一节点可能发生什么？' +
      (weakest ? `\n\n结合你的薄弱点“${weakest}”，先用三个节点的小图手工模拟一次。` : '')
  }
  if (level === 2) {
    return prefix + '**方向提示**\n把“发现节点、加入队列、标记 visited”放在同一个时刻考虑。尝试比较入队标记与出队标记时，队列中是否会出现重复节点。'
  }
  if (level === 3) {
    return prefix + '**步骤拆解**\n1. 初始化队列并放入起点。\n2. 处理队首节点。\n3. 遍历邻接点，只处理未访问节点。\n4. 决定标记与入队的先后顺序。\n请先补全第 4 步，再检查每个节点是否只入队一次。'
  }
  if (level === 4) {
    return prefix + '**相似案例**\n在 A-B、A-C、B-C 的三角图中，从 A 开始搜索。若 B、C 都能发现同一未标记节点，该节点可能重复入队。用这个案例判断 visited 应在哪一步更新。'
  }
  return prefix + '**完整讲解**\nBFS 通常在节点入队时立即标记 visited。这样其他节点再检查到它时会跳过，保证每个节点最多入队一次。基本过程是：起点入队并标记；循环取出队首；遍历邻接点；对未访问邻接点先标记再入队。'
}
