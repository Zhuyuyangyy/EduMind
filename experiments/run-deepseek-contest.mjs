import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

const outputPath = path.resolve(process.argv[2] || '../../artifacts/raw/deepseek-contest-results.json')
const suppliedKey = process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY
if (!suppliedKey) throw new Error('DEEPSEEK_API_KEY or LLM_API_KEY is required')

process.env.LLM_API_URL = process.env.LLM_API_URL || 'https://api.deepseek.com/chat/completions'
process.env.LLM_API_KEY = suppliedKey
process.env.LLM_MODEL = 'deepseek-chat'
process.env.LLM_TIMEOUT_MS = process.env.LLM_TIMEOUT_MS || '60000'

const { callLlm } = await import('../server/llm/provider.js')
const { runTutorAgent } = await import('../server/agents/tutor-agent.js')
const { runResourceAgent } = await import('../server/agents/resource-agent.js')

const probeStarted = performance.now()
const probe = await callLlm('你是连通性检测助手。', '只回复 OK。', { temperature: 0, maxTokens: 8 })
const preflight = {
  success: Boolean(probe.content) && !probe.fallbackUsed,
  durationMs: Number((performance.now() - probeStarted).toFixed(2)),
  fallbackUsed: probe.fallbackUsed,
  errorCategory: probe.error ? (/401|authentication/i.test(probe.error) ? 'authentication' : /timeout/i.test(probe.error) ? 'timeout' : 'provider-error') : null,
}

const results = []
if (preflight.success) {
  const tasks = [
    {
      id: 'tutor-bfs',
      type: 'tutor',
      input: {
        question: 'BFS 中 visited 应该在节点入队时标记还是出队时标记？请结合重复访问问题解释。',
        mode: 'explain',
        profile: { totalScore: 61, weaknesses: ['知识基础需巩固'], dimensions: [{ label: '知识基础', value: 61 }] },
        resources: [],
      },
    },
    {
      id: 'tutor-pointer',
      type: 'tutor',
      input: {
        question: '请用一个简短的内存地址图解释 C 语言中指针变量变化和指向值变化的区别。',
        mode: 'explain',
        profile: { totalScore: 66, weaknesses: ['逻辑思维需补强'], dimensions: [{ label: '逻辑思维', value: 66 }] },
        resources: [],
      },
    },
    {
      id: 'resource-active-recall',
      type: 'resource',
      input: {
        topic: '主动回忆与间隔复习',
        resourceType: 'all',
        weaknesses: ['专注力需补强'],
        profile: { totalScore: 68, weaknesses: ['专注力需补强'], dimensions: [{ label: '专注力', value: 68 }] },
      },
    },
  ]

  for (const task of tasks) {
    const started = performance.now()
    const result = task.type === 'tutor' ? await runTutorAgent(task.input) : await runResourceAgent(task.input)
    results.push({
      id: task.id,
      type: task.type,
      model: 'deepseek-chat',
      durationMs: Number((performance.now() - started).toFixed(2)),
      fallbackUsed: result.fallbackUsed,
      confidence: result.confidence,
      status: result.status,
      evidence: result.evidence,
      output: result.output,
      checks: {
        callSucceeded: result.fallbackUsed === false,
        outputPresent: Boolean(result.output) && (task.type === 'tutor' ? typeof result.output.answer === 'string' && result.output.answer.length > 0 : Array.isArray(result.output.resources)),
        structuredResourceCoverage: task.type !== 'resource' || new Set(result.output?.resources?.map(item => item.type)).size === 6,
      },
    })
  }
}

const durations = results.map(result => result.durationMs).sort((left, right) => left - right)
const output = {
  generatedAt: new Date().toISOString(),
  kind: 'real-provider-small-sample',
  provider: 'DeepSeek',
  model: 'deepseek-chat',
  endpointHost: 'api.deepseek.com',
  credentialRecorded: false,
  samplePlan: { requested: 3, completed: results.length },
  preflight,
  summary: {
    successCount: results.filter(result => result.checks.callSucceeded).length,
    fallbackCount: results.filter(result => result.fallbackUsed).length,
    averageDurationMs: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null,
    p50DurationMs: durations.length ? durations[Math.ceil(durations.length * 0.5) - 1] : null,
    maxDurationMs: durations.length ? durations.at(-1) : null,
    allOutputsPresent: results.length === 3 && results.every(result => result.checks.outputPresent),
  },
  results,
}

await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8')
console.log(JSON.stringify({ preflight, summary: output.summary, samples: results.map(({ id, type, durationMs, fallbackUsed, checks }) => ({ id, type, durationMs, fallbackUsed, checks })) }, null, 2))
if (!preflight.success || results.length !== 3 || results.some(result => !result.checks.callSucceeded || !result.checks.outputPresent)) process.exitCode = 1
