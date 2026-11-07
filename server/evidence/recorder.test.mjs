import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

test('trace summary aggregates per-agent results and fallback counts', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'zhixue-traces-'))
  process.env.ZHIXUE_TRACE_FILE = path.join(directory, 'traces.json')

  try {
    const { buildTrace, getTraceSummary, recordTrace, runWithAccount } = await import('./recorder.js')
    recordTrace(buildTrace({
      agents: ['ProfileAgent', 'TutorAgent'],
      fallbackUsed: true,
      durationMs: 30,
      agentResults: [
        { agentName: 'ProfileAgent', confidence: 0.8, durationMs: 10, fallbackUsed: false },
        { agentName: 'TutorAgent', confidence: 0.6, durationMs: 20, fallbackUsed: true },
      ],
    }))

    // 无账号上下文记录的 trace 归属 default（改造前历史数据的兼容行为）
    const summary = getTraceSummary('default')
    assert.equal(summary.totalTraces, 1)
    assert.equal(summary.fallbackCount, 1)
    assert.deepEqual(summary.agentStats, [
      { agentName: 'ProfileAgent', totalRuns: 1, fallbackCount: 0, avgConfidence: 0.8, avgDurationMs: 10 },
      { agentName: 'TutorAgent', totalRuns: 1, fallbackCount: 1, avgConfidence: 0.6, avgDurationMs: 20 },
    ])

    // 账号上下文内的 trace 只归属该账号，default 看不到
    runWithAccount('alice', () => {
      recordTrace(buildTrace({ agents: ['ChatAgent'], inputsSummary: 'alice 的提问' }))
    })
    assert.equal(getTraceSummary('default').totalTraces, 1, 'default 汇总不受 alice 的 trace 影响')
    assert.equal(getTraceSummary('alice').totalTraces, 1, 'alice 汇总只含自己的 trace')
  } finally {
    delete process.env.ZHIXUE_TRACE_FILE
    await rm(directory, { recursive: true, force: true })
  }
})
