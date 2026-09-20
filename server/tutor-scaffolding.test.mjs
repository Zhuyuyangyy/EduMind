import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runTutorAgent } from './agents/tutor-agent.js'

test('TutorAgent defaults to first-level scaffolding instead of a complete answer', async () => {
  const result = await runTutorAgent({
    question: '请直接给出 BFS 最短路完整代码',
    mode: 'step-solve',
    profile: { weaknesses: ['visited 标记时机'] },
    resources: [],
  })

  assert.equal(result.output.scaffolding.level, 1)
  assert.equal(result.output.scaffolding.revealsCompleteAnswer, false)
  assert.match(result.output.answer, /先想|提示|概念/)
  assert.doesNotMatch(result.output.answer, /完整代码|最终答案/)
})

test('TutorAgent exposes a worked explanation only at level five', async () => {
  const result = await runTutorAgent({
    question: 'BFS 的 visited 应该何时标记？',
    mode: 'step-solve',
    hintLevel: 5,
    attempts: 4,
    profile: { weaknesses: ['visited 标记时机'] },
    resources: [],
  })

  assert.equal(result.output.scaffolding.level, 5)
  assert.equal(result.output.scaffolding.revealsCompleteAnswer, true)
  assert.match(result.output.answer, /完整讲解|入队/)
})
