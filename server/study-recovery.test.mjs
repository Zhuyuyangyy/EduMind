import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * 进程清理（Windows 平台）：spawn 的子进程被 kill 后会残留管道 Socket
 * 拖住父进程事件循环。做法：spawn 后立即 unref()（子进程句柄不保持
 * 父进程存活），finally 中 kill + 等待 exit（带超时竞速）。进程随
 * 事件循环排空自然退出，不依赖强制 process.exit()。
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

/**
 * P3.4 崩溃恢复验收（先于修复编写，预期在当前版本失败）。
 *
 * 故障窗口（服务端 ZHIXUE_FAULT_INJECT 注入，模拟进程崩溃）：
 *   A after-profile-write  画像已写入、步骤未标记 done
 *   B before-revision-write 画像已写、修订账本未写
 *   C after-path-write     路径已写入、步骤未标记 done
 *
 * 每个用例：第一次请求触发注入故障（500）→ 重启服务（同数据文件、
 * 无故障）→ 再次请求反馈 → 断言每个子更新最多生效一次。
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function startServer(port, dataFile, extraEnv = {}) {
  const child = startTrackedServer(process.execPath, ['server/index.js'], {
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
      ZHIXUE_FEEDBACK_STALE_MS: '0', // 测试中重启后立即允许接管
      ...extraEnv,
    },
    stdio: 'ignore',
  })
  return child
}

async function waitUp(baseUrl, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`)
      if (res.ok) return
    } catch {}
    await new Promise(r => setTimeout(r, 120))
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

/** 建画像 + 路径 + 完成 3 题全对会话，返回 { auth, sessionId } */
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
      body: JSON.stringify({ exerciseId: exercise.id, submitted: correctIndex, idempotencyKey: `idem-${created.session.id}-${index}` }),
    })
  }
  await fetch(`${baseUrl}/api/study/sessions/${created.session.id}/complete`, { method: 'POST', headers: auth })
  return created.session.id
}

async function readState(baseUrl, auth, sessionId) {
  const profile = (await (await fetch(`${baseUrl}/api/profile/latest`, { headers: auth })).json()).result
  const path = (await (await fetch(`${baseUrl}/api/knowledge-path/latest`, { headers: auth })).json()).result
  const revisions = (await (await fetch(`${baseUrl}/api/study/revisions`, { headers: auth })).json()).items
  return { profile, path, revisions }
}

/**
 * 通用崩溃恢复用例：
 * 1. 首次 feedback 触发故障（500）
 * 2. 重启服务
 * 3. 再次 feedback → 断言状态
 */
async function crashRecoveryCase(t, faultPoint, assertions) {
  const dataFile = path.join(os.tmpdir(), `edumind-recovery-${process.pid}-${Date.now()}.json`)
  const port = 21000 + (process.pid % 20000)
  const baseUrl = `http://127.0.0.1:${port}`

  let api = startServer(port, dataFile, { ZHIXUE_FAULT_INJECT: faultPoint })
  try {
    await waitUp(baseUrl)
    const auth = await login(baseUrl)
    const sessionId = await prepareCompletedSession(baseUrl, auth)

    const first = await fetch(`${baseUrl}/api/study/sessions/${sessionId}/feedback`, { method: 'POST', headers: auth })
    assert.equal(first.status, 500, `故障注入应导致 500，实际=${first.status}`)

    const afterCrash = await readState(baseUrl, auth, sessionId)
    await stopServer(api)

    // 重启（无故障注入）
    api = startServer(port, dataFile)
    await waitUp(baseUrl)
    const auth2 = await login(baseUrl)
    const second = await fetch(`${baseUrl}/api/study/sessions/${sessionId}/feedback`, { method: 'POST', headers: auth2 })
    assert.equal(second.status, 200, `重启后反馈应成功，实际=${second.status}`)

    const afterRecovery = await readState(baseUrl, auth2, sessionId)
    assertions({ afterCrash, afterRecovery })
  } finally {
    await stopServer(api)
    try {
      fs.rmSync(dataFile, { force: true })
      fs.rmSync(`${dataFile}.traces.json`, { force: true })
    } catch {
      /* ignore */
    }
  }
}

