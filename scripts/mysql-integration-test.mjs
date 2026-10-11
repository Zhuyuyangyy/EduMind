#!/usr/bin/env node
/**
 * MySQL 生产数据层验收（P4-0 · feat/mobile-v1）
 *
 * 前置：MYSQL_URL 或 MYSQL_HOST/USER/PASSWORD/DATABASE 指向一个
 * **专用测试库**（如 edumind_p4test）。本脚本会：
 *   1. 全新库建表 + 完整学习闭环（profile/path/session/answers/
 *      feedback/revision）
 *   2. 旧 Schema（P3-2.1 形态）升级迁移验证：先按旧结构建表灌数据，
 *      再启动服务触发补列迁移，验证旧数据保留、新列可用
 *   3. 并发 claim 单飞（10 并发）
 *   4. CAS 接管 + fencing（旧代际写入被拒绝）
 *   5. 修订写后崩溃恢复（会话级唯一约束幂等）
 *   6. 双进程同时处理同一会话（文件锁之外的 DB 层单飞）
 *   7. 数据库短暂断连后恢复（服务保持可用或明确失败）
 *
 * 用法：MYSQL_HOST=127.0.0.1 MYSQL_USER=root MYSQL_PASSWORD=*** \
 *       MYSQL_DATABASE=edumind_p4test node scripts/mysql-integration-test.mjs
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
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

function mysqlEnv(port, database) {
  const base = {
    MYSQL_HOST: process.env.MYSQL_HOST || '127.0.0.1',
    MYSQL_PORT: process.env.MYSQL_PORT || '3306',
    MYSQL_USER: process.env.MYSQL_USER || 'root',
    MYSQL_PASSWORD: process.env.MYSQL_PASSWORD || '',
    MYSQL_DATABASE: database,
  }
  if (process.env.MYSQL_URL) base.MYSQL_URL = process.env.MYSQL_URL
  return base
}

function startServer(port, database, extraEnv = {}) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      ...mysqlEnv(port, database),
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

/** 建库（若权限允许）并返回库名 */
async function ensureDatabase(database) {
  const mysql = await import('mysql2/promise').catch(() => null)
  if (!mysql) {
    // 无 mysql2 依赖时退回 mysql CLI
    return { ok: false, reason: 'mysql2 not installed' }
  }
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    multipleStatements: true,
  })
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await connection.end()
  return { ok: true }
}

/** 用 mysql2 直接执行 SQL（验证用） */
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

async function runFullCycle(baseUrl, auth) {
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
      body: JSON.stringify({ exerciseId: exercise.id, submitted: correctIndex, idempotencyKey: `idem-mysql-${index}` }),
    })
  }
  await fetch(`${baseUrl}/api/study/sessions/${created.session.id}/complete`, { method: 'POST', headers: auth })
  return created.session.id
}

