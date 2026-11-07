/**
 * 学习事件仓库门面（P3-1 · feat/mobile-v1）
 * 按运行模式分发：MySQL 配置可用 → 生产实现（事务+唯一约束）；
 * 否则 → JSON 开发实现（单文件，不宣称多实例事务能力）。
 */
import { isMySqlConfigured } from '../store/mysql.js'
import * as jsonStore from './store.js'
import * as mysqlStore from './store-mysql.js'

export function backendName() {
  return isMySqlConfigured() ? 'mysql' : 'json'
}

function store() {
  return isMySqlConfigured() ? mysqlStore : jsonStore
}

export function createStudySession(accountId, options) {
  return store().createStudySession(accountId, options)
}

export function getStudySession(accountId, sessionId) {
  return store().getStudySession(accountId, sessionId)
}

export function recordAnswer(accountId, sessionId, payload) {
  return store().recordAnswer(accountId, sessionId, payload)
}

export function completeStudySession(accountId, sessionId) {
  return store().completeStudySession(accountId, sessionId)
}

export function getStudyStats(accountId) {
  return store().getStudyStats(accountId)
}

export function saveProfileRevision(accountId, revision) {
  return store().saveProfileRevision(accountId, revision)
}

export function hasRevisionForSession(accountId, sessionId) {
  return store().hasRevisionForSession(accountId, sessionId)
}

export function listProfileRevisions(accountId, limit) {
  return store().listProfileRevisions(accountId, limit)
}

export function listLearningEvents(accountId, limit) {
  return store().listLearningEvents(accountId, limit)
}

export { naturalDay } from './store.js'
export { loadExerciseBank, findExercise, listExercisesForTopic, listBankTopics, validateBank } from './exercise-bank.js'
export { scoreAnswer, summarizeAttempts } from './scoring.js'

/* ———————————— 知识路径（P4-2B-2） ———————————— */

export {
  getLatestKnowledgePath,
  saveKnowledgePathResult,
  regenerateKnowledgePath,
  commitPathUpdateCAS,
  hasPathUpdateForSession,
  ensureKnowledgePathSchema,
} from './knowledge-path-repository.js'

/* ———————————— 聊天与导师历史（P4-2B-3） ———————————— */

export {
  appendChatInteraction,
  getChatHistory,
  appendTutoringHistory,
  getTutoringHistory,
  ensureHistorySchema,
  MAX_MULTIMODAL_BYTES,
} from './history-repository.js'
