import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { searchKnowledgeBase } from '../server/knowledge-base/vector-store.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputPath = path.resolve(process.argv[2] || path.join(here, 'output', 'rag-results.json'))
const testset = JSON.parse(await fs.readFile(path.join(here, 'rag-testset.json'), 'utf8'))
const modes = ['keyword', 'vector', 'vector-keyword', 'hybrid']

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] || 0
}

const groups = []
for (const mode of modes) {
  const rows = []
  for (const item of testset) {
    const started = performance.now()
    const result = searchKnowledgeBase({ query: item.question, limit: 5, mode })
    const durationMs = performance.now() - started
    const rankedIds = result.matches.map(match => match.id)
    const firstRelevant = rankedIds.findIndex(id => item.expectedDocs.includes(id))
    rows.push({
      ...item,
      predictedDomain: result.matches[0]?.domain || null,
      rankedIds,
      scores: result.matches.map(match => ({ id: match.id, score: match.score, ...match.scores })),
      predictedOutOfKnowledgeBase: result.outOfKnowledgeBase,
      reciprocalRank: firstRelevant < 0 ? 0 : 1 / (firstRelevant + 1),
      durationMs: Number(durationMs.toFixed(4)),
    })
  }

  const inDomain = rows.filter(row => !row.outOfKnowledgeBase)
  const ood = rows.filter(row => row.outOfKnowledgeBase)
  const durations = rows.map(row => row.durationMs)
  const hitAt = k => inDomain.filter(row => row.rankedIds.slice(0, k).some(id => row.expectedDocs.includes(id))).length / inDomain.length
  const irrelevantAt3 = inDomain.reduce((sum, row) => sum + row.rankedIds.slice(0, 3).filter(id => !row.expectedDocs.includes(id)).length, 0) / (inDomain.length * 3)
  groups.push({
    mode,
    metrics: {
      sampleCount: rows.length,
      inDomainCount: inDomain.length,
      outOfKnowledgeBaseCount: ood.length,
      domainRoutingAccuracy: inDomain.filter(row => row.predictedDomain === row.domain).length / inDomain.length,
      hitAt1: hitAt(1), hitAt3: hitAt(3), hitAt5: hitAt(5),
      mrr: inDomain.reduce((sum, row) => sum + row.reciprocalRank, 0) / inDomain.length,
      irrelevantEvidenceRateAt3: irrelevantAt3,
      oodFlagRate: ood.filter(row => row.predictedOutOfKnowledgeBase).length / ood.length,
      averageLatencyMs: durations.reduce((sum, value) => sum + value, 0) / durations.length,
      p95LatencyMs: percentile(durations, 0.95),
    },
    rows,
  })
}

const output = {
  generatedAt: new Date().toISOString(),
  note: 'The source contains 6 documents in 6 labeled domains; one document is treated as one chunk. No 8-domain claim is made.',
  groups,
}
await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8')
console.log(JSON.stringify(groups.map(group => ({ mode: group.mode, ...group.metrics })), null, 2))
