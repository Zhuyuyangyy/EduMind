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

export async function ensureHistorySchema() {
  if (historySchemaReady) return
  const { getMySqlPool } = await import('../store/mysql.js')
  const db = getMySqlPool()
  await db.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      seq BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      account_id VARCHAR(191) NOT NULL,
      interaction_id VARCHAR(64) NOT NULL,
      client_message_id VARCHAR(64) NULL,
      role VARCHAR(16) NOT NULL,
      content MEDIUMTEXT NOT NULL,
      time_str VARCHAR(32) NOT NULL,
      resources_json JSON NULL,
      suggestions_json TEXT NULL,
      multimodal_json JSON NULL,
      created_at DATETIME(3) NOT NULL,
      KEY chat_messages_account (account_id, seq),
      UNIQUE KEY chat_messages_idem (account_id, client_message_id),
      CONSTRAINT chat_messages_role CHECK (role IN ('user', 'assistant'))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  // P4-2B-3a 幂等键迁移（既有表补列+补唯一约束，幂等）
  for (const ddl of [
    'ALTER TABLE chat_messages ADD COLUMN client_message_id VARCHAR(64) NULL',
    'ALTER TABLE chat_messages ADD UNIQUE KEY chat_messages_idem (account_id, client_message_id)',
  ]) {
    try {
      await db.query(ddl)
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME' && error?.code !== 'ER_DUP_KEYNAME' && !/Duplicate/i.test(error?.message || '')) throw error
    }
  }
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

/**
 * 多模态体积闸门（两种模式统一）。P4-2B-3a：按 UTF-8 字节数计——
 * 中文 3 字节/emoji 4 字节，按字符串长度计数会把超限内容放行。
 * 超限抛 413 语义错误（index.js 的 catch 按 statusCode 映射）。
 */
function assertMultimodalWithinLimit(multimodalContents) {
  if (!multimodalContents || multimodalContents.length === 0) return
  const serialized = JSON.stringify(multimodalContents)
  const bytes = Buffer.byteLength(serialized, 'utf8')
  if (bytes > MAX_MULTIMODAL_BYTES) {
    throw Object.assign(
      new Error(`多模态内容超过体积上限（${Math.round(bytes / 1024)}KB > ${MAX_MULTIMODAL_BYTES / 1024}KB，按 UTF-8 字节计），已拒绝写入；大对象应迁移至独立对象存储`),
      { statusCode: 413 },
    )
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
 *
 * 幂等键（P4-2B-3a）：调用方传 idempotencyKey 时，(account_id,
 * client_message_id) 唯一约束保证同键重复请求不落库，并返回第一次
 * 的结果（duplicate:true + 首次 reply）。键仅落在 user 行（唯一索引
 * 多 NULL 不冲突）。未传键时行为与旧版一致。
 *
 * @returns {{duplicate:boolean, reply?:object, interactionId?:string}}
 */
export async function appendChatInteraction(accountId, input) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await appendChatInteractionOnce(accountId, input)
    } catch (error) {
      // InnoDB may choose either of two competing inserts as a deadlock victim.
      // The whole transaction has rolled back and its connection was released.
      // Retry persistence only (never call the model again), with a strict bound.
      if (error?.code !== 'ER_LOCK_DEADLOCK' || attempt >= 2) throw error
      await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)))
    }
  }
}

