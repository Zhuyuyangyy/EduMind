import { ref } from 'vue'
import { apiGet, apiPost } from '@/lib/api'
import { currentEpoch } from './learning-data'
import type { KnowledgePath } from './types'
export interface Goal { id: string; title: string; deadline: string | null; dailyMinutes: number; status: string; updatedAt: string }
export interface Citation { id: string; materialId: string; title: string; paragraph: number; page: number | null; text: string }
export interface Material { id: string; title: string; kind: string; status: string; message: string; sections: Citation[]; tags: string[]; dataUrl: string | null; updatedAt: string }
export interface Note { id: string; title: string; content: string; materialId: string | null; updatedAt: string }
export interface AgentTask { id: string; kind: string; prompt: string; goalId: string | null; materialIds: string[]; status: string; steps: Array<{ title: string; status: string }>; artifacts: Array<{ id: string; title: string; content: string; citations: Citation[] }>; checklist?: Array<{ id: string; title: string; minutes: number; done: boolean; updatedAt?: string }>; source: string | null; error: string | null; updatedAt: string }
export interface Focus { id: string; minutes: number; accumulatedSeconds: number; status: string; resumedAt: string; startedAt: string; finishedAt?: string | null; goalId?: string | null }
export interface Workspace { version: number; goals: Goal[]; materials: Material[]; notes: Note[]; tasks: AgentTask[]; focus: Focus[]; reviews: Array<{ id: string; dueAt: string; exerciseId: string }>; memories: Array<{ id: string; type: string; content: string; source: string; updatedAt: string }>; feedback: Array<{ id: string; content: string; status: string }>; preferences: { memoryEnabled: boolean; reminderEnabled: boolean; reminderTime: string; quietStart: string; quietEnd: string }; sessions: Array<{ id: string; status: string; answered: number; exerciseIds: string[]; createdAt: string }> }
export const workspaceUpdated = ref(0)
export async function loadWorkspace() {
  const epoch = currentEpoch()
  const result = await apiGet<Workspace>('/api/workspace')
  if (epoch !== currentEpoch()) throw new Error('账号已切换，请重新读取。')
  return result
}
export async function changeWorkspace<T = unknown>(path: string, body: unknown): Promise<T> {
  const epoch = currentEpoch()
  const result = await apiPost<T>(`/api/workspace/${path}`, body)
  if (epoch !== currentEpoch()) throw new Error('账号已切换，请重新读取。')
  workspaceUpdated.value++
  return result
}
export function downloadText(filename: string, content: string, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function dateLabel(value?: string | null) { if (!value) return '未设置期限'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '时间未记录' : date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'short', day: 'numeric' }) }
export const taskLabels: Record<string, string> = { preview: '等待确认', running: '正在处理', completed: '已完成', failed: '未完成，可重试', cancelled: '已取消' }
export function activeGoal(workspace: Workspace | null) { return workspace?.goals.find(goal => goal.status === 'active') || null }
export function dueReviewCount(workspace: Workspace | null) {
  if (!workspace?.preferences.reminderEnabled) return 0
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
  const { quietStart, quietEnd, reminderTime } = workspace.preferences
  const quiet = quietStart === quietEnd ? false : quietStart < quietEnd ? time >= quietStart && time < quietEnd : time >= quietStart || time < quietEnd
  if (quiet || time < reminderTime) return 0
  return workspace.reviews.filter(review => Date.parse(review.dueAt) <= Date.now()).length
}
export async function loadPath() { return (await apiGet<{ result: KnowledgePath | null }>('/api/knowledge-path/latest')).result }
