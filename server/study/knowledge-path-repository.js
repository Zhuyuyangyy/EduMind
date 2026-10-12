/**
 * 知识路径仓库（P4-2B-2 · feat/mobile-v1）
 *
 * 权威存储按模式分发：
 * - MySQL（生产）：knowledge_paths 表（account_id 主键 + version +
 *   path_json + updated_at）；knowledge_path_ledger 以 session_id
 *   唯一约束记录已应用的会话（同会话重放不重复推高版本）。
 * - JSON（开发）：data.js 的 knowledgePathByAccount（单文件语义，
 *   不宣称多实例 CAS 能力；CAS 以进程内版本比对近似）。
 *
 * 并发语义（用户指出的覆盖问题）：
 * - commitPathUpdateCAS 要求 expectedVersion 与当前版本一致，否则
 *   返回 { ok:false, code:'version-conflict' }——调用方必须基于
 *   最新路径重新计算，不允许拿旧对象重试。
 * - 同一 sessionId 的重复提交返回 { ok:false,
 *   code:'session-already-applied' }（恢复对账场景的幂等）。
 */

import { isMySqlConfigured } from '../store/mysql.js'
import { getLatestKnowledgePath as jsonGetLatest, saveKnowledgePathResult as jsonSave } from '../data.js'

let mysqlSchemaReady = false

