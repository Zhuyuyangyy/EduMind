import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * P4-2B 最终审计整改门禁（先于修复编写 · 一次性收口）。
 *
 * 对应独立审计阻断项：
 * A1 dry-run 严格只读：不得执行任何 DDL / 写入（空库验证）
 * A2 账号数据覆盖保护：旧来源不得无条件覆盖较新目标（画像/设置）
 * A3 source_id 含来源文件身份：不同来源文件同账号同旧 ID 不误判重复
 * A4 来源变化检测：账本存在但 record_digest 变化 → 显式冲突+隔离，
 *    不静默跳过
 * A5 导入前来源 SHA 核对：备份/导入之间文件变化可发现
 * A6 全局数组默认不导入任何账号表（仅隔离清单）
 * A7 CLI 报告脱敏：不含聊天/辅导/画像原文
 * A8 verify 真实性：删/篡改已导入消息必须变红；顺序/角色/内容/
 *    三态失真必须红；无账本记录计入应导入；多来源分别 verify；
 *    版本冲突跳过有明确状态
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrator = await import('../scripts/migrate-legacy-json.mjs')
const repository = await import('../server/study/repository.js')

const mysqlConfigured = (await import('../server/store/mysql.js')).isMySqlConfigured()

function tmp(name) {
  return path.join(os.tmpdir(), `edumind-audit-${process.pid}-${Date.now()}-${name}.json`)
}

function fixture(overrides = {}) {
  const account = overrides.account || `audit-${Date.now()}`
  const store = {
    chatHistory: overrides.chatHistory ?? {
      [account]: [
        { id: 1001, role: 'user', content: '审计问题甲', time: '09:00', multimodalContents: [] },
        { id: 1002, role: 'assistant', content: '审计回复甲', time: '09:00', resources: [], suggestions: [] },
        { id: 1003, role: 'user', content: '审计问题乙', time: '09:01', multimodalContents: [] },
        { id: 1004, role: 'assistant', content: '审计回复乙', time: '09:01', resources: [], suggestions: [] },
      ],
    },
    tutoringHistory: overrides.tutoringHistory ?? {
      [account]: [
        { q: '审计辅导问题', a: '审计辅导回答', time: '09:30', mode: 'qa', scenario: 'preview', fallbackAgents: [] },
      ],
    },
    profiles: overrides.profiles ?? {
      [account]: { dimensions: [{ label: '知识基础', value: 60 }], totalScore: 60, savedAt: '2026-10-01T00:00:00.000Z' },
    },
    accountSettings: overrides.accountSettings ?? { [account]: { displayName: '审计学员' } },
    learningCycles: overrides.learningCycles ?? [],
  }
  return { store, account }
}

