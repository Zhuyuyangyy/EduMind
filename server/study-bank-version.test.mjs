import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * P3.4 题库版本与历史快照验收。
 *
 * 场景：会话创建后「升级题库」（改题干/答案/解析），历史会话的题目与
 * 判分必须保持创建时的含义——快照机制生效，不受当前题库影响。
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

test('题库升级不改变历史会话的题目与判分（快照隔离）', async () => {
  const dataFile = path.join(os.tmpdir(), `edumind-bank-${process.pid}-${Date.now()}.json`)
  const bankFile = path.join(os.tmpdir(), `edumind-bank-copy-${process.pid}.json`)
  const originalBank = fs.readFileSync(path.join(projectRoot, 'server/study/exercise-bank.json'), 'utf8')
  fs.writeFileSync(bankFile, originalBank)

  const port = 23000 + (process.pid % 20000)
  const baseUrl = `http://127.0.0.1:${port}`
  const env = {
    ZHIXUE_DATA_FILE: dataFile,
    ZHIXUE_CHAT_STORE_FILE: dataFile,
    ZHIXUE_TRACE_FILE: `${dataFile}.traces.json`,
    ZHIXUE_EXERCISE_BANK_PATH: bankFile,
    ZHIXUE_FEEDBACK_STALE_MS: '0',
  }

  let api = startTrackedServer(process.execPath, ['server/index.js'], { cwd: projectRoot, env: { ...process.env,      MYSQL_URL: '',
      MYSQL_HOST: '',
      MYSQL_PORT: '',
      MYSQL_USER: '',
      MYSQL_PASSWORD: '',
      MYSQL_DATABASE: '',
 PORT: String(port), ...env }, stdio: 'ignore' })
  try {
    await waitUp(baseUrl)
    const login = await (await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: 'reviewer', password: 'Zhixue2026!', role: 'student' }),
    })).json()
    const auth = { Authorization: `Bearer ${login.token}`, 'Content-Type': 'application/json' }

    // 用当前题库创建会话并记录题目快照
    const created = await (await fetch(`${baseUrl}/api/study/sessions`, {
      method: 'POST', headers: auth, body: JSON.stringify({ topicId: 'f1', exerciseCount: 1 }),
    })).json()
    const originalPrompt = created.exercises[0].prompt
    const originalId = created.exercises[0].id
    const bankData = JSON.parse(originalBank)
    const originalAnswer = bankData.exercises.find(e => e.id === originalId).answer

    // —— 模拟题库升级：改题干、改答案、改解析、升版本 ——
    const upgraded = JSON.parse(originalBank)
    upgraded.version = 99
    const target = upgraded.exercises.find(e => e.id === originalId)
    target.prompt = '【已升级】升级后的新题干'
    target.answer = (originalAnswer + 1) % target.choices.length
    target.explanation = '【已升级】升级后的新解析'
    fs.writeFileSync(bankFile, JSON.stringify(upgraded, null, 2))

    // 重启服务加载新题库
    await stopServer(api)
    api = startTrackedServer(process.execPath, ['server/index.js'], { cwd: projectRoot, env: { ...process.env, MYSQL_URL: '', MYSQL_HOST: '', MYSQL_PORT: '', MYSQL_USER: '', MYSQL_PASSWORD: '', MYSQL_DATABASE: '', PORT: String(port), ...env }, stdio: 'ignore' })
    await waitUp(baseUrl)
    // 重启后会话令牌失效（内存态），需重新登录
    const relogin = await (await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: 'reviewer', password: 'Zhixue2026!', role: 'student' }),
    })).json()
    const auth2 = { Authorization: `Bearer ${relogin.token}`, 'Content-Type': 'application/json' }

    // 历史会话的题目仍是创建时快照
    const questions = await (await fetch(`${baseUrl}/api/study/sessions/${created.session.id}/questions`, { headers: auth2 })).json()
    assert.equal(questions.fromSnapshot, true, '应标记来自快照')
    assert.equal(questions.bankVersion, bankData.version, '应记录创建时的题库版本')
    assert.equal(questions.exercises[0].prompt, originalPrompt, '历史题干不得被升级改变')

    // 判分按快照答案：原正确答案仍然判对，升级后的新答案反而判错
    const submitOriginal = await (await fetch(`${baseUrl}/api/study/sessions/${created.session.id}/answers`, {
      method: 'POST', headers: auth2,
      body: JSON.stringify({ exerciseId: originalId, submitted: originalAnswer, idempotencyKey: 'idem-bank-0001' }),
    })).json()
    assert.equal(submitOriginal.correct, true, '按创建时答案提交必须判对（快照判分）')
  } finally {
    await stopServer(api)
    try {
      fs.rmSync(dataFile, { force: true })
      fs.rmSync(bankFile, { force: true })
      fs.rmSync(`${dataFile}.traces.json`, { force: true })
    } catch {
      /* ignore */
    }
  }
})

test('时区连续学习天数：陈旧记录不得显示为当前连续', async () => {
  const { computeStreak, naturalDay, previousDayInZone } = await import('./study/store.js')

  // 基本连续性
  const today = naturalDay(new Date().toISOString(), 'Asia/Shanghai')
  const yesterday = previousDayInZone(today, 'Asia/Shanghai')
  assert.equal(computeStreak(new Set([today, yesterday]), 'Asia/Shanghai'), 2)

  // 断档：三天前 + 今天 → 连续 1（不得把陈旧记录算进当前连续）
  const threeDaysAgo = previousDayInZone(previousDayInZone(yesterday, 'Asia/Shanghai'), 'Asia/Shanghai')
  assert.equal(computeStreak(new Set([today, threeDaysAgo]), 'Asia/Shanghai'), 1)

  // P4-0：最后学习日是昨天 → 仍然算连续（昨天学的，今天还没学）
  assert.equal(computeStreak(new Set([yesterday, previousDayInZone(yesterday, 'Asia/Shanghai')]), 'Asia/Shanghai'), 2)

  // P4-0：陈旧连续（三天前结束，且更早还有记录）→ 当前连续为 0
  const fourDaysAgo = previousDayInZone(threeDaysAgo, 'Asia/Shanghai')
  assert.equal(computeStreak(new Set([threeDaysAgo, fourDaysAgo]), 'Asia/Shanghai'), 0,
    '三天前结束的连续记录不得显示为当前连续')

  // 空集合
  assert.equal(computeStreak(new Set(), 'Asia/Shanghai'), 0)

  // 跨时区一致性：用固定时间点验证时区归属
  const instant = '2026-10-10T02:00:00Z' // 北京时间 10:00，纽约时间前一日
  assert.equal(naturalDay(instant, 'Asia/Shanghai'), '2026-10-10')
  assert.equal(naturalDay(instant, 'America/New_York'), '2026-10-09')
  assert.equal(previousDayInZone('2026-10-10', 'America/New_York'), '2026-10-09')
})