async function ensureKnowledgePathSchema() {
  if (mysqlSchemaReady) return
  const { getMySqlPool } = await import('../store/mysql.js')
  const db = getMySqlPool()
  await db.query(`
    CREATE TABLE IF NOT EXISTS knowledge_paths (
      account_id VARCHAR(191) NOT NULL PRIMARY KEY,
      version INT NOT NULL DEFAULT 1,
      path_json JSON NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      KEY knowledge_paths_updated (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  await db.query(`
    CREATE TABLE IF NOT EXISTS knowledge_path_ledger (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      account_id VARCHAR(191) NOT NULL,
      session_id VARCHAR(191) NOT NULL,
      version INT NOT NULL,
      applied_at DATETIME(3) NOT NULL,
      UNIQUE KEY knowledge_path_ledger_session (account_id, session_id),
      KEY knowledge_path_ledger_account (account_id, applied_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  mysqlSchemaReady = true
}

function useMysql() {
  return isMySqlConfigured()
}

/* ———————————— 读取 ———————————— */

export async function getLatestKnowledgePath(accountId = 'default') {
  if (!useMysql()) {
    const current = jsonGetLatest(accountId)
    // 版本归一化：遗留路径可能没有 version 字段。CAS 与 prepare 必须
    // 使用同一口径（缺省按 1），否则会出现「prepare 基于 1 计算、CAS
    // 按 0 比对」的永久冲突（实测复现）。
    return current ? { ...current, version: Number(current.version) || 1 } : null
  }
  await ensureKnowledgePathSchema()
  const { getMySqlPool } = await import('../store/mysql.js')
  const [rows] = await getMySqlPool().query(
    'SELECT version, path_json, updated_at FROM knowledge_paths WHERE account_id = ?',
    [String(accountId)],
  )
  const row = rows[0]
  if (!row) return null
  const parsed = typeof row.path_json === 'string' ? JSON.parse(row.path_json) : row.path_json
  return { ...parsed, version: Number(row.version) || Number(parsed.version) || 1 }
}

/* ———————————— 直接保存（生成/初始化路径，无 CAS） ———————————— */

export async function saveKnowledgePathResult(accountId = 'default', result) {
  // version 归一化后落库：CAS 口径稳定（缺省 1）
  const normalized = { ...result, version: Number(result?.version) || 1 }
  if (!useMysql()) return jsonSave(accountId, normalized)
  await ensureKnowledgePathSchema()
  const { getMySqlPool } = await import('../store/mysql.js')
  await getMySqlPool().query(
    `INSERT INTO knowledge_paths (account_id, version, path_json, updated_at)
     VALUES (?, ?, CAST(? AS JSON), ?)
     ON DUPLICATE KEY UPDATE version = VALUES(version), path_json = VALUES(path_json), updated_at = VALUES(updated_at)`,
    [String(accountId), normalized.version, JSON.stringify(normalized), new Date(result.updatedAt || Date.now())],
  )
}

/* ———————————— CAS 提交（反馈链路唯一写入口） ———————————— */

/**
 * 版本 CAS 提交。
 * @param expectedVersion 调用方计算所基于的当前版本
 * @param sessionId 学习会话 ID（可选）；提供时以账本保证同会话幂等
 * @returns {{ok:true,version:number} | {ok:false,code:'version-conflict'|'session-already-applied',currentVersion?:number}}
 */
export async function commitPathUpdateCAS(accountId, nextPath, { expectedVersion, sessionId } = {}) {
  const nextVersion = Number(nextPath.version) || 1

  if (!useMysql()) {
    // JSON 开发实现：进程内版本比对（单文件语义，无跨进程 CAS）
    const current = jsonGetLatest(accountId)
    const currentVersion = current ? (Number(current.version) || 1) : 0
    if (currentVersion !== Number(expectedVersion)) {
      return { ok: false, code: 'version-conflict', currentVersion }
    }
    if (sessionId) {
      const ledger = current?.appliedSessions || []
      if (ledger.includes(String(sessionId))) {
        return { ok: false, code: 'session-already-applied', currentVersion }
      }
    }
    const toSave = sessionId
      ? { ...nextPath, appliedSessions: [...(current?.appliedSessions || []), String(sessionId)] }
      : nextPath
    jsonSave(accountId, toSave)
    return { ok: true, version: nextVersion }
  }

  await ensureKnowledgePathSchema()
  const { getMySqlPool } = await import('../store/mysql.js')
  const db = getMySqlPool()
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()

    // 账本优先：同一会话已应用过 → 幂等拒绝（行锁防止并发双查）
    if (sessionId) {
      const [ledgerRows] = await connection.query(
        'SELECT version FROM knowledge_path_ledger WHERE account_id = ? AND session_id = ? FOR UPDATE',
        [String(accountId), String(sessionId)],
      )
      if (ledgerRows.length > 0) {
        await connection.rollback()
        return { ok: false, code: 'session-already-applied', currentVersion: ledgerRows[0].version }
      }
    }

    // 版本 CAS：仅当当前版本与 expectedVersion 一致才更新
    const [result] = await connection.query(
      `UPDATE knowledge_paths SET version = ?, path_json = CAST(? AS JSON), updated_at = ?
       WHERE account_id = ? AND version = ?`,
      [nextVersion, JSON.stringify(nextPath), new Date(), String(accountId), Number(expectedVersion)],
    )
    if (result.affectedRows !== 1) {
      await connection.rollback()
      const [rows] = await connection.query('SELECT version FROM knowledge_paths WHERE account_id = ?', [String(accountId)])
      return { ok: false, code: 'version-conflict', currentVersion: rows[0] ? Number(rows[0].version) : 0 }
    }

    if (sessionId) {
      await connection.query(
        'INSERT INTO knowledge_path_ledger (account_id, session_id, version, applied_at) VALUES (?, ?, ?, ?)',
        [String(accountId), String(sessionId), nextVersion, new Date()],
      )
    }

    await connection.commit()
    return { ok: true, version: nextVersion }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

/** 该会话是否已应用过路径更新（恢复对账用） */
export async function hasPathUpdateForSession(accountId, sessionId) {
  if (!useMysql()) {
    const current = jsonGetLatest(accountId)
    return (current?.appliedSessions || []).includes(String(sessionId))
  }
  await ensureKnowledgePathSchema()
  const { getMySqlPool } = await import('../store/mysql.js')
  const [rows] = await getMySqlPool().query(
    'SELECT 1 FROM knowledge_path_ledger WHERE account_id = ? AND session_id = ?',
    [String(accountId), String(sessionId)],
  )
  return rows.length > 0
}
