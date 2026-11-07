import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import mysql from 'mysql2/promise'

const configured = Boolean(process.env.MYSQL_URL || (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE))
const options = { skip: configured ? false : '未配置 MySQL：索引迁移和双进程初始化未实测' }
const root = fileURLToPath(new URL('..', import.meta.url))
const database = `edumind_idx_${crypto.randomBytes(8).toString('hex')}`
let admin, db, workerEnv

before(async () => {
  if (!configured) return
  admin = await mysql.createConnection(process.env.MYSQL_URL || {
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD || '',
  })
  // Only this uniquely named fixture database is created/removed.
  await admin.query(`CREATE DATABASE ${database}`)
  const cfg = admin.config
  workerEnv = { ...process.env, MYSQL_URL: '', MYSQL_HOST: cfg.host, MYSQL_PORT: String(cfg.port),
    MYSQL_USER: cfg.user, MYSQL_PASSWORD: cfg.password || '', MYSQL_DATABASE: database }
  db = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database })
})
after(async () => {
  await db?.end()
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${database}`)
    await admin.end()
  }
})

async function indexDefinition() {
  const [rows] = await db.query("SELECT COLUMN_NAME, NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'answer_submissions' AND INDEX_NAME = 'answer_submissions_idem' ORDER BY SEQ_IN_INDEX")
  return rows.map(row => [row.COLUMN_NAME, Number(row.NON_UNIQUE)])
}
const expected = [['account_id', 0], ['session_id', 0], ['idempotency_key', 0]]

async function workers(count = 1) {
  const children = Array.from({ length: count }, () => {
    const child = spawn(process.execPath, ['scripts/study-schema-init-worker.mjs'], {
      cwd: root, env: workerEnv, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = '', stderr = ''
    const ready = new Promise((resolve, reject) => {
      child.stdout.on('data', chunk => { stdout += chunk; if (stdout.includes('ready')) resolve() })
      child.stderr.on('data', chunk => { stderr += chunk })
      child.on('error', reject)
      child.on('exit', () => { if (!stdout.includes('ready')) reject(new Error(stderr || 'worker exited before ready')) })
    })
    const done = once(child, 'exit').then(([code]) => {
      const last = stdout.trim().split(/\r?\n/).at(-1)
      const result = JSON.parse(last)
      return { ...result, exitCode: code }
    })
    return { child, ready, done }
  })
  const timeout = setTimeout(() => children.forEach(({ child }) => child.kill()), 45_000)
  try {
    await Promise.all(children.map(item => item.ready))
    children.forEach(({ child }) => child.stdin.end('go'))
    return await Promise.all(children.map(item => item.done))
  } finally {
    clearTimeout(timeout)
    children.forEach(({ child }) => { if (child.exitCode === null) child.kill() })
  }
}

test('MySQL 索引：正确结构跨进程重复初始化不执行任何删建', options, async () => {
  const initial = await workers()
  assert.equal(initial[0].ok, true, JSON.stringify(initial))
  assert.deepEqual(await indexDefinition(), expected)
  const repeated = await workers(2)
  assert.ok(repeated.every(item => item.ok), JSON.stringify(repeated))
  assert.equal(repeated.reduce((sum, item) => sum + item.indexAlters, 0), 0, '已正确的索引不得被删除重建')
})

test('MySQL 索引：两个进程并发迁移旧全局索引只替换一次，历史数据不丢', options, async () => {
  await db.query('ALTER TABLE answer_submissions DROP INDEX answer_submissions_idem, ADD UNIQUE KEY answer_submissions_idem (idempotency_key)')
  await db.query("INSERT INTO answer_submissions (session_id,account_id,exercise_id,exercise_version,correct,reason,idempotency_key,submitted_at) VALUES ('session-a','account-a','exercise-a',1,1,'fixture','shared-key',NOW())")
  const result = await workers(2)
  assert.ok(result.every(item => item.ok && item.exitCode === 0), JSON.stringify(result))
  assert.equal(result.reduce((sum, item) => sum + item.indexAlters, 0), 1, '旧索引应只用一条 ALTER 替换一次')
  assert.deepEqual(await indexDefinition(), expected)
  const [rows] = await db.query("SELECT correct FROM answer_submissions WHERE account_id='account-a'")
  assert.equal(rows.length, 1)
  assert.equal(rows[0].correct, 1)
  // Same key is legal for another account/session, but rejected in its own scope.
  await db.query("INSERT INTO answer_submissions (session_id,account_id,exercise_id,exercise_version,correct,reason,idempotency_key,submitted_at) VALUES ('session-b','account-b','exercise-b',1,0,'fixture','shared-key',NOW())")
  await assert.rejects(db.query("INSERT INTO answer_submissions (session_id,account_id,exercise_id,exercise_version,correct,reason,idempotency_key,submitted_at) VALUES ('session-b','account-b','exercise-c',1,1,'fixture','shared-key',NOW())"), { code: 'ER_DUP_ENTRY' })
})

test('MySQL 索引：缺失索引并发初始化只补建一次', options, async () => {
  await db.query('ALTER TABLE answer_submissions DROP INDEX answer_submissions_idem')
  const result = await workers(2)
  assert.ok(result.every(item => item.ok), JSON.stringify(result))
  assert.equal(result.reduce((sum, item) => sum + item.indexAlters, 0), 1)
  assert.deepEqual(await indexDefinition(), expected)
})

test('MySQL 索引：意外结构明确失败，保留原索引和历史数据', options, async () => {
  await db.query('ALTER TABLE answer_submissions DROP INDEX answer_submissions_idem, ADD INDEX answer_submissions_idem (account_id)')
  const result = await workers()
  assert.equal(result[0].ok, false)
  assert.equal(result[0].code, 'STUDY_INDEX_SCHEMA_MISMATCH')
  assert.equal(result[0].indexAlters, 0)
  assert.deepEqual(await indexDefinition(), [['account_id', 1]])
  const [[row]] = await db.query('SELECT COUNT(*) AS count FROM answer_submissions')
  assert.equal(row.count, 2)
})
