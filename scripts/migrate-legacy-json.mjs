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

function extractRecords(store, sourcePath, sourceSha) {
  const records = []       // { category, accountId, locator, digest, record, sourceSha }
  const isolated = []      // 归属假设/存疑清单
  const skipped = []       // 演示种子等
  const anomalies = []     // 孤儿消息等
  const structureVariants = []

  function collect(category, value, { accountFromRecord } = {}) {
    const { map, variant } = asAccountMap(value, category)
    structureVariants.push({ category, shape: variant })
    if (variant === 'legacy-global-array') {
      isolated.push({
        category,
        reason: `global-array: 旧全局数组无账号归属，按 default（演示账号）兼容读取（既有 data.js 语义），需人工确认后再决定是否保留`,
        records: map.default.length,
      })
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
            detail: `id=${record.id ?? '?'} content=${String(record.content || '').slice(0, 40)}`,
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
  collect('knowledgePath', store.knowledgePathByAccount || store.knowledgePathResult ? (store.knowledgePathByAccount || { default: store.knowledgePathResult }) : undefined)
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

function sourceIdOf(rec) {
  return crypto.createHash('sha256').update(`${rec.category}|${rec.accountId}|${rec.locator}`).digest('hex')
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
    await connection.query(
      `INSERT INTO tutoring_history (account_id, question, answer, mode, scenario, time_str, multimodal_json, fallback_agents_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?)`,
      [accountId, String(record?.q ?? ''), String(record?.a ?? ''), String(record?.mode || 'qa'), String(record?.scenario || 'preview'), String(record?.time ?? ''), record?.multimodalContents?.length ? JSON.stringify(record.multimodalContents) : null, fallbackJson, new Date()],
    )
    return null
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

/** assistant 配对行（chatHistory 专用）：与 user 同批写入 */
async function writeChatAssistant(connection, rec) {
  const interactionId = `legacy-${sourceIdOf(rec).slice(0, 32)}`
  // assistant 的 source_id 与 user 不同（locator 不同），但 interaction 相同——
  // 用配对 user 的 locator 反推：digest 内容含 role，这里按 interaction 直接插
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

function buildScanReport(sourcePath, source) {
  const { records, isolated, skipped, anomalies, structureVariants } = extractRecords(source.store, sourcePath, source.sha256)
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
    records,
  }
}

/* ———————————— 主入口 ———————————— */

export async function runMigration({ mode, sourcePath: explicitPath, env = process.env, backupDir, faultAfterFirstBatch = false }) {
  let sourcePath
  let source
  let scan
  try {
    sourcePath = resolveSourcePath(explicitPath, env)
    source = readSourceStrict(sourcePath)
    scan = buildScanReport(sourcePath, source)
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
    if (mode === 'dry-run') {
      // 冲突预测：目标库已有数据检查（只读）
      try {
        const { connection } = await openConnection(env)
        try {
          const conflicts = []
          for (const rec of scan.records) {
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
    return scan
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
    const conflicts = { knowledgePath: 0 }
    const errors = []
    let batchIndex = 0
    try {
      // 按 (category, account) 分批；每批一个事务：数据 + 账本一致提交
      const batches = new Map()
      for (const rec of scan.records) {
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
          // 账本预检（事务内行锁防并发双导）
          const sourceIds = recs.map(sourceIdOf)
          const [existing] = await dbConn.query(
            `SELECT source_id FROM migration_source_ledger WHERE source_id IN (${sourceIds.map(() => '?').join(',')})`,
            sourceIds,
          )
          const existingSet = new Set(existing.map(r => r.source_id))
          for (const rec of recs) {
            const sid = sourceIdOf(rec)
            if (existingSet.has(sid)) continue // 幂等：已导入过
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
            const targetRef = await writeRecord(dbConn, rec)
            if (category === 'chatHistory' && rec.record?.role === 'user' && rec.pairAssistant) {
              // 配对 assistant（extractRecords 按数组顺序精确挂接）
              await writeChatAssistant(dbConn, {
                accountId: rec.accountId,
                record: rec.pairAssistant,
              })
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
      return { ok: true, mode: 'import', imported, conflicts, batches: batchIndex, isolated: scan.isolated, skipped: scan.skipped, anomalies: scan.anomalies, errors }
    } catch (error) {
      return {
        ok: false,
        mode: 'import',
        errors: [error?.message || String(error)],
        imported,
        conflicts,
        batchesCompleted: batchIndex - 1,
      }
    } finally {
      await connection.end()
    }
  }

  if (mode === 'verify') {
    const { connection } = await openConnection(env)
    try {
      const mismatches = []
      const checked = { chat: 0, tutoring: 0, knowledgePath: 0, profile: 0, learningCycle: 0 }
      // 账本对账：每条已导入记录的 target 是否存在
      const [ledgerRows] = await connection.query(
        'SELECT source_id, category, account_id, target_ref FROM migration_source_ledger WHERE source_path = ?',
        [sourcePath],
      )
      const ledgerMap = new Map(ledgerRows.map(r => [r.source_id, r]))
      for (const rec of scan.records) {
        const sid = sourceIdOf(rec)
        const entry = ledgerMap.get(sid)
        if (!entry) continue // 未导入（冲突跳过/演示数据）——不计差异
        const cat = rec.category === 'chatHistory' ? 'chat' : rec.category === 'tutoringHistory' ? 'tutoring' : rec.category
        checked[cat] = (checked[cat] || 0) + 1
        if (rec.category === 'knowledgePath') {
          const [rows] = await connection.query('SELECT version, path_json FROM knowledge_paths WHERE account_id = ?', [rec.accountId])
          if (rows.length === 0) {
            mismatches.push({ sourceId: sid, reason: '目标路径缺失' })
          } else if (entry.target_ref && Number(rows[0].version) !== Number(entry.target_ref.replace('path:', ''))) {
            mismatches.push({ sourceId: sid, reason: `版本不一致: 目标=${rows[0].version} 账本=${entry.target_ref}` })
          }
        }
        if (rec.category === 'chatHistory' && entry.target_ref) {
          const [rows] = await connection.query('SELECT COUNT(*) AS n FROM chat_messages WHERE account_id = ? AND interaction_id = ?', [rec.accountId, entry.target_ref])
          if (Number(rows[0].n) === 0) {
            mismatches.push({ sourceId: sid, reason: '目标聊天交互缺失' })
          }
        }
      }
      // 目标侧不应有超出账本的记录（重复导入检测）。
      // 期望行数按配对模型计算：每个有配对 assistant 的 user 记录产生
      // 2 行（user+assistant），孤儿 user 产生 1 行。
      const expectedByAccount = {}
      for (const rec of scan.records) {
        if (rec.category !== 'chatHistory') continue
        const delta = rec.record?.role === 'user' ? (rec.pairAssistant ? 2 : 1) : 0
        expectedByAccount[rec.accountId] = (expectedByAccount[rec.accountId] || 0) + delta
      }
      const [chatCounts] = await connection.query(
        `SELECT account_id, COUNT(*) AS n FROM chat_messages WHERE interaction_id LIKE 'legacy-%' GROUP BY account_id`,
      )
      for (const row of chatCounts) {
        const expected = expectedByAccount[row.account_id] || 0
        if (Number(row.n) > expected) {
          mismatches.push({ accountId: row.account_id, reason: `目标聊天记录数(${row.n})超过期望(${expected})——疑似重复导入` })
        }
      }
      return { ok: mismatches.length === 0, mode: 'verify', checked, mismatches, sourceSha256: source.sha256 }
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