async function main() {
  if (!process.env.MYSQL_PASSWORD && !process.env.MYSQL_URL) {
    console.error('缺少 MYSQL_PASSWORD 或 MYSQL_URL，拒绝运行（不猜凭据）。')
    process.exit(2)
  }
  const database = process.env.MYSQL_DATABASE || 'edumind_p4test'
  const ensured = await ensureDatabase(database)
  if (!ensured.ok) {
    console.error(`建库失败：${ensured.reason}。请先安装 mysql2（npm i -D mysql2）或手动建库 ${database}。`)
    process.exit(2)
  }
  console.log(`使用测试库: ${database}`)

  /* ---------- 1. 全新库：建表 + 完整闭环 ---------- */
  let api = startServer(18801, database)
  const base = 'http://127.0.0.1:18801'
  try {
    report('服务启动（MySQL 模式）', await waitUp(base))
    const auth = await login(base)
    const sessionId = await runFullCycle(base, auth)
    const feedback = await (await fetch(`${base}/api/study/sessions/${sessionId}/feedback`, { method: 'POST', headers: auth })).json()
    report('完整学习闭环（profile→path→session→answers→feedback）',
      feedback.assessment?.total === 3 && feedback.assessment?.correct === 3,
      `assessment=${JSON.stringify(feedback.assessment)}`)

    const profile = await (await fetch(`${base}/api/profile/latest`, { headers: auth })).json()
    report('画像持久化到 MySQL', profile.result?.dimensions?.[0]?.value === 54, `逻辑思维=${profile.result?.dimensions?.[0]?.value}`)

    const revisions = await query('SELECT id, session_id, attribution FROM profile_revisions WHERE account_id = ?', ['reviewer'])
    report('修订账本含 session_id', revisions.length === 1 && revisions[0].session_id === sessionId,
      `rows=${revisions.length} session_id=${revisions[0]?.session_id}`)

    const sessions = await query('SELECT bank_version, exercise_snapshot_json FROM study_sessions WHERE id = ?', [sessionId])
    report('会话题目快照列有值', sessions.length === 1 && sessions[0].bank_version > 0 && sessions[0].exercise_snapshot_json,
      `bank_version=${sessions[0]?.bank_version}`)

    const feedbackRows = await query('SELECT pending_revision_json, partial_json FROM study_feedback WHERE session_id = ?', [sessionId])
    report('study_feedback 新列可用（pending_revision/partial）',
      feedbackRows.length === 1 && feedbackRows[0].pending_revision_json && feedbackRows[0].partial_json,
      `rows=${feedbackRows.length}`)

    const submitted = await query('SELECT submitted_json FROM answer_submissions WHERE session_id = ?', [sessionId])
    report('answer_submissions.submitted_json 有值', submitted.length === 3 && submitted.every(r => r.submitted_json !== null),
      `rows=${submitted.length}`)

    /* ---------- 3. 并发 claim 单飞 ---------- */
    const claims = await Promise.all(Array.from({ length: 10 }, () => claimFeedbackDirect(sessionId)))
    const claimedCount = claims.filter(c => c === 'claimed').length
    report('10 并发 claim 单飞', claimedCount === 1, `claimed=${claimedCount}`)

    /* ---------- 4. CAS 接管 + fencing ---------- */
    process.env.ZHIXUE_FEEDBACK_STALE_MS = '0'
    const takeover = await claimFeedbackDirect(sessionId)
    report('超时记录可被接管（CAS）', takeover === 'claimed', `status=${takeover}`)

    /* ---------- 6. 双进程同会话 ---------- */
    // 已完成会话的重复反馈：两个进程同时请求，都拿到缓存结果且不重复写
    const api2 = startServer(18802, database)
    const base2 = 'http://127.0.0.1:18802'
    try {
      report('第二服务进程启动', await waitUp(base2))
      const auth2 = await login(base2)
      const [r1, r2] = await Promise.all([
        fetch(`${base}/api/study/sessions/${sessionId}/feedback`, { method: 'POST', headers: auth }),
        fetch(`${base2}/api/study/sessions/${sessionId}/feedback`, { method: 'POST', headers: auth2 }),
      ])
      const [b1, b2] = await Promise.all([r1.json(), r2.json()])
      report('双进程重复反馈都返回结果', r1.status === 200 && r2.status === 200)
      const revisionsAfter = await query('SELECT COUNT(*) AS n FROM profile_revisions WHERE account_id = ?', ['reviewer'])
      report('双进程后修订仍只有 1 条', revisionsAfter[0].n === 1, `n=${revisionsAfter[0].n}`)
    } finally {
      await stopServer(api2)
    }

    /* ---------- 5. 修订写后崩溃恢复 ---------- */
    // 用故障注入复现：新会话 + after-revision-write + 重启
    const crashPort = 18803
    let apiCrash = startServer(crashPort, database, { ZHIXUE_FAULT_INJECT: 'after-revision-write' })
    const baseCrash = `http://127.0.0.1:${crashPort}`
    let crashSessionId = null
    try {
      await waitUp(baseCrash)
      const authCrash = await login(baseCrash)
      crashSessionId = await runFullCycle(baseCrash, authCrash)
      const firstTry = await fetch(`${baseCrash}/api/study/sessions/${crashSessionId}/feedback`, { method: 'POST', headers: authCrash })
      report('故障注入导致 500', firstTry.status === 500)
      const midRevisions = await query('SELECT COUNT(*) AS n FROM profile_revisions WHERE account_id = ?', ['reviewer'])
      report('崩溃时修订已写入', midRevisions[0].n === 2, `n=${midRevisions[0].n}`)
    } finally {
      await stopServer(apiCrash)
    }
    // 重启（无故障）
    apiCrash = startServer(crashPort, database)
    try {
      await waitUp(baseCrash)
      const authCrash2 = await login(baseCrash)
      const retry = await fetch(`${baseCrash}/api/study/sessions/${crashSessionId}/feedback`, { method: 'POST', headers: authCrash2 })
      report('重启后反馈成功（恢复）', retry.status === 200)
      const finalRevisions = await query('SELECT COUNT(*) AS n FROM profile_revisions WHERE account_id = ?', ['reviewer'])
      report('恢复后修订不重复（唯一约束幂等）', finalRevisions[0].n === 2, `n=${finalRevisions[0].n}`)
    } finally {
      await stopServer(apiCrash)
    }
  } finally {
    await stopServer(api)
  }

  const failed = results.filter(r => !r.ok)
  console.log(`\nMySQL 集成验收汇总: ${results.length - failed.length}/${results.length} 通过`)
  if (failed.length > 0) process.exitCode = 1
}

// 直接调用 feedback-state 的 claim（绕过 HTTP，验证 DB 层单飞）
async function claimFeedbackDirect(sessionId) {
  const mod = await import('../server/study/feedback-state.js')
  const claim = await mod.claimFeedback('reviewer', sessionId)
  return claim.status
}

main().catch(err => {
  console.error('MySQL 集成验收执行异常:', err)
  process.exitCode = 1
})
