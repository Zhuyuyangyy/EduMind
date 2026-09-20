import assert from 'node:assert/strict'
import { test } from 'node:test'
import { summarizeLearningHistory } from './learner-memory.js'

test('learner memory summarizes recent evidence for downstream agents', () => {
  const summary = summarizeLearningHistory([
    {
      workflowId: 'cycle-1',
      profileChanges: [{ dimension: '数据结构', before: 52, after: 48, reason: 'BFS visited 连续错误' }],
      evaluation: { mastery: [{ topic: 'BFS', score: 40 }] },
      path: { replanReason: '插入 visited 专项练习' },
      reflection: { nextSteps: ['先完成 BFS 基础补弱'] },
      createdAt: '2026-09-08T00:00:00.000Z',
    },
  ])

  assert.equal(summary.length, 1)
  assert.equal(summary[0].workflowId, 'cycle-1')
  assert.match(JSON.stringify(summary[0]), /BFS|数据结构|visited/)
})
