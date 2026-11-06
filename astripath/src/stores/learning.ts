import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { KpMasteryState, LearningState, PlanTask, TutorMessage } from '../logic/types.ts'
import { demoCourse } from '../data/course.ts'
import { diagnosisQuestions } from '../data/diagnosis.ts'
import { exercisesByKp } from '../data/exercises.ts'
import { answerQuestion, suggestedQuestions, type TutorResponse } from '../logic/tutor.ts'
import { generatePlan, nextPendingTask, planChangeSummary, planProgress } from '../logic/plan.ts'
import { overallMastery, statusOf } from '../logic/mastery.ts'
import {
  STORAGE_KEY,
  appendChat,
  clearState,
  createInitialState,
  loadState,
  resetLearningState,
  saveState,
  submitDiagnosis,
  submitPractice,
  togglePlanTask
} from '../logic/state.ts'

/** 浏览器本地存储（不可用时降级为内存，保证演示不中断） */
function resolveStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = '__astripath_probe__'
      localStorage.setItem(probe, '1')
      localStorage.removeItem(probe)
      return localStorage
    }
  } catch {
    /* 隐私模式等场景：降级为内存存储 */
  }
  return null
}

const memoryStore = new Map<string, string>()
const memoryStorage: Storage = {
  get length() {
    return memoryStore.size
  },
  clear: () => memoryStore.clear(),
  getItem: (key: string) => memoryStore.get(key) ?? null,
  key: (index: number) => [...memoryStore.keys()][index] ?? null,
  removeItem: (key: string) => memoryStore.delete(key),
  setItem: (key: string, value: string) => void memoryStore.set(key, value)
}

export const useLearningStore = defineStore('learning', () => {
  const storage = resolveStorage() ?? memoryStorage
  const storageAvailable = resolveStorage() !== null

  const state = ref<LearningState>(loadState(storage) ?? createInitialState())
  const lastRouteTitle = ref('')
  /** 计划重新生成的可见提示（key 用于强制刷新） */
  const planNotice = ref<{ id: number; changes: string[]; at: string } | null>(null)

  let noticeSeq = 0

  watch(
    state,
    (next) => {
      saveState(storage, next)
    },
    { deep: true }
  )

  // —— 派生数据 ——

  const kpList = computed<KpMasteryState[]>(() =>
    demoCourse.knowledgePoints.map((kp) => state.value.kpStates[kp.id])
  )

  const isDiagnosed = computed(() => state.value.diagnosis.submitted)

  const overall = computed(() => overallMastery(kpList.value))

  const statusGroups = computed(() => {
    const groups: Record<'mastered' | 'learning' | 'weak' | 'untested', KpMasteryState[]> = {
      mastered: [],
      learning: [],
      weak: [],
      untested: []
    }
    for (const kp of kpList.value) {
      const tested = kp.diagnosis !== null || kp.practiceCount > 0
      groups[statusOf(kp.mastery, tested)].push(kp)
    }
    return groups
  })

  /** 薄弱知识点（按掌握度升序），用于导师推荐问题与报告 */
  const weakKps = computed(() =>
    kpList.value
      .filter((kp) => {
        const tested = kp.diagnosis !== null || kp.practiceCount > 0
        return tested && statusOf(kp.mastery, true) === 'weak'
      })
      .sort((a, b) => a.mastery - b.mastery)
  )

  const plan = computed<PlanTask[]>(() => generatePlan(demoCourse, state.value.kpStates))

  const planProgressInfo = computed(() => planProgress(plan.value, state.value.planCompletion))

  const todayTask = computed(() => nextPendingTask(plan.value, state.value.planCompletion))

  const practiceTotalCount = computed(() =>
    kpList.value.reduce((sum, kp) => sum + kp.practiceCount, 0)
  )

  // —— 动作 ——

  function answerDiagnosis(questionId: string, choiceIndex: number): void {
    state.value.diagnosis.answers[questionId] = choiceIndex
  }

  function submitDiagnosisAction(answers: Record<string, number>) {
    const prevPlan = plan.value
    const result = submitDiagnosis(state.value, answers)
    state.value = result.state
    const changes = planChangeSummary(prevPlan, plan.value)
    noticeSeq += 1
    planNotice.value = { id: noticeSeq, changes, at: new Date().toISOString() }
    return result
  }

  function submitPracticeAction(kpId: string, answers: Record<string, number>) {
    const prevPlan = plan.value
    const result = submitPractice(state.value, kpId, answers)
    state.value = result.state
    const changes = planChangeSummary(prevPlan, plan.value)
    if (changes.length > 0) {
      noticeSeq += 1
      planNotice.value = { id: noticeSeq, changes, at: new Date().toISOString() }
    }
    return result
  }

  function toggleTask(key: string, label: string): void {
    state.value = togglePlanTask(state.value, key, label)
  }

  /** 提问：检索演示知识库，写入对话记录，返回完整回答（含引用依据） */
  function askTutor(question: string): TutorResponse {
    const response = answerQuestion(question)
    const at = new Date().toISOString()
    const userMessage: TutorMessage = {
      id: `msg-${Date.now().toString(36)}-u`,
      role: 'user',
      text: question,
      at
    }
    const tutorMessage: TutorMessage = {
      id: `msg-${Date.now().toString(36)}-t`,
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
    state.value = appendChat(state.value, userMessage)
    state.value = appendChat(state.value, tutorMessage)
    return response
  }

  function resetDemo(): void {
    clearState(storage)
    state.value = resetLearningState()
    planNotice.value = null
  }

  function dismissPlanNotice(): void {
    planNotice.value = null
  }

  function touchRoute(title: string): void {
    lastRouteTitle.value = title
  }

  // —— 便捷读取 ——

  const diagnosisProgress = computed(() => {
    const answered = diagnosisQuestions.filter((q) => q.id in state.value.diagnosis.answers).length
    return { answered, total: diagnosisQuestions.length }
  })

  const exercisesFor = (kpId: string) => exercisesByKp[kpId] ?? []

  const tutorSuggestions = computed(() =>
    suggestedQuestions(weakKps.value.map((kp) => kp.kpId))
  )

  return {
    state,
    storageAvailable,
    storageKey: STORAGE_KEY,
    lastRouteTitle,
    planNotice,
    // derived
    kpList,
    isDiagnosed,
    overall,
    statusGroups,
    weakKps,
    plan,
    planProgressInfo,
    todayTask,
    practiceTotalCount,
    diagnosisProgress,
    tutorSuggestions,
    // actions
    answerDiagnosis,
    submitDiagnosisAction,
    submitPracticeAction,
    toggleTask,
    askTutor,
    resetDemo,
    dismissPlanNotice,
    touchRoute,
    exercisesFor
  }
})

export type LearningStore = ReturnType<typeof useLearningStore>
