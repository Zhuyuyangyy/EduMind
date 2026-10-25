#!/usr/bin/env node
/**
 * 移动端数据层 E2E（P2-2C · feat/mobile-v1）
 *
 * 双账号数据隔离与真实性回归：
 *   账号 A（reviewer）预置：画像 + 知识路径（mastery 0/0.5/1）+ 辅导历史
 *     （一条无来源标注的旧记录 + 一条带 fallbackAgents 的新记录）
 *   账号 B（student）：无任何数据
 *
 * 场景：
 *   D1 A 今日页显示可追溯今日主题（mastery 0/0.5/1 均不误判）
 *   D2 A 成长页显示真实画像与路径，三种掌握度标签可区分
 *   D3 A 导师页加载历史，旧记录标「来源未记录」、降级记录标「降级回答」
 *   D4 A 退出 → B 登录：B 全空态，且全文不含 A 的任何内容（防串号）
 *   D5 B 退出 → A 登录：A 数据完整恢复
 *   D6 刷新页面后 A 数据一致（冷启动一致性）
 *   D7 A 新提问后历史刷新且不重复展示
 *   D8 Web↔Mobile 一致：App 内的提问，API（网页版视角）立即可见
 *
 * 前置：npm run build:mobile；静态服务（scripts/serve-mobile.mjs）。
 * 用法：node scripts/mobile-e2e-data.mjs [webUrl] [apiUrl] [chromePath]
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
const CDP_PORT = 9336
const ACCOUNT_A = { account: 'reviewer', password: 'Zhixue2026!' }
const ACCOUNT_B = { account: 'student', password: 'student123' }

// A 的专属内容标记（D4 用于扫描串号）
const A_MARKERS = ['编程基础与语法', '数据结构入门', '算法思维培养', '知识基础', '旧历史问题（无来源标注）', '新历史问题（降级）', '今日专注']

const results = []
function report(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitFor(fn, timeout = 15000, interval = 300) {
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
    await sleep(700)
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

  async hash() {
    return this.eval('location.hash')
  }
}

async function login(cdp, creds) {
  await cdp.type('.m-field input[type="text"]', creds.account)
  await cdp.type('.m-field input[type="password"]', creds.password)
  await cdp.eval("document.querySelector('.login__form .m-btn').click()")
  const ready = await waitFor(() => cdp.eval("Boolean(document.querySelector('.mobile-tabs')) && location.hash !== '#/login'"), 20000)
  if (ready) {
    await waitFor(() => cdp.eval("document.querySelector('#mobile-content')?.getAttribute('aria-busy') === 'false'"))
    await cdp.eval("document.querySelector('.welcome-card__bottom button')?.click()")
  }
  return ready
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
  // 端口预检：本脚本会自己 spawn API 服务器；若端口已被占用，打到的将是
  // 另一个服务器（数据不符导致误报），必须快速失败而不是跑出假结果。
  const apiPort = new URL(API_URL).port
  const portInUse = await new Promise(resolve => {
    const socket = net.connect(Number(apiPort), '127.0.0.1')
    socket.on('connect', () => { socket.destroy(); resolve(true) })
    socket.on('error', () => resolve(false))
  })
  if (portInUse) {
    console.error(`[mobile-e2e-data] 端口 ${apiPort} 已被占用。本脚本会自行启动 API 服务器，请先释放该端口（不要与其他测试服务并行）。`)
    process.exit(1)
  }

  // —— 预置账号 A 的数据（直接写服务端 store，模拟真实学习记录） ——
  const seed = {
    profiles: {
      reviewer: {
        dimensions: [
          { label: '知识基础', value: 72, color: '#3b82f6' },
          { label: '学习速度', value: 65, color: '#3b82f6' },
        ],
        totalScore: 68,
        source: 'profile-save',
        savedAt: new Date().toISOString(),
      },
    },
    knowledgePathByAccount: {
      reviewer: {
        phases: [
          {
            id: 'fundamentals',
            name: '基础巩固',
            short: 'FUND',
            color: '#00d4ff',
            topics: [
              { id: 'f1', name: '编程基础与语法', mastery: 0, importance: 0.9, recommended: true },
              { id: 'f2', name: '数据结构入门', mastery: 0.5, importance: 0.8, recommended: false },
              { id: 'f3', name: '算法思维培养', mastery: 1, importance: 0.7, recommended: false },
            ],
          },
        ],
      },
    },
    tutoringHistory: {
      reviewer: [
        // 旧记录：没有 fallbackAgents 字段 → 客户端必须标「来源未记录」
        { q: '旧历史问题（无来源标注）', a: '旧历史回答内容', time: '08:00', mode: 'qa', scenario: 'preview' },
        // 新记录：带降级元数据
        { q: '新历史问题（降级）', a: '新历史回答内容', time: '09:00', mode: 'qa', fallbackAgents: ['TutorAgent'] },
      ],
    },
  }
  const seedFile = path.join(os.tmpdir(), `edumind-e2e-data-seed-${process.pid}.json`)
  fs.writeFileSync(seedFile, JSON.stringify(seed, null, 2))

  const api = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: new URL(API_URL).port,
      ZHIXUE_DATA_FILE: seedFile,
      ZHIXUE_CHAT_STORE_FILE: seedFile,
      ZHIXUE_TRACE_FILE: path.join(os.tmpdir(), `edumind-e2e-data-traces-${process.pid}.json`),
      ZHIXUE_SESSION_FILE: `${seedFile}.sessions.json`,
      ZHIXUE_IDENTITY_FILE: `${seedFile}.identities.json`,
    },
    stdio: 'ignore',
  })

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edumind-mobile-data-e2e-'))
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

    // 等 API 就绪
    await waitFor(async () => {
      const res = await fetch(`${API_URL}/api/health`).catch(() => null)
      return res?.ok
    }, 15000)

    /* ---------- D1：A 今日页：可追溯今日主题 ---------- */
    await cdp.goto(`${WEB_URL}/#/login`)
    await login(cdp, ACCOUNT_A)
    await cdp.eval("document.querySelectorAll('.tab')[0].click()")
    const todayA = await waitFor(async () => {
      const text = await cdp.bodyText()
      return text.includes('今日专注') ? text : null
    }, 15000)
    report('D1 A 今日页显示真实今日主题（可追溯 topic）', Boolean(todayA) && todayA.includes('编程基础与语法'),
      todayA ? `主题=编程基础与语法 掌握估计=${todayA.includes('掌握估计 0%') ? '0%（mastery=0 正确）' : '?'}` : '未显示')

    /* ---------- D2：A 成长页：真实画像 + 三种掌握度标签 ---------- */
    await cdp.eval("document.querySelectorAll('.tab')[2].click()")
    const growthA = await waitFor(async () => {
      const text = await cdp.bodyText()
      return text.includes('能力画像') ? text : null
    }, 15000)
    const phaseCount = await cdp.eval("document.querySelectorAll('.learning-path__head').length")
    let expandedLabels = ''
    for (let index = 0; index < phaseCount; index++) {
      await cdp.eval(`(() => { const button = document.querySelectorAll('.learning-path__head')[${index}]; if (button.getAttribute('aria-expanded') !== 'true') button.click() })()`)
      expandedLabels += await cdp.bodyText()
    }
    const hasAllMastery = (growthA + expandedLabels)
      && expandedLabels.includes('估计未接触') // mastery 0
      && expandedLabels.includes('估计中等') // mastery 0.5
      && expandedLabels.includes('估计熟练') // mastery 1
    report('D2 A 成长页三种掌握度（0/0.5/1）标签可区分', Boolean(hasAllMastery),
      hasAllMastery ? '估计未接触/中等/熟练 均正确渲染' : (growthA ? '标签缺失' : '页面未就绪'))
    report('D2 A 成长页显示真实画像维度', Boolean(growthA?.includes('知识基础')), growthA?.includes('知识基础') ? '知识基础 72' : '未显示')

    /* ---------- D3：A 导师页：历史 + 来源标注 ---------- */
    await cdp.eval("document.querySelectorAll('.tab')[1].click()")
    const tutorA = await waitFor(async () => {
      const text = await cdp.bodyText()
      return text.includes('旧历史问题（无来源标注）') && text.includes('新历史问题（降级）') ? text : null
    }, 15000)
    report('D3 A 导师页加载服务端历史（2 条）', Boolean(tutorA), tutorA ? '两条历史均在' : '历史缺失')
    report('D3 旧历史标「来源未记录」不冒充模型生成', Boolean(tutorA?.includes('来源未记录')))
    report('D3 降级历史标「降级回答」', Boolean(tutorA?.includes('降级回答')))

    /* ---------- D4：A 退出 → B 登录：全空态 + 无 A 内容 ---------- */
    await logout(cdp)
    await login(cdp, ACCOUNT_B)
    await cdp.eval("document.querySelectorAll('.tab')[0].click()")
    const todayB = await waitFor(async () => {
      const text = await cdp.bodyText()
      return text.includes('从了解你开始') && text.includes('开始学习诊断') ? text : null
    }, 15000)
    report('D4 B（无数据）今日页显示需求采集入口而非 A 的主题', Boolean(todayB), todayB ? '显示诊断入口' : '未显示入口')

    await cdp.eval("document.querySelectorAll('.tab')[2].click()")
    const growthB = await waitFor(async () => {
      const text = await cdp.bodyText()
      return text.includes('能力画像') ? text : null
    }, 15000)
    const bLeak = A_MARKERS.filter(m => growthB?.includes(m))
    report('D4 B 成长页无 A 的任何内容（防串号）', bLeak.length === 0 && Boolean(growthB?.includes('暂无画像')),
      bLeak.length ? `泄漏: ${bLeak.join(',')}` : '空态正确，无泄漏')

    await cdp.eval("document.querySelectorAll('.tab')[1].click()")
    const tutorB = await waitFor(async () => {
      const text = await cdp.bodyText()
      return await cdp.eval("Boolean(document.querySelector('.tutor__welcome'))") ? text : null
    }, 15000)
    const bTutorLeak = A_MARKERS.filter(m => tutorB?.includes(m))
    report('D4 B 导师页空态且无 A 历史', Boolean(tutorB) && bTutorLeak.length === 0,
      bTutorLeak.length ? `泄漏: ${bTutorLeak.join(',')}` : tutorB ? '空态正确' : '空态未就绪')

    /* ---------- D5：B 退出 → A 登录：数据恢复 ---------- */
    await logout(cdp)
    const backA = await login(cdp, ACCOUNT_A)
    await cdp.eval("document.querySelectorAll('.tab')[0].click()")
    const todayA2 = await waitFor(async () => {
      const text = await cdp.bodyText()
      return text.includes('编程基础与语法') ? text : null
    }, 15000)
    report('D5 A 重新登录后今日主题恢复', Boolean(todayA2), todayA2 ? '数据完整恢复' : '未恢复')

    /* ---------- D6：刷新后数据一致 ---------- */
    await cdp.send('Page.reload', { ignoreCache: false })
    await sleep(1200)
    const afterReload = await waitFor(async () => {
      const text = await cdp.bodyText()
      return text.includes('编程基础与语法') || text.includes('从了解你开始') || text.includes('登录') ? text : null
    }, 15000)
    // 刷新后若被守卫打回登录页（会话 Cookie 失效场景），重新登录再验证
    let consistent = afterReload?.includes('编程基础与语法')
    if (!consistent && afterReload?.includes('登录')) {
      await login(cdp, ACCOUNT_A)
      await cdp.eval("document.querySelectorAll('.tab')[0].click()")
      consistent = Boolean(await waitFor(async () => {
        const text = await cdp.bodyText()
        return text.includes('编程基础与语法') ? text : null
      }, 15000))
    }
    report('D6 刷新页面后 A 数据一致（冷启动一致性）', Boolean(consistent), consistent ? '刷新后仍显示 A 主题' : '刷新后数据丢失')

    /* ---------- D7：新提问后历史刷新且不重复 ---------- */
    await cdp.eval("document.querySelectorAll('.tab')[1].click()")
    await waitFor(() => cdp.eval("Boolean(document.querySelector('.tutor__composer'))"))
    const newQuestion = `P2-2C 回归提问 ${Date.now()}`
    await cdp.type('.tutor__composer textarea', newQuestion)
    await cdp.eval("document.querySelector('.tutor__send').click()")
    const refreshed = await waitFor(async () => {
      const text = await cdp.bodyText()
      return text.includes(newQuestion) && text.includes('旧历史问题（无来源标注）') ? text : null
    }, 30000)
    if (refreshed) {
      const occurrences = refreshed.split(newQuestion).length - 1
      report('D7 新提问后历史刷新且不重复展示', occurrences === 1, `提问出现 ${occurrences} 次（应为 1）`)
    } else {
      report('D7 新提问后历史刷新且不重复展示', false, '新提问或旧历史未出现')
    }

    /* ---------- D8：Web↔Mobile 一致（API 视角） ---------- */
    const tokenA = await apiLogin(ACCOUNT_A)
    const webView = await (await fetch(`${API_URL}/api/tutoring/history`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    })).json()
    const webSees = (webView.items || []).some(item => item.q === newQuestion)
    report('D8 Web 与 Mobile 数据一致（App 提问 API 立即可见）', webSees,
      webSees ? '同一账号同一服务端，网页视角可见移动端提问' : 'API 未见移动端提问')
  } finally {
    if (ws) ws.close()
    chrome.kill()
    api.kill()
    // Chromium profile 同步删除在 Windows 上会因句柄未释放阻塞主线程
    // （实测挂住数分钟）——改为分离的后台进程清理，主进程立即退出。
    try {
      const cleaner = process.platform === 'win32'
        ? spawn('cmd', ['/c', 'rd', '/s', '/q', `"${userDataDir}"`], { detached: true, stdio: 'ignore', windowsHide: true })
        : spawn('rm', ['-rf', userDataDir], { detached: true, stdio: 'ignore' })
      cleaner.unref()
      fs.rmSync(seedFile, { force: true })
    } catch {
      /* 清理失败不影响结果（Temp 由 OS 回收） */
    }
  }

  const failed = results.filter(r => !r.ok)
  console.log(`\n数据层 E2E 汇总: ${results.length - failed.length}/${results.length} 通过`)
  if (failed.length > 0) process.exitCode = 1
}

main().catch(err => {
  console.error('数据层 E2E 执行异常:', err)
  process.exitCode = 1
})
