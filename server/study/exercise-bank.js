/**
 * 题库加载（P3-1 · feat/mobile-v1）
 * 版本化题库：客户端只能读题目（不含答案），答案只留在服务端。
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const bankPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'exercise-bank.json')

let cached = null

export function loadExerciseBank() {
  if (cached) return cached
  const parsed = JSON.parse(fs.readFileSync(bankPath, 'utf8'))
  const exercises = (parsed.exercises || []).filter(item =>
    item && typeof item.id === 'string' && typeof item.prompt === 'string')
  cached = { version: parsed.version || 1, exercises }
  return cached
}

export function findExercise(exerciseId) {
  return loadExerciseBank().exercises.find(item => item.id === exerciseId) || null
}

export function listExercisesForTopic(topicId) {
  return loadExerciseBank().exercises.filter(item => item.topicId === topicId)
}

export function listBankTopics() {
  const topics = new Map()
  for (const item of loadExerciseBank().exercises) {
    if (!topics.has(item.topicId)) topics.set(item.topicId, { topicId: item.topicId, phaseId: item.phaseId, count: 0 })
    topics.get(item.topicId).count += 1
  }
  return [...topics.values()]
}

/** 开发期自检：题库结构完整性（测试用） */
export function validateBank() {
  const { exercises } = loadExerciseBank()
  const problems = []
  const ids = new Set()
  for (const item of exercises) {
    if (ids.has(item.id)) problems.push(`重复题目 id: ${item.id}`)
    ids.add(item.id)
    if (item.type === 'choice') {
      if (!Array.isArray(item.choices) || item.choices.length < 2) problems.push(`${item.id}: 选项不足`)
      if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer >= (item.choices || []).length) {
        problems.push(`${item.id}: 答案下标越界`)
      }
    } else {
      problems.push(`${item.id}: 未知题型 ${item.type}`)
    }
    if (typeof item.explanation !== 'string' || !item.explanation) problems.push(`${item.id}: 缺少解析`)
  }
  return { ok: problems.length === 0, problems, count: exercises.length }
}

// 进程内缓存可按需失效（开发热更新用）
export function invalidateBankCache() {
  cached = null
}
