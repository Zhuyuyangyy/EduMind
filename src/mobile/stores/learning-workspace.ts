import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getAuthSession } from '@/lib/auth'
import { getApiBase } from '@/lib/api-config'
import { apiGet } from '@/lib/api'
import { currentEpoch } from '@/mobile/data/learning-data'
import { loadPath, loadWorkspace, type Workspace } from '@/mobile/data/workspace'
import type { KnowledgePath, LearnerProfile } from '@/mobile/data/types'
import type { StudyAttempt, StudyExercise } from '@/mobile/data/study'
import { fetchSessionQuestions } from '@/mobile/data/study'
import { defaultLocalConfig, feedPet, grantEvidence, petProgress, readLocalConfig, shanghaiDay, storageScope, validateWidget, type WidgetConfig, type LocalConfig, type TimeRecord } from '@/mobile/domain/companion'

export interface ReviewEvidence { exercise: StudyExercise; attempt: StudyAttempt; sessionId: string; review: { reason: string; dueAt: string } | null }
export interface LearningEvent { id: string; type: string; sessionId: string | null; at: string; ref: Record<string, unknown> }
export const useLearningWorkspace = defineStore('mobile-learning-workspace', () => {
  const scope = ref(''), local = ref<LocalConfig>(defaultLocalConfig()), workspace = ref<Workspace | null>(null), path = ref<KnowledgePath | null>(null), profile = ref<LearnerProfile | null>(null), events = ref<LearningEvent[]>([]), reviews = ref<ReviewEvidence[]>([]), loading = ref(false), error = ref(''), evidenceError = ref(''), storageError = ref(''), loaded = ref(false)
  const topicEvidence=ref<Record<string,{answers:number;correct:number;sessionIds:string[];lastAt:string}>>({})
  let generation = 0, inflightEpoch = -1
  let inflight: Promise<void> | null = null
  function bindAccount() {
    const session = getAuthSession()
    const key = session ? storageScope(getApiBase() || window.location.origin, session.account) : ''
    if (key === scope.value) return
    generation++; scope.value = key; local.value = defaultLocalConfig(); workspace.value = null; path.value = null; profile.value = null; events.value = []; reviews.value = []; topicEvidence.value={};error.value = ''; evidenceError.value = ''; storageError.value = ''; loaded.value = false; loading.value = false; inflight = null
    try { if (key) local.value = readLocalConfig(localStorage.getItem(key)) } catch { storageError.value = '本机存储不可用，面板和宠物设置暂不能持久化。' }
  }
  function persist() { if (!scope.value) return; try { localStorage.setItem(scope.value, JSON.stringify(local.value)); storageError.value = '' } catch { storageError.value = '本机存储已满或不可用，本次配置没有保存。' } }
  async function refresh() {
    bindAccount(); if (!scope.value) return
    if (inflight&&inflightEpoch===currentEpoch()) return inflight
    const key = scope.value, epoch = currentEpoch(), request = ++generation
    inflightEpoch=epoch
    loading.value = true; error.value = ''
    inflight = (async () => {
      const results = await Promise.allSettled([loadWorkspace(), loadPath(), apiGet<{ result: LearnerProfile | null }>('/api/profile/latest'), apiGet<{ items: LearningEvent[] }>('/api/study/events'), apiGet<{ items: ReviewEvidence[] }>('/api/workspace/reviews')])
      if (key !== scope.value || epoch !== currentEpoch() || request !== generation) return
      const [w,p,profileResult,e,r] = results
      if (w.status === 'rejected') { error.value = '学习工作区读取失败，请检查连接后重试。'; return }
      workspace.value = w.value
      path.value = p.status === 'fulfilled' ? p.value : null
      profile.value = profileResult.status === 'fulfilled' ? profileResult.value.result : null
      events.value = e.status === 'fulfilled' ? e.value.items : []
      reviews.value = r.status === 'fulfilled' ? r.value.items : []
      evidenceError.value = [p,profileResult,e,r].some(result => result.status === 'rejected') ? '部分路径或证据暂不可用，相关区域不会用零值替代请求失败。' : ''
      let changed = false
      for (const focus of w.value.focus.filter(f => f.status === 'completed' && f.finishedAt)) changed = grantEvidence(local.value, { id: focus.id, type: 'focus', at: focus.finishedAt!, seconds: focus.accumulatedSeconds, expectedSeconds: focus.minutes * 60 }) || changed
      for (const event of events.value.filter(event => event.type === 'session-complete' && event.sessionId)) changed = grantEvidence(local.value, { id: event.sessionId!, type: 'practice', at: event.at }) || changed
      for(const task of w.value.tasks.filter(t=>t.status==='completed'))for(const item of task.checklist||[])if(item.done&&item.updatedAt)changed=grantEvidence(local.value,{id:`${task.id}:${item.id}`,type:'task',at:item.updatedAt,confirmedDone:true})||changed
      if (changed) persist()
      const completed=w.value.sessions.filter(s=>s.status==='completed').slice(0,8)
      const snapshots=await Promise.all(completed.map(s=>fetchSessionQuestions(s.id)))
      if(snapshots.some(s=>!s))evidenceError.value='部分已完成练习证据读取失败，请重试；缺失记录不计为零分。'
      if(key!==scope.value||epoch!==currentEpoch()||request!==generation)return
      const evidence:typeof topicEvidence.value={}
      snapshots.forEach((snapshot,i)=>{if(!snapshot||snapshot.session.status!=='completed')return;for(const exercise of snapshot.exercises){const attempt=snapshot.answered.find(a=>a.exerciseId===exercise.id);if(!attempt)continue;const item=evidence[exercise.topicId]||{answers:0,correct:0,sessionIds:[],lastAt:completed[i]!.createdAt};item.answers++;if(attempt.correct)item.correct++;if(!item.sessionIds.includes(snapshot.session.id))item.sessionIds.push(snapshot.session.id);evidence[exercise.topicId]=item}})
      topicEvidence.value=evidence
      loaded.value = true
    })().finally(() => { if (request === generation) { loading.value = false; inflight = null } })
    return inflight
  }
  const pet = computed(() => petProgress(local.value.experience))
  const timeRecords = computed<TimeRecord[]>(() => workspace.value?.focus.filter(f => f.status === 'completed' && f.finishedAt).map(f => ({ id: f.id, seconds: f.accumulatedSeconds, at: f.finishedAt!, goalId: f.goalId || null })) || [])
  const todayKey = computed(() => shanghaiDay())
  const taskItems = computed(() => workspace.value?.tasks.filter(t => t.status === 'completed').flatMap(t => (t.checklist || []).map(item => ({ ...item, taskId: t.id, goalId: t.goalId, type: '学习任务', condition: '完成后手动确认；不作为测验成绩', localState: local.value.taskStates[item.id]?.status || 'pending' }))) || [])
  function setWidgets(widgets: WidgetConfig[]) { if(widgets.length>12||!widgets.every(validateWidget)||new Set(widgets.map(w=>w.id)).size!==widgets.length)return; local.value.widgets = widgets; persist() }
  function feed() { const success = feedPet(local.value); if (success) persist(); return success }
  function setTaskState(id: string, status: 'pending' | 'active' | 'deferred') { local.value.taskStates[id] = { status, updatedAt: new Date().toISOString() }; persist() }
  return { scope, local, workspace, path, profile, events, reviews, topicEvidence, loading, error, evidenceError, storageError, loaded, pet, timeRecords, taskItems, todayKey, bindAccount, persist, refresh, setWidgets, feed, setTaskState }
})
