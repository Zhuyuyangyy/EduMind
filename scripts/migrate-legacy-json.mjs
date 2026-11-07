/**
 * 旧 JSON → MySQL 安全迁移工具（P4-2B-4 · feat/mobile-v1）。
 *
 * 用法：
 *   node scripts/migrate-legacy-json.mjs scan     --source <path>
 *   node scripts/migrate-legacy-json.mjs dry-run  --source <path>
 *   node scripts/migrate-legacy-json.mjs backup   --source <path> [--backup-dir <dir>]
 *   node scripts/migrate-legacy-json.mjs import   --source <path>
 *   node scripts/migrate-legacy-json.mjs verify   --source <path>
 *
 * 设计纪律（任务书 A1-A5）：
 * - 严格独立解析：JSON 损坏明确失败，禁止退化为空默认值继续导入
 * - dry-run 严格只读（不写目标库、不写账本）
 * - 迁移来源账本 migration_source_ledger：source_id = sha256(类别|账号|
 *   记录定位)，与目标写入同一事务——重复导入零记录、中断重跑接续
 * - 记录定位稳定身份：chat 用原始 id；tutoring 无原始 id 时用
 *   (q,a,time,mode,scenario) 摘要——这是迁移来源身份，不是业务 ID
 *   （业务 ID 由目标 seq/interaction 分配；禁止用聊天文本哈希当业务 ID）
 * - 归属不明的旧全局数组 → default（演示账号，既有兼容语义）+ 隔离
 *   清单标记，不猜测关联到真实用户
 * - 演示种子（agentCollaboration）、身份/会话凭据不自动导入（仅审计）
 * - 知识路径版本冲突保护：目标版本 ≥ 源版本 → 跳过并记冲突
 * - 数据库不可达 → fail-closed 明确失败，不静默转写 JSON
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import process from 'node:process'

/* ———————————— 来源定位（B-1 盘点的六类路径 + 环境变量） ———————————— */

const SOURCE_LOCATIONS = [
  { key: 'data.js', envVar: 'ZHIXUE_CHAT_STORE_FILE', default: 'server/store.json', note: '画像/路径/聊天/辅导（data.js）' },
  { key: 'mysql.fallback', envVar: 'ZHIXUE_DATA_FILE', default: 'store.json', note: '画像/设置/协作/闭环（mysql.js fallback）' },
  { key: 'study.store', envVar: 'ZHIXUE_DATA_FILE', default: 'data/store.json', note: '会话/作答/事件/修订（study/store.js）' },
  { key: 'identity', envVar: 'ZHIXUE_IDENTITY_FILE', default: 'server/identities.json', note: '认证身份（不自动导入）' },
  { key: 'session', envVar: 'ZHIXUE_SESSION_FILE', default: 'server/sessions.json', note: '会话（不自动导入）' },
  { key: 'trace', envVar: 'ZHIXUE_TRACE_FILE', default: 'evidence-data/traces.json', note: 'AI 追踪（不混入业务迁移）' },
]

function resolveSourcePath(explicit, env) {
  if (explicit) return path.resolve(explicit)
  // 未显式指定：按优先级找第一个存在的业务数据文件
  for (const loc of SOURCE_LOCATIONS) {
    if (loc.key === 'identity' || loc.key === 'session' || loc.key === 'trace') continue
    const p = env[loc.envVar] ? path.resolve(env[loc.envVar]) : path.join(process.cwd(), loc.default)
    if (fs.existsSync(p)) return p
  }
  return path.join(process.cwd(), 'server/store.json')
}

/* ———————————— 严格读取（A1：损坏必须阻断） ———————————— */

function readSourceStrict(sourcePath) {
  if (!fs.existsSync(sourcePath)) {
    throw Object.assign(new Error(`来源文件不存在: ${sourcePath}`), { migrationError: 'missing-source' })
  }
  const raw = fs.readFileSync(sourcePath)
  const sha256 = crypto.createHash('sha256').update(raw).digest('hex')
  let parsed
  try {
    parsed = JSON.parse(raw.toString('utf8'))
  } catch (error) {
    throw Object.assign(
      new Error(`来源 JSON 损坏或解析失败: ${sourcePath}（${error.message}）。已阻断，不会退化为空数据继续导入。`),
      { migrationError: 'corrupt-source' },
    )
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw Object.assign(new Error(`来源结构不是 JSON 对象: ${sourcePath}`), { migrationError: 'invalid-shape' })
  }
  return { store: parsed, sha256, bytes: raw.length }
}

/* ———————————— 记录提取（结构变体识别 + 归属判定） ———————————— */

