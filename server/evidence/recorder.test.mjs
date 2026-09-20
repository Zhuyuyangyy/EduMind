import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

test('trace summary aggregates per-agent results and fallback counts', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'zhixue-traces-'))
  process.env.ZHIXUE_TRACE_FILE = path.join(directory, 'traces.json')

  try {
    const { buildTrace, getTraceSummary, recordTrace } = await import('./recorder.js')
    recordTrace(buildTrace({
      agents: ['ProfileAgent', 'TutorAgent'],
      fallbackUsed: true,
      durationMs: 30,
      agentResults: [
        { agentName: 'ProfileAgent', confidence: 0.8, durationMs: 10, fallbackUsed: false },
        { agentName: 'TutorAgent', confidence: 0.6, durationMs: 20, fallbackUsed: true },
      ],
    }))

    const summary = getTraceSummary()
    assert.equal(summary.totalTraces, 1)
    assert.equal(summary.fallbackCount, 1)
    assert.deepEqual(summary.agentStats, [
      { agentName: 'ProfileAgent', totalRuns: 1, fallbackCount: 0, avgConfidence: 0.8, avgDurationMs: 10 },
      { agentName: 'TutorAgent', totalRuns: 1, fallbackCount: 1, avgConfidence: 0.6, avgDurationMs: 20 },
    ])
  } finally {
    delete process.env.ZHIXUE_TRACE_FILE
    await rm(directory, { recursive: true, force: true })
  }
})
