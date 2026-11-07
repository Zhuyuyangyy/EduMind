import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * P4-0 修订账本写后崩溃窗口（先于修复编写，预期失败）。
 *
 * 缺口：saveProfileRevision 未持久化 sessionId（JSON 不存字段、
 * MySQL 无列），恢复逻辑靠扫描最近 20 条匹配 sessionId 判断
 * 「修订是否已写」——永远匹配不上，「修订已写、步骤未标记」窗口
 * 恢复后会重复写入修订。
 *
 * 新故障点 after-revision-write：修订已写入、steps.revision 未标记。
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 进程清理（Windows 平台）：spawn 的子进程被 kill 后会残留管道 Socket
 * 拖住父进程事件循环。做法：spawn 后立即 unref()，kill 后等待 exit
 * （带超时竞速）。进程随事件循环排空自然退出，不依赖强制 process.exit()。
 */
function startTrackedServer(command, args, options) {
  const child = spawn(command, args, options)
  child.unref()
  return child
}

async function stopServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  child.kill()
  await Promise.race([
    new Promise(resolve => child.on('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 1500)),
  ])
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function waitUp(baseUrl, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`)
      if (res.ok) return
    } catch {}
    await sleep(120)
  }
  throw new Error('server did not start')
}

async function login(baseUrl) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: 'reviewer', password: 'Zhixue2026!', role: 'student' }),
  })
  const { token } = await res.json()
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function prepareCompletedSession(baseUrl, auth) {
  await fetch(`${baseUrl}/api/profile/save`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      dimensions: [{ label: '逻辑思维', value: 50, color: '#3b82f6' }],
      totalScore: 50,
      source: 'profile-save',
    }),
  })
  await fetch(`${baseUrl}/api/knowledge-path/generate`, { method: 'POST', headers: auth, body: '{}' })
  const created = await (await fetch(`${baseUrl}/api/study/sessions`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ topicId: 'f1', exerciseCount: 3 }),
  })).json()
  const bank = JSON.parse(fs.readFileSync(path.join(projectRoot, 'server/study/exercise-bank.json'), 'utf8'))
  for (const [index, exercise] of created.exercises.entries()) {
    const correctIndex = bank.exercises.find(item => item.id === exercise.id).answer
    await fetch(`${baseUrl}/api/study/sessions/${created.session.id}/answers`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ exerciseId: exercise.id, submitted: correctIndex, idempotencyKey: `idem-rev-${index}` }),
    })
  }
  await fetch(`${baseUrl}/api/study/sessions/${created.session.id}/complete`, { method: 'POST', headers: auth })
  return created.session.id
}

async function revisionsFor(baseUrl, auth) {
  return (await (await fetch(`${baseUrl}/api/study/revisions`, { headers: auth })).json()).items
}

test('修订写后、步骤未标记 → 重启后不重复写入修订', async () => {
  const dataFile = path.join(os.tmpdir(), `edumind-rev-${process.pid}-${Date.now()}.json`)
  const port = 25000 + (process.pid % 20000)
  const baseUrl = `http://127.0.0.1:${port}`

  const startServer = extraEnv => startTrackedServer(process.execPath, ['server/index.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      MYSQL_URL: '',
      MYSQL_HOST: '',
      MYSQL_PORT: '',
      MYSQL_USER: '',
      MYSQL_PASSWORD: '',
      MYSQL_DATABASE: '',
      PORT: String(port),
      ZHIXUE_DATA_FILE: dataFile,
      ZHIXUE_CHAT_STORE_FILE: dataFile,
      ZHIXUE_TRACE_FILE: `${dataFile}.traces.json`,
      ZHIXUE_SESSION_FILE: `${dataFile}.sessions.json`,
      ZHIXUE_IDENTITY_FILE: `${dataFile}.identities.json`,
      ZHIXUE_FEEDBACK_STALE_MS: '0',
      ...extraEnv,
    },
    stdio: 'ignore',
  })

  let api = startServer({ ZHIXUE_FAULT_INJECT: 'after-revision-write' })
  try {
    await waitUp(baseUrl)
    const auth = await login(baseUrl)
    const sessionId = await prepareCompletedSession(baseUrl, auth)

    const first = await fetch(`${baseUrl}/api/study/sessions/${sessionId}/feedback`, { method: 'POST', headers: auth })
    assert.equal(first.status, 500, '故障注入应导致 500')

    const afterCrash = await revisionsFor(baseUrl, auth)
    assert.equal(afterCrash.length, 1, `崩溃时修订应已写入 1 条，实际=${afterCrash.length}`)

    await stopServer(api)

    // 重启（无故障）→ 恢复处理
    api = startServer({})
    await waitUp(baseUrl)
    const auth2 = await login(baseUrl)
    const second = await fetch(`${baseUrl}/api/study/sessions/${sessionId}/feedback`, { method: 'POST', headers: auth2 })
    assert.equal(second.status, 200, '重启后反馈应成功')

    const afterRecovery = await revisionsFor(baseUrl, auth2)
    assert.equal(afterRecovery.length, 1, `恢复后修订账本仍应只有 1 条，实际=${afterRecovery.length}`)

    const profile = (await (await fetch(`${baseUrl}/api/profile/latest`, { headers: auth2 })).json()).result
    const logic = profile.dimensions.find(d => d.label === '逻辑思维')
    assert.equal(logic.value, 54, `画像应保持 54，实际=${logic.value}`)
  } finally {
    await stopServer(api)
    try {
      fs.rmSync(dataFile, { force: true })
      fs.rmSync(`${dataFile}.traces.json`, { force: true })
    } catch {
      /* ignore */
    }
  }
})
