#!/usr/bin/env node
/**
 * MySQL 生产数据层验收（P4-0 · feat/mobile-v1）
 *
 * 前置：MYSQL_HOST/USER/PASSWORD/DATABASE（或 MYSQL_URL）指向专用
 * 测试库。拒绝无凭据运行。
 *
 * 门禁：
 *   1. 全新库建表 + 完整学习闭环 + 逐项 SQL 验证持久化
 *   2. 10 并发 claim 单飞（未处理的新会话）
 *   3. CAS 接管 + fencing（超时记录；旧代际拒绝）
 *   4. 修订写后崩溃恢复（after-revision-write + 重启，唯一约束幂等）
 *   5. 双进程同时处理同一已完成会话（都返回结果、修订不重复）
 *   6. 旧 Schema 升级迁移（P3-2.1 形态 → P3.4，旧数据保留）
 *
 * 端口分配：每个阶段独立端口，避免 Windows 端口复用竞态。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const results = []

function report(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

function mysqlEnv(database) {
  const env = {
    MYSQL_HOST: process.env.MYSQL_HOST || '127.0.0.1',
    MYSQL_PORT: process.env.MYSQL_PORT || '3306',
    MYSQL_USER: process.env.MYSQL_USER || 'root',
    MYSQL_PASSWORD: process.env.MYSQL_PASSWORD || '',
    MYSQL_DATABASE: database,
  }
  if (process.env.MYSQL_URL) env.MYSQL_URL = process.env.MYSQL_URL
  return env
}

function startServer(port, database, extraEnv = {}) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      ...mysqlEnv(database),
      ZHIXUE_FEEDBACK_STALE_MS: '0',
      ...extraEnv,
    },
    stdio: 'ignore',
  })
  child.unref()
  return child
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return
  child.kill()
  await Promise.race([
    new Promise(resolve => child.on('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 2000)),
  ])
  await sleep(300) // 端口释放缓冲
}

async function waitUp(baseUrl, timeout = 20000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`)
      if (res.ok) return true
    } catch {}
    await sleep(150)
  }
  return false
}

async function login(baseUrl, account = 'reviewer') {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password: 'Zhixue2026!', role: 'student' }),
  })
  if (!res.ok) throw new Error(`login failed: ${res.status}`)
  const { token } = await res.json()
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function query(sql, params = []) {
  const mysql = await import('mysql2/promise')
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE,
  })
  try {
    const [rows] = await connection.query(sql, params)
    return rows
  } finally {
    await connection.end()
  }
}

/** 建档 + 路径 + 完成 3 题全对会话；runFeedback=false 时只做到完成 */
async function prepareSession(baseUrl, auth, { runFeedback = true } = {}) {
  await fetch(`${baseUrl}/api/profile/save`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ dimensions: [{ label: '逻辑思维', value: 50, color: '#3b82f6' }], totalScore: 50, source: 'profile-save' }),
  })
  await fetch(`${baseUrl}/api/knowledge-path/generate`, { method: 'POST', headers: auth, body: '{}' })
  const created = await (await fetch(`${baseUrl}/api/study/sessions`, {
    method: 'POST', headers: auth, body: JSON.stringify({ topicId: 'f1', exerciseCount: 3 }),
  })).json()
  const bank = JSON.parse(fs.readFileSync(path.join(projectRoot, 'server/study/exercise-bank.json'), 'utf8'))
  for (const [index, exercise] of created.exercises.entries()) {
    const correctIndex = bank.exercises.find(item => item.id === exercise.id).answer
    await fetch(`${baseUrl}/api/study/sessions/${created.session.id}/answers`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ exerciseId: exercise.id, submitted: correctIndex, idempotencyKey: `idem-mysql-${Date.now()}-${index}` }),
    })
  }
  await fetch(`${baseUrl}/api/study/sessions/${created.session.id}/complete`, { method: 'POST', headers: auth })
  if (runFeedback) {
    const feedback = await fetch(`${baseUrl}/api/study/sessions/${created.session.id}/feedback`, { method: 'POST', headers: auth })
    return { sessionId: created.session.id, feedbackStatus: feedback.status }
  }
  return { sessionId: created.session.id, feedbackStatus: null }
}

