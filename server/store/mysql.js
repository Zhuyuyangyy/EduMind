import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

let pool
let schemaReady

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function isMySqlConfigured() {
  return Boolean(process.env.MYSQL_URL || (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE))
}

export function getStorageBackend() {
  return isMySqlConfigured() ? 'mysql' : 'json'
}

function fallbackPath() {
  return process.env.ZHIXUE_DATA_FILE || path.join(__dirname, '..', 'store.json')
}

function emptyFallbackStore() {
  return {
    profiles: {},
    accountSettings: {},
    agentCollaboration: {},
    learningCycles: [],
  }
}

function readFallbackStore() {
  const filePath = fallbackPath()
  if (!fs.existsSync(filePath)) return emptyFallbackStore()
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  return { ...emptyFallbackStore(), ...parsed }
}

function writeFallbackStore(store) {
  const filePath = fallbackPath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(temporaryPath, JSON.stringify(store, null, 2), 'utf8')
  fs.renameSync(temporaryPath, filePath)
}

function parseJsonColumn(value) {
  return typeof value === 'string' ? JSON.parse(value) : value
}

function getConfig() {
  if (process.env.MYSQL_URL) return process.env.MYSQL_URL

  const host = process.env.MYSQL_HOST
  const user = process.env.MYSQL_USER
  const database = process.env.MYSQL_DATABASE
  if (!host || !user || !database) {
    throw new Error('MySQL is not configured. Set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD and MYSQL_DATABASE.')
  }

  return {
    host,
    port: Number(process.env.MYSQL_PORT || 3306),
    user,
    password: process.env.MYSQL_PASSWORD || '',
    database,
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_POOL_SIZE || 10),
    charset: 'utf8mb4',
  }
}

export function getMySqlPool() {
  if (!pool) pool = mysql.createPool(getConfig())
  return pool
}

/** 关闭连接池（测试/优雅退出用；生产由进程退出处理） */
export async function closeMySqlPool() {
  if (pool) {
    const current = pool
    pool = undefined
    schemaReady = false
    await current.end()
  }
}

export async function ensureMySqlSchema() {
  if (!isMySqlConfigured()) return false
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getMySqlPool()
      await db.query(`
        CREATE TABLE IF NOT EXISTS profile_results (
          account_id VARCHAR(191) NOT NULL PRIMARY KEY,
          profile_json JSON NOT NULL,
          saved_at DATETIME(3) NOT NULL,
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
            ON UPDATE CURRENT_TIMESTAMP(3)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `)
      await db.query(`
        CREATE TABLE IF NOT EXISTS account_settings (
          account_id VARCHAR(191) NOT NULL PRIMARY KEY,
          display_name VARCHAR(64) NOT NULL,
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
            ON UPDATE CURRENT_TIMESTAMP(3)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `)
      await db.query(`
        CREATE TABLE IF NOT EXISTS learner_onboarding (
          account_id VARCHAR(191) NOT NULL PRIMARY KEY,
          payload_json JSON NOT NULL,
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `)
      await db.query(`
        CREATE TABLE IF NOT EXISTS agent_collaboration (
          day_of_week TINYINT UNSIGNED NOT NULL PRIMARY KEY,
          day_name VARCHAR(32) NOT NULL,
          date_string DATE NULL,
          total_agents INT NOT NULL DEFAULT 0,
          total_events INT NOT NULL DEFAULT 0,
          total_chains INT NOT NULL DEFAULT 0,
          chains_json JSON NOT NULL,
          agents_json JSON NOT NULL,
          events_json JSON NOT NULL,
          modules_json JSON NOT NULL,
          created_at DATETIME(3) NOT NULL,
          updated_at DATETIME(3) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `)
      await db.query(`
        CREATE TABLE IF NOT EXISTS learning_cycles (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          account_id VARCHAR(191) NOT NULL,
          workflow_id VARCHAR(64) NOT NULL,
          profile_json JSON NOT NULL,
          resource_json JSON NOT NULL,
          tutoring_json JSON NOT NULL,
          evaluation_json JSON NOT NULL,
          path_json JSON NOT NULL,
          reflection_json JSON NOT NULL,
          trace_json JSON NOT NULL,
          created_at DATETIME(3) NOT NULL,
          profile_before_json JSON NULL,
          profile_changes_json JSON NULL,
          evidence VARCHAR(64) NULL,
          UNIQUE KEY learning_cycles_workflow_id (workflow_id),
          KEY learning_cycles_account_created_at (account_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `)
      // P3-0 迁移：为既有表补齐证据保真列（幂等，忽略已存在的列）
      const cycleAlterColumns = [
        ['profile_before_json', 'JSON NULL'],
        ['profile_changes_json', 'JSON NULL'],
        ['evidence', 'VARCHAR(64) NULL'],
      ]
      for (const [column, definition] of cycleAlterColumns) {
        try {
          await db.query(`ALTER TABLE learning_cycles ADD COLUMN ${column} ${definition}`)
        } catch (error) {
          // 1060 = Duplicate column name，属预期；其他错误直接抛出
          if (error?.code !== 'ER_DUP_FIELDNAME' && !/Duplicate column/i.test(error?.message || '')) throw error
        }
      }
    })().catch(error => {
      schemaReady = undefined
      throw error
    })
  }
  return schemaReady
}

