import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

const baseUrl = process.argv[2] || 'http://127.0.0.1:8788'
const outputPath = path.resolve(process.argv[3] || 'experiments/output/api-benchmark.json')
const concurrencyLevels = [1, 5, 10, 20]
const scenarios = [
  { name: 'health', method: 'GET', path: '/api/health' },
  { name: 'knowledge-status', method: 'GET', path: '/api/knowledge/status' },
  { name: 'resources', method: 'GET', path: '/api/resources' },
  { name: 'learning-path', method: 'GET', path: '/api/learning-path' },
  { name: 'trace-summary', method: 'GET', path: '/api/evidence/summary' },
  { name: 'knowledge-search', method: 'POST', path: '/api/knowledge/search', body: { query: 'BFS visited queue', limit: 5 } },
]

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] || 0
}

async function execute(scenario) {
  const started = performance.now()
  try {
    const response = await fetch(baseUrl + scenario.path, {
      method: scenario.method,
      headers: scenario.body ? { 'content-type': 'application/json' } : undefined,
      body: scenario.body ? JSON.stringify(scenario.body) : undefined,
    })
    await response.arrayBuffer()
    return { ok: response.ok, status: response.status, durationMs: performance.now() - started }
  } catch (error) {
    return { ok: false, status: 0, durationMs: performance.now() - started, error: error.message }
  }
}

const results = []
for (const scenario of scenarios) {
  for (const concurrency of concurrencyLevels) {
    const requestCount = Math.max(40, concurrency * 10)
    const started = performance.now()
    const rows = []
    let cursor = 0
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (cursor < requestCount) {
        cursor += 1
        rows.push(await execute(scenario))
      }
    }))
    const elapsedMs = performance.now() - started
    const durations = rows.map(row => row.durationMs)
    const statusCounts = Object.groupBy(rows, row => String(row.status))
    results.push({
      scenario: scenario.name,
      concurrency,
      requestCount: rows.length,
      successCount: rows.filter(row => row.ok).length,
      successRate: rows.filter(row => row.ok).length / rows.length,
      averageMs: durations.reduce((sum, value) => sum + value, 0) / durations.length,
      p50Ms: percentile(durations, 0.5), p95Ms: percentile(durations, 0.95), p99Ms: percentile(durations, 0.99),
      minMs: Math.min(...durations), maxMs: Math.max(...durations),
      throughputRps: rows.length / (elapsedMs / 1000),
      statusCounts: Object.fromEntries(Object.entries(statusCounts).map(([status, items]) => [status, items.length])),
      errors: rows.filter(row => row.error).map(row => row.error),
    })
  }
}

const output = { generatedAt: new Date().toISOString(), baseUrl, kind: 'local-deterministic-interfaces', results }
await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8')
console.log(JSON.stringify(results, null, 2))
