import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { searchKnowledgeBase } from '../server/knowledge-base/vector-store.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputPath = path.resolve(process.argv[2] || '../../artifacts/raw/rag-contest-results.json')
const testset = JSON.parse(await fs.readFile(path.join(here, 'rag-contest-testset.json'), 'utf8'))

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] || 0
}

const rows = testset.map(item => {
  const started = performance.now()
  const result = searchKnowledgeBase({ query: item.question, limit: 3, mode: 'hybrid' })
  const durationMs = performance.now() - started
  const top3 = result.matches.map(match => ({ id: match.id, domain: match.domain, source: match.source, title: match.title, score: match.score }))
  const relevantEvidence = top3.filter(match => item.expectedDocs.includes(match.id))
  return {
    ...item,
    predictedDomain: top3[0]?.domain || null,
    predictedOutOfKnowledgeBase: result.outOfKnowledgeBase,
    domainCorrect: item.outOfKnowledgeBase ? null : (item.expectedDomains || [item.domain]).includes(top3[0]?.domain),
    top3Hit: item.outOfKnowledgeBase ? null : relevantEvidence.length > 0,
    evidenceSourceShown: item.outOfKnowledgeBase ? null : relevantEvidence.length > 0 && relevantEvidence.every(match => Boolean(match.source)),
    top3,
    durationMs: Number(durationMs.toFixed(4)),
  }
})

const inScope = rows.filter(row => !row.outOfKnowledgeBase)
const ood = rows.filter(row => row.outOfKnowledgeBase)
const durations = rows.map(row => row.durationMs)
const summary = {
  sampleCount: rows.length,
  inDomainCount: rows.filter(row => row.category === 'in-domain').length,
  crossDomainCount: rows.filter(row => row.category === 'cross-domain').length,
  outOfKnowledgeBaseCount: ood.length,
  correctDomainCount: inScope.filter(row => row.domainCorrect).length,
  domainAccuracy: inScope.filter(row => row.domainCorrect).length / inScope.length,
  top3HitCount: inScope.filter(row => row.top3Hit).length,
  top3HitRate: inScope.filter(row => row.top3Hit).length / inScope.length,
  outOfKnowledgeBaseRecognizedCount: ood.filter(row => row.predictedOutOfKnowledgeBase).length,
  outOfKnowledgeBaseRecognitionRate: ood.filter(row => row.predictedOutOfKnowledgeBase).length / ood.length,
  evidenceSourceShownCount: inScope.filter(row => row.evidenceSourceShown).length,
  evidenceSourceShownRate: inScope.filter(row => row.evidenceSourceShown).length / inScope.length,
  averageLatencyMs: durations.reduce((sum, value) => sum + value, 0) / durations.length,
  p95LatencyMs: percentile(durations, 0.95),
}

const output = {
  generatedAt: new Date().toISOString(),
  kind: 'contest-scale-rag-check',
  corpus: { documents: 6, domains: 6, chunks: 6, embedding: 'local-hash-embedding-v1', dimensions: 96 },
  retrieval: { mode: 'hybrid', weights: { vector: 0.5, tag: 0.3, keyword: 0.2 }, topK: 3 },
  summary,
  rows,
}
await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8')
console.log(JSON.stringify(summary, null, 2))