export async function getProfileResult(accountId = 'default') {
  if (!isMySqlConfigured()) {
    return readFallbackStore().profiles[accountId] || null
  }
  await ensureMySqlSchema()
  const [rows] = await getMySqlPool().query(
    'SELECT profile_json FROM profile_results WHERE account_id = ?',
    [accountId],
  )
  const value = rows[0]?.profile_json
  return value == null ? null : parseJsonColumn(value)
}

export async function saveProfileResult(accountId = 'default', profile) {
  if (!isMySqlConfigured()) {
    const store = readFallbackStore()
    const savedAt = profile.savedAt || new Date().toISOString()
    const normalized = { ...profile, savedAt, accountId }
    store.profiles[accountId] = normalized
    writeFallbackStore(store)
    return normalized
  }
  await ensureMySqlSchema()
  const savedAt = profile.savedAt || new Date().toISOString()
  const normalized = { ...profile, savedAt, accountId }
  await getMySqlPool().query(
    `INSERT INTO profile_results (account_id, profile_json, saved_at)
     VALUES (?, CAST(? AS JSON), ?)
     ON DUPLICATE KEY UPDATE profile_json = VALUES(profile_json), saved_at = VALUES(saved_at)`,
    // P4-0：传 Date 对象（时区由驱动处理）；剥 T/Z 的字符串会被本地时区重新解释
    [accountId, JSON.stringify(normalized), new Date(savedAt)],
  )
  return normalized
}

export async function getAccountSettings(accountId = 'default') {
  if (!isMySqlConfigured()) {
    return readFallbackStore().accountSettings[accountId] || null
  }
  await ensureMySqlSchema()
  const [rows] = await getMySqlPool().query(
    'SELECT account_id, display_name, updated_at FROM account_settings WHERE account_id = ?',
    [accountId],
  )
  const row = rows[0]
  return row ? {
    accountId: row.account_id,
    displayName: row.display_name,
    updatedAt: row.updated_at,
  } : null
}

export async function getLearnerOnboarding(accountId) {
  if (!isMySqlConfigured()) return readFallbackStore().learnerOnboarding?.[accountId] || null
  await ensureMySqlSchema()
  const [rows] = await getMySqlPool().query('SELECT payload_json FROM learner_onboarding WHERE account_id = ?', [accountId])
  return rows[0] ? parseJsonColumn(rows[0].payload_json) : null
}

export async function saveLearnerOnboarding(accountId, payload) {
  if (!isMySqlConfigured()) {
    const store = readFallbackStore()
    store.learnerOnboarding = { ...store.learnerOnboarding, [accountId]: payload }
    writeFallbackStore(store)
  } else {
    await ensureMySqlSchema()
    await getMySqlPool().query('INSERT INTO learner_onboarding (account_id, payload_json) VALUES (?, ?) ON DUPLICATE KEY UPDATE payload_json = VALUES(payload_json)', [accountId, JSON.stringify(payload)])
  }
  return payload
}

export async function saveAccountSettings(accountId = 'default', { displayName }) {
  const name = String(displayName || '').trim()
  if (!name || name.length > 64) {
    throw new Error('Display name must contain 1 to 64 characters.')
  }
  if (!isMySqlConfigured()) {
    const store = readFallbackStore()
    const result = { accountId, displayName: name, updatedAt: new Date().toISOString() }
    store.accountSettings[accountId] = result
    writeFallbackStore(store)
    return result
  }
  await ensureMySqlSchema()
  await getMySqlPool().query(
    `INSERT INTO account_settings (account_id, display_name)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)`,
    [accountId, name],
  )
  return getAccountSettings(accountId)
}