test('崩溃窗口 A：画像已写、步骤未标记 → 重启后不重复应用', async () => {
  await crashRecoveryCase(test, 'after-profile-write', ({ afterRecovery }) => {
    const logic = afterRecovery.profile.dimensions.find(d => d.label === '逻辑思维')
    assert.equal(logic.value, 54, `画像应保持 54，实际=${logic.value}`)
    assert.equal(afterRecovery.revisions.length, 1, `修订账本应补齐为 1 条，实际=${afterRecovery.revisions.length}`)
  })
})

test('崩溃窗口 B：画像已写、修订未写 → 重启后补齐账本且不重复改画像', async () => {
  await crashRecoveryCase(test, 'before-revision-write', ({ afterCrash, afterRecovery }) => {
    // 崩溃时画像已改、账本未写
    const crashLogic = afterCrash.profile.dimensions.find(d => d.label === '逻辑思维')
    assert.equal(crashLogic.value, 54, '崩溃时画像应已写入 54')
    assert.equal(afterCrash.revisions.length, 0, '崩溃时修订账本应尚未写入')
    // 恢复后：账本补齐，画像不变
    const logic = afterRecovery.profile.dimensions.find(d => d.label === '逻辑思维')
    assert.equal(logic.value, 54, `恢复后画像应仍为 54，实际=${logic.value}`)
    assert.equal(afterRecovery.revisions.length, 1, `恢复后修订账本应为 1 条，实际=${afterRecovery.revisions.length}`)
  })
})

test('崩溃窗口 C：路径已写、步骤未标记 → 重启后版本不重复递增', async () => {
  await crashRecoveryCase(test, 'after-path-write', ({ afterCrash, afterRecovery }) => {
    const crashVersion = Number(afterCrash.path?.version) || 1
    const recoveredVersion = Number(afterRecovery.path?.version) || 1
    assert.equal(recoveredVersion, crashVersion, `路径版本不应重复递增（崩溃时=${crashVersion} 恢复后=${recoveredVersion}）`)
    assert.equal(afterRecovery.revisions.length, 1, '修订账本应只有 1 条')
  })
})

test('恢复完整性：三次连续重启后状态稳定（无重复写入）', async () => {
  const dataFile = path.join(os.tmpdir(), `edumind-recovery-multi-${process.pid}-${Date.now()}.json`)
  const port = 22000 + (process.pid % 20000)
  const baseUrl = `http://127.0.0.1:${port}`

  let api = startServer(port, dataFile, { ZHIXUE_FAULT_INJECT: 'before-revision-write' })
  try {
    await waitUp(baseUrl)
    const auth = await login(baseUrl)
    const sessionId = await prepareCompletedSession(baseUrl, auth)
    await fetch(`${baseUrl}/api/study/sessions/${sessionId}/feedback`, { method: 'POST', headers: auth })
    await stopServer(api)

    // 连续三次重启 + 请求
    for (let round = 0; round < 2; round += 1) {
      api = startServer(port, dataFile)
      await waitUp(baseUrl)
      const authRound = await login(baseUrl)
      const res = await fetch(`${baseUrl}/api/study/sessions/${sessionId}/feedback`, { method: 'POST', headers: authRound })
      assert.equal(res.status, 200, `第 ${round + 1} 次重启后反馈应成功`)
    }

    const final = await readState(baseUrl, await login(baseUrl), sessionId)
    const logic = final.profile.dimensions.find(d => d.label === '逻辑思维')
    assert.equal(logic.value, 54, `多次重启后画像应稳定在 54，实际=${logic.value}`)
    assert.equal(final.revisions.length, 1, `多次重启后修订账本应稳定为 1 条，实际=${final.revisions.length}`)
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
