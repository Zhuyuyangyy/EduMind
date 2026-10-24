import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyEvaluationResponse } from './composables/evaluationDataPolicy.ts'

test('evaluation UI policy keeps a 503 unavailable and never substitutes a fixture', () => {
  assert.equal(classifyEvaluationResponse({ ok: false, status: 503, code: 'demo-data-disabled', demoEnabled: true }), 'unavailable')
})

test('evaluation UI policy distinguishes network failure, empty data and real data', () => {
  assert.equal(classifyEvaluationResponse({ ok: false, status: 0 }), 'error')
  assert.equal(classifyEvaluationResponse({ ok: true, hasData: false }), 'no-data')
  assert.equal(classifyEvaluationResponse({ ok: true, hasData: true, dataSource: 'real', simulated: false }), 'real')
})

test('evaluation UI policy rejects missing, unknown and simulated sources as real evidence', () => {
  assert.equal(classifyEvaluationResponse({ ok: true, hasData: true }), 'no-data')
  assert.equal(classifyEvaluationResponse({ ok: true, hasData: true, dataSource: 'legacy-fixture' }), 'no-data')
  assert.equal(classifyEvaluationResponse({ ok: true, hasData: true, dataSource: 'real', simulated: true }), 'no-data')
})

test('evaluation UI policy requires explicit demo mode for fixture data', () => {
  assert.equal(classifyEvaluationResponse({ ok: true, hasData: true, dataSource: 'demo-fixture', demoEnabled: false }), 'unavailable')
  assert.equal(classifyEvaluationResponse({ ok: true, hasData: true, dataSource: 'demo-fixture', demoEnabled: true }), 'demo')
})
