/**
 * 聊天与导师历史仓库（P4-2B-3 · feat/mobile-v1）
 *
 * 权威存储按模式分发：
 * - MySQL（生产）：chat_messages / tutoring_history 两张表，按
 *   (account_id, seq) 索引查询（禁全表读后应用层过滤）；聊天交互
 *   （用户消息+助手回复）在单事务内原子写入，共享 interaction_id；
 *   排序用自增 seq（稳定，不受 created_at 毫秒并列影响）
 * - JSON（开发）：委托 data.js 的既有实现（账号映射 + 30/20 限额），
 *   保持旧响应契约（id 为时间戳，无 interactionId 字段）
 *
 * 来源三态（导师历史）：fallback_agents_json 为 NULL=历史未知来源
 * （旧记录，不得补写为模型生成）、'[]'=真实模型生成、非空数组=
 * 规则降级。chat_messages 不承载降级元数据（既有契约不含）。
 *
 * 多模态体积上限：单条 multimodalContents 序列化超过
 * MAX_MULTIMODAL_BYTES 明确拒绝（两种模式统一校验）。大对象未来应
 * 迁独立对象存储（仅存引用），本仓库先行设置体积闸门。
 */

import { isMySqlConfigured } from '../store/mysql.js'
import {
  getChatHistory as jsonGetChatHistory,
  saveChatHistoryEntry as jsonSaveChatEntry,
  getTutoringHistory as jsonGetTutoringHistory,
  saveTutoringHistoryEntry as jsonSaveTutoringEntry,
} from '../data.js'
import { randomUUID } from 'node:crypto'

/** 单条多模态内容序列化上限（512KB）：超出即拒绝，未来迁对象存储 */
export const MAX_MULTIMODAL_BYTES = 512 * 1024

let historySchemaReady = false