async function appendChatInteractionOnce(accountId, { userMessage, reply, multimodalContents, interactionId, idempotencyKey }) {
  assertMultimodalWithinLimit(multimodalContents)
  const key = idempotencyKey ? String(idempotencyKey).slice(0, 64) : null

  if (!useMysql()) {
    // JSON 开发实现：窗口内幂等识别（data.js 仅保留每账号最近 30 条，
    // 键落在窗口外时不视为重复——重新记录，与 MySQL 的全历史唯一
    // 约束相比是有意的开发态折衷）
    if (key) {
      const existing = jsonGetChatHistory(accountId)
      const hit = existing.find(item => item.role === 'user' && item.clientMessageId === key)
      if (hit) {
        // 同键不同内容 → 409 冲突（与 MySQL 路径同语义）
        if (String(hit.content) !== String(userMessage ?? '')) {
          throw Object.assign(
            new Error(`幂等键冲突：该键已绑定其他消息内容（账号 ${accountId}），拒绝写入`),
            { statusCode: 409 },
          )
        }
        const index = existing.indexOf(hit)
        const assistant = existing.slice(index + 1).find(item => item.role === 'assistant')
        return {
          duplicate: true,
          reply: assistant
            ? { content: assistant.content, resources: assistant.resources ?? [], suggestions: assistant.suggestions ?? [] }
            : { content: hit.content, resources: [], suggestions: [] },
        }
      }
    }
    // data.js 单次 writeStore 承载两条（既有契约不变）
    jsonSaveChatEntry(accountId, userMessage, reply, multimodalContents, key || undefined)
    return {
      duplicate: false,
      reply: { content: String(reply?.content ?? ''), resources: reply?.resources ?? [], suggestions: reply?.suggestions ?? [] },
    }
  }

  await ensureHistorySchema()
  const { getMySqlPool } = await import('../store/mysql.js')
  const db = getMySqlPool()

  // 幂等命中：返回第一次的结果，不落库。
  // userMessage 是请求身份的一部分——同键不同内容说明客户端复用键
  // 错误，明确报 409 冲突（不得静默返回首次结果，否则调用方无法
  // 区分「重试」与「键复用错误」）。reply 内容不参与判定：重试时
  // 模型可能重新生成不同回复，返回首次结果正是幂等语义。
  if (key) {
    const [rows] = await db.query(
      `SELECT interaction_id, content FROM chat_messages WHERE account_id = ? AND client_message_id = ? LIMIT 1`,
      [String(accountId), key],
    )
    if (rows.length > 0) {
      if (String(rows[0].content) !== String(userMessage ?? '')) {
        throw Object.assign(
          new Error(`幂等键冲突：该键已绑定其他消息内容（账号 ${accountId}），拒绝写入`),
          { statusCode: 409 },
        )
      }
      const [assistantRows] = await db.query(
        `SELECT content, resources_json, suggestions_json FROM chat_messages
         WHERE account_id = ? AND interaction_id = ? AND role = 'assistant' LIMIT 1`,
        [String(accountId), rows[0].interaction_id],
      )
      const row = assistantRows[0]
      return {
        duplicate: true,
        reply: row
          ? {
              content: row.content,
              resources: parseJsonColumn(row.resources_json) ?? [],
              suggestions: parseJsonColumn(row.suggestions_json) ?? [],
            }
          : { content: '', resources: [], suggestions: [] },
      }
    }
  }

  const connection = await db.getConnection()
  const interaction = interactionId || randomUUID()
  const timestamp = nowTime()
  try {
    await connection.beginTransaction()
    await connection.query(
      `INSERT INTO chat_messages (account_id, interaction_id, client_message_id, role, content, time_str, multimodal_json, created_at)
       VALUES (?, ?, ?, 'user', ?, ?, CAST(? AS JSON), ?)`,
      [
        String(accountId), interaction, key, String(userMessage ?? ''), timestamp,
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
    return {
      duplicate: false,
      interactionId: interaction,
      reply: { content: String(reply?.content ?? ''), resources: reply?.resources ?? [], suggestions: reply?.suggestions ?? [] },
    }
  } catch (error) {
    await connection.rollback()
    // 并发赢家窗口：两个进程同时通过预检（都查无记录）→ 后者 user 行
    // INSERT 撞 (account_id, client_message_id) 唯一约束。此时不得
    // 抛 500——回滚后重读，按 duplicate 返回首次结果（P4-2B-3b）。
    if (key && error?.code === 'ER_DUP_ENTRY') {
      const [rows] = await db.query(
        `SELECT interaction_id, content FROM chat_messages WHERE account_id = ? AND client_message_id = ? LIMIT 1`,
        [String(accountId), key],
      )
      if (rows.length > 0) {
        if (String(rows[0].content) !== String(userMessage ?? '')) {
          throw Object.assign(
            new Error(`幂等键冲突：该键已绑定其他消息内容（账号 ${accountId}），拒绝写入`),
            { statusCode: 409 },
          )
        }
        const [assistantRows] = await db.query(
          `SELECT content, resources_json, suggestions_json FROM chat_messages
           WHERE account_id = ? AND interaction_id = ? AND role = 'assistant' LIMIT 1`,
          [String(accountId), rows[0].interaction_id],
        )
        const row = assistantRows[0]
        return {
          duplicate: true,
          reply: row
            ? {
                content: row.content,
                resources: parseJsonColumn(row.resources_json) ?? [],
                suggestions: parseJsonColumn(row.suggestions_json) ?? [],
              }
            : { content: '', resources: [], suggestions: [] },
        }
      }
    }
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
