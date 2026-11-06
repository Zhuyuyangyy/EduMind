import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreChoice, scoreAnswer, summarizeAttempts } from '../src/logic/scoring.ts'
import { diagnosisQuestions } from '../src/data/diagnosis.ts'

test('选择题：正确下标判对', () => {
  const result = scoreChoice(1, 1)
  assert.equal(result.correct, true)
})

test('选择题：错误下标判错', () => {
  const result = scoreChoice(0, 1)
  assert.equal(result.correct, false)
  assert.match(result.reason, /回答错误/)
})

test('选择题：非整数/负数下标判不合法', () => {
  assert.equal(scoreChoice(1.5, 0).correct, false)
  assert.equal(scoreChoice(-1, 0).correct, false)
  assert.equal(scoreChoice('x', 0).correct, false)
})

test('题库答案配置异常时判错并说明原因', () => {
  const result = scoreChoice(0, -1)
  assert.equal(result.correct, false)
  assert.match(result.reason, /题库答案配置异常/)
})

test('scoreAnswer 按题目分派，未知题型一律判错', () => {
  const question = diagnosisQuestions[0]
  assert.equal(scoreAnswer(question, question.answer).correct, true)
  const weird = { type: 'essay' } as unknown as typeof question
  const result = scoreAnswer(weird, 0)
  assert.equal(result.correct, false)
  assert.match(result.reason, /暂不支持的题型/)
})

test('会话汇总：正确率计算与空会话处理', () => {
  assert.deepEqual(summarizeAttempts([{ correct: true }, { correct: false }, { correct: true }]), {
    total: 3,
    correct: 2,
    correctRate: Number((2 / 3).toFixed(4))
  })
  assert.deepEqual(summarizeAttempts([]), { total: 0, correct: 0, correctRate: null })
})

test('诊断题库完整性：8 题、每题 4 个选项、答案下标合法、知识点覆盖 8 个', () => {
  assert.equal(diagnosisQuestions.length, 8)
  const kpIds = new Set<string>()
  for (const q of diagnosisQuestions) {
    assert.equal(q.choices.length, 4, `${q.id} 应有 4 个选项`)
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4, `${q.id} 答案下标非法`)
    assert.ok(q.explanation.length > 10, `${q.id} 缺少解析`)
    kpIds.add(q.kpId)
  }
  assert.equal(kpIds.size, 8, '诊断题应覆盖全部 8 个知识点')
})
