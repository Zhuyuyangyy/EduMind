import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STORAGE_KEY,
  appendChat,
  clearState,
  createInitialState,
  deserializeState,
  loadState,
  resetLearningState,
  saveState,
  submitDiagnosis,
  submitPractice,
  togglePlanTask
} from '../src/logic/state.ts'
import { generatePlan } from '../src/logic/plan.ts'
import { demoCourse } from '../src/data/course.ts'
import type { KvStorage } from '../src/logic/state.ts'

function mockStorage(seed: Record<string, string> = {}): KvStorage & { data: Record<string, string> } {
  const data = { ...seed }
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v
    },
    removeItem: (k) => {
      delete data[k]
    }
  }
}

const ALL_CORRECT: Record<string, number> = Object.fromEntries(
  (await import('../src/data/diagnosis.ts')).diagnosisQuestions.map((q) => [q.id, q.answer])
)

test('初始状态：全部知识点未测试', () => {
  const state = createInitialState()
  assert.equal(state.diagnosis.submitted, false)
  assert.equal(Object.keys(state.kpStates).length, 8)
  for (const kp of demoCourse.knowledgePoints) {
    assert.equal(state.kpStates[kp.id].mastery, 0)
    assert.equal(state.kpStates[kp.id].lastResult, null)
  }
})

test('提交诊断：判分、建立基线、记录事件', () => {
  const { state, result } = submitDiagnosis(createInitialState(), ALL_CORRECT)
  assert.equal(result.summary.correct, 8)
  assert.equal(state.diagnosis.submitted, true)
  assert.equal(state.kpStates['py-basics'].mastery, 75)
  assert.deepEqual(state.kpStates['py-basics'].diagnosis, { correct: 1, total: 1 })
  assert.equal(state.events.length, 1)
  assert.match(state.events[0].summary, /完成学习诊断/)
  assert.equal(result.perQuestion.length, 8)
  assert.equal(result.perKp.length, 8)
})

test('提交诊断：漏答按未作答判错', () => {
  const { state, result } = submitDiagnosis(createInitialState(), { 'd-py-div': 0 })
  assert.equal(result.summary.correct, 1)
  const missed = result.perQuestion.find((q) => q.questionId === 'd-numpy-mul')!
  assert.equal(missed.correct, false)
  assert.match(missed.reason, /未作答/)
  assert.equal(state.kpStates['numpy-basics'].mastery, 0)
})

test('提交练习：判分并更新该知识点掌握度，其他知识点不受影响', () => {
  const diagnosed = submitDiagnosis(createInitialState(), ALL_CORRECT).state
  const answers = { 'e-np-1': 1, 'e-np-2': 2, 'e-np-3': 2 } // 全对
  const { state, result } = submitPractice(diagnosed, 'numpy-basics', answers)
  assert.equal(result.summary.correct, 3)
  assert.equal(result.masteryBefore, 75)
  assert.equal(result.masteryAfter, 83)
  assert.equal(state.kpStates['numpy-basics'].practiceCount, 3)
  assert.equal(state.kpStates['py-basics'].mastery, 75)
  assert.equal(state.kpStates['py-basics'].practiceCount, 0)
  assert.equal(state.practice['numpy-basics']['e-np-1'], 1)
  assert.equal(state.events.length, 2)
})

test('闭环：练习后计划随新画像重新生成', () => {
  let state = submitDiagnosis(createInitialState(), ALL_CORRECT).state
  const planBefore = generatePlan(demoCourse, state.kpStates)
  state = submitPractice(state, 'numpy-basics', { 'e-np-1': 0, 'e-np-2': 0, 'e-np-3': 0 }).state // 全错 -> 75-8=67? 实际 0% -> -8
  const planAfter = generatePlan(demoCourse, state.kpStates)
  assert.notDeepEqual(planBefore.map((t) => t.kpId), planAfter.map((t) => t.kpId))
  assert.equal(state.kpStates['numpy-basics'].mastery, 67)
})

test('计划任务完成状态切换与事件记录', () => {
  let state = submitDiagnosis(createInitialState(), ALL_CORRECT).state
  const plan = generatePlan(demoCourse, state.kpStates)
  state = togglePlanTask(state, plan[0].key, plan[0].kpName)
  assert.equal(state.planCompletion[plan[0].key], true)
  assert.equal(state.events.at(-1)?.kind, 'plan-task-completed')
  state = togglePlanTask(state, plan[0].key, plan[0].kpName)
  assert.equal(state.planCompletion[plan[0].key], false)
  assert.equal(state.events.length, 2)
})

test('对话追加与截断（保留 50 条）', () => {
  let state = createInitialState()
  for (let i = 0; i < 55; i++) {
    state = appendChat(state, { id: `m-${i}`, role: 'user', text: `q${i}`, at: 't' })
  }
  assert.equal(state.chat.length, 50)
  assert.equal(state.chat[0].text, 'q5')
})

test('持久化：保存后加载可还原，损坏数据安全降级', () => {
  const storage = mockStorage()
  const { state } = submitDiagnosis(createInitialState(), ALL_CORRECT)
  assert.equal(saveState(storage, state), true)
  const loaded = loadState(storage)
  assert.ok(loaded)
  assert.equal(loaded!.kpStates['py-basics'].mastery, 75)
  assert.equal(loaded!.diagnosis.submitted, true)

  storage.setItem(STORAGE_KEY, '{broken json')
  assert.equal(loadState(storage), null)
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 999, kpStates: {} }))
  assert.equal(loadState(storage), null)

  clearState(storage)
  assert.equal(storage.data[STORAGE_KEY], undefined)
})

test('反序列化：补齐缺失知识点，过滤越界字段', () => {
  const state = createInitialState()
  const raw = JSON.stringify({ ...state, kpStates: { 'py-basics': state.kpStates['py-basics'] }, bogus: 1 })
  const restored = deserializeState(raw)
  assert.ok(restored)
  assert.equal(Object.keys(restored!.kpStates).length, 8)
  assert.equal('bogus' in restored!, false)
})

test('重置：恢复初始演示状态', () => {
  const { state } = submitDiagnosis(createInitialState(), ALL_CORRECT)
  const fresh = resetLearningState()
  assert.equal(fresh.diagnosis.submitted, false)
  assert.equal(fresh.kpStates['py-basics'].mastery, 0)
  assert.notEqual(state.diagnosis.submitted, fresh.diagnosis.submitted)
})

test('存储不可用时保存失败但不抛出', () => {
  const broken: KvStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceeded')
    },
    removeItem: () => {
      throw new Error('denied')
    }
  }
  assert.equal(saveState(broken, createInitialState()), false)
  assert.doesNotThrow(() => clearState(broken))
})
