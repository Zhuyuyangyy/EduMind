import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generatePlan, nextPendingTask, planChangeSummary, planProgress } from '../src/logic/plan.ts'
import { buildDiagnosisBaseline, createUntestedState } from '../src/logic/mastery.ts'
import { demoCourse } from '../src/data/course.ts'

function allWeak(mastery: number) {
  const states: Record<string, ReturnType<typeof createUntestedState>> = {}
  for (const kp of demoCourse.knowledgePoints) {
    const s = buildDiagnosisBaseline(kp.id, 1, 1, 't0')
    s.mastery = mastery
    states[kp.id] = s
  }
  return states
}

function dayOf(plan: ReturnType<typeof generatePlan>, kpId: string): number {
  return plan.find((t) => t.kpId === kpId)?.day ?? Number.POSITIVE_INFINITY
}

test('计划固定 7 天：5 个学习日 + 综合项目 + 综合测评', () => {
  const plan = generatePlan(demoCourse, allWeak(30))
  assert.equal(plan.length, 7)
  assert.deepEqual(
    plan.map((t) => t.day),
    [1, 2, 3, 4, 5, 6, 7]
  )
  assert.equal(plan[5].kind, 'project')
  assert.equal(plan[6].kind, 'assessment')
})

test('薄弱优先：薄弱知识点在先修链允许的最早时间出现，不被无关知识点挤占', () => {
  const states = allWeak(60)
  states['pandas-clean'].mastery = 10
  states['pandas-clean'].diagnosis = { correct: 0, total: 1 }
  states['pandas-clean'].lastResult = { correct: 0, total: 1, at: 't0', kind: 'diagnosis' }
  const plan = generatePlan(demoCourse, states)
  // pandas-clean 掌握度 10，但先修链 py-basics -> pandas-io 必须在前
  assert.equal(dayOf(plan, 'py-basics'), 1)
  assert.equal(dayOf(plan, 'pandas-io'), 2)
  assert.equal(dayOf(plan, 'pandas-clean'), 3)
  assert.equal(plan[2].kpId, 'pandas-clean')
  assert.equal(plan[2].kind, 'learn')
  assert.match(plan[2].reason, /最薄弱/)
  // 无关且掌握度更高的知识点排在其后
  assert.ok(dayOf(plan, 'viz-basic') > dayOf(plan, 'pandas-clean') || dayOf(plan, 'viz-basic') === Number.POSITIVE_INFINITY)
})

test('先修约束：后续知识点不会出现在先修之前', () => {
  const states = allWeak(30)
  states['groupby-agg'].mastery = 5
  const plan = generatePlan(demoCourse, states)
  assert.ok(dayOf(plan, 'pandas-clean') < dayOf(plan, 'groupby-agg'))
  assert.ok(dayOf(plan, 'pandas-io') < dayOf(plan, 'pandas-clean'))
  assert.ok(dayOf(plan, 'py-basics') < dayOf(plan, 'pandas-io'))
  assert.ok(dayOf(plan, 'py-basics') < dayOf(plan, 'numpy-basics') || dayOf(plan, 'numpy-basics') === Number.POSITIVE_INFINITY)
})

test('链连续性：薄弱知识点的先修连续安排，而非被无关知识点插队', () => {
  const states = allWeak(50)
  const plan = generatePlan(demoCourse, states)
  const ids = plan.filter((t) => t.kpId).map((t) => t.kpId)
  assert.deepEqual(ids, ['py-basics', 'pandas-io', 'pandas-clean', 'groupby-agg', 'merge-concat'])
})

test('每个任务都有可解释的推荐理由，且引用先修状态', () => {
  const states = allWeak(50)
  const plan = generatePlan(demoCourse, states)
  for (const task of plan.slice(0, 5)) {
    assert.ok(task.reason.length > 10, `Day ${task.day} 缺少推荐理由`)
    if (task.kpId && task.kpId !== 'py-basics') {
      assert.match(task.reason, /先修/, `Day ${task.day} 理由应说明先修状态`)
    }
  }
  assert.match(plan[5].reason, /整合|综合/)
  assert.match(plan[6].reason, /画像/)
})

test('确定性：相同输入产生相同计划', () => {
  const states = allWeak(42)
  assert.deepEqual(generatePlan(demoCourse, states), generatePlan(demoCourse, states))
})

test('未测试知识点参与计划但不标记为薄弱', () => {
  const states: Record<string, ReturnType<typeof createUntestedState>> = {}
  for (const kp of demoCourse.knowledgePoints) states[kp.id] = createUntestedState(kp.id)
  const plan = generatePlan(demoCourse, states)
  assert.equal(plan.length, 7)
  assert.match(plan[0].reason, /尚未产生学习证据/)
  assert.notEqual(plan[0].kind, 'learn')
})

test('计划变化摘要：检测任务调整', () => {
  const before = generatePlan(demoCourse, allWeak(60))
  const states = allWeak(60)
  states['viz-basic'].mastery = 5
  states['viz-basic'].diagnosis = { correct: 0, total: 1 }
  states['viz-basic'].lastResult = { correct: 0, total: 1, at: 't0', kind: 'diagnosis' }
  const after = generatePlan(demoCourse, states)
  const changes = planChangeSummary(before, after)
  assert.ok(changes.length > 0)
  assert.ok(changes.some((c) => c.includes('Day')))
})

test('计划进度与下一个未完成任务', () => {
  const plan = generatePlan(demoCourse, allWeak(50))
  assert.deepEqual(planProgress(plan, {}), { done: 0, total: 7, ratio: 0 })
  const completion = { [plan[0].key]: true, [plan[1].key]: true }
  assert.deepEqual(planProgress(plan, completion), { done: 2, total: 7, ratio: 2 / 7 })
  assert.equal(nextPendingTask(plan, completion)?.key, plan[2].key)
  assert.equal(nextPendingTask(plan, Object.fromEntries(plan.map((t) => [t.key, true]))), null)
})