async function resetAuditData() {
  const mysql = await import('../server/store/mysql.js')
  await mysql.ensureMySqlSchema()
  await repository.ensureHistorySchema()
  await repository.ensureKnowledgePathSchema()
  const db = mysql.getMySqlPool()
  await db.query(`CREATE TABLE IF NOT EXISTS migration_source_ledger (
    source_id VARCHAR(128) NOT NULL PRIMARY KEY,
    category VARCHAR(32) NOT NULL,
    account_id VARCHAR(191) NOT NULL,
    source_path VARCHAR(512) NOT NULL,
    source_sha256 VARCHAR(64) NOT NULL,
    record_digest VARCHAR(64) NOT NULL,
    target_ref VARCHAR(128) NULL,
    imported_at DATETIME(3) NOT NULL,
    KEY ledger_category (category, account_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  await db.query("DELETE FROM chat_messages WHERE account_id LIKE 'audit-%'")
  await db.query("DELETE FROM tutoring_history WHERE account_id LIKE 'audit-%'")
  await db.query("DELETE FROM knowledge_paths WHERE account_id LIKE 'audit-%'")
  await db.query("DELETE FROM profile_results WHERE account_id LIKE 'audit-%'")
  await db.query("DELETE FROM account_settings WHERE account_id LIKE 'audit-%'")
  await db.query("DELETE FROM learning_cycles WHERE account_id LIKE 'audit-%'")
  // 定向清理：仅删本文件来源（edumind-audit- 前缀）的账本，不清
  // 全表——共享测试库下与其他测试文件并发互不破坏
  await db.query("DELETE FROM migration_source_ledger WHERE source_path LIKE '%edumind-audit-%'")
}

after(async () => {
  try {
    const { closeMySqlPool } = await import('../server/store/mysql.js')
    await closeMySqlPool()
  } catch { /* ignore */ }
})

/* ============ A1 dry-run 严格只读 ============ */

test('A1 dry-run 严格只读：空目标库上无任何 DDL / 数据写入', { skip: mysqlConfigured ? false : '未配置 MySQL' }, async () => {
  await resetAuditData()
  const { store, account } = fixture()
  const sourcePath = tmp('src')
  fs.writeFileSync(sourcePath, JSON.stringify(store), 'utf8')

  // 独立空库（模拟全新目标）：migrator 不得创建任何表。
  // 连接参数跟随测试环境的 MySQL（CI 服务容器/便携实例），
  // 不再硬编码本机开发库凭据。
  const auditMysql = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
  }
  const probeEnv = {
    ...process.env,
    MYSQL_HOST: auditMysql.host, MYSQL_PORT: String(auditMysql.port),
    MYSQL_USER: auditMysql.user, MYSQL_PASSWORD: auditMysql.password,
    MYSQL_DATABASE: 'edumind_audit_empty',
  }
  const mysql2 = (await import('mysql2/promise')).default
  const admin = await mysql2.createConnection(auditMysql)
  await admin.query('DROP DATABASE IF EXISTS edumind_audit_empty')
  await admin.query('CREATE DATABASE edumind_audit_empty CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
  await admin.end()

  try {
    const report = await migrator.runMigration({ mode: 'dry-run', sourcePath, env: probeEnv })
    assert.equal(report.ok, true, `dry-run 应成功: ${JSON.stringify(report.errors)}`)

    // 验证空库仍然为空（无表被创建）
    const check = await mysql2.createConnection({ ...auditMysql, database: 'edumind_audit_empty' })
    const [tables] = await check.query('SHOW TABLES')
    await check.end()
    assert.equal(tables.length, 0, `dry-run 不得创建任何表，实际存在 ${tables.length} 张表`)
    void account
  } finally {
    const cleanup = await mysql2.createConnection(auditMysql)
    await cleanup.query('DROP DATABASE IF EXISTS edumind_audit_empty')
    await cleanup.end()
    fs.rmSync(sourcePath, { force: true })
  }
})

/* ============ A2 覆盖保护 ============ */

test('A2 覆盖保护：旧来源画像/设置不得覆盖较新目标记录', { skip: mysqlConfigured ? false : '未配置 MySQL' }, async () => {
  await resetAuditData()
  const { store, account } = fixture()
  const sourcePath = tmp('src')
  fs.writeFileSync(sourcePath, JSON.stringify(store), 'utf8')

  try {
    // 目标先写入较新画像（savedAt 晚于来源）
    const mysql = await import('../server/store/mysql.js')
    await mysql.saveProfileResult(account, {
      dimensions: [{ label: '知识基础', value: 95 }], totalScore: 95,
      savedAt: '2026-10-09T00:00:00.000Z', accountId: account,
    })

    const result = await migrator.runMigration({ mode: 'import', sourcePath, env: process.env })
    assert.equal(result.ok, true)
    assert.ok(result.conflicts.profile >= 1, '旧画像 vs 新目标必须记冲突并跳过')

    const mysqlStore = await import('../server/store/mysql.js')
    const current = await mysqlStore.getProfileResult(account)
    assert.equal(current.totalScore, 95, '较新目标画像不得被旧来源覆盖')
  } finally {
    fs.rmSync(sourcePath, { force: true })
  }
})

/* ============ A3 source_id 含来源文件身份 ============ */

test('A3 跨文件同账号同旧 ID：两个来源文件的记录都导入（不误判重复）', { skip: mysqlConfigured ? false : '未配置 MySQL' }, async () => {
  await resetAuditData()
  const account = `audit-xfile-${Date.now()}`
  const mk = (marker) => ({
    chatHistory: {
      [account]: [
        { id: 1001, role: 'user', content: marker, time: '09:00', multimodalContents: [] },
        { id: 1002, role: 'assistant', content: `${marker} 的回复`, time: '09:00', resources: [], suggestions: [] },
      ],
    },
    tutoringHistory: {},
    profiles: {},
    accountSettings: {},
    learningCycles: [],
  })
  const fileA = tmp('a.json')
  const fileB = tmp('b.json')
  fs.writeFileSync(fileA, JSON.stringify(mk('文件A的问题')), 'utf8')
  fs.writeFileSync(fileB, JSON.stringify(mk('文件B的问题')), 'utf8')

  try {
    const first = await migrator.runMigration({ mode: 'import', sourcePath: fileA, env: process.env })
    assert.equal(first.ok, true)
    const second = await migrator.runMigration({ mode: 'import', sourcePath: fileB, env: process.env })
    assert.equal(second.ok, true)
    assert.ok(second.imported.chat >= 1, '不同来源文件的同账号同旧 ID 记录必须导入（不误判重复）')

    const history = await repository.getChatHistory(account)
    assert.ok(history.some(i => i.content === '文件A的问题'), '文件 A 的记录应在')
    assert.ok(history.some(i => i.content === '文件B的问题'), '文件 B 的记录应在')
  } finally {
    fs.rmSync(fileA, { force: true })
    fs.rmSync(fileB, { force: true })
  }
})

/* ============ A4 来源变化显式冲突 ============ */

test('A4 来源变化：账本存在但 record_digest 变化 → 显式冲突且隔离，不静默跳过', { skip: mysqlConfigured ? false : '未配置 MySQL' }, async () => {
  await resetAuditData()
  const { store, account } = fixture()
  const sourcePath = tmp('src')
  fs.writeFileSync(sourcePath, JSON.stringify(store), 'utf8')

  try {
    const first = await migrator.runMigration({ mode: 'import', sourcePath, env: process.env })
    assert.equal(first.ok, true)

    // 来源内容变化（同 id 内容改写）
    const changed = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
    changed.chatHistory[account][0].content = '被篡改的问题内容'
    fs.writeFileSync(sourcePath, JSON.stringify(changed), 'utf8')

    const second = await migrator.runMigration({ mode: 'import', sourcePath, env: process.env })
    assert.equal(second.ok, true, '来源变化应显式处理而非崩溃')
    assert.ok(second.conflicts.changedSource >= 1, '来源内容变化必须记 changedSource 冲突')

    // 目标保持第一次导入的内容（变化记录被隔离，不静默用新内容覆盖）
    const history = await repository.getChatHistory(account)
    assert.ok(history.some(i => i.content === '审计问题甲'), '目标应保持首次导入内容')
    assert.ok(!history.some(i => i.content === '被篡改的问题内容'), '变化内容不得被静默导入')
  } finally {
    fs.rmSync(sourcePath, { force: true })
  }
})

/* ============ A5 导入前来源 SHA 核对 ============ */

test('A5 导入前核对来源 SHA：与 dry-run/backup 时不一致 → 明确阻断', { skip: mysqlConfigured ? false : '未配置 MySQL' }, async () => {
  await resetAuditData()
  const { store, account } = fixture()
  const sourcePath = tmp('src')
  fs.writeFileSync(sourcePath, JSON.stringify(store), 'utf8')

  try {
    // dry-run 记录来源 SHA
    const dry = await migrator.runMigration({ mode: 'dry-run', sourcePath, env: process.env })
    const drySha = dry.sourceSha256

    // 来源在 dry-run 后被修改
    const changed = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
    changed.chatHistory[account][0].content = 'dry-run 之后被修改'
    fs.writeFileSync(sourcePath, JSON.stringify(changed), 'utf8')

    // import 带 expectedSourceSha（dry-run 时的 SHA）→ 必须阻断
    const result = await migrator.runMigration({ mode: 'import', sourcePath, env: process.env, expectedSourceSha: drySha })
    assert.equal(result.ok, false, '来源 SHA 与预期不一致必须阻断导入')
    assert.match((result.errors || []).join(' '), /SHA|哈希|不一致|变化/, '失败原因必须指向来源变化')

    const history = await repository.getChatHistory(account)
    assert.equal(history.length, 0, '阻断后不得写入任何数据')
  } finally {
    fs.rmSync(sourcePath, { force: true })
  }
})

/* ============ A6 全局数组默认不导入 ============ */

test('A6 全局数组默认不导入：仅进隔离清单，不写入任何账号表', { skip: mysqlConfigured ? false : '未配置 MySQL' }, async () => {
  await resetAuditData()
  const sourcePath = tmp('src')
  // 旧全局数组结构（无账号归属）
  fs.writeFileSync(sourcePath, JSON.stringify({
    chatHistory: [
      { id: 5001, role: 'user', content: '无归属的旧全局问题', time: '08:00', multimodalContents: [] },
      { id: 5002, role: 'assistant', content: '无归属的旧全局回复', time: '08:00', resources: [], suggestions: [] },
    ],
    tutoringHistory: [],
    profiles: {},
    accountSettings: {},
    learningCycles: [],
  }), 'utf8')

  try {
    const result = await migrator.runMigration({ mode: 'import', sourcePath, env: process.env })
    assert.equal(result.ok, true)
    // 隔离清单包含全局数组
    assert.ok(result.isolated.some(i => i.category === 'chatHistory' && /global-array/.test(i.reason)), '全局数组必须进隔离清单')

    // 不得写入 default 或任何账号：本来源在账本中没有 chatHistory
    // 条目（隔离清单 only）。注意不能按 interaction 前缀查全库——
    // 共享测试库下其他测试文件正并发写入 legacy- 交互。
    const mysql = await import('../server/store/mysql.js')
    const db = mysql.getMySqlPool()
    const [ledger] = await db.query(
      "SELECT COUNT(*) AS n FROM migration_source_ledger WHERE source_path = ? AND category = 'chatHistory'",
      [sourcePath],
    )
    assert.equal(Number(ledger[0].n), 0, '归属不明的全局数组不得导入任何账号表（含 default）')
  } finally {
    fs.rmSync(sourcePath, { force: true })
  }
})

/* ============ A7 CLI 报告脱敏 ============ */

test('A7 CLI 报告脱敏：dry-run 输出不含聊天/辅导原文', { skip: mysqlConfigured ? false : '未配置 MySQL' }, async () => {
  await resetAuditData()
  const { store } = fixture()
  const sourcePath = tmp('src')
  fs.writeFileSync(sourcePath, JSON.stringify(store), 'utf8')

  try {
    const report = await migrator.runMigration({ mode: 'dry-run', sourcePath, env: process.env })
    const serialized = JSON.stringify(report)
    assert.ok(!serialized.includes('审计问题甲'), 'dry-run 输出不得包含聊天原文')
    assert.ok(!serialized.includes('审计辅导回答'), 'dry-run 输出不得包含辅导原文')
    assert.ok(!serialized.includes('审计学员'), 'dry-run 输出不得包含账号设置原文')
  } finally {
    fs.rmSync(sourcePath, { force: true })
  }
})

/* ============ A8 verify 真实性（反向故障） ============ */

test('A8 verify 反向故障：删除已导入消息 → verify 必须失败', { skip: mysqlConfigured ? false : '未配置 MySQL' }, async () => {
  await resetAuditData()
  const { store, account } = fixture()
  const sourcePath = tmp('src')
  fs.writeFileSync(sourcePath, JSON.stringify(store), 'utf8')

  try {
    await migrator.runMigration({ mode: 'import', sourcePath, env: process.env })

    // 完整性基线：verify 通过
    const okReport = await migrator.runMigration({ mode: 'verify', sourcePath, env: process.env })
    assert.equal(okReport.ok, true, `导入后 verify 应通过: ${JSON.stringify(okReport.mismatches)}`)

    // 反向故障 1：删除一条已导入消息
    const mysql = await import('../server/store/mysql.js')
    const db = mysql.getMySqlPool()
    await db.query("DELETE FROM chat_messages WHERE account_id = ? AND role = 'user' AND content = '审计问题乙'", [account])

    const broken = await migrator.runMigration({ mode: 'verify', sourcePath, env: process.env })
    assert.equal(broken.ok, false, '删除已导入消息后 verify 必须失败')
    assert.ok(broken.mismatches.length > 0, '必须报告具体差异')
  } finally {
    fs.rmSync(sourcePath, { force: true })
  }
})

test('A8 verify 反向故障：篡改已导入消息内容 → verify 必须失败', { skip: mysqlConfigured ? false : '未配置 MySQL' }, async () => {
  await resetAuditData()
  const { store, account } = fixture()
  const sourcePath = tmp('src')
  fs.writeFileSync(sourcePath, JSON.stringify(store), 'utf8')

  try {
    await migrator.runMigration({ mode: 'import', sourcePath, env: process.env })
    const mysql = await import('../server/store/mysql.js')
    const db = mysql.getMySqlPool()
    await db.query("UPDATE chat_messages SET content = '被篡改的回复' WHERE account_id = ? AND role = 'assistant' AND content = '审计回复甲'", [account])

    const broken = await migrator.runMigration({ mode: 'verify', sourcePath, env: process.env })
    assert.equal(broken.ok, false, '篡改已导入消息后 verify 必须失败')
  } finally {
    fs.rmSync(sourcePath, { force: true })
  }
})

test('A8 verify：来源三态失真（fallbackAgents 被补写）→ 必须失败', { skip: mysqlConfigured ? false : '未配置 MySQL' }, async () => {
  await resetAuditData()
  const account = `audit-tristate-${Date.now()}`
  const sourcePath = tmp('src')
  fs.writeFileSync(sourcePath, JSON.stringify({
    chatHistory: {},
    tutoringHistory: {
      [account]: [
        { q: '未知来源问题', a: '回答', time: '09:30', mode: 'qa', scenario: 'preview' },
      ],
    },
    profiles: {}, accountSettings: {}, learningCycles: [],
  }), 'utf8')

  try {
    await migrator.runMigration({ mode: 'import', sourcePath, env: process.env })
    // 把「未知来源」（NULL）篡改为「真实模型」（[]）——正是 B-3 明令禁止的补写
    const mysql = await import('../server/store/mysql.js')
    const db = mysql.getMySqlPool()
    await db.query("UPDATE tutoring_history SET fallback_agents_json = CAST('[]' AS JSON) WHERE account_id = ?", [account])

    const broken = await migrator.runMigration({ mode: 'verify', sourcePath, env: process.env })
    assert.equal(broken.ok, false, '来源三态被补写后 verify 必须失败')
  } finally {
    fs.rmSync(sourcePath, { force: true })
  }
})

test('A8 verify：应导入但未导入（空目标）→ 必须失败', { skip: mysqlConfigured ? false : '未配置 MySQL' }, async () => {
  await resetAuditData()
  const { store, account } = fixture()
  const sourcePath = tmp('src')
  fs.writeFileSync(sourcePath, JSON.stringify(store), 'utf8')

  try {
    // 未导入直接 verify（目标为空）
    const report = await migrator.runMigration({ mode: 'verify', sourcePath, env: process.env })
    assert.equal(report.ok, false, '应导入的记录缺失时 verify 必须失败（不得假阳性）')
    assert.ok(report.mismatches.some(m => /未导入|缺失/.test(m.reason || '')), '必须报告未导入记录')
    void account
  } finally {
    fs.rmSync(sourcePath, { force: true })
  }
})
