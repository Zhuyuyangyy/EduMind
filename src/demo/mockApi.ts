/**
 * 本地 API 模拟层（竞赛演示模式）
 *
 * 拦截 /api/* 请求并返回演示数据，使原版视图在无后端公网环境下完整工作：
 * - 画像 / 学习路径 / 评估：由演示学习状态实时生成；
 * - 导师问答（chat / tutoring）：由预置课程知识库检索生成（演示模式，非实时大模型）；
 * - 资源 / 证据 / 工作流：演示夹具；
 * - 未覆盖端点返回 404，触发原版视图自带的本地回退（不卡死、不报错）。
 *
 * 所有响应均标注 dataSource: 'demo-fixture'，与原版约定一致。
 */
import {
  demoAskTutor,
  demoCourse,
  demoEvents,
  demoIsDiagnosed,
  demoKpStates,
  demoOverall,
  demoPlan,
  demoSubmitDiagnosis,
  demoSubmitPractice,
  demoTogglePlanTask,
  demoWeakKps,
  kbByKp,
  getDemoState
} from './demoState.ts'

type Handler = (url: URL, body: any) => unknown

interface Route {
  method: string
  pattern: RegExp
  handler: Handler
}

/** 从请求体提取用户问题：兼容 { message } 与 { messages: [{role, content}] } 两种形态 */
function extractQuestion(body: any): string {
  if (!body) return ''
  if (typeof body.message === 'string' && body.message.trim()) return body.message
  if (typeof body.question === 'string' && body.question.trim()) return body.question
  if (Array.isArray(body.messages)) {
    for (let i = body.messages.length - 1; i >= 0; i--) {
      const msg = body.messages[i]
      if (msg && msg.role === 'user' && typeof msg.content === 'string' && msg.content.trim()) {
        return msg.content
      }
    }
  }
  return ''
}

const NOW = () => new Date().toISOString()

/** 知识点状态 → 画像维度（雷达图） */
function profileDimensions() {
  const colors = ['#6ab8e8', '#8b7cf8', '#55d496', '#f0c959', '#f07a7a', '#5a9fd8', '#7dd3fc', '#c4b5fd']
  return demoCourse.knowledgePoints.map((kp, i) => {
    const state = getDemoState().kpStates[kp.id]
    const tested = state.diagnosis !== null || state.practiceCount > 0
    return { label: kp.name, value: tested ? Math.round(state.mastery) : 0, color: colors[i % colors.length] }
  })
}

function buildProfileResult() {
  const dimensions = profileDimensions()
  const overall = demoOverall()
  const weak = demoWeakKps()
  const plan = demoPlan()
  return {
    dimensions,
    totalScore: overall ?? 0,
    stats: [
      { label: '总体掌握度', value: overall === null ? '未诊断' : `${overall}%`, icon: 'target', color: '#6ab8e8' },
      { label: '已掌握知识点', value: `${demoKpStates().filter(({ state }) => (state.diagnosis || state.practiceCount > 0) && state.mastery >= 80).length} / ${demoCourse.knowledgePoints.length}`, icon: 'check', color: '#55d496' },
      { label: '薄弱知识点', value: `${weak.length}`, icon: 'alert', color: '#f07a7a' },
      { label: '累计练习', value: `${demoKpStates().reduce((s, { state }) => s + state.practiceCount, 0)} 题`, icon: 'edit', color: '#f0c959' }
    ],
    weaknesses: weak.map(({ kp, state }) => ({ tag: kp.name, count: state.practiceCount || 1 })),
    skillTree: [
      {
        category: demoCourse.name,
        color: '#6ab8e8',
        skills: demoCourse.knowledgePoints.map((kp) => {
          const state = getDemoState().kpStates[kp.id]
          const tested = state.diagnosis !== null || state.practiceCount > 0
          return { name: kp.name, level: tested ? Math.round(state.mastery) : 0 }
        })
      }
    ],
    preferences: [
      { label: '演示课程', value: demoCourse.name },
      { label: '知识点总数', value: `${demoCourse.knowledgePoints.length} 个` },
      { label: '数据模式', value: '演示数据（虚构样本）' }
    ],
    timeline: demoEvents()
      .filter((e) => e.kind !== 'demo-reset')
      .slice(0, 8)
      .map((e) => ({ date: new Date(e.at).toLocaleString('zh-CN'), event: e.summary, type: '' as const })),
    recommendations: plan.slice(0, 3).map((t) => `Day ${t.day}：${t.kpName} · ${t.title}（${t.reason}）`)
  }
}