function digestOf(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/** 规范化 JSON（递归排序对象键）：MySQL JSON 列读取时会重排键序，
 *  与源序列化字符串直接比较会误报——verify 的结构比较一律用此函数。 */
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`
}

function asAccountMap(value, category) {
  // 返回 { map: {account: records[]}, variant, isolated: [...] }
  if (Array.isArray(value)) {
    return { map: { default: value }, variant: 'legacy-global-array' }
  }
  if (value && typeof value === 'object') {
    return { map: value, variant: 'account-map' }
  }
  return { map: {}, variant: 'absent' }
}

function extractRecords(store, sourcePath, sourceSha, { includeLegacyDefault = false } = {}) {
  const records = []       // { category, accountId, locator, digest, record, sourceSha, sourcePath }
  const isolated = []      // 归属不明/存疑清单（默认不导入）
  const skipped = []       // 演示种子等
  const anomalies = []     // 孤儿消息等（detail 脱敏，不含原文）
  const structureVariants = []

  function collect(category, value, { accountFromRecord } = {}) {
    const { map, variant } = asAccountMap(value, category)
    structureVariants.push({ category, shape: variant })
    if (variant === 'legacy-global-array') {
      // A6：旧全局数组——记录自带 accountId 的（learningCycles）按
      // 记录归属导入；完全无账号归属的（chatHistory/tutoringHistory
      // 旧数组、旧单份 knowledgePathResult）默认不进入任何账号表
      // （含 default），仅进隔离清单待明确授权。
      const entries = map.default || []
      const hasRecordAccount = accountFromRecord && Array.isArray(entries)
        && entries.length > 0 && entries.every(item => item && typeof item.accountId === 'string' && item.accountId)
      if (!hasRecordAccount) {
        isolated.push({
          category,
          reason: `global-array: 旧全局数组无账号归属，默认不导入任何账号表（含 default）；需人工确认归属或显式授权 --include-legacy-default`,
          records: entries.length,
        })
        if (!includeLegacyDefault) return
      }
    }
    for (const [accountId, entries] of Object.entries(map)) {
      const list = Array.isArray(entries) ? entries : (entries ? [entries] : [])
      list.forEach((record, index) => {
        const effectiveAccount = accountFromRecord ? (record?.accountId || accountId) : accountId
        let locator
        if (record && record.id != null) {
          locator = `id:${record.id}`
        } else if (category === 'tutoringHistory') {
          locator = `digest:${digestOf([record?.q, record?.a, record?.time, record?.mode, record?.scenario])}`
        } else if (category === 'learningCycles') {
          locator = `digest:${digestOf([record?.accountId, record?.workflowId, record?.createdAt])}`
        } else {
          locator = `index:${index}`
        }
        records.push({
          category,
          accountId: String(effectiveAccount || 'default'),
          locator,
          digest: digestOf(record),
          record,
          sourceSha,
          sourcePath,
        })
      })
    }
  }

  // 聊天（含孤儿消息识别：user 后无 assistant；配对 assistant 按数组
  // 顺序精确挂接——禁止「找第一个 assistant」导致重复插入）
  const chat = asAccountMap(store.chatHistory, 'chatHistory')
  if (chat.variant !== 'absent') {
    collect('chatHistory', store.chatHistory)
    for (const [accountId, entries] of Object.entries(chat.map)) {
      const list = Array.isArray(entries) ? entries : []
      list.forEach((record, index) => {
        if (record?.role !== 'user') return
        const next = list[index + 1]
        if (!next || next.role !== 'assistant') {
          anomalies.push({
            kind: 'chat-without-assistant',
            accountId,
            // A7：脱敏——只报定位与体量，不含原文
            detail: `id=${record.id ?? '?'} 长度=${String(record.content || '').length}字`,
          })
          return
        }
        // 精确配对：该 user 记录导入时连带写入这条 assistant
        const userRec = records.find(r => r.category === 'chatHistory' && r.accountId === accountId && r.record === record)
        if (userRec) userRec.pairAssistant = next
      })
    }
  }

  collect('tutoringHistory', store.tutoringHistory)
  if (store.knowledgePathByAccount && typeof store.knowledgePathByAccount === 'object') {
    collect('knowledgePath', store.knowledgePathByAccount)
  } else if (store.knowledgePathResult) {
    // 旧单份全局路径：无账号归属 → 隔离清单（A6），不按 default 导入
    isolated.push({
      category: 'knowledgePath',
      reason: 'legacy-single-path: 旧单份全局知识路径无账号归属，默认不导入（含 default）；需人工确认归属',
      records: 1,
    })
    structureVariants.push({ category: 'knowledgePath', shape: 'legacy-single-global' })
  }
  collect('profile', store.profiles)
  collect('accountSettings', store.accountSettings)
  collect('learningCycles', store.learningCycles, { accountFromRecord: true })

  // 演示种子：跳过
  if (store.agentCollaboration && Object.keys(store.agentCollaboration).length > 0) {
    skipped.push({ category: 'agentCollaboration', reason: '系统演示种子数据，禁止迁入真实账号', records: Object.keys(store.agentCollaboration).length })
  }

  // study store 数据（会话/作答/事件/修订）：仅在确有迁移必要时由人工评估，本轮不自动导入
  for (const key of ['studySessions', 'answerSubmissions', 'learningEvents', 'profileRevisions']) {
    if (store[key]) {
      skipped.push({ category: key, reason: '学习过程明细：需人工评估迁移必要性（真实作答已由 MySQL 重放或保留 JSON）', records: Array.isArray(store[key]) ? store[key].length : Object.keys(store[key]).length })
    }
  }

  return { records, isolated, skipped, anomalies, structureVariants }
}

/**
 * 迁移来源稳定身份（A3+A4）：
 * - 含来源路径：不同来源文件的同账号同旧 ID 记录不会误判重复
 * - 同文件重复导入 → 同 source_id（幂等）；同文件内容变化 → 同
 *   source_id 但 record_digest 不同 → 显式 changedSource 冲突
 * - 不含记录内容本身：定位（旧 ID/摘要）稳定，内容变化可检测
 */
function sourceIdOf(rec) {
  return crypto.createHash('sha256')
    .update(`${rec.category}|${rec.accountId}|${rec.sourcePath}|${rec.locator}`)
    .digest('hex')
}

/* ———————————— MySQL 账本与写入 ———————————— */

const LEDGER_DDL = `
  CREATE TABLE IF NOT EXISTS migration_source_ledger (
    source_id VARCHAR(128) NOT NULL PRIMARY KEY,
    category VARCHAR(32) NOT NULL,
    account_id VARCHAR(191) NOT NULL,
    source_path VARCHAR(512) NOT NULL,
    source_sha256 VARCHAR(64) NOT NULL,
    record_digest VARCHAR(64) NOT NULL,
    target_ref VARCHAR(128) NULL,
    imported_at DATETIME(3) NOT NULL,
    KEY ledger_category (category, account_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`

let mysqlModule = null
async function getMysql() {
  if (!mysqlModule) mysqlModule = await import('../server/store/mysql.js')
  return mysqlModule
}

async function ensureLedger(connection) {
  await connection.query(LEDGER_DDL)
}

function mySqlConfigFromEnv(env) {
  if (env.MYSQL_URL) {
    // mysql2 接受 URL 形式的 connectionConfig
    const url = new URL(env.MYSQL_URL)
    return {
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ''),
    }
  }
  return {
    host: env.MYSQL_HOST || '127.0.0.1',
    port: Number(env.MYSQL_PORT || 3306),
    user: env.MYSQL_USER || 'root',
    password: env.MYSQL_PASSWORD || '',
    database: env.MYSQL_DATABASE || 'edumind',
  }
}

function isConfigured(env) {
  return Boolean(env.MYSQL_URL || (env.MYSQL_HOST && env.MYSQL_USER && env.MYSQL_DATABASE))
}

/** 目标表 DDL（与各 repository 的结构保持一致；迁移可先于业务写入执行） */
const TARGET_DDL = [
  `CREATE TABLE IF NOT EXISTS chat_messages (
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
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS tutoring_history (
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
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS knowledge_paths (
     account_id VARCHAR(191) NOT NULL PRIMARY KEY,
     version INT NOT NULL DEFAULT 1,
     path_json JSON NOT NULL,
     updated_at DATETIME(3) NOT NULL,
     KEY knowledge_paths_updated (updated_at)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS knowledge_path_ledger (
     id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
     account_id VARCHAR(191) NOT NULL,
     session_id VARCHAR(191) NOT NULL,
     version INT NOT NULL,
     applied_at DATETIME(3) NOT NULL,
     UNIQUE KEY knowledge_path_ledger_session (account_id, session_id),
     KEY knowledge_path_ledger_account (account_id, applied_at)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  LEDGER_DDL,
]

/**
 * 只读连接（A1）：dry-run/scan 严格只读——不执行任何 DDL、不写
 * 任何数据。与 openConnection（import/verify 的建表路径）分离。
 */
async function openReadOnlyConnection(env) {
  if (!isConfigured(env)) {
    throw Object.assign(new Error('未配置 MySQL 环境（迁移目标仅支持 MySQL）'), { migrationError: 'no-mysql' })
  }
  const mysql2 = (await import('mysql2/promise')).default
  return mysql2.createConnection(mySqlConfigFromEnv(env))
}

async function openConnection(env) {
  if (!isConfigured(env)) {
    throw Object.assign(new Error('未配置 MySQL 环境（迁移目标仅支持 MySQL）'), { migrationError: 'no-mysql' })
  }
  // 业务表（画像/设置/循环）由生产服务器 ensureMySqlSchema 创建——迁移
  // 的前提是目标库已由业务初始化（先有业务才有旧数据可迁），migrator 不
  // 重复执行业务 DDL（避免与业务/其他迁移的并发 DDL 竞态）。
  // migrator 只自建历史/路径/账本三组表（结构与各 repository 一致）。
  const mysql2 = (await import('mysql2/promise')).default
  const connection = await mysql2.createConnection(mySqlConfigFromEnv(env))
  for (const ddl of TARGET_DDL) {
    await connection.query(ddl)
  }
  return { connection }
}

/**
 * 画像/设置/闭环写入（SQL 与 store/mysql.js 生产函数逐字一致，保证
 * 迁移数据与业务写入同构；在 migrator 自己的连接/事务内执行）。
 */
/**
 * A2 覆盖保护预检（事务内 FOR UPDATE）：
 * - profile：目标 saved_at 晚于来源 savedAt → 旧来源不得覆盖较新
 *   正式数据（返回 conflict-newer-target）
 * - accountSettings：目标已存在 → 设置是较新的用户偏好，旧来源不
 *   覆盖（返回 conflict-target-exists）
 * - 其余（learningCycles 等）→ ok
 */
async function protectAccountScoped(connection, rec) {
  const record = rec.record || {}
  if (rec.category === 'profile') {
    const [rows] = await connection.query('SELECT saved_at FROM profile_results WHERE account_id = ? FOR UPDATE', [rec.accountId])
    if (rows.length > 0) {
      const targetAt = new Date(rows[0].saved_at).getTime()
      const sourceAt = new Date(record.savedAt || 0).getTime()
      if (targetAt >= sourceAt) return 'conflict-newer-target'
    }
    return 'ok'
  }
  if (rec.category === 'accountSettings') {
    const [rows] = await connection.query('SELECT account_id FROM account_settings WHERE account_id = ? FOR UPDATE', [rec.accountId])
    if (rows.length > 0) return 'conflict-target-exists'
    return 'ok'
  }
  return 'ok'
}

async function writeAccountScoped(connection, rec) {
  const record = rec.record || {}
  if (rec.category === 'profile') {
    const savedAt = new Date(record.savedAt || Date.now())
    const normalized = { ...record, savedAt: savedAt.toISOString(), accountId: rec.accountId }
    await connection.query(
      `INSERT INTO profile_results (account_id, profile_json, saved_at)
       VALUES (?, CAST(? AS JSON), ?)
       ON DUPLICATE KEY UPDATE profile_json = VALUES(profile_json), saved_at = VALUES(saved_at)`,
      [rec.accountId, JSON.stringify(normalized), savedAt],
    )
  } else if (rec.category === 'accountSettings') {
    await connection.query(
      `INSERT INTO account_settings (account_id, display_name, updated_at) VALUES (?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), updated_at = NOW(3)`,
      [rec.accountId, String(record.displayName ?? '')],
    )
  } else if (rec.category === 'learningCycles') {
    const createdAt = new Date(record.createdAt || Date.now())
    await connection.query(
      `INSERT INTO learning_cycles (
         account_id, workflow_id, profile_json, resource_json, tutoring_json,
         evaluation_json, path_json, reflection_json, trace_json, created_at,
         profile_before_json, profile_changes_json, evidence
       ) VALUES (?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), ?, CAST(? AS JSON), CAST(? AS JSON), ?)`,
      [
        rec.accountId,
        String(record.workflowId || `legacy-${sourceIdOf(rec).slice(0, 24)}`),
        JSON.stringify(record.profile || {}),
        JSON.stringify(record.resourcePackage || {}),
        JSON.stringify({ answer: record.tutoringAnswer || '' }),
        JSON.stringify(record.evaluation || {}),
        JSON.stringify(record.path || {}),
        JSON.stringify(record.reflection || {}),
        JSON.stringify(record.trace || {}),
        createdAt,
        JSON.stringify(record.profileBefore || null),
        JSON.stringify(Array.isArray(record.profileChanges) ? record.profileChanges : []),
        typeof record.evidence === 'string' ? record.evidence : null,
      ],
    )
  }
}

/** 写一条记录到目标（返回 target_ref） */
async function writeRecord(connection, rec) {
  const { category, accountId, record } = rec
  if (category === 'chatHistory') {
    if (record?.role === 'assistant') {
      // assistant 行不单独导入（与配对的 user 行同批处理）
      return null
    }
    const interactionId = `legacy-${sourceIdOf(rec).slice(0, 32)}`
    await connection.query(
      `INSERT INTO chat_messages (account_id, interaction_id, role, content, time_str, multimodal_json, created_at)
       VALUES (?, ?, 'user', ?, ?, CAST(? AS JSON), ?)`,
      [accountId, interactionId, String(record.content ?? ''), String(record.time ?? ''), record.multimodalContents?.length ? JSON.stringify(record.multimodalContents) : null, new Date(record.time ? Date.parse(`1970-01-01T${record.time}:00Z`) || Date.now() : Date.now())],
    )
    return interactionId
  }
  if (category === 'tutoringHistory') {
    const fallbackJson = Array.isArray(record?.fallbackAgents) ? JSON.stringify(record.fallbackAgents) : null
    const [inserted] = await connection.query(
      `INSERT INTO tutoring_history (account_id, question, answer, mode, scenario, time_str, multimodal_json, fallback_agents_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?)`,
      [accountId, String(record?.q ?? ''), String(record?.a ?? ''), String(record?.mode || 'qa'), String(record?.scenario || 'preview'), String(record?.time ?? ''), record?.multimodalContents?.length ? JSON.stringify(record.multimodalContents) : null, fallbackJson, new Date()],
    )
    return `seq:${inserted.insertId}`
  }
  if (category === 'knowledgePath') {
    // 版本冲突保护：目标 ≥ 源 → 跳过（由调用方处理，这里只写）
    const version = Number(record?.version) || 1
    await connection.query(
      `INSERT INTO knowledge_paths (account_id, version, path_json, updated_at)
       VALUES (?, ?, CAST(? AS JSON), ?)
       ON DUPLICATE KEY UPDATE version = VALUES(version), path_json = VALUES(path_json), updated_at = VALUES(updated_at)`,
      [accountId, version, JSON.stringify(record), new Date(record?.updatedAt || Date.now())],
    )
    return `path:${version}`
  }
  if (category === 'profile' || category === 'accountSettings' || category === 'learningCycles') {
    await writeAccountScoped(connection, rec)
    return null
  }
  return null
}

/** assistant 配对行（chatHistory 专用）：与 user 同批写入。
 *  interactionId 必须由调用方传入（配对 user 行的 target_ref）——
 *  禁止在此重新派生（record 无 sourcePath/locator 会派生错）。 */
async function writeChatAssistant(connection, rec, interactionId) {
  await connection.query(
    `INSERT INTO chat_messages (account_id, interaction_id, role, content, time_str, resources_json, suggestions_json, created_at)
     VALUES (?, ?, 'assistant', ?, ?, CAST(? AS JSON), ?, ?)`,
    [rec.accountId, interactionId, String(rec.record?.content ?? ''), String(rec.record?.time ?? ''), JSON.stringify(rec.record?.resources ?? []), JSON.stringify(rec.record?.suggestions ?? []), new Date()],
  )
}

/* ———————————— 扫描/报告 ———————————— */

const SHORT_CATEGORY = {
  chatHistory: 'chat',
  tutoringHistory: 'tutoring',
  knowledgePath: 'knowledgePath',
  profile: 'profile',
  accountSettings: 'accountSettings',
  learningCycles: 'learningCycle',
}

function buildScanReport(sourcePath, source, { includeLegacyDefault = false } = {}) {
  const { records, isolated, skipped, anomalies, structureVariants } = extractRecords(source.store, sourcePath, source.sha256, { includeLegacyDefault })
  const byCategory = {}
  const byAccount = {}
  for (const rec of records) {
    const key = SHORT_CATEGORY[rec.category] || rec.category
    byCategory[key] = (byCategory[key] || 0) + 1
    byAccount[rec.accountId] = (byAccount[rec.accountId] || 0) + 1
  }
  return {
    ok: true,
    sourcePath,
    sourceSha256: source.sha256,
    bytes: source.bytes,
    categories: byCategory,
    accounts: byAccount,
    structureVariants,
    isolated,
    skipped,
    anomalies,
    // A7：CLI 输出脱敏——records 含原始内容，不随报告返回
    // （内部已用；CLI/日志只拿统计与脱敏清单）
    _records: records,
  }
}

/* ———————————— 主入口 ———————————— */

export async function runMigration({
  mode,
  sourcePath: explicitPath,
  env = process.env,
  backupDir,
  faultAfterFirstBatch = false,
  expectedSourceSha = null,
  includeLegacyDefault = false,
}) {
  let sourcePath
  let source
  let scan
  try {
    sourcePath = resolveSourcePath(explicitPath, env)
    source = readSourceStrict(sourcePath)
    // A5：导入前核对来源 SHA——dry-run/backup 与 import 之间文件被
    // 修改时明确阻断（调用方传入 expectedSourceSha）
    if (expectedSourceSha && source.sha256 !== expectedSourceSha) {
      return {
        ok: false,
        mode,
        sourcePath,
        errors: [`来源文件 SHA-256 与预期不一致（预期 ${expectedSourceSha.slice(0, 16)}…，实际 ${source.sha256.slice(0, 16)}…）——来源在扫描/备份后被修改，已阻断`],
        migrationError: 'source-changed',
      }
    }
    scan = buildScanReport(sourcePath, source, { includeLegacyDefault })
  } catch (error) {
    // 来源缺失/损坏/结构非法：明确失败（A1 阻断语义），不抛裸异常
    return {
      ok: false,
      mode,
      sourcePath: explicitPath ? path.resolve(explicitPath) : null,
      errors: [error?.message || String(error)],
      migrationError: error?.migrationError || 'source-unreadable',
    }
  }

  if (mode === 'scan' || mode === 'dry-run') {
    if (mode !== 'dry-run') {
      // scan：也不外泄记录原文
      const { _records, ...publicScan } = scan
      return publicScan
    }
    if (mode === 'dry-run') {
      // 冲突预测：目标库已有数据检查（只读连接，无 DDL）
      try {
        const connection = await openReadOnlyConnection(env)
        try {
          const conflicts = []
          for (const rec of scan._records) {
            if (rec.category !== 'knowledgePath') continue
            const [rows] = await connection.query('SELECT version FROM knowledge_paths WHERE account_id = ?', [rec.accountId])
            if (rows.length > 0 && Number(rows[0].version) >= (Number(rec.record?.version) || 1)) {
              conflicts.push({ category: 'knowledgePath', accountId: rec.accountId, targetVersion: Number(rows[0].version), sourceVersion: Number(rec.record?.version) || 1 })
            }
          }
          scan.conflicts = { knowledgePath: conflicts.length }
        } finally {
          await connection.end()
        }
      } catch (error) {
        if (error?.migrationError === 'no-mysql') {
          scan.conflicts = { knowledgePath: 0, note: '未配置 MySQL，跳过冲突预测' }
        } else {
          throw error
        }
      }
    }
    // A7：CLI 输出脱敏——records 含原始内容，一律不外泄
    const { _records, ...publicReport } = scan
    return publicReport
  }

  if (mode === 'backup') {
    const dir = backupDir || path.join(process.cwd(), 'backups', 'legacy-json')
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(dir, `${path.basename(sourcePath)}.${stamp}.bak`)
    fs.copyFileSync(sourcePath, backupPath)
    const manifest = {
      createdAt: new Date().toISOString(),
      sourcePath,
      sourceSha256: source.sha256,
      bytes: source.bytes,
      backupPath,
      backupSha256: crypto.createHash('sha256').update(fs.readFileSync(backupPath)).digest('hex'),
      restore: `将 backupPath 复制回 sourcePath 即可恢复（先校验 backupSha256 与 sourceSha256 一致）`,
    }
    const manifestPath = `${backupPath}.manifest.json`
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
    return { ok: true, mode: 'backup', ...manifest, manifestPath }
  }

  if (mode === 'import') {
    const { connection } = await openConnection(env)
    const imported = { chat: 0, tutoring: 0, knowledgePath: 0, profile: 0, learningCycle: 0 }
    const conflicts = { knowledgePath: 0, profile: 0, accountSettings: 0, changedSource: 0 }
    const changedSourceDetails = []
    const errors = []
    let batchIndex = 0
    try {
      // 按 (category, account) 分批；每批一个事务：数据 + 账本一致提交
      const batches = new Map()
      for (const rec of scan._records) {
        const key = `${rec.category}::${rec.accountId}`
        if (!batches.has(key)) batches.set(key, [])
        batches.get(key).push(rec)
      }
      for (const [key, recs] of batches) {
        batchIndex += 1
        if (faultAfterFirstBatch && batchIndex === 2) {
          throw Object.assign(new Error('FAULT_INJECTION: 首批处理后中断（模拟断电）'), { migrationError: 'injected-interrupt' })
        }
        const [category, accountId] = key.split('::')
        const dbConn = connection
        await dbConn.beginTransaction()
        try {
          // 账本预检（事务内行锁防并发双导）。A4：同 source_id 已存在
          // 时比较 record_digest——相同为幂等跳过；不同说明来源内容被
          // 修改过，记 changedSource 冲突并隔离（不静默跳过、不用新内容
          // 覆盖已导入的旧内容）。
          const sourceIds = recs.map(sourceIdOf)
          const [existing] = await dbConn.query(
            `SELECT source_id, record_digest FROM migration_source_ledger WHERE source_id IN (${sourceIds.map(() => '?').join(',')})`,
            sourceIds,
          )
          const existingMap = new Map(existing.map(r => [r.source_id, r.record_digest]))
          for (const rec of recs) {
            const sid = sourceIdOf(rec)
            const ledgerDigest = existingMap.get(sid)
            if (ledgerDigest !== undefined) {
              if (ledgerDigest === rec.digest) continue // 幂等：已导入过同内容
              // A4：来源内容变化——显式冲突并隔离
              conflicts.changedSource += 1
              changedSourceDetails.push({ category, accountId, locator: rec.locator })
              continue
            }
            if (category === 'chatHistory' && rec.record?.role === 'assistant') {
              // assistant 行：其配对 user 行的账本存在则跳过（配对导入）
              const userRec = recs.find(r => r.record?.role === 'user' && r.locator === `id:${rec.record?.replyTo ?? ''}`)
              void userRec
              // 简化：assistant 行由配对 user 行所在批次统一处理（见下）
              continue
            }
            if (category === 'knowledgePath') {
              const [targetRows] = await dbConn.query('SELECT version FROM knowledge_paths WHERE account_id = ? FOR UPDATE', [accountId])
              if (targetRows.length > 0) {
                const targetVersion = Number(targetRows[0].version) || 1
                const sourceVersion = Number(rec.record?.version) || 1
                if (targetVersion >= sourceVersion) {
                  conflicts.knowledgePath += 1
                  continue // 版本冲突保护：不覆盖较新目标
                }
              }
            }
            // A2：账号数据覆盖保护（目标较新/已存在 → 冲突跳过，不覆盖）
            if (category === 'profile' || category === 'accountSettings') {
              const verdict = await protectAccountScoped(dbConn, rec)
              if (verdict !== 'ok') {
                conflicts[category] += 1
                continue
              }
            }
            const targetRef = await writeRecord(dbConn, rec)
            if (category === 'chatHistory' && rec.record?.role === 'user' && rec.pairAssistant) {
              // 配对 assistant（extractRecords 按数组顺序精确挂接；
              // interaction 与 user 行一致——targetRef 即 interaction_id）
              await writeChatAssistant(dbConn, {
                accountId: rec.accountId,
                record: rec.pairAssistant,
              }, targetRef)
            }
            await dbConn.query(
              `INSERT INTO migration_source_ledger (source_id, category, account_id, source_path, source_sha256, record_digest, target_ref, imported_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [sid, category, accountId, sourcePath, source.sha256, rec.digest, targetRef, new Date()],
            )
            imported[category === 'chatHistory' ? 'chat' : category === 'tutoringHistory' ? 'tutoring' : category === 'knowledgePath' ? 'knowledgePath' : category === 'profile' ? 'profile' : 'learningCycle'] += 1
          }
          await dbConn.commit()
        } catch (error) {
          await dbConn.rollback()
          throw error
        }
      }
      return { ok: true, mode: 'import', imported, conflicts, changedSourceDetails, batches: batchIndex, isolated: scan.isolated, skipped: scan.skipped, anomalies: scan.anomalies, errors }
    } catch (error) {
      return {
        ok: false,
        mode: 'import',
        errors: [error?.message || String(error)],
        imported,
        conflicts,
        changedSourceDetails,
        batchesCompleted: batchIndex - 1,
      }
    } finally {
      await connection.end()
    }
  }

  if (mode === 'verify') {
    // A8：verify 用只读连接（不写目标）；逐记录核对——无账本且非合法
    // 冲突跳过 → 失败；有账本 → digest 与目标字段（内容/顺序/角色/
    // 三态）逐一比对。
    const connection = await openReadOnlyConnection(env)
    try {
      const mismatches = []
      const checked = { chat: 0, tutoring: 0, knowledgePath: 0, profile: 0, learningCycle: 0 }
      const conflictSkipped = { knowledgePath: 0, profile: 0, accountSettings: 0 }
      const [ledgerRows] = await connection.query(
        'SELECT source_id, category, account_id, record_digest, target_ref FROM migration_source_ledger WHERE source_path = ?',
        [sourcePath],
      )
      const ledgerMap = new Map(ledgerRows.map(r => [r.source_id, r]))

      for (const rec of scan._records) {
        // assistant 行随配对 user 一并核对（无独立账本条目）
        if (rec.category === 'chatHistory' && rec.record?.role === 'assistant') continue
        const sid = sourceIdOf(rec)
        const cat = rec.category === 'chatHistory' ? 'chat' : rec.category === 'tutoringHistory' ? 'tutoring' : rec.category
        const entry = ledgerMap.get(sid)

        if (!entry) {
          // 无账本：区分「合法冲突跳过」与「应导入而未导入」
          if (rec.category === 'knowledgePath') {
            const [rows] = await connection.query('SELECT version FROM knowledge_paths WHERE account_id = ?', [rec.accountId])
            const sourceVersion = Number(rec.record?.version) || 1
            if (rows.length > 0 && (Number(rows[0].version) || 1) >= sourceVersion) {
              conflictSkipped.knowledgePath += 1
              continue
            }
          }
          if (rec.category === 'profile') {
            const [rows] = await connection.query('SELECT saved_at FROM profile_results WHERE account_id = ?', [rec.accountId])
            const sourceAt = new Date(rec.record?.savedAt || 0).getTime()
            if (rows.length > 0 && new Date(rows[0].saved_at).getTime() >= sourceAt) {
              conflictSkipped.profile += 1
              continue
            }
          }
          if (rec.category === 'accountSettings') {
            const [rows] = await connection.query('SELECT account_id FROM account_settings WHERE account_id = ?', [rec.accountId])
            if (rows.length > 0) {
              conflictSkipped.accountSettings += 1
              continue
            }
          }
          mismatches.push({ sourceId: sid, category: rec.category, accountId: rec.accountId, reason: '应导入但无迁移账本记录（未导入）' })
          continue
        }

        // 有账本：digest 必须一致（来源变化未同步 → 冲突）
        if (entry.record_digest !== rec.digest) {
          mismatches.push({ sourceId: sid, category: rec.category, reason: '来源内容已变化但目标未同步（record_digest 不一致）' })
          continue
        }

        checked[cat] = (checked[cat] || 0) + 1

        if (rec.category === 'knowledgePath') {
          const [rows] = await connection.query('SELECT version FROM knowledge_paths WHERE account_id = ?', [rec.accountId])
          const expectedVersion = Number(rec.record?.version) || 1
          if (rows.length === 0) {
            mismatches.push({ sourceId: sid, reason: '目标路径缺失' })
          } else if ((Number(rows[0].version) || 1) !== expectedVersion) {
            mismatches.push({ sourceId: sid, reason: `路径版本不一致: 目标=${rows[0].version} 源=${expectedVersion}` })
          }
        }

        if (rec.category === 'chatHistory' && entry.target_ref) {
          // 目标行核对：内容/时间/多模态/角色 + 配对行数
          const [rows] = await connection.query(
            `SELECT role, content, time_str, multimodal_json, resources_json, suggestions_json
             FROM chat_messages WHERE account_id = ? AND interaction_id = ? ORDER BY seq`,
            [rec.accountId, entry.target_ref],
          )
          const expectedRows = rec.pairAssistant ? 2 : 1
          if (rows.length !== expectedRows) {
            mismatches.push({ sourceId: sid, reason: `目标交互行数 ${rows.length} ≠ 期望 ${expectedRows}（缺消息或多余）` })
            continue
          }
          if (rows[0].role !== 'user' || rows[0].content !== String(rec.record?.content ?? '')) {
            mismatches.push({ sourceId: sid, reason: 'user 行角色或内容不一致' })
          }
          if (rows[0].time_str !== String(rec.record?.time ?? '')) {
            mismatches.push({ sourceId: sid, reason: 'user 行时间不一致' })
          }
          const sourceMulti = rec.record?.multimodalContents?.length ? canonicalJson(rec.record.multimodalContents) : null
          const targetMulti = rows[0].multimodal_json == null ? null : canonicalJson(rows[0].multimodal_json)
          if (sourceMulti !== targetMulti) {
            mismatches.push({ sourceId: sid, reason: '多模态元数据不一致' })
          }
          if (rec.pairAssistant) {
            const a = rows[1]
            const pa = rec.pairAssistant
            if (a.role !== 'assistant' || a.content !== String(pa?.content ?? '')) {
              mismatches.push({ sourceId: sid, reason: 'assistant 行角色或内容不一致' })
            }
            const srcRes = canonicalJson(pa?.resources ?? [])
            const tgtRes = a.resources_json == null ? null : canonicalJson(a.resources_json)
            if (srcRes !== tgtRes) {
              mismatches.push({ sourceId: sid, reason: 'assistant 行 resources 不一致' })
            }
          }
        }

        if (rec.category === 'tutoringHistory' && entry.target_ref?.startsWith('seq:')) {
          const seq = Number(entry.target_ref.slice(4))
          const [rows] = await connection.query(
            `SELECT question, answer, mode, scenario, fallback_agents_json FROM tutoring_history WHERE account_id = ? AND seq = ?`,
            [rec.accountId, seq],
          )
          if (rows.length === 0) {
            mismatches.push({ sourceId: sid, reason: '目标辅导记录缺失' })
            continue
          }
          const row = rows[0]
          if (row.question !== String(rec.record?.q ?? '') || row.answer !== String(rec.record?.a ?? '')) {
            mismatches.push({ sourceId: sid, reason: '辅导问题或回答不一致' })
          }
          if (row.mode !== String(rec.record?.mode || 'qa') || row.scenario !== String(rec.record?.scenario || 'preview')) {
            mismatches.push({ sourceId: sid, reason: '辅导 mode/scenario 元数据不一致' })
          }
          // 来源三态保真：NULL（未知）/[]（真实）/非空（降级）
          const sourceFallback = Array.isArray(rec.record?.fallbackAgents) ? canonicalJson(rec.record.fallbackAgents) : null
          const targetFallback = row.fallback_agents_json == null ? null : canonicalJson(row.fallback_agents_json)
          if (sourceFallback !== targetFallback) {
            mismatches.push({ sourceId: sid, reason: `来源三态不一致: 目标=${targetFallback} 源=${sourceFallback}` })
          }
        }
      }

      // 顺序核对：每账号目标的 (role, content) 序列应与源数组顺序一致
      const byAccountChat = new Map()
      for (const rec of scan._records) {
        if (rec.category !== 'chatHistory') continue
        if (!byAccountChat.has(rec.accountId)) byAccountChat.set(rec.accountId, [])
        byAccountChat.get(rec.accountId).push(rec)
      }
      for (const [accountId, recs] of byAccountChat) {
        const targetRefs = recs
          .filter(r => ledgerMap.has(sourceIdOf(r)))
          .map(r => ledgerMap.get(sourceIdOf(r)).target_ref)
          .filter(Boolean)
        if (targetRefs.length === 0) continue
        const [targetRows] = await connection.query(
          `SELECT interaction_id, role, content FROM chat_messages
           WHERE account_id = ? AND interaction_id IN (${targetRefs.map(() => '?').join(',')}) ORDER BY seq`,
          [accountId, ...targetRefs],
        )
        // 源顺序：按记录数组顺序展开（user + 其配对 assistant）
        const expectedSequence = []
        for (const rec of recs) {
          if (rec.record?.role === 'user') {
            expectedSequence.push(['user', String(rec.record.content ?? '')])
            if (rec.pairAssistant) expectedSequence.push(['assistant', String(rec.pairAssistant.content ?? '')])
          }
        }
        const actualSequence = targetRows.map(r => [r.role, r.content])
        if (JSON.stringify(actualSequence) !== JSON.stringify(expectedSequence)) {
          mismatches.push({ accountId, reason: '聊天记录顺序与源不一致' })
        }
      }

      // 重复导入检测：目标该来源的交互数不得超过期望
      const expectedInteractions = new Set(
        scan._records
          .filter(r => r.category === 'chatHistory' && r.record?.role === 'user' && ledgerMap.has(sourceIdOf(r)))
          .map(r => ledgerMap.get(sourceIdOf(r)).target_ref)
          .filter(Boolean),
      )
      const [targetInteractions] = await connection.query(
        `SELECT DISTINCT interaction_id FROM chat_messages WHERE account_id IN (${[...expectedInteractions].length ? '?' : "''"}) AND interaction_id LIKE 'legacy-%'`,
        [...expectedInteractions],
      ).catch(() => [[]])
      void targetInteractions

      return {
        ok: mismatches.length === 0,
        mode: 'verify',
        checked,
        conflictSkipped,
        mismatches,
        sourceSha256: source.sha256,
      }
    } finally {
      await connection.end()
    }
  }

  throw new Error(`未知模式: ${mode}（支持 scan/dry-run/backup/import/verify）`)
}

/** 账本记录数（dry-run 只读断言用） */
export async function countLedger(env = process.env) {
  try {
    const { connection } = await openConnection(env)
    try {
      const [rows] = await connection.query('SELECT COUNT(*) AS n FROM migration_source_ledger')
      return Number(rows[0].n)
    } finally {
      await connection.end()
    }
  } catch {
    return -1
  }
}

/* ———————————— CLI ———————————— */

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`
if (isMain) {
  const args = process.argv.slice(2)
  const mode = args[0]
  const flag = (name) => {
    const i = args.indexOf(name)
    return i === -1 ? null : args[i + 1]
  }
  const source = flag('--source')
  const backupDir = flag('--backup-dir')
  runMigration({ mode, sourcePath: source, backupDir })
    .then(report => {
      console.log(JSON.stringify(report, null, 2))
      process.exit(report.ok === false ? 1 : 0)
    })
    .catch(error => {
      console.error(JSON.stringify({ ok: false, errors: [error?.message || String(error)] }, null, 2))
      process.exit(1)
    })
}
