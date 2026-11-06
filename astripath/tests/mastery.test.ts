import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MASTERY_RULES,
  applyPracticeSession,
  buildDiagnosisBaseline,
  createUntestedState,
  initialMasteryFromDiagnosis,
  overallMastery,
  statusOf
} from '../src/logic/mastery.ts'

test('诊断基线：正确率映射到 0-75，满分诊断记 75 而非 100', () => {
  assert.equal(initialMasteryFromDiagnosis(1, 1), MASTERY_RULES.DIAGNOSIS_MAX)
  assert.equal(initialMasteryFromDiagnosis(0, 1), 0)
  assert.equal(initialMasteryFromDiagnosis(1, 2), Math.round(0.5 * MASTERY_RULES.DIAGNOSIS_MAX))
  assert.equal(initialMasteryFromDiagnosis(0, 0), 0)
})

test('诊断基线状态包含可解释的变化记录', () => {
  const state = buildDiagnosisBaseline('pandas-clean', 1, 2, '2026-11-06T00:00:00.000Z')
  assert.equal(state.mastery, 38)
  assert.deepEqual(state.diagnosis, { correct: 1, total: 2 })
  assert.equal(state.lastResult?.kind, 'diagnosis')
  assert.match(state.history[0].reason, /诊断正确率/)
})

test('状态分档：未测试/需加强/学习中/已掌握', () => {
  assert.equal(statusOf(0, false), 'untested')
  assert.equal(statusOf(0, true), 'weak')
  assert.equal(statusOf(MASTERY_RULES.WEAK_THRESHOLD, true), 'learning')
  assert.equal(statusOf(MASTERY_RULES.MASTERED_THRESHOLD, true), 'mastered')
  assert.equal(statusOf(MASTERY_RULES.MASTERED_THRESHOLD - 1, true), 'learning')
})

test('证据量门槛：单次练习少于 2 题不调整掌握度', () => {
  const state = buildDiagnosisBaseline('py-basics', 1, 1, 't0')
  const result = applyPracticeSession(state, 1, 1, 't1')
  assert.equal(result.changed, false)
  assert.equal(result.after, state.mastery)
  assert.match(result.reason, /证据量不足/)
})

test('稳定区间：正确率 [40%, 80%) 时掌握度不变', () => {
  const state = buildDiagnosisBaseline('numpy-basics', 1, 2, 't0')
  const result = applyPracticeSession(state, 2, 4, 't1') // 50%
  assert.equal(result.changed, false)
  assert.match(result.reason, /稳定区间/)
})

test('高正确率提升掌握度，且不超过单次上限', () => {
  const state = buildDiagnosisBaseline('numpy-basics', 1, 2, 't0') // mastery 38
  const result = applyPracticeSession(state, 3, 3, 't1') // 100%
  assert.equal(result.changed, true)
  assert.equal(result.delta, MASTERY_RULES.MAX_DELTA)
  assert.equal(result.after, state.mastery + MASTERY_RULES.MAX_DELTA)
  assert.equal(result.state.lastResult?.kind, 'practice')
  assert.equal(result.state.practiceCount, 3)
  assert.equal(result.state.practiceCorrect, 3)
})

test('低正确率降低掌握度，且不低于 0', () => {
  const state = buildDiagnosisBaseline('numpy-basics', 0, 1, 't0') // mastery 0
  const result = applyPracticeSession(state, 0, 3, 't1') // 0%
  assert.equal(result.changed, false)
  assert.equal(result.after, 0)
  assert.match(result.reason, /下限/)

  const state2 = buildDiagnosisBaseline('numpy-basics', 1, 2, 't0') // 38
  const result2 = applyPracticeSession(state2, 0, 3, 't1')
  assert.equal(result2.changed, true)
  assert.equal(result2.after, 38 - MASTERY_RULES.MAX_DELTA)
})

test('掌握度钳制在 100：达到上限后良好表现不再提升', () => {
  let state = buildDiagnosisBaseline('groupby-agg', 1, 1, 't0') // 75
  state = applyPracticeSession(state, 3, 3, 't1').state // +8 -> 83
  state = applyPracticeSession(state, 3, 3, 't2').state // +8 -> 91
  state = applyPracticeSession(state, 3, 3, 't3').state // +8 -> 99
  const result = applyPracticeSession(state, 3, 3, 't4') // +8 -> 107 被钳制为 100
  assert.equal(result.after, 100)
  assert.equal(result.delta, 1)
})

test('总体掌握度：仅统计有证据的知识点，无证据返回 null', () => {
  assert.equal(overallMastery([]), null)
  const untested = createUntestedState('py-basics')
  assert.equal(overallMastery([untested]), null)
  const a = buildDiagnosisBaseline('py-basics', 1, 1, 't0') // 75
  const b = buildDiagnosisBaseline('numpy-basics', 0, 1, 't0') // 0
  assert.equal(overallMastery([a, b, untested]), 38)
})