/** 7 天计划 → 学习路径 phases（星系/星座可视化数据源） */
function buildLearningPath() {
  const plan = demoPlan()
  const colors = ['#6ab8e8', '#8b7cf8', '#55d496', '#f0c959', '#f07a7a', '#5a9fd8', '#7dd3fc']
  const phases = plan.map((task, i) => ({
    id: task.key,
    title: `Day ${task.day} · ${task.kpName}`,
    period: `第 ${task.day} 天`,
    progress: getDemoState().planCompletion[task.key] ? 100 : 0,
    status: getDemoState().planCompletion[task.key] ? 'completed' : task.day === 1 ? 'active' : 'pending',
    color: colors[i % colors.length],
    topics: task.kpId
      ? [
          {
            id: task.kpId,
            name: task.kpName,
            label: task.kpName,
            mastery: (() => {
              const state = getDemoState().kpStates[task.kpId]
              const tested = state.diagnosis !== null || state.practiceCount > 0
              return tested ? Math.round(state.mastery) : 0
            })(),
            progress: (() => {
              const state = getDemoState().kpStates[task.kpId]
              const tested = state.diagnosis !== null || state.practiceCount > 0
              return tested ? Math.round(state.mastery) : 0
            })(),
            recommended: task.kind === 'learn',
            concepts: [task.title],
            duration: `${task.minutes} 分钟`
          }
        ]
      : [],
    nodes: [
      {
        name: `${task.kpName} · ${task.title}`,
        progress: getDemoState().planCompletion[task.key] ? 100 : 0,
        duration: `${task.minutes} 分钟`,
        resources: task.kpId ? 3 : 1
      }
    ]
  }))
  return {
    dataSource: 'demo-fixture' as const,
    simulated: true,
    phases,
    weeklyGoals: [
      { label: '薄弱知识点突破', progress: demoWeakKps().length === 0 ? 100 : Math.round((1 - demoWeakKps().length / demoCourse.knowledgePoints.length) * 100), target: '全部 ≥ 40%' },
      { label: '计划任务完成', progress: Math.round((plan.filter((t) => getDemoState().planCompletion[t.key]).length / plan.length) * 100), target: '7 / 7' }
    ]
  }
}

/** 评估仪表盘（诊断结果驱动） */
function buildEvaluation() {
  const overall = demoOverall()
  const weak = demoWeakKps()
  const stats = [
    { label: '总体掌握度', value: overall === null ? '未诊断' : `${overall}%`, change: demoIsDiagnosed() ? '诊断已生成' : '待诊断', color: '#6ab8e8', icon: 'gauge' },
    { label: '薄弱知识点', value: `${weak.length} 个`, change: weak.length > 0 ? '需优先突破' : '无', color: '#f07a7a', icon: 'alert' },
    { label: '计划任务', value: `${demoPlan().filter((t) => getDemoState().planCompletion[t.key]).length} / 7`, change: '进行中', color: '#55d496', icon: 'check' },
    { label: '累计练习', value: `${demoKpStates().reduce((s, { state }) => s + state.practiceCount, 0)} 题`, change: '证据驱动更新', color: '#f0c959', icon: 'edit' }
  ]
  return {
    generatedAt: NOW(),
    dataSource: 'demo-fixture' as const,
    simulated: true,
    stats,
    suggestions: weak.slice(0, 3).map(({ kp, state }) => ({
      id: kp.id,
      title: `突破「${kp.name}」`,
      description: `当前掌握度 ${Math.round(state.mastery)}%（演示评估值），建议完成专项学习与针对性练习。`,
      priority: 'high' as const,
      kpId: kp.id
    })),
    dashboard: {
      flow: ['诊断', '画像', '计划', '辅导', '练习', '反馈'],
      profileMetrics: demoCourse.knowledgePoints.map((kp) => {
        const state = getDemoState().kpStates[kp.id]
        const tested = state.diagnosis !== null || state.practiceCount > 0
        return { key: kp.id, label: kp.name, stage0: 0, stage1: tested ? Math.round(state.mastery) : 0, stage2: tested ? Math.round(state.mastery) : 0 }
      }),
      weaknesses: weak.map(({ kp, state }) => ({
        id: kp.id,
        label: kp.name,
        severity: (state.mastery < 20 ? 'high' : 'medium') as 'high' | 'medium',
        reason: `诊断/练习正确率偏低（最近 ${state.lastResult ? `${state.lastResult.correct}/${state.lastResult.total}` : '—'}）`,
        impact: '影响后续先修知识点的学习',
        action: '安排专项学习与 AI 讲解，再完成针对性练习'
      })),
      evidenceRounds: [
        { stage: 0 as const, trigger: '课程诊断', evidence: ['8 道诊断题逐题判分'], profileUpdates: ['建立各知识点基线掌握度'], pathImpact: '生成初始 7 天计划' },
        { stage: 1 as const, trigger: '针对性练习', evidence: ['练习按知识点判分'], profileUpdates: ['证据规则更新掌握度'], pathImpact: '计划自动重新生成' },
        { stage: 2 as const, trigger: '综合测评', evidence: ['待完成'], profileUpdates: ['待更新'], pathImpact: '待调整' }
      ]
    }
  }
}

