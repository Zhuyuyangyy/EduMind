import fs from 'node:fs/promises'
import path from 'node:path'

const baseUrl = process.argv[2] || 'http://localhost:8788'
const outputDir = path.resolve(process.argv[3] || '../../artifacts/learning-cycles')

const cases = [
  {
    id: 'bfs-weakness',
    title: 'BFS visited 标记错误',
    targetDimension: '知识基础',
    profile: profileOf([61, 61, 61, 61, 61, 61], ['知识基础需巩固']),
    learningData: { topic: 'BFS 图搜索', completedResources: 2 },
    exerciseResults: { knowledgePoint: 'BFS visited 标记时机', dimension: '知识基础', attempted: 5, completed: 5, correctRate: 0.4 },
  },
  {
    id: 'pointer-weakness',
    title: '指针别名推理错误',
    targetDimension: '逻辑思维',
    profile: profileOf([72, 68, 66, 70, 74, 73], ['知识基础需巩固']),
    learningData: { topic: 'C语言指针与内存', completedResources: 3 },
    exerciseResults: { knowledgePoint: '指针别名与地址追踪', dimension: '逻辑思维', attempted: 6, completed: 6, correctRate: 0.5 },
  },
  {
    id: 'active-recall-improvement',
    title: '主动回忆训练后提升',
    targetDimension: '专注力',
    profile: profileOf([70, 70, 70, 70, 68, 70], ['专注力需补强']),
    learningData: { topic: '主动回忆与间隔复习', completedResources: 5 },
    exerciseResults: { knowledgePoint: '主动回忆训练', dimension: '专注力', attempted: 10, completed: 10, correctRate: 0.9 },
  },
]

function profileOf(values, weaknesses) {
  const labels = ['知识基础', '学习速度', '逻辑思维', '创造力', '专注力', '自律力']
  const dimensions = labels.map((label, index) => ({ label, value: values[index] }))
  return {
    dimensions,
    radarPoints: dimensions.map(item => ({ dimension: item.label, score: item.value })),
    totalScore: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    weaknesses,
  }
}

async function post(urlPath, body) {
  const response = await fetch(baseUrl + urlPath, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(`${urlPath} returned ${response.status}: ${JSON.stringify(data)}`)
  return data
}

const results = []
for (const item of cases) {
  const initialPathResult = await post('/api/agents/path-replan', {
    profile: item.profile,
    evaluation: {},
    currentPath: null,
  })
  const update = await post('/api/learning-cycles/update', {
    accountId: `experiment-${item.id}`,
    profile: item.profile,
    currentPath: initialPathResult.path,
    learningData: item.learningData,
    exerciseResults: item.exerciseResults,
  })
  const before = Object.fromEntries(item.profile.dimensions.map(dimension => [dimension.label, dimension.value]))
  const after = Object.fromEntries(update.profile.dimensions.map(dimension => [dimension.label, dimension.value]))
  const change = update.profileChanges.find(entry => entry.dimension === item.targetDimension)
  const unrelatedChanges = Object.keys(before).filter(label => label !== item.targetDimension && before[label] !== after[label])
  results.push({
    id: item.id,
    title: item.title,
    targetDimension: item.targetDimension,
    initialProfile: item.profile,
    initialPath: initialPathResult.path,
    assessment: { learningData: item.learningData, exerciseResults: item.exerciseResults },
    updateEvidence: change,
    updatedProfile: update.profile,
    updatedPath: update.path,
    trace: update.trace,
    checks: {
      targetDimensionUpdated: Boolean(change),
      directionCorrect: item.exerciseResults.correctRate >= 0.8 ? change?.delta > 0 : change?.delta < 0,
      pathReplanned: Array.isArray(update.path?.phases) && update.path.phases.length > 0 && /重|评估/.test(update.path?.replanReason || ''),
      unrelatedDimensionsUnchanged: unrelatedChanges.length === 0,
      traceComplete: update.trace?.agents?.length === 3 && update.trace?.evidence?.some(evidence => evidence.includes(`${change?.before} -> ${change?.after}`)),
    },
  })
}

const checks = results.flatMap(result => Object.values(result.checks))
const output = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  kind: 'real-http-reverse-update-cases',
  summary: {
    cases: results.length,
    passedChecks: checks.filter(Boolean).length,
    totalChecks: checks.length,
    passRate: checks.filter(Boolean).length / checks.length,
  },
  results,
}

