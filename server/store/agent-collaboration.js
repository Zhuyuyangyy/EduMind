import {
  getCollaborationByDayIndex,
  saveCollaborationByDayIndex,
  hasAnyCollaboration as hasAnyMySqlCollaboration,
} from './mysql.js'

const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

export function resolveDay(dayParam) {
  if (typeof dayParam === 'number' && dayParam >= 0 && dayParam < 7) {
    return { index: dayParam, name: DAY_NAMES[dayParam], label: DAY_LABELS[dayParam] }
  }
  const normalized = String(dayParam || '').toLowerCase().trim()
  const index = DAY_NAMES.indexOf(normalized)
  if (index >= 0) return { index, name: DAY_NAMES[index], label: DAY_LABELS[index] }
  return { index: 0, name: DAY_NAMES[0], label: DAY_LABELS[0] }
}

export function listDays() {
  return DAY_NAMES.map((name, index) => ({ name, label: DAY_LABELS[index], index }))
}

export async function getCollaborationByDay(dayParam) {
  const { index } = resolveDay(dayParam)
  return getCollaborationByDayIndex(index)
}

export async function saveCollaboration(dayParam, payload) {
  const { index, name } = resolveDay(dayParam)
  return saveCollaborationByDayIndex(index, name, payload)
}

export function hasAnyCollaboration() {
  return hasAnyMySqlCollaboration()
}