/** 知识路径（知识图谱数据源：domain/topic 结构） */
function buildKnowledgePath() {
  const path = buildLearningPath()
  const domains = [
    { id: 'py-basics', name: 'Python 基础', color: '#6ab8e8', short: 'PY' },
    { id: 'numpy', name: 'NumPy', color: '#8b7cf8', short: 'NP' },
    { id: 'pandas', name: 'Pandas', color: '#55d496', short: 'PD' },
    { id: 'viz', name: '可视化', color: '#f0c959', short: 'VZ' }
  ]
  const phases = domains.map((domain) => {
    const kps = demoCourse.knowledgePoints.filter((kp) => kp.category.includes(domain.name.replace('Python 基础', 'Python 基础')) || domainTopics(domain.id).includes(kp.id))
    return {
      id: domain.id,
      name: domain.name,
      color: domain.color,
      short: domain.short,
      topics: kps.map((kp) => {
        const state = getDemoState().kpStates[kp.id]
        const tested = state.diagnosis !== null || state.practiceCount > 0
        return {
          id: kp.id,
          name: kp.name,
          label: kp.name,
          mastery: tested ? Math.round(state.mastery) / 100 : 0,
          progress: tested ? Math.round(state.mastery) : 0,
          recommended: tested && state.mastery < 40,
          concepts: [kp.description],
          prerequisites: kp.prerequisites
        }
      })
    }
  })
  return { result: { ...path, dataSource: 'demo-fixture', phases, generatedAt: NOW() } }
}

function domainTopics(domainId: string): string[] {
  switch (domainId) {
    case 'py-basics':
      return ['py-basics']
    case 'numpy':
      return ['numpy-basics']
    case 'pandas':
      return ['pandas-io', 'pandas-clean', 'pandas-select', 'groupby-agg', 'merge-concat']
    case 'viz':
      return ['viz-basic']
    default:
      return []
  }
}

/** 演示资源（课程知识卡片） */
function buildResources() {
  const items = Object.values(kbByKp).map((card) => ({
    id: card.id,
    title: card.title,
    type: 'concept',
    kpId: card.kpId,
    description: card.concept.slice(0, 80),
    difficulty: '入门',
    duration: '15 分钟',
    source: card.source,
    tags: card.keywords.slice(0, 4)
  }))
  return { items }
}

/** 演示证据（学习流水） */
function buildEvidenceTraces() {
  const items = demoEvents().slice(0, 20).map((e, i) => ({
    id: `trace-${i}`,
    time: e.at,
    kind: e.kind,
    summary: e.summary,
    agent: 'demo-learning-loop',
    confidence: 1
  }))
  return { items, total: items.length }
}

