import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'

/**
 * P4-2B-4 旧 JSON 安全迁移门禁（先于实现编写）。
 *
 * 覆盖任务书 A1-A5：
 * - dry-run 严格只读（不写库、不写目标）
 * - 首次导入 / 二次导入零重复 / 中断恢复接续 / 版本冲突保护
 * - 来源损坏阻断（不得退化为空数据继续）
 * - 账号隔离 / 顺序保真 / fallbackAgents 三态 / Unicode 与多模态
 * - 旧全局数组（归属 default 假设 + 隔离标记）与账号映射两种结构
 * - DB 断开 fail-closed
 * - 不用聊天文本哈希作为业务 ID（source_id 是迁移来源身份，
 *   业务 ID 由目标 seq/interaction 分配）
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { isMySqlConfigured } = await import('../server/store/mysql.js')
const mysqlConfigured = isMySqlConfigured()

const migrator = await import('../scripts/migrate-legacy-json.mjs')
const repository = await import('../server/study/repository.js')

const MYSQL_ENV_KEYS = ['MYSQL_URL', 'MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']
const MYSQL_ENV_SNAPSHOT = Object.fromEntries(MYSQL_ENV_KEYS.map(k => [k, process.env[k]]))

function tmp(name) {
  return path.join(os.tmpdir(), `edumind-b4-${process.pid}-${Date.now()}-${name}`)
}

/** 构造旧结构夹具：全局数组 + 账号映射混合 */
function buildLegacyFixture() {
  const accountA = `legacy-a-${Date.now()}`
  const accountB = `legacy-b-${Date.now()}`
  const store = {
    // 旧全局数组（无账号归属）——须按 default 假设 + 隔离标记处理
    chatHistory: [
      { id: 1001, role: 'user', content: '旧全局问题', time: '09:00', multimodalContents: [] },
      { id: 1002, role: 'assistant', content: '旧全局回复', time: '09:00', resources: [{ type: 'doc', title: '速查' }], suggestions: ['建议'] },
    ],
    // 账号映射新结构
    knowledgePathByAccount: {
      [accountA]: {
        version: 5,
        basedOn: 4,
        phases: [{ id: 'p1', title: '阶段一', topics: [
          { id: 'topic-alpha', title: '甲', mastery: 0.4 },
          { id: 'topic-beta', title: '乙', mastery: 0.6 },
        ] }],
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
      [accountB]: {
        // 旧路径缺 version——首次导入归一化，已有更高版本则跳过
        phases: [{ id: 'p1', title: '阶段一', topics: [{ id: 'topic-alpha', title: '甲', mastery: 0.3 }] }],
        updatedAt: '2026-10-02T00:00:00.000Z',
      },
    },
    profiles: {
      [accountA]: { dimensions: [{ label: '知识基础', value: 72 }], totalScore: 72, savedAt: '2026-10-01T00:00:00.000Z' },
    },
    accountSettings: {
      [accountA]: { displayName: '学员甲' },
    },
    learningCycles: [
      { accountId: accountA, workflowId: 'lc-1', createdAt: '2026-10-01T00:00:00.000Z', evidence: 'unverified-client-input' },
      { accountId: accountB, workflowId: 'lc-2', createdAt: '2026-10-02T00:00:00.000Z' },
    ],
    agentCollaboration: { 0: { monday: 'demo' } }, // 演示种子——必须跳过
  }
  // 聊天账号映射（新结构）
  store.chatHistory = {
    default: store.chatHistory,
    [accountA]: [
      { id: 2001, role: 'user', content: '甲的问题 😀 中文', time: '10:00', multimodalContents: [{ type: 'text', data: '多模态' }] },
      { id: 2002, role: 'assistant', content: '甲的回复', time: '10:00', resources: [], suggestions: [] },
      { id: 2003, role: 'user', content: '甲的追问', time: '10:01', multimodalContents: [] },
    ],
    [accountB]: [
      { id: 3001, role: 'user', content: '乙的问题', time: '11:00', multimodalContents: [] },
      { id: 3002, role: 'assistant', content: '乙的回复', time: '11:00', resources: [], suggestions: [] },
    ],
  }
  // 导师历史：三态 + 缺助手回复的历史消息
  store.tutoringHistory = {
    [accountA]: [
      { q: '真实模型问题', a: '回答一', time: '10:30', mode: 'qa', scenario: 'preview', fallbackAgents: [] },
      { q: '降级问题', a: '回答二', time: '10:31', mode: 'qa', scenario: 'preview', fallbackAgents: ['TutorAgent'] },
      { q: '旧记录问题', a: '回答三', time: '10:32', mode: 'qa', scenario: 'preview' },
    ],
    // 缺助手回复的历史消息：只有 user 条目（旧数据缺陷）
    [accountB]: [
      { id: 4001, role: 'user', content: '乙的孤儿问题', time: '12:00', multimodalContents: [] },
    ],
  }
  return { store, accountA, accountB }
}

/**
 * 定向清理本文件产生的数据（保证测试独立，不依赖运行顺序，且不清
 * 全表——共享测试库下其他测试文件的数据不得被破坏）：
 * - legacy- 前缀账号的各表记录
 * - legacy-% 前缀 interaction 的迁移聊天记录
 * - 迁移账本全表（仅 migrator 使用）
 */
async function resetTestDb() {
  const mysql = await import('../server/store/mysql.js')
  await mysql.ensureMySqlSchema()
  // 账本表可能尚未创建（空库）——先建后清
  await mysql.getMySqlPool().query(`CREATE TABLE IF NOT EXISTS migration_source_ledger (
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
  const repository = await import('../server/study/repository.js')
  await repository.ensureHistorySchema()
  await repository.ensureKnowledgePathSchema()
  const db = mysql.getMySqlPool()
  await db.query("DELETE FROM chat_messages WHERE account_id LIKE 'legacy-%' OR interaction_id LIKE 'legacy-%'")
  await db.query("DELETE FROM tutoring_history WHERE account_id LIKE 'legacy-%'")
  await db.query("DELETE FROM knowledge_paths WHERE account_id LIKE 'legacy-%'")
  await db.query("DELETE FROM knowledge_path_ledger WHERE account_id LIKE 'legacy-%'")
  await db.query("DELETE FROM profile_results WHERE account_id LIKE 'legacy-%'")
  await db.query("DELETE FROM account_settings WHERE account_id LIKE 'legacy-%'")
  await db.query("DELETE FROM learning_cycles WHERE account_id LIKE 'legacy-%'")
  await db.query('TRUNCATE TABLE migration_source_ledger')
}

function setupSource() {
  const fixture = buildLegacyFixture()
  const sourcePath = tmp('source.json')
  fs.writeFileSync(sourcePath, JSON.stringify(fixture.store), 'utf8')
  return { ...fixture, sourcePath }
}

after(async () => {
  // 恢复调用方环境
  for (const [k, v] of Object.entries(MYSQL_ENV_SNAPSHOT)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    const { closeMySqlPool } = await import('../server/store/mysql.js')
    await closeMySqlPool()
  } catch { /* ignore */ }
})

/* ============ A1/A2 dry-run 只读 ============ */

test('B-4 dry-run：严格只读，输出账号分布/数量/结构变体/冲突预测/隔离清单', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，dry-run 门禁未实测' }, async () => {
  const { store, accountA, sourcePath } = setupSource()
  await resetTestDb()
  try {
    const report = await migrator.runMigration({
      mode: 'dry-run',
      sourcePath,
      env: process.env,
    })
    assert.equal(report.ok, true, `dry-run 应成功: ${JSON.stringify(report.errors)}`)
    // 数量与账号分布
    assert.ok(report.categories.chat >= 2, '聊天类别应覆盖账号映射结构')
    assert.ok(report.categories.tutoring >= 1)
    assert.ok(report.categories.knowledgePath >= 2)
    assert.ok(report.categories.profile >= 1)
    assert.ok(report.categories.learningCycle >= 2)
    // 结构变体识别
    assert.ok(report.structureVariants.some(v => v.shape === 'legacy-global-array'), '应识别旧全局数组结构')
    // 隔离清单：全局数组归属假设 + 演示种子跳过
    assert.ok(report.isolated.some(i => i.reason.includes('global-array')), '旧全局数组应进隔离清单')
    assert.ok(report.skipped.some(s => s.category === 'agentCollaboration'), '演示种子必须跳过')
    // 严格只读：不写目标库（账本表为空）
    const ledgerCount = await migrator.countLedger(process.env)
    assert.equal(ledgerCount, 0, 'dry-run 不得写入迁移账本')
    // 孤儿消息（缺助手回复）识别
    assert.ok(report.anomalies.some(a => a.kind === 'chat-without-assistant'), '缺助手回复的历史消息应被识别')
  } finally {
    fs.rmSync(sourcePath, { force: true })
    void store
    void accountA
  }
})

/* ============ A2/A5 首次导入 + 二次零重复 ============ */

test('B-4 import：首次导入各类别落库，二次导入零重复', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，导入幂等门禁未实测' }, async () => {
  const { accountA, accountB, sourcePath } = setupSource()
  await resetTestDb()
  try {
    const first = await migrator.runMigration({ mode: 'import', sourcePath, env: process.env })
    assert.equal(first.ok, true, `首次导入应成功: ${JSON.stringify(first.errors)}`)
    assert.ok(first.imported.chat >= 2, '账号映射聊天应导入')
    assert.ok(first.imported.tutoring >= 3, '导师历史应导入')
    assert.ok(first.imported.knowledgePath >= 2, '知识路径应导入')
    assert.ok(first.imported.profile >= 1)
    assert.ok(first.imported.learningCycle >= 2)

    // 目标数据可读且账号隔离
    const chatA = await repository.getChatHistory(accountA)
    const chatB = await repository.getChatHistory(accountB)
    assert.equal(chatA.length, 3, 'A 的聊天应完整导入（含顺序）')
    assert.equal(chatB.length, 2, 'B 的聊天应完整导入')
    assert.equal(chatA[0].content, '甲的问题 😀 中文', 'Unicode 保真')
    assert.deepEqual(chatA[0].multimodalContents, [{ type: 'text', data: '多模态' }], '多模态元数据保真')
    assert.equal(chatA[chatA.length - 1].content, '甲的追问', '源数组顺序保真')

    // 顺序保真：B 的顺序也不串
    assert.equal(chatB[0].content, '乙的问题')
    assert.equal(chatB[1].content, '乙的回复')

    // 导师三态保真
    const tutorA = await repository.getTutoringHistory(accountA)
    assert.equal(tutorA.length, 3)
    assert.deepEqual(tutorA[0].fallbackAgents, [], '真实模型空数组保真')
    assert.deepEqual(tutorA[1].fallbackAgents, ['TutorAgent'], '降级列表保真')
    assert.ok(!('fallbackAgents' in tutorA[2]), '未知来源不得补写')

    // 知识路径版本保真（A v5 原样；B 缺 version 归一化）
    const pathA = await repository.getLatestKnowledgePath(accountA)
    assert.equal(pathA.version, 5, '已有版本的路径必须原样保留')
    const pathB = await repository.getLatestKnowledgePath(accountB)
    assert.ok(pathB && (Number(pathB.version) || 1) >= 1, '缺 version 的旧路径首次导入归一化')

    // 二次导入：零重复
    const second = await migrator.runMigration({ mode: 'import', sourcePath, env: process.env })
    assert.equal(second.ok, true)
    assert.deepEqual(second.imported, {
      chat: 0, tutoring: 0, knowledgePath: 0, profile: 0, learningCycle: 0,
    }, '二次导入必须零重复（账本幂等）')

    const chatAAfter = await repository.getChatHistory(accountA)
    assert.equal(chatAAfter.length, 3, '二次导入后聊天不得重复')
    const tutorAAfter = await repository.getTutoringHistory(accountA)
    assert.equal(tutorAAfter.length, 3, '二次导入后辅导历史不得重复')
  } finally {
    fs.rmSync(sourcePath, { force: true })
  }
})

/* ============ A5 版本冲突保护 ============ */

test('B-4 import：目标已有更高版本路径 → 跳过保护（不覆盖）', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，版本冲突门禁未实测' }, async () => {
  const { accountA, sourcePath } = setupSource()
  await resetTestDb()
  try {
    // 目标先推进到 v9（比源 v5 更新）
    await repository.saveKnowledgePathResult(accountA, {
      version: 9, basedOn: 8,
      phases: [{ id: 'p1', title: '阶段一', topics: [{ id: 'topic-alpha', title: '甲', mastery: 0.95 }] }],
      updatedAt: '2026-10-09T00:00:00.000Z',
    })
    const result = await migrator.runMigration({ mode: 'import', sourcePath, env: process.env })
    assert.equal(result.ok, true)
    assert.ok(result.conflicts.knowledgePath >= 1, '源 v5 vs 目标 v9 必须记冲突并跳过')
    const current = await repository.getLatestKnowledgePath(accountA)
    assert.equal(current.version, 9, '目标较新路径不得被旧源覆盖')
    assert.equal(current.phases[0].topics[0].mastery, 0.95, '目标路径内容不得被覆盖')
  } finally {
    fs.rmSync(sourcePath, { force: true })
  }
})

/* ============ A1/A5 来源损坏阻断 ============ */

test('B-4 import：来源 JSON 损坏 → 明确阻断，不退化为空数据继续', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，损坏阻断门禁未实测' }, async () => {
  const { accountA } = setupSource()
  const brokenPath = tmp('broken.json')
  fs.writeFileSync(brokenPath, '{"chatHistory": [{"id": 1, ', 'utf8')
  try {
    const result = await migrator.runMigration({ mode: 'import', sourcePath: brokenPath, env: process.env })
    assert.equal(result.ok, false, '来源损坏必须明确失败')
    assert.match(result.errors[0] || '', /损坏|解析|JSON/i)
    // 不得写任何数据
    assert.equal((await repository.getChatHistory(accountA)).length, 0, '损坏来源不得产生导入数据')
  } finally {
    fs.rmSync(brokenPath, { force: true })
  }
})

/* ============ A4-10 中断恢复 ============ */

test('B-4 import：中途中断后重跑接续，无重复无丢失', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，中断恢复门禁未实测' }, async () => {
  const { accountA, sourcePath } = setupSource()
  await resetTestDb()
  try {
    // 第一次：注入中断（处理完第一个账号批次后抛错，模拟断电）
    const aborted = await migrator.runMigration({
      mode: 'import', sourcePath, env: process.env,
      faultAfterFirstBatch: true,
    })
    assert.equal(aborted.ok, false, '注入中断必须失败')

    // 重跑：接续剩余批次
    const resumed = await migrator.runMigration({ mode: 'import', sourcePath, env: process.env })
    assert.equal(resumed.ok, true, '恢复运行必须成功')

    // 无重复无丢失
    const chatA = await repository.getChatHistory(accountA)
    assert.equal(chatA.length, 3, '中断恢复后 A 的聊天必须完整且不重复')
    const tutorA = await repository.getTutoringHistory(accountA)
    assert.equal(tutorA.length, 3, '中断恢复后辅导历史必须完整')
  } finally {
    fs.rmSync(sourcePath, { force: true })
  }
})

/* ============ verify：源目标对账 ============ */

test('B-4 verify：源与目标逐项对账（数量/归属/顺序/三态/摘要）', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，verify 门禁未实测' }, async () => {
  const { accountA, accountB, sourcePath } = setupSource()
  await resetTestDb()
  try {
    await migrator.runMigration({ mode: 'import', sourcePath, env: process.env })
    const report = await migrator.runMigration({ mode: 'verify', sourcePath, env: process.env })
    assert.equal(report.ok, true, `verify 对应账一致: ${JSON.stringify(report.mismatches)}`)
    assert.equal(report.mismatches.length, 0, '不得存在对账差异')
    // user 记录进账本（assistant 随配对导入，不单独记账）：
    // A 2 条 + B 1 条 + default 1 条 = 4
    assert.ok(report.checked.chat >= 4, `聊天对账条数，实际=${report.checked.chat}`)
    assert.ok(report.checked.tutoring >= 3, `辅导对账条数，实际=${report.checked.tutoring}`)
  } finally {
    fs.rmSync(sourcePath, { force: true })
    void accountA; void accountB
  }
})

/* ============ A5 DB 断开 fail-closed ============ */

test('B-4 import：数据库断开 → 明确失败，不静默转写 JSON', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，fail-closed 门禁未实测' }, async () => {
  const { sourcePath } = setupSource()
  // 子进程验证：mysql2 连接池为模块级单例（env 覆盖不重建），断连场景
  // 必须在全新进程中以启动环境变量为准才真实。
  const brokenEnv = {
    ...process.env,
    MYSQL_HOST: '127.0.0.1', MYSQL_PORT: '3999', MYSQL_USER: 'root', MYSQL_PASSWORD: 'x', MYSQL_DATABASE: 'edumind_nonexistent',
  }
  const probeWorker = path.join(root, 'scripts', 'migration-probe-worker.mjs')
  try {
    const child = spawn(process.execPath, [probeWorker, '--source', sourcePath, '--mode', 'import'], { cwd: root, env: brokenEnv, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let spawnError = null
    child.stdout.on('data', d => { stdout += String(d) })
    child.stderr.on('data', d => { stderr += String(d) })
    child.on('error', error => { spawnError = error })
    const [exitCode] = await once(child, 'exit')
    assert.equal(spawnError, null, `子进程启动失败: ${spawnError?.message || 'unknown'}（cwd=${root} execPath=${process.execPath}）`)
    const line = stdout.split('\n').find(l => l.startsWith('RESULT:'))
    assert.ok(line, `子进程应输出结果，stderr=${stderr.slice(0, 300)}`)
    const result = JSON.parse(line.slice('RESULT:'.length))
    assert.equal(result.ok, false, '数据库不可达必须失败')
    assert.match((result.errors || []).join(' ') || stderr, /数据库|连接|MySQL|ECONNREFUSED|connect/i, '失败原因必须明确指向数据库连接')
    void exitCode
  } finally {
    fs.rmSync(sourcePath, { force: true })
  }
})