await fs.mkdir(outputDir, { recursive: true })
await fs.writeFile(path.join(outputDir, 'learning-cycle-results.json'), JSON.stringify(output, null, 2), 'utf8')
await fs.writeFile(path.join(outputDir, 'learning-cycle-comparison.html'), renderHtml(output), 'utf8')
console.log(JSON.stringify({ summary: output.summary, cases: results.map(result => ({ id: result.id, evidence: result.updateEvidence, checks: result.checks })) }, null, 2))
if (!checks.every(Boolean)) process.exitCode = 1

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function renderHtml(data) {
  const cards = data.results.map(result => {
    const before = result.updateEvidence?.before
    const after = result.updateEvidence?.after
    const initialNodes = result.initialPath?.phases?.flatMap(phase => phase.nodes || []).map(node => node.name).join('、')
    const updatedNodes = result.updatedPath?.phases?.flatMap(phase => phase.nodes || []).map(node => node.name).join('、')
    return `<article class="case">
      <header><span>${escapeHtml(result.id)}</span><h2>${escapeHtml(result.title)}</h2></header>
      <div class="flow">
        <section><small>初始画像</small><strong>${escapeHtml(result.targetDimension)} ${before}</strong><p>总分 ${result.initialProfile.totalScore}</p></section>
        <b>→</b>
        <section class="evidence"><small>评估证据</small><strong>正确率 ${Math.round(result.assessment.exerciseResults.correctRate * 100)}%</strong><p>${escapeHtml(result.updateEvidence?.reason)}</p></section>
        <b>→</b>
        <section class="after"><small>更新后画像</small><strong>${escapeHtml(result.targetDimension)} ${after}</strong><p>变化 ${result.updateEvidence?.delta > 0 ? '+' : ''}${result.updateEvidence?.delta}</p></section>
      </div>
      <div class="paths"><div><small>初始路径节点</small><p>${escapeHtml(initialNodes)}</p></div><div><small>重规划路径节点</small><p>${escapeHtml(updatedNodes)}</p></div></div>
      <footer>${Object.entries(result.checks).map(([key, passed]) => `<span class="${passed ? 'ok' : 'bad'}">${passed ? '✓' : '✗'} ${escapeHtml(key)}</span>`).join('')}</footer>
    </article>`
  }).join('')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>智学星枢反向更新闭环实验</title><style>
    *{box-sizing:border-box}body{margin:0;background:#07111f;color:#e9f4ff;font-family:Segoe UI,Microsoft YaHei,sans-serif}main{width:1440px;min-height:900px;padding:42px 54px;background:radial-gradient(circle at top right,#123b65 0,transparent 35%),#07111f}h1{margin:0 0 8px;font-size:34px}.lead{color:#9eb6ca;margin:0 0 30px}.case{background:#0e2033;border:1px solid #285275;border-radius:18px;padding:22px;margin:18px 0;box-shadow:0 14px 40px #0006}.case header{display:flex;align-items:center;gap:15px}.case header span{font:12px Consolas;color:#54d6ff;background:#0b3248;padding:5px 9px;border-radius:10px}.case h2{font-size:21px;margin:0}.flow{display:grid;grid-template-columns:1fr 40px 1.25fr 40px 1fr;align-items:stretch;gap:10px;margin-top:18px}.flow section,.paths div{background:#091827;border-radius:12px;padding:15px}.flow b{display:grid;place-items:center;color:#54d6ff;font-size:24px}.flow small,.paths small{display:block;color:#8ca8bd;margin-bottom:8px}.flow strong{font-size:22px}.flow p,.paths p{margin:7px 0 0;color:#bcd0df}.evidence{border-left:3px solid #ffc857}.after{border-left:3px solid #39db9a}.paths{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.paths p{font-size:12px;line-height:1.55}footer{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}footer span{font-size:12px;padding:5px 9px;border-radius:10px}.ok{background:#123f35;color:#72f0bd}.bad{background:#4d2028;color:#ff9ca8}.meta{position:absolute;right:54px;top:50px;color:#7894aa;font:12px Consolas}</style></head><body><main><div class="meta">${escapeHtml(data.generatedAt)}</div><h1>智学星枢 · 反向更新闭环实验</h1><p class="lead">3 个真实 HTTP 案例｜更新前 → 评估证据 → 画像写回 → 路径重规划｜${data.summary.passedChecks}/${data.summary.totalChecks} 项检查通过</p>${cards}</main></body></html>`
}