const routes: Route[] = [
  // —— 认证（演示模式：直接成功） ——
  { method: 'POST', pattern: /^\/api\/auth\/login$/, handler: () => ({ account: 'demo-reviewer', displayName: '演示学员', role: 'student', token: 'demo-token', expiresAt: new Date(Date.now() + 864e5).toISOString() }) },
  { method: 'GET', pattern: /^\/api\/auth\/session$/, handler: () => ({ account: 'demo-reviewer', role: 'student', displayName: '演示学员' }) },
  { method: 'POST', pattern: /^\/api\/auth\/logout$/, handler: () => ({ ok: true }) },
  { method: 'GET', pattern: /^\/api\/account\/settings/, handler: () => ({ result: { accountId: 'demo-reviewer', displayName: '演示学员' } }) },
  { method: 'POST', pattern: /^\/api\/account\/settings$/, handler: () => ({ result: { accountId: 'demo-reviewer', displayName: '演示学员' } }) },

  // —— 画像 ——
  { method: 'GET', pattern: /^\/api\/profile\/latest/, handler: () => ({ result: buildProfileResult() }) },
  { method: 'POST', pattern: /^\/api\/profile\/analyze$/, handler: () => buildProfileResult() },
  { method: 'POST', pattern: /^\/api\/profile\/save$/, handler: () => ({ ok: true }) },

  // —— 竞赛闭环（诊断/练习/计划由演示状态驱动） ——
  { method: 'POST', pattern: /^\/api\/demo\/diagnosis$/, handler: (_url, body) => demoSubmitDiagnosis(body?.answers ?? {}) },
  { method: 'POST', pattern: /^\/api\/demo\/practice$/, handler: (_url, body) => demoSubmitPractice(body?.kpId, body?.answers ?? {}) },
  { method: 'POST', pattern: /^\/api\/demo\/plan-task$/, handler: (_url, body) => { demoTogglePlanTask(body?.key, body?.label ?? ''); return { ok: true } } },
  { method: 'POST', pattern: /^\/api\/demo\/reset$/, handler: () => ({ ok: true }) },

  // —— 学习路径 / 知识路径 / 评估 ——
  { method: 'GET', pattern: /^\/api\/learning-path$/, handler: () => buildLearningPath() },
  { method: 'GET', pattern: /^\/api\/knowledge-path\/latest$/, handler: () => buildKnowledgePath() },
  { method: 'POST', pattern: /^\/api\/knowledge-path\/generate$/, handler: () => buildKnowledgePath() },
  { method: 'GET', pattern: /^\/api\/evaluation$/, handler: () => buildEvaluation() },
  { method: 'GET', pattern: /^\/api\/agent\/workflow$/, handler: () => ({ dataSource: 'demo-fixture', steps: demoPlan().map((t) => ({ id: t.key, name: `Day ${t.day} · ${t.kpName}`, status: getDemoState().planCompletion[t.key] ? 'done' : 'pending', agent: 'path-agent' })) }) },

  // —— 导师（演示知识库检索，非实时大模型） ——
  { method: 'GET', pattern: /^\/api\/tutoring\/topics$/, handler: () => ({ topics: Object.values(kbByKp).map((c) => ({ id: c.kpId, label: c.title, category: demoCourse.name })) }) },
  { method: 'POST', pattern: /^\/api\/chat$/, handler: (_url, body) => {
    const r = demoAskTutor(extractQuestion(body))
    // 同时满足两种消费方：useChatApi 读 reply/choices（DeepSeek 形态），
    // ChatView 读 content/resources/suggestions（ChatReply 形态）
    const answerText =
      r.answer +
      (r.example ? `\n\n示例：\n${r.example}` : '') +
      (r.pitfalls.length > 0 ? `\n\n常见错误：\n${r.pitfalls.map((p) => `· ${p}`).join('\n')}` : '') +
      (r.source ? `\n\n引用依据：${r.source}（演示模式：预置课程知识库检索，非实时大模型）` : '') +
      (r.followUps.length > 0 ? `\n\n可以继续问我：${r.followUps.slice(0, 3).join('；')}` : '')
    return {
      reply: answerText,
      choices: [{ message: { content: answerText, role: 'assistant' }, finish_reason: 'stop' }],
      model: 'demo-kb-retrieval',
      content: answerText,
      resources: r.relatedExercises.map((e) => ({ id: e.id, title: e.prompt, type: 'exercise' })),
      suggestions: r.followUps
    }
  } },
  { method: 'POST', pattern: /^\/api\/chat\/history$/, handler: () => ({ items: [] }) },
  { method: 'POST', pattern: /^\/api\/tutoring\/ask$/, handler: (_url, body) => {
    const r = demoAskTutor(extractQuestion(body))
    return {
      answer: r.answer + (r.source ? `\n\n引用依据：${r.source}（演示模式：预置课程知识库检索，非实时大模型）` : ''),
      time: NOW(),
      fallbackAgents: [],
      securityRefused: false,
      scaffolding: { level: r.matched ? 5 : 1, attempts: 1, revealsCompleteAnswer: r.matched, nextLevelAvailable: false }
    }
  } },
  { method: 'POST', pattern: /^\/api\/agents\/tutor$/, handler: (_url, body) => {
    const r = demoAskTutor(extractQuestion(body))
    return {
      answer: r.answer + (r.source ? `\n\n引用依据：${r.source}` : ''),
      scaffolding: { level: r.matched ? 5 : 1, attempts: 1, revealsCompleteAnswer: r.matched, nextLevelAvailable: false },
      agentResults: [],
      trace: { agentId: 'demo-tutor', agentName: '演示导师', role: 'tutor', input: String(body?.question ?? ''), process: '知识库检索', output: r.matched ? '命中课程卡片' : '未命中，明确降级', confidence: r.matched ? 1 : 0, evidenceTags: r.matchedTerms }
    }
  } },
  { method: 'POST', pattern: /^\/api\/agents\/profile$/, handler: () => ({ profile: buildProfileResult(), agentResults: [], trace: {} }) },

  // —— 学习闭环反馈 ——
  { method: 'POST', pattern: /^\/api\/learning-cycles\/update$/, handler: () => ({
    workflowId: `demo-wf-${Date.now()}`,
    profileChanges: demoWeakKps().map(({ kp, state }) => ({ dimension: kp.name, before: 0, after: Math.round(state.mastery), reason: '证据驱动更新（演示评估值）' })),
    path: { replanReason: '掌握度变化，计划已重新生成', phases: demoPlan().map((t) => ({ day: t.day, kpName: t.kpName, kind: t.kind })) },
    reflection: { reflection: '演示模式：根据练习证据更新掌握度并重排计划。', nextSteps: demoPlan().slice(0, 3).map((t) => `Day ${t.day}：${t.kpName} · ${t.title}`) },
    trace: {}
  }) },

  // —— 资源 / 证据 / 知识检索 ——
  { method: 'GET', pattern: /^\/api\/resources/, handler: () => buildResources() },
  { method: 'GET', pattern: /^\/api\/evidence\/traces/, handler: () => buildEvidenceTraces() },
  { method: 'GET', pattern: /^\/api\/evidence\/summary$/, handler: () => ({ total: demoEvents().length, byKind: demoEvents().reduce((acc: Record<string, number>, e) => { acc[e.kind] = (acc[e.kind] ?? 0) + 1; return acc }, {}) }) },
  { method: 'GET', pattern: /^\/api\/knowledge\/status$/, handler: () => ({ ready: true, source: 'demo-fixture', cards: Object.keys(kbByKp).length }) }
]

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

let installed = false

export function installMockApi(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    let path = raw
    try {
      path = new URL(raw, window.location.href).pathname
    } catch {
      path = raw.split('?')[0]
    }
    if (!path.startsWith('/api/')) return originalFetch(input, init)

    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    let body: any
    if (typeof init?.body === 'string' && init.body) {
      try {
        body = JSON.parse(init.body)
      } catch {
        body = undefined
      }
    }

    let url: URL
    try {
      url = new URL(raw, window.location.href)
    } catch {
      url = new URL(`http://demo.local${path}`)
    }

    for (const route of routes) {
      if (route.method === method && route.pattern.test(path)) {
        try {
          return jsonResponse(route.handler(url, body))
        } catch (error) {
          console.warn('[demo-mock] handler failed:', error)
          return jsonResponse({ code: 'demo_mock_error', message: String(error) }, 500)
        }
      }
    }

    // 未覆盖端点：快速 404，触发原版视图的本地回退
    return jsonResponse({ code: 'demo_not_available', message: '演示模式：该端点使用本地回退数据' }, 404)
  }
}