export async function getCollaborationByDayIndex(index) {
  if (!isMySqlConfigured()) {
    return readFallbackStore().agentCollaboration[index] || null
  }
  await ensureMySqlSchema()
  const [rows] = await getMySqlPool().query(
    'SELECT * FROM agent_collaboration WHERE day_of_week = ?',
    [index],
  )
  const row = rows[0]
  if (!row) return null
  return {
    dayOfWeek: row.day_of_week,
    dayName: row.day_name,
    dateString: row.date_string,
    totalAgents: row.total_agents,
    totalEvents: row.total_events,
    totalChains: row.total_chains,
    chains: parseJsonColumn(row.chains_json),
    agents: parseJsonColumn(row.agents_json),
    events: parseJsonColumn(row.events_json),
    modules: parseJsonColumn(row.modules_json),
    updatedAt: row.updated_at,
  }
}

export async function saveCollaborationByDayIndex(index, name, payload) {
  if (!isMySqlConfigured()) {
    const store = readFallbackStore()
    const now = new Date().toISOString()
    const normalized = {
      ...payload,
      dayOfWeek: index,
      dayName: name,
      dateString: payload.dateString || now.slice(0, 10),
      updatedAt: now,
    }
    store.agentCollaboration[index] = normalized
    writeFallbackStore(store)
    return normalized
  }
  await ensureMySqlSchema()
  const now = new Date()
  const dateString = payload.dateString || now.toISOString().slice(0, 10)
  await getMySqlPool().query(
    `INSERT INTO agent_collaboration (
       day_of_week, day_name, date_string, total_agents, total_events, total_chains,
       chains_json, agents_json, events_json, modules_json, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), ?, ?)
     ON DUPLICATE KEY UPDATE
       day_name = VALUES(day_name), date_string = VALUES(date_string),
       total_agents = VALUES(total_agents), total_events = VALUES(total_events),
       total_chains = VALUES(total_chains), chains_json = VALUES(chains_json),
       agents_json = VALUES(agents_json), events_json = VALUES(events_json),
       modules_json = VALUES(modules_json), updated_at = VALUES(updated_at)`,
    [
      index,
      name,
      dateString,
      payload.totalAgents ?? 12,
      payload.totalEvents ?? payload.events?.length ?? 0,
      payload.totalChains ?? payload.chains?.length ?? 6,
      JSON.stringify(payload.chains || []),
      JSON.stringify(payload.agents || []),
      JSON.stringify(payload.events || []),
      JSON.stringify(payload.modules || []),
      now,
      now,
    ],
  )
  return getCollaborationByDayIndex(index)
}

export async function hasAnyCollaboration() {
  if (!isMySqlConfigured()) {
    return Object.keys(readFallbackStore().agentCollaboration).length > 0
  }
  await ensureMySqlSchema()
  const [rows] = await getMySqlPool().query('SELECT COUNT(*) AS count FROM agent_collaboration')
  return Number(rows[0]?.count || 0) > 0
}

export async function saveLearningCycle(accountId = 'default', cycle) {
  if (!isMySqlConfigured()) {
    const store = readFallbackStore()
    const normalized = {
      ...cycle,
      accountId,
      createdAt: new Date().toISOString(),
    }
    store.learningCycles = [...store.learningCycles.filter(item => item.workflowId !== cycle.workflowId), normalized].slice(-200)
    writeFallbackStore(store)
    return { workflowId: cycle.workflowId, accountId, createdAt: normalized.createdAt }
  }
  await ensureMySqlSchema()
  const createdAt = new Date()
  await getMySqlPool().query(
    `INSERT INTO learning_cycles (
       account_id, workflow_id, profile_json, resource_json, tutoring_json,
       evaluation_json, path_json, reflection_json, trace_json, created_at,
       profile_before_json, profile_changes_json, evidence
     ) VALUES (?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), ?, CAST(? AS JSON), CAST(? AS JSON), ?)`,
    [
      accountId,
      cycle.workflowId,
      JSON.stringify(cycle.profile || {}),
      JSON.stringify(cycle.resourcePackage || {}),
      JSON.stringify({ answer: cycle.tutoringAnswer || '' }),
      JSON.stringify(cycle.evaluation || {}),
      JSON.stringify(cycle.path || {}),
      JSON.stringify(cycle.reflection || {}),
      JSON.stringify(cycle.trace || {}),
      createdAt,
      // P3-0 证据保真：画像前后快照与变化原因真实持久化（不再读取时补 null）
      JSON.stringify(cycle.profileBefore || null),
      JSON.stringify(Array.isArray(cycle.profileChanges) ? cycle.profileChanges : []),
      typeof cycle.evidence === 'string' ? cycle.evidence : null,
    ],
  )
  return { workflowId: cycle.workflowId, accountId, createdAt: createdAt.toISOString() }
}