/** 直接调用 feedback-state 的 claim（DB 层单飞验证） */
async function claimDirect(sessionId, account = 'reviewer') {
  const mod = await import('../server/study/feedback-state.js')
  const claim = await mod.claimFeedback(account, sessionId)
  return claim.status
}

async function main() {
  if (!process.env.MYSQL_PASSWORD && !process.env.MYSQL_URL) {
    console.error('缺少 MYSQL_PASSWORD 或 MYSQL_URL，拒绝运行（不猜凭据）。')
    process.exit(2)
  }
  const database = process.env.MYSQL_DATABASE || 'edumind_p4test'
  console.log(`使用测试库: ${database}`)

  /* ========== 1. 全新库：建表 + 完整闭环 + 持久化验证 ========== */
  let api = startServer(18811, database)
  const base = 'http://127.0.0.1:18811'
  try {
    report('服务启动（MySQL 模式）', await waitUp(base))
    const auth = await login(base)
    const { sessionId, feedbackStatus } = await prepareSession(base, auth)
    report('完整学习闭环（feedback 200）', feedbackStatus === 200, `status=${feedbackStatus}`)

    const profile = await (await fetch(`${base}/api/profile/latest`, { headers: auth })).json()
    report('画像持久化到 MySQL', profile.result?.dimensions?.[0]?.value === 54, `逻辑思维=${profile.result?.dimensions?.[0]?.value}`)

    const revisions = await query('SELECT id, session_id, attribution FROM profile_revisions WHERE account_id = ?', ['reviewer'])
    report('修订账本含 session_id', revisions.length === 1 && revisions[0].session_id === sessionId,
      `rows=${revisions.length} session_id=${revisions[0]?.session_id}`)

    const sessions = await query('SELECT bank_version, exercise_snapshot_json FROM study_sessions WHERE id = ?', [sessionId])
    report('会话题目快照列有值', sessions.length === 1 && sessions[0].bank_version > 0 && sessions[0].exercise_snapshot_json,
      `bank_version=${sessions[0]?.bank_version}`)

    const feedbackRows = await query('SELECT pending_revision_json, partial_json FROM study_feedback WHERE session_id = ?', [sessionId])
    report('study_feedback 新列可用', feedbackRows.length === 1 && feedbackRows[0].pending_revision_json && feedbackRows[0].partial_json,
      `rows=${feedbackRows.length}`)

    const submitted = await query('SELECT submitted_json FROM answer_submissions WHERE session_id = ?', [sessionId])
    report('answer_submissions.submitted_json 有值', submitted.length === 3 && submitted.every(r => r.submitted_json !== null),
      `rows=${submitted.length}`)

    /* ========== 2. 10 并发 claim 单飞（未处理的新会话） ========== */
    // 注意：本阶段用默认超时窗口（60s）。若窗口为 0，处理中记录立即变为
    // 可接管，抢占失败者会立刻接管——那是接管语义，不是并发单飞语义。
    const { sessionId: freshId } = await prepareSession(base, auth, { runFeedback: false })
    const claims = await Promise.all(Array.from({ length: 10 }, () => claimDirect(freshId)))
    const claimedCount = claims.filter(c => c === 'claimed').length
    report('10 并发 claim 单飞', claimedCount === 1, `claimed=${claimedCount} 其余=${[...new Set(claims.filter(c => c !== 'claimed'))].join('/') || '让位'}`)

    /* ========== 3. CAS 接管 + fencing ========== */
    // freshId 已处于 processing。接管语义需要「记录已超时」——把测试进程的
    // 超时窗口设为 0（staleMs() 调用时读取，模块加载后设置也生效）。
    process.env.ZHIXUE_FEEDBACK_STALE_MS = '0'
    const takeover = await claimDirect(freshId)
    report('超时记录可被接管（CAS）', takeover === 'claimed', `status=${takeover}`)

    // fencing：旧代际（attempt=1）直接 mutate 应被拒绝
    const stateMod = await import('../server/study/feedback-state.js')
    const staleWrite = await stateMod.mutateFeedback('reviewer', freshId, 1, r => ({ ...r, status: 'completed' }))
    report('旧代纪写入被拒绝（fencing）', staleWrite.ok === false && staleWrite.code === 'stale-executor',
      `ok=${staleWrite.ok} code=${staleWrite.code}`)

    /* ========== 4. 双进程处理同一已完成会话 ========== */
    const api2 = startServer(18812, database)
    const base2 = 'http://127.0.0.1:18812'
    try {
      report('第二服务进程启动', await waitUp(base2))
      const auth2 = await login(base2)
      const [r1, r2] = await Promise.all([
        fetch(`${base}/api/study/sessions/${sessionId}/feedback`, { method: 'POST', headers: auth }),
        fetch(`${base2}/api/study/sessions/${sessionId}/feedback`, { method: 'POST', headers: auth2 }),
      ])
      const [b1, b2] = await Promise.all([r1.json(), r2.json()])
      report('双进程重复反馈都返回 200', r1.status === 200 && r2.status === 200)
      report('双进程返回同一评估', JSON.stringify(b1.assessment) === JSON.stringify(b2.assessment))
      const revisionsAfter = await query('SELECT COUNT(*) AS n FROM profile_revisions WHERE account_id = ?', ['reviewer'])
      report('双进程后修订仍只有 1 条', revisionsAfter[0].n === 1, `n=${revisionsAfter[0].n}`)
    } finally {
      await stopServer(api2)
    }
  } finally {
    await stopServer(api)
  }

  /* ========== 5. 修订写后崩溃恢复（故障注入 + 重启） ========== */
  let apiCrash = startServer(18813, database, { ZHIXUE_FAULT_INJECT: 'after-revision-write' })
  const baseCrash = 'http://127.0.0.1:18813'
  let crashSessionId = null
  try {
    report('崩溃注入服务启动', await waitUp(baseCrash))
    const authCrash = await login(baseCrash)
    const prepared = await prepareSession(baseCrash, authCrash, { runFeedback: false })
    crashSessionId = prepared.sessionId
    const firstTry = await fetch(`${baseCrash}/api/study/sessions/${crashSessionId}/feedback`, { method: 'POST', headers: authCrash })
    report('故障注入导致 500', firstTry.status === 500, `status=${firstTry.status}`)
    const midRevisions = await query('SELECT COUNT(*) AS n FROM profile_revisions WHERE account_id = ?', ['reviewer'])
    report('崩溃时修订已写入', midRevisions[0].n === 2, `n=${midRevisions[0].n}`)
  } finally {
    await stopServer(apiCrash)
  }
  apiCrash = startServer(18814, database) // 新端口，避免复用竞态
  const baseRecover = 'http://127.0.0.1:18814'
  try {
    report('恢复服务启动（新端口）', await waitUp(baseRecover))
    const authRecover = await login(baseRecover)
    const retry = await fetch(`${baseRecover}/api/study/sessions/${crashSessionId}/feedback`, { method: 'POST', headers: authRecover })
    report('重启后反馈成功（恢复）', retry.status === 200, `status=${retry.status}`)
    const finalRevisions = await query('SELECT COUNT(*) AS n FROM profile_revisions WHERE account_id = ?', ['reviewer'])
    report('恢复后修订不重复（唯一约束幂等）', finalRevisions[0].n === 2, `n=${finalRevisions[0].n}`)
    // prepareSession 每轮把基线重置为 50，因此本会话的正确落点是 54；
    // 关键是崩溃+恢复全过程只应用了一次（不是 58）
    const profileAfter = await (await fetch(`${baseRecover}/api/profile/latest`, { headers: authRecover })).json()
    const logic = profileAfter.result?.dimensions?.find(d => d.label === '逻辑思维')
    report('恢复后画像只被应用一次（50→54，非 58）', logic?.value === 54, `逻辑思维=${logic?.value}`)
    const intentRow = await query('SELECT JSON_EXTRACT(profile_after_json, \'$."逻辑思维"\') AS v FROM study_feedback WHERE session_id = ?', [crashSessionId])
    report('崩溃尝试的意图记录为 54（与最终一致）', Number(intentRow[0]?.v) === 54, `intent=${intentRow[0]?.v}`)
  } finally {
    await stopServer(apiCrash)
  }

  /* ========== 6. 旧 Schema 升级迁移（P3-2.1 形态） ========== */
  const legacyDb = `${database}_legacy`
  const mysql = await import('mysql2/promise')
  const admin = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    multipleStatements: true,
  })
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${legacyDb}`)
    await admin.query(`CREATE DATABASE ${legacyDb} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    await admin.query(`USE ${legacyDb}`)
    // P3-2.1 形态：缺 P3.4/P4-0 新增列
    await admin.query(`
      CREATE TABLE study_feedback (
        account_id VARCHAR(191) NOT NULL,
        session_id VARCHAR(64) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'processing',
        attempt INT NOT NULL DEFAULT 1,
        started_at DATETIME(3) NOT NULL,
        finished_at DATETIME(3) NULL,
        error VARCHAR(500) NULL,
        result_json JSON NULL,
        steps_json JSON NOT NULL,
        profile_after_json JSON NULL,
        path_version_after INT NULL,
        PRIMARY KEY (account_id, session_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      CREATE TABLE study_sessions (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        account_id VARCHAR(191) NOT NULL,
        topic_id VARCHAR(191) NULL,
        phase_id VARCHAR(191) NULL,
        timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        exercise_ids JSON NOT NULL,
        created_at DATETIME(3) NOT NULL,
        completed_at DATETIME(3) NULL,
        KEY study_sessions_account (account_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      CREATE TABLE answer_submissions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(64) NOT NULL,
        account_id VARCHAR(191) NOT NULL,
        exercise_id VARCHAR(191) NOT NULL,
        exercise_version INT NOT NULL,
        correct TINYINT(1) NOT NULL,
        reason VARCHAR(255) NOT NULL DEFAULT '',
        idempotency_key VARCHAR(191) NOT NULL,
        submitted_at DATETIME(3) NOT NULL,
        UNIQUE KEY answer_submissions_idem (idempotency_key),
        UNIQUE KEY answer_submissions_session_exercise (session_id, exercise_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      CREATE TABLE profile_revisions (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        account_id VARCHAR(191) NOT NULL,
        event_ids JSON NOT NULL,
        before_json JSON NULL,
        after_json JSON NULL,
        reason VARCHAR(500) NOT NULL DEFAULT '',
        source VARCHAR(16) NOT NULL DEFAULT 'rule',
        version INT NOT NULL DEFAULT 1,
        created_at DATETIME(3) NOT NULL,
        KEY profile_revisions_account (account_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      CREATE TABLE learning_events (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        account_id VARCHAR(191) NOT NULL,
        session_id VARCHAR(64) NULL,
        type VARCHAR(64) NOT NULL,
        ref_json JSON NOT NULL,
        at DATETIME(3) NOT NULL,
        KEY learning_events_account (account_id, at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      -- 灌入 P3-2.1 时代的旧数据（无 session_id 的修订 + 无快照的会话）
      INSERT INTO profile_revisions (id, account_id, event_ids, reason, source, version, created_at)
        VALUES ('legacy-rev-1', 'reviewer', CAST('[]' AS JSON), 'P3-2.1 时代的历史修订（无会话归属）', 'rule', 1, '2026-10-01 10:00:00.000');
      INSERT INTO study_feedback (account_id, session_id, status, attempt, started_at, steps_json)
        VALUES ('reviewer', 'legacy-session-1', 'completed', 1, '2026-10-01 09:00:00.000', CAST('{"profile":"done","path":"done","revision":"done"}' AS JSON));
    `)
    console.log(`旧 Schema 库就绪: ${legacyDb}（含 P3-2.1 形态表 + 历史数据）`)
  } finally {
    await admin.end()
  }

  let apiLegacy = startServer(18815, legacyDb)
  const baseLegacy = 'http://127.0.0.1:18815'
  try {
    report('旧库服务启动（触发迁移）', await waitUp(baseLegacy))
    // 通过 HTTP 跑一次完整 feedback——由服务端自己的 ensureStudySchema
    // 执行补列迁移（不能用测试进程内的 claimDirect：那连的是主库）
    const authLegacy = await login(baseLegacy)
    const { sessionId: legacyCycleId, feedbackStatus } = await prepareSession(baseLegacy, authLegacy)
    report('旧库升级后完整闭环可用', feedbackStatus === 200, `status=${feedbackStatus}`)

    // 验证新列存在
    const columns = await queryColumnCheck(legacyDb, 'study_feedback', ['pending_revision_json', 'partial_json'])
    report('study_feedback 补列成功', columns.every(Boolean), `pending_revision=${columns[0]} partial=${columns[1]}`)
    const sessionColumns = await queryColumnCheck(legacyDb, 'study_sessions', ['bank_version', 'exercise_snapshot_json'])
    report('study_sessions 补列成功', sessionColumns.every(Boolean), `bank_version=${sessionColumns[0]} snapshot=${sessionColumns[1]}`)
    const revisionColumns = await queryColumnCheck(legacyDb, 'profile_revisions', ['session_id', 'attribution'])
    report('profile_revisions 补列成功', revisionColumns.every(Boolean), `session_id=${revisionColumns[0]} attribution=${revisionColumns[1]}`)

    // 历史数据保留
    const legacyRev = await queryOn(legacyDb, "SELECT id, attribution FROM profile_revisions WHERE id = 'legacy-rev-1'")
    report('P3-2.1 历史修订保留', legacyRev.length === 1, `attribution=${legacyRev[0]?.attribution}`)
    const legacyFb = await queryOn(legacyDb, "SELECT status FROM study_feedback WHERE session_id = 'legacy-session-1'")
    report('P3-2.1 历史反馈记录保留', legacyFb.length === 1 && legacyFb[0].status === 'completed')
  } finally {
    await stopServer(apiLegacy)
    const cleanup = await mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
    })
    await cleanup.query(`DROP DATABASE IF EXISTS ${legacyDb}`)
    await cleanup.end()
  }

  const failed = results.filter(r => !r.ok)
  // 关闭测试进程内的 mysql2 连接池（正确清理，避免挂住事件循环）
  try {
    const { closeMySqlPool } = await import('../server/store/mysql.js')
    await closeMySqlPool()
  } catch {
    /* ignore */
  }
  console.log(`\nMySQL 集成验收汇总: ${results.length - failed.length}/${results.length} 通过`)
  if (failed.length > 0) process.exitCode = 1
}

async function queryColumnCheck(database, table, columns) {
  const rows = await queryOn(database, `
    SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
  `, [database, table])
  const names = new Set(rows.map(r => r.COLUMN_NAME))
  return columns.map(c => names.has(c))
}

async function queryOn(database, sql, params = []) {
  const mysql = await import('mysql2/promise')
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database,
  })
  try {
    const [rows] = await connection.query(sql, params)
    return rows
  } finally {
    await connection.end()
  }
}

main().catch(err => {
  console.error('MySQL 集成验收执行异常:', err)
  process.exitCode = 1
})
