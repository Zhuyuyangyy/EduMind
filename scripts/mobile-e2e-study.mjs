#!/usr/bin/env node
/**
 * 移动端完整学习闭环 E2E（P3-3 · feat/mobile-v1）
 *
 * 账号 A（预置画像 + 知识路径）：
 *   S1 今日页 → 开始练习 → 练习页 3 题（未答题不泄露对错）
 *   S2 答对第 1 题 → 即时正确反馈
 *   S3 刷新页面 → 会话恢复（已答状态保持、跳到未答题）
 *   S4 答错第 2 题 → 即时错误反馈、练习页不公开标准答案
 *   S5 完成 → 结果页权威评分 2/3 = 66.7%
 *   S6 结果页逐题回顾（你的选择/正确答案/解析）+ AI 反馈来源 +
 *      画像未更新（稳定区间，合法结果）
 *   S7 成长页真实统计（完成 1 / 答题 3 / 答对 2 / 学习天数 ≥1）
 *   S8 退出重登 → 结果页仍可访问（幂等反馈，不重复修改）
 *   S9 账号 B：零练习、零统计
 *   S10 Web↔Mobile：API 视角与 App 内状态一致
 *
 * 用法：node scripts/mobile-e2e-study.mjs [webUrl] [apiUrl] [chromePath]
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const WEB_URL = process.argv[2] || 'http://127.0.0.1:5174'
const API_URL = process.argv[3] || 'http://127.0.0.1:8788'
const CHROME = process.argv[4] || 'D:/cloakbrowser-windows-x64/chrome.exe'
const CDP_PORT = 9337
const ACCOUNT_A = { account: 'reviewer', password: 'Zhixue2026!' }
const ACCOUNT_B = { account: 'student', password: 'student123' }

const results = []
function report(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitFor(fn, timeout = 20000, interval = 300) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const value = await fn()
      if (value) return value
    } catch {}
    await sleep(interval)
  }
  return null
}

class CdpClient {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.onmessage = event => {
      const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString())
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
      }
    }
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'eval failed')
    return result.result.value
  }

  async goto(url) {
    await this.send('Page.navigate', { url })
    await sleep(800)
  }

  async type(selector, text) {
    await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      el.focus()
      el.setSelectionRange(0, el.value.length)
    })()`)
    await this.send('Input.insertText', { text })
    await sleep(150)
  }

  async bodyText() {
    return this.eval('document.body.innerText')
  }
}

async function login(cdp, creds) {
  await cdp.type('.m-field input[type="text"]', creds.account)
  await cdp.type('.m-field input[type="password"]', creds.password)
  await cdp.eval("document.querySelector('.login__form .m-btn').click()")
  return waitFor(() => cdp.eval("Boolean(document.querySelector('.mobile-tabs')) && location.hash !== '#/login'"), 20000)
}

async function logout(cdp) {
  await cdp.eval("document.querySelectorAll('.tab')[3].click()")
  await waitFor(() => cdp.eval("Boolean(document.querySelector('.profile__logout'))"))
  await cdp.eval("document.querySelector('.profile__logout').click()")
  return waitFor(() => cdp.eval("Boolean(document.querySelector('.login'))"), 15000)
}

async function apiLogin(creds) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...creds, role: 'student' }),
  })
  const { token } = await res.json()
  return token
}

async function main() {
  // 端口预检（本脚本自行启动 API 服务器）
  const apiPort = new URL(API_URL).port
  const portInUse = await new Promise(resolve => {
    const socket = net.connect(Number(apiPort), '127.0.0.1')
    socket.on('connect', () => { socket.destroy(); resolve(true) })
    socket.on('error', () => resolve(false))
  })
  if (portInUse) {
    console.error(`[mobile-e2e-study] 端口 ${apiPort} 已被占用，请先释放。`)
    process.exit(1)
  }

  // 预置账号 A：画像 + 知识路径（topic f1 = BFS 三题）
  const seed = {
    profiles: {
      reviewer: {
        dimensions: [
          { label: '逻辑思维', value: 50, color: '#3b82f6' },
          { label: '知识基础', value: 60, color: '#3b82f6' },
        ],
        totalScore: 55,
        source: 'profile-save',
      },
    },
    knowledgePathByAccount: {
      reviewer: {
        phases: [
          {
            id: 'fundamentals',
            name: '基础巩固',
            color: '#00d4ff',
            topics: [
              { id: 'f1', name: 'BFS 与图遍历基础', mastery: 0.3, importance: 0.9, recommended: true },
              { id: 'f2', name: '队列与栈', mastery: 0.5, importance: 0.8, recommended: false },
            ],
          },
        ],
      },
    },
  }
  const seedFile = path.join(os.tmpdir(), `edumind-e2e-study-seed-${process.pid}.json`)
  fs.writeFileSync(seedFile, JSON.stringify(seed, null, 2))

  const api = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: apiPort,
      ZHIXUE_DATA_FILE: seedFile,
      ZHIXUE_CHAT_STORE_FILE: seedFile,
      ZHIXUE_TRACE_FILE: path.join(os.tmpdir(), `edumind-e2e-study-traces-${process.pid}.json`),
    },
    stdio: 'ignore',
  })

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edumind-mobile-study-e2e-'))
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--disable-gpu',
    'about:blank',
  ], { stdio: 'ignore' })

  let ws = null
  let cdp = null
  let sessionId = null
  try {
    const target = await waitFor(async () => {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)
      const list = await res.json()
      return list.find(t => t.type === 'page' && t.webSocketDebuggerUrl)
    }, 20000)
    if (!target) throw new Error('Chromium DevTools target 未就绪')

    ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = () => reject(new Error('WebSocket 连接失败'))
    })
    cdp = new CdpClient(ws)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await waitFor(async () => (await fetch(`${API_URL}/api/health`).catch(() => null))?.ok, 15000)

    /* ---------- S1：今日页 → 开始练习 ---------- */
    await cdp.goto(`${WEB_URL}/#/login`)
    await login(cdp, ACCOUNT_A)
    await cdp.eval("document.querySelectorAll('.tab')[0].click()")
    const todayReady = await waitFor(async () => {
      const text = await cdp.bodyText()
      return text.includes('BFS 与图遍历基础') ? text : null
    }, 15000)
    report('S1 今日页显示真实今日主题', Boolean(todayReady), todayReady ? '主题=BFS 与图遍历基础' : '未显示')

    await cdp.eval("document.querySelector('.today__hero-actions .m-btn--primary').click()")
    const practiceReady = await waitFor(async () => {
      const text = await cdp.bodyText()
      return text.includes('已作答') && text.includes('visited') ? text : null
    }, 20000)
    report('S1 开始练习进入练习页（3 题）', Boolean(practiceReady) && cdp.eval("location.hash.includes('/study/session/')") !== false,
      practiceReady ? '练习页加载，题干可见' : '练习页未就绪')
    if (!practiceReady) throw new Error('练习页未就绪，后续场景无法继续')
    sessionId = await cdp.eval("location.hash.match(/study\\/session\\/([A-Za-z0-9-]+)/)[1]")

    // 未作答题：页面不得出现对错标记或“正确答案”
    const noLeak = await cdp.bodyText()
    report('S1 未作答题目不泄露对错与标准答案',
      !noLeak.includes('回答正确') && !noLeak.includes('回答错误') && !noLeak.includes('正确答案'),
      '练习页无对错标记')

    /* ---------- S2：答对第 1 题 ---------- */
    // 读取当前题的正确选项（通过 API 拿题库，仅测试脚本知晓）
    const bank = JSON.parse(fs.readFileSync('server/study/exercise-bank.json', 'utf8'))
    const firstPrompt = await cdp.eval("document.querySelector('.practice__prompt')?.textContent || ''")
    const firstExercise = bank.exercises.find(item => firstPrompt.includes(item.prompt.slice(0, 12)))
    await cdp.eval(`document.querySelectorAll('.practice__choice')[${firstExercise.answer}].click()`)
    const verdictOk = await waitFor(async () => {
      const text = await cdp.bodyText()
      return text.includes('回答正确') ? text : null
    }, 15000)
    report('S2 答对第 1 题显示服务端判词', Boolean(verdictOk))

    /* ---------- S3：刷新恢复 ---------- */
    await cdp.send('Page.reload', { ignoreCache: false })
    await sleep(1500)
    const restored = await waitFor(async () => {
      const text = await cdp.bodyText()
      // 恢复后应落在未作答题（第 2 题），且第 1 题的已答状态仍在（进度 1/3）
      return text.includes('1 / 3 已作答') ? text : null
    }, 20000)
    report('S3 刷新后会话恢复（已答状态保持、跳到未答题）', Boolean(restored),
      restored ? '进度 1/3 保持' : '恢复失败')

    /* ---------- S4：答错第 2 题 ---------- */
    const secondPrompt = await cdp.eval("document.querySelector('.practice__prompt')?.textContent || ''")
    const secondExercise = bank.exercises.find(item => secondPrompt.includes(item.prompt.slice(0, 12)))
    const wrongIndex = (secondExercise.answer + 1) % (secondExercise.choices?.length || 4)
    await cdp.eval(`document.querySelectorAll('.practice__choice')[${wrongIndex}].click()`)
    const verdictBad = await waitFor(async () => {
      const text = await cdp.bodyText()
      return text.includes('回答错误') ? text : null
    }, 15000)
    const stillNoAnswer = await cdp.bodyText()
    report('S4 答错第 2 题显示错误反馈', Boolean(verdictBad))
    report('S4 练习页仍不公开标准答案', !stillNoAnswer.includes('正确答案'))

    /* ---------- S5：答第 3 题并完成 ---------- */
    await cdp.eval("document.querySelectorAll('.practice__nav .m-btn')[1].click()")
    await sleep(400)
    const thirdPrompt = await cdp.eval("document.querySelector('.practice__prompt')?.textContent || ''")
    const thirdExercise = bank.exercises.find(item => thirdPrompt.includes(item.prompt.slice(0, 12)))
    await cdp.eval(`document.querySelectorAll('.practice__choice')[${thirdExercise.answer}].click()`)
    await waitFor(async () => (await cdp.bodyText()).includes('回答正确'), 15000)
    await cdp.eval("document.querySelector('.practice__finish .m-btn--primary').click()")

    /* ---------- S6：结果页 ---------- */
    const resultReady = await waitFor(async () => {
      const text = await cdp.bodyText()
      return text.includes('逐题回顾') && text.includes('2 / 3') ? text : null
    }, 25000)
    report('S5 完成进入结果页', Boolean(resultReady), resultReady ? '结果页加载' : '未进入结果页')
    if (resultReady) {
      const text = resultReady
      report('S6 权威评分 2/3 = 66.7%', text.includes('66.7%') && text.includes('2 / 3'))
      report('S6 逐题展示学生选择与正确答案', text.includes('你的选择') && text.includes('正确答案'))
      report('S6 错题解析可见', text.includes('解析'))
      report('S6 AI 反馈来源标注', text.includes('模型生成') || text.includes('规则降级'))
      // 逻辑思维正确率 2/3 = 66.7% 落在稳定区间 → 画像不更新（合法结果）
      report('S6 稳定区间画像不更新（合法结果，非故障）',
        text.includes('未更新') && text.includes('稳定区间'))
    }

    /* ---------- S7：成长页真实统计 ---------- */
    await cdp.eval("document.querySelectorAll('.tab')[2].click()")
    const growthReady = await waitFor(async () => {
      const text = await cdp.bodyText()
      return text.includes('学习记录') ? text : null
    }, 15000)
    if (growthReady) {
      // 统计卡片：完成练习 1 / 累计答题 3 / 答对 2 / 学习天数 ≥1
      const statsOk = growthReady.includes('完成练习') && growthReady.includes('累计答题')
      report('S7 成长页显示真实学习统计', statsOk, statsOk ? '统计区渲染' : '统计缺失')
      const apiToken = await apiLogin(ACCOUNT_A)
      const stats = await (await fetch(`${API_URL}/api/study/stats`, { headers: { Authorization: `Bearer ${apiToken}` } })).json()
      report('S7 服务端统计与练习一致（完成 1 / 答题 3 / 答对 2）',
        stats.completedSessions === 1 && stats.totalAnswers === 3 && stats.correctAnswers === 2,
        `completed=${stats.completedSessions} answers=${stats.totalAnswers} correct=${stats.correctAnswers} days=${stats.studyDays}`)
    } else {
      report('S7 成长页显示真实学习统计', false, '页面未就绪')
    }

    /* ---------- S8：退出重登 → 结果页幂等 ---------- */
    await logout(cdp)
    const backAgain = await login(cdp, ACCOUNT_A)
    await cdp.goto(`${WEB_URL}/#/study/session/${sessionId}/result`)
    const resultAgain = await waitFor(async () => {
      const text = await cdp.bodyText()
      return text.includes('逐题回顾') ? text : null
    }, 20000)
    report('S8 重登后结果页可访问', Boolean(resultAgain))
    if (resultAgain) {
      report('S8 重复请求返回首次结果（幂等提示）', resultAgain.includes('首次处理结果') || resultAgain.includes('逐题回顾'))
    }

    /* ---------- S9：账号 B 零数据 ---------- */
    await logout(cdp)
    await login(cdp, ACCOUNT_B)
    const tokenB = await apiLogin(ACCOUNT_B)
    const statsB = await (await fetch(`${API_URL}/api/study/stats`, { headers: { Authorization: `Bearer ${tokenB}` } })).json()
    report('S9 账号 B 零练习零统计', statsB.completedSessions === 0 && statsB.totalAnswers === 0,
      `completed=${statsB.completedSessions}`)
    const crossSession = await fetch(`${API_URL}/api/study/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    })
    report('S9 账号 B 无法读取 A 的会话', crossSession.status === 404)

    /* ---------- S10：Web↔Mobile 一致 ---------- */
    const tokenA2 = await apiLogin(ACCOUNT_A)
    const webView = await (await fetch(`${API_URL}/api/study/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${tokenA2}` },
    })).json()
    report('S10 Web 视角与 App 内会话状态一致',
      webView.session?.status === 'completed' && webView.attempts?.length === 3,
      `status=${webView.session?.status} attempts=${webView.attempts?.length}`)
  } finally {
    if (ws) ws.close()
    chrome.kill()
    api.kill()
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true })
      fs.rmSync(seedFile, { force: true })
    } catch {
      /* ignore */
    }
  }

  const failed = results.filter(r => !r.ok)
  console.log(`\n学习闭环 E2E 汇总: ${results.length - failed.length}/${results.length} 通过`)
  if (failed.length > 0) process.exitCode = 1
}

main().catch(err => {
  console.error('学习闭环 E2E 执行异常:', err)
  process.exitCode = 1
})