async function ensureHistorySchema() {
  if (historySchemaReady) return
  const { getMySqlPool } = await import('../store/mysql.js')
  const db = getMySqlPool()
  await db.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      seq BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      account_id VARCHAR(191) NOT NULL,
      interaction_id VARCHAR(64) NOT NULL,
      role VARCHAR(16) NOT NULL,
      content MEDIUMTEXT NOT NULL,
      time_str VARCHAR(32) NOT NULL,
      resources_json JSON NULL,
      suggestions_json TEXT NULL,
      multimodal_json JSON NULL,
      created_at DATETIME(3) NOT NULL,
      KEY chat_messages_account (account_id, seq),
      CONSTRAINT chat_messages_role CHECK (role IN ('user', 'assistant'))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  await db.query(`
    CREATE TABLE IF NOT EXISTS tutoring_history (
      seq BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      account_id VARCHAR(191) NOT NULL,
      question TEXT NOT NULL,
      answer MEDIUMTEXT NOT NULL,
      mode VARCHAR(32) NOT NULL,
      scenario VARCHAR(32) NOT NULL,
      time_str VARCHAR(32) NOT NULL,
      multimodal_json JSON NULL,
      fallback_agents_json JSON NULL,
      created_at DATETIME(3) NOT NULL,
      KEY tutoring_history_account (account_id, seq)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  historySchemaReady = true
}

function useMysql() {
  return isMySqlConfigured()
}

function nowTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

/** 多模态体积闸门（两种模式统一）：超限抛错，调用方转为 4xx/5xx */
function assertMultimodalWithinLimit(multimodalContents) {
  if (!multimodalContents || multimodalContents.length === 0) return
  const size = JSON.stringify(multimodalContents).length
  if (size > MAX_MULTIMODAL_BYTES) {
    throw new Error(`多模态内容超过体积上限（${Math.round(size / 1024)}KB > ${MAX_MULTIMODAL_BYTES / 1024}KB），已拒绝写入；大对象应迁移至独立对象存储`)
  }
}

function parseJsonColumn(value) {
  if (value == null) return null
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return null }
  }
  return value
}

/* ———————————— 聊天历史 ———————————— */

/**
 * 追加一次聊天交互（用户消息 + 助手回复）。
 * MySQL 模式：单事务原子写入，两条共享 interaction_id；任一行失败
 * 整体回滚（不得只保存用户消息就返回成功）。
 */
export async function appendChatInteraction(accountId, { userMessage, reply, multimodalContents, interactionId }) {
  assertMultimodalWithinLimit(multimodalContents)
  if (!useMysql()) {
    // JSON 开发实现：data.js 单次 writeStore 承载两条（既有契约不变）
    return jsonSaveChatEntry(accountId, userMessage, reply, multimodalContents)
  }
  await ensureHistorySchema()
  const { getMySqlPool } = await import('../store/mysql.js')
  const db = getMySqlPool()
  const connection = await db.getConnection()
  const interaction = interactionId || randomUUID()
  const timestamp = nowTime()
  try {
    await connection.beginTransaction()
    await connection.query(
      `INSERT INTO chat_messages (account_id, interaction_id, role, content, time_str, multimodal_json, created_at)
       VALUES (?, ?, 'user', ?, ?, CAST(? AS JSON), ?)`,
      [
        String(accountId), interaction, String(userMessage ?? ''), timestamp,
        multimodalContents && multimodalContents.length ? JSON.stringify(multimodalContents) : null,
        new Date(),
      ],
    )
    await connection.query(
      `INSERT INTO chat_messages (account_id, interaction_id, role, content, time_str, resources_json, suggestions_json, created_at)
       VALUES (?, ?, 'assistant', ?, ?, CAST(? AS JSON), ?, ?)`,
      [
        String(accountId), interaction, String(reply?.content ?? ''), timestamp,
        JSON.stringify(reply?.resources ?? []),
        JSON.stringify(reply?.suggestions ?? []),
        new Date(),
      ],
    )
    await connection.commit()
    return { interactionId: interaction }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

/** 读取聊天历史（账号索引查询，最近 30 条，chronological 顺序） */
export async function getChatHistory(accountId) {
  if (!useMysql()) return jsonGetChatHistory(accountId)
  await ensureHistorySchema()
  const { getMySqlPool } = await import('../store/mysql.js')
  const [rows] = await getMySqlPool().query(
    `SELECT seq, interaction_id, role, content, time_str, resources_json, suggestions_json, multimodal_json
     FROM chat_messages WHERE account_id = ? ORDER BY seq DESC LIMIT 30`,
    [String(accountId)],
  )
  return rows.reverse().map(row => {
    const item = {
      id: Number(row.seq),
      interactionId: row.interaction_id,
      role: row.role,
      content: row.content,
      time: row.time_str,
    }
    const resources = parseJsonColumn(row.resources_json)
    if (resources != null) item.resources = resources
    const suggestions = parseJsonColumn(row.suggestions_json)
    if (suggestions != null) item.suggestions = suggestions
    const multimodal = parseJsonColumn(row.multimodal_json)
    if (multimodal != null) item.multimodalContents = multimodal
    return item
  })
}

/* ———————————— 导师辅导历史 ———————————— */

/**
 * 追加一条导师辅导记录。
 * fallbackAgents：数组时如实落库（[]=真实模型，非空=规则降级）；
 * 非数组（旧记录/未知来源）落 NULL——不得补写为未经证实的模型生成。
 */
export async function appendTutoringHistory(accountId, { question, answer, mode, scenario, multimodalContents, fallbackAgents }) {
  assertMultimodalWithinLimit(multimodalContents)
  if (!useMysql()) {
    return jsonSaveTutoringEntry(accountId, {
      question, answer, mode, scenario, multimodalContents, fallbackAgents,
    })
  }
  await ensureHistorySchema()
  const { getMySqlPool } = await import('../store/mysql.js')
  await getMySqlPool().query(
    `INSERT INTO tutoring_history (account_id, question, answer, mode, scenario, time_str, multimodal_json, fallback_agents_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?)`,
    [
      String(accountId),
      String(question ?? ''),
      String(answer ?? ''),
      String(mode || 'qa'),
      String(scenario || 'preview'),
      nowTime(),
      multimodalContents && multimodalContents.length ? JSON.stringify(multimodalContents) : null,
      Array.isArray(fallbackAgents) ? JSON.stringify(fallbackAgents) : null,
      new Date(),
    ],
  )
}

/** 读取辅导历史（账号索引查询，最近 20 条，chronological 顺序） */
export async function getTutoringHistory(accountId) {
  if (!useMysql()) return jsonGetTutoringHistory(accountId)
  await ensureHistorySchema()
  const { getMySqlPool } = await import('../store/mysql.js')
  const [rows] = await getMySqlPool().query(
    `SELECT question, answer, mode, scenario, time_str, multimodal_json, fallback_agents_json
     FROM tutoring_history WHERE account_id = ? ORDER BY seq DESC LIMIT 20`,
    [String(accountId)],
  )
  return rows.reverse().map(row => {
    const item = {
      q: row.question,
      a: row.answer,
      time: row.time_str,
      mode: row.mode,
      scenario: row.scenario,
    }
    const multimodal = parseJsonColumn(row.multimodal_json)
    if (multimodal != null) item.multimodalContents = multimodal
    // 三态区分：NULL=未知来源（不带字段）；'[]'=真实模型；非空=降级
    const fallback = parseJsonColumn(row.fallback_agents_json)
    if (fallback != null) item.fallbackAgents = fallback
    return item
  })
}
