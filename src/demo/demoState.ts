/**
 * 演示学习状态（竞赛版）
 *
 * 复用 astripath 竞赛闭环的确定性逻辑（判分/掌握度/计划/导师检索），
 * 以 localStorage 持久化；API 模拟层与新增闭环视图都通过这里读写状态，
 * 保证原版视图与竞赛闭环看到同一份数据。
 */
import {
  STORAGE_KEY,
  appendChat,
  createInitialState,
  deserializeState,
  loadState,
  resetLearningState,
  saveState,
  submitDiagnosis,
  submitPractice,
  togglePlanTask
} from '../../astripath/src/logic/state.ts'
import type { LearningState, TutorMessage } from '../../astripath/src/logic/types.ts'
import { answerQuestion } from '../../astripath/src/logic/tutor.ts'
import { generatePlan } from '../../astripath/src/logic/plan.ts'
import { overallMastery, statusOf } from '../../astripath/src/logic/mastery.ts'
import { demoCourse } from '../../astripath/src/data/course.ts'
import { kbByKp } from '../../astripath/src/data/knowledgeBase.ts'
import { ref } from 'vue'

const memory = new Map<string, string>()
const storage = {
  getItem: (key: string) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return memory.get(key) ?? null
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      memory.set(key, value)
    }
  },
  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key)
    } catch {
      memory.delete(key)
    }
  }
}

let current: LearningState = loadState(storage) ?? createInitialState()
/** 响应式版本号：状态变更时自增，使依赖 getDemoState() 的 computed 重新求值 */
const stateVersion = ref(0)

export function getDemoState(): LearningState {
  void stateVersion.value
  return current
}

function commit(next: LearningState): LearningState {
  current = next
  stateVersion.value += 1
  saveState(storage, next)
  return next
}

export function demoSubmitDiagnosis(answers: Record<string, number>) {
  const result = submitDiagnosis(current, answers)
  commit(result.state)
  return result
}

export function demoSubmitPractice(kpId: string, answers: Record<string, number>) {
  const result = submitPractice(current, kpId, answers)
  commit(result.state)
  return result
}

export function demoTogglePlanTask(key: string, label: string) {
  commit(togglePlanTask(current, key, label))
}

export function demoAskTutor(question: string) {
  const response = answerQuestion(question)
  const at = new Date().toISOString()
  const userMessage: TutorMessage = { id: `u-${Date.now()}`, role: 'user', text: question, at }
  const tutorMessage: TutorMessage = {
    id: `t-${Date.now()}`,
    role: 'tutor',
    text: response.answer,
    at,
    source: response.source ?? undefined,
    matchedTerms: response.matchedTerms,
    kpId: response.kpId ?? undefined,
    example: response.example ?? undefined,
    pitfalls: response.pitfalls,
    relatedExercises: response.relatedExercises,
    followUps: response.followUps,
    matched: response.matched,
    title: response.title
  }
  commit(appendChat(appendChat(current, userMessage), tutorMessage))
  return response
}

export function demoReset() {
  commit(resetLearningState())
}

export function demoDeserialize(raw: string | null): LearningState | null {
  return deserializeState(raw)
}

// —— 派生数据（供 API 模拟与视图使用） ——

export function demoOverall(): number | null {
  return overallMastery(Object.values(getDemoState().kpStates))
}

export function demoKpStates() {
  const state = getDemoState()
  return demoCourse.knowledgePoints.map((kp) => ({
    kp,
    state: state.kpStates[kp.id]
  }))
}

export function demoWeakKps() {
  return demoKpStates()
    .filter(({ state }) => {
      const tested = state.diagnosis !== null || state.practiceCount > 0
      return tested && statusOf(state.mastery, true) === 'weak'
    })
    .sort((a, b) => a.state.mastery - b.state.mastery)
}

export function demoPlan() {
  return generatePlan(demoCourse, getDemoState().kpStates)
}

export function demoIsDiagnosed(): boolean {
  return getDemoState().diagnosis.submitted
}

export function demoChat(): TutorMessage[] {
  return getDemoState().chat
}

export function demoEvents() {
  return [...getDemoState().events].reverse()
}

export { demoCourse, kbByKp, STORAGE_KEY }
