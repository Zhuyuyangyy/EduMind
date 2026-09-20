import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runEvaluationAgent } from './agents/evaluation-agent.js'

test('EvaluationAgent does not consume candidates already marked out of knowledge base', async () => {
  const result = await runEvaluationAgent({
    profile: { dimensions: [{ label: '知识基础', value: 60 }], totalScore: 60 },
    exerciseResults: { correctRate: 0.5, dimension: '知识基础' },
    knowledgeContext: {
      outOfKnowledgeBase: true,
      matches: [{ id: 'low-score-candidate', title: '不相关低分候选', agentHint: '不应进入建议' }],
      embedding: { model: 'test' },
    },
  })

  assert.deepEqual(result.output.knowledgeContext.matches, [])
  assert.equal(result.output.knowledgeContext.candidateMatches.length, 1)
  assert.ok(result.riskFlags.includes('knowledge-base-out-of-scope'))
  assert.ok(result.evidence.some(item => item.includes('未注入 Agent')))
  assert.ok(!result.output.suggestions.some(item => item.evidenceSource === 'low-score-candidate'))
})