/**
 * 学习闭环统一响应契约（P2-2A）。
 * JSON 存储返回原始保存对象（含 profileBefore/profileChanges/agentResults），
 * MySQL 存储按列重组（含 resourcePackage/tutoring）——两者字段集不同，
 * 客户端无法用一套类型安全消费。这里归一为同一组键：
 * 缺失的可选字段补 null / 空数组，绝不伪造数据。
 */
export function normalizeLearningCycle(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    workflowId: raw.workflowId ?? null,
    accountId: raw.accountId ?? null,
    createdAt: raw.createdAt ?? null,
    // 证据标记：'unverified-client-input' = 旧演示闭环（未核验）；
    // P3-1 起真实闭环带评分事件 ID 列表
    evidence: typeof raw.evidence === 'string' ? raw.evidence : null,
    // 画像（更新后）与更新痕迹
    profile: raw.profile ?? null,
    profileBefore: raw.profileBefore ?? null,
    profileChanges: Array.isArray(raw.profileChanges) ? raw.profileChanges : [],
    // 各智能体产物
    resourcePackage: raw.resourcePackage ?? null,
    tutoring: raw.tutoring ?? null,
    evaluation: raw.evaluation ?? null,
    path: raw.path ?? null,
    reflection: raw.reflection ?? null,
    // 溯源
    trace: raw.trace ?? null,
    agentResults: Array.isArray(raw.agentResults) ? raw.agentResults : [],
  }
}

export async function getLatestLearningCycle(accountId = 'default') {
  if (!isMySqlConfigured()) {
    const cycles = readFallbackStore().learningCycles.filter(item => item.accountId === accountId)
    return normalizeLearningCycle(cycles.at(-1) || null)
  }
  await ensureMySqlSchema()
  const [rows] = await getMySqlPool().query(
    `SELECT * FROM learning_cycles
     WHERE account_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [accountId],
  )
  const row = rows[0]
  if (!row) return null
  return normalizeLearningCycle({
    workflowId: row.workflow_id,
    accountId: row.account_id,
    profile: parseJsonColumn(row.profile_json),
    resourcePackage: parseJsonColumn(row.resource_json),
    tutoring: parseJsonColumn(row.tutoring_json),
    evaluation: parseJsonColumn(row.evaluation_json),
    path: parseJsonColumn(row.path_json),
    reflection: parseJsonColumn(row.reflection_json),
    trace: parseJsonColumn(row.trace_json),
    // P3-0：证据列真实读取（旧行为是读取时补 null/[]，无法重放历史）
    profileBefore: parseJsonColumn(row.profile_before_json),
    profileChanges: parseJsonColumn(row.profile_changes_json) || [],
    evidence: row.evidence,
    createdAt: row.created_at,
  })
}

export async function getLearningCycleHistory(accountId = 'default', limit = 5) {
  const safeLimit = Math.max(1, Math.min(20, Number(limit) || 5))
  if (!isMySqlConfigured()) {
    return readFallbackStore().learningCycles
      .filter(item => item.accountId === accountId)
      .slice(-safeLimit)
  }
  await ensureMySqlSchema()
  const [rows] = await getMySqlPool().query(
    `SELECT * FROM learning_cycles
     WHERE account_id = ?
     ORDER BY created_at DESC
     LIMIT ${safeLimit}`,
    [accountId],
  )
  return rows.reverse().map(row => ({
    workflowId: row.workflow_id,
    accountId: row.account_id,
    profile: parseJsonColumn(row.profile_json),
    resourcePackage: parseJsonColumn(row.resource_json),
    tutoring: parseJsonColumn(row.tutoring_json),
    evaluation: parseJsonColumn(row.evaluation_json),
    path: parseJsonColumn(row.path_json),
    reflection: parseJsonColumn(row.reflection_json),
    trace: parseJsonColumn(row.trace_json),
    createdAt: row.created_at,
  }))
}
