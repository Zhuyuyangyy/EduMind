#!/usr/bin/env node
/**
 * 移动端生产包 E2E 验证（P1 · feat/mobile-v1）
 * 用无头 Chromium（CDP）驱动 dist-mobile 生产包，覆盖：
 *   A 未登录拦截  B 登录  C AI 提问（含降级徽标）  D 状态页  E 退出
 *   F 会话失效(401)自动回登录  G 网络不可达的清晰反馈
 *
 * 前置：API 服务器运行中（默认 127.0.0.1:8788），静态服务在 5174（scripts/serve-mobile.mjs），
 *      且已执行 npm run build:mobile。
 * 用法：node scripts/mobile-e2e.mjs [webUrl] [apiUrl] [chromePath]
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const WEB_URL = process.argv[2] || 'http://127.0.0.1:5174'
const API_URL = process.argv[3] || 'http://127.0.0.1:8788'
const CHROME = process.argv[4] || 'D:/cloakbrowser-windows-x64/chrome.exe'
const CDP_PORT = 9333
const DEMO_ACCOUNT = process.env.DEMO_STUDENT_ACCOUNT || 'reviewer'
const DEMO_PASSWORD = process.env.DEMO_STUDENT_PASSWORD || 'Zhixue2026!'
// CROSS_ORIGIN=1：模拟 Capacitor 真机场景——页面与 API 不同源，
// 预置 localStorage 绝对 API 地址，不走本地 /api 代理，验证 CORS + Bearer 全链路
const CROSS_ORIGIN = process.env.CROSS_ORIGIN === '1'

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
    this.consoleLines = []
    ws.onmessage = event => {
      const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString())
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
      }
      // 收集浏览器 console（失败诊断用）
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.args) {
        const text = msg.params.args.map(a => a.value ?? a.description ?? '').join(' ')
        this.consoleLines.push(`[${msg.params.type}] ${text}`)
        if (this.consoleLines.length > 60) this.consoleLines.shift()
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

  /** 聚焦元素、全选既有内容后用 CDP 插入文本（替换预填值，产生真实输入事件） */
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

async function login(cdp) {
  await cdp.type('.m-field input[type="text"]', DEMO_ACCOUNT)
  await cdp.type('.m-field input[type="password"]', DEMO_PASSWORD)
  await cdp.eval("document.querySelector('.login__form .m-btn').click()")
  // 登录成功标志：底部导航出现（hash 可能是 /today，也可能被 redirect 参数带回 /tutor）
  const ok = await waitFor(() => cdp.eval("Boolean(document.querySelector('.mobile-tabs')) && location.hash !== '#/login'"), 20000)
  if (!ok) {
    // 失败时 dump 现场便于诊断
    const text = await cdp.bodyText()
    const err = await cdp.eval("document.querySelector('.error')?.textContent || ''")
    const vals = await cdp.eval(`JSON.stringify({
      account: document.querySelector('.m-field input[type="text"]')?.value,
      pwdLen: (document.querySelector('.m-field input[type="password"]')?.value || '').length,
      hash: location.hash,
    })`)
    console.log(`[login 失败诊断] error="${err}" vals=${vals}\n[body] ${text.slice(0, 200)}`)
  }
  return ok
}

async function main() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edumind-mobile-e2e-'))
  // P4-2A：跨域场景必须基于开发构建（跨源 Bearer 桥接仅开发可用）。
  // 生产构建会命中「拒绝跨源 Web」存储，登录必然失败——先给出明确提示。
  if (CROSS_ORIGIN) {
    console.log('[mobile-e2e] 跨域模式：dist-mobile 须由 `node scripts/build-mobile.mjs --dev` 产出（开发构建）；生产构建将按设计拒绝跨源 Web')
  }
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
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
    await cdp.send('Network.enable') // P4-1C：读取 HttpOnly 会话 cookie 重放注销

    if (CROSS_ORIGIN) {
      // 在页面脚本执行前预置绝对 API 地址（等价于真机上配置远程后端）
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `try { window.localStorage.setItem('edumind-api-base', ${JSON.stringify(API_URL)}) } catch (e) {}`,
      })
      console.log(`[cross-origin] 页面 ${WEB_URL} → API ${API_URL}（不走代理，验证 CORS+Bearer）`)
    }

    // A. 未登录直接访问 → 登录页
    await cdp.goto(`${WEB_URL}/#/tutor`)
    const loginVisible = await waitFor(() => cdp.eval("Boolean(document.querySelector('.login'))"))
    report('A 未登录访问被重定向到登录页', Boolean(loginVisible), loginVisible ? '' : '未出现登录表单')

    // B. 登录
    const onTutor = await login(cdp)
    report('B 登录成功进入 AI 导师页', Boolean(onTutor), onTutor ? '' : '未进入导师页')

    // C. 提问并得到回答（无 LLM 配置时应显示降级徽标）
    await cdp.eval("document.querySelectorAll('.tab')[1].click()")
    await waitFor(() => cdp.eval("Boolean(document.querySelector('.tutor__composer'))"))
    await cdp.type('.tutor__composer textarea', 'BFS 的 visited 标记在入队时还是出队时打？')
    await cdp.eval("document.querySelector('.tutor__send').click()")
    const answerState = await waitFor(async () => {
      return cdp.eval(`(() => {
        const el = document.querySelector('.m-bubble--ai')
        if (!el || (el.textContent || '').length < 5) return null
        return JSON.stringify({
          len: el.textContent.length,
          fallbackBadge: Boolean(document.querySelector('.m-badge--warn')),
        })
      })()`).then(v => (v ? JSON.parse(v) : null))
    }, 30000)
    report('C AI 提问返回真实回答', Boolean(answerState),
      answerState ? `回答 ${answerState.len} 字符，降级徽标=${answerState.fallbackBadge ? '显示(未配 LLM，符合预期)' : '未显示'}` : '未出现回答')

    // D. 「我的」页（账号 + 服务诊断）
    await cdp.eval("document.querySelectorAll('.tab')[3].click()")
    const statusOk = await waitFor(async () => {
      const text = await cdp.bodyText()
      return text.includes('服务连接诊断') && (text.includes('正常') || text.includes('不可达'))
    })
    const statusText = statusOk ? await cdp.bodyText() : ''
    report('D 「我的」页展示账号与服务诊断', Boolean(statusOk),
      statusOk ? `账号=${statusText.includes(DEMO_ACCOUNT) ? DEMO_ACCOUNT : '?'} 健康=${statusText.includes('正常') ? '正常' : '异常'}` : '页面未就绪')

    // E. 退出登录
    await cdp.eval("document.querySelector('.profile__logout').click()")
    const backToLogin = await waitFor(() => cdp.eval("Boolean(document.querySelector('.login'))"))
    report('E 退出登录回到登录页', Boolean(backToLogin))

    // F. 会话失效：P4-1C 起 Web 同源为 HttpOnly Cookie 认证（JS 读不到
    //    会话 cookie），改用 CDP Network.getCookies 取全量 cookie，
    //    配合 CSRF 双提交重放注销——等价于服务端主动撤销该会话。
    //    再进入 AI 导师（历史请求即 401）应被自动打回登录页
    const onTutor2 = await login(cdp)
    let logoutStatus = 0
    if (onTutor2) {
      const cookies = await cdp.send('Network.getCookies', { urls: [API_URL] }).catch(() => ({ cookies: [] }))
      const cookieHeader = (cookies.cookies || []).map(item => `${item.name}=${item.value}`).join('; ')
      const csrf = (cookies.cookies || []).find(item => item.name === 'edumind_csrf')?.value || ''
      if (cookieHeader) {
        const res = await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { Cookie: cookieHeader, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
        }).catch(() => null)
        logoutStatus = res?.status || 0
      }
      // 进入导师页：按账号拉取历史 → 401 → 自动回登录页
      await cdp.eval("document.querySelectorAll('.tab')[1].click()")
    }
    const reauth = await waitFor(() => cdp.eval("Boolean(document.querySelector('.login'))"), 20000)
    report('F 会话失效后请求被 401 打回登录页', Boolean(reauth) && logoutStatus === 200,
      reauth ? '' : '未自动跳转登录页')

    // G. 网络不可达：API 地址指向不存在端口，登录应给出清晰错误（而非白屏/无限转圈）
    await cdp.eval("localStorage.setItem('edumind-api-base', 'http://127.0.0.1:9999')")
    await cdp.type('.m-field input[type="text"]', DEMO_ACCOUNT)
    await cdp.type('.m-field input[type="password"]', DEMO_PASSWORD)
    await cdp.eval("document.querySelector('.login__form .m-btn').click()")
    const netError = await waitFor(async () => {
      const text = await cdp.bodyText()
      return text.includes('网络') || text.includes('不可达') || text.includes('请求失败')
    }, 25000)
    const errLine = netError ? (await cdp.bodyText()).split('\n').find(l => l.includes('网络') || l.includes('不可达') || l.includes('请求失败')) : ''
    report('G 网络不可达时给出清晰错误提示', Boolean(netError), errLine || '无错误提示')

    // H. 冷启动恢复（P4-2A）：重新登录 → 刷新页面 → 登录态必须仍在。
    //    同源模式走 HttpOnly Cookie；跨域（开发构建）走 origin 绑定的
    //    Bearer 桥接——桥接 migrate() 曾误清活动 token 导致刷新丢登录，
    //    本场景守住该修复。先恢复默认 API 地址，避免 G 的死端口残留。
    await cdp.eval("localStorage.removeItem('edumind-api-base')")
    await cdp.send('Page.reload')
    await waitFor(() => cdp.eval("Boolean(document.querySelector('.login') || document.querySelector('.mobile-tabs'))"), 20000)
    if (await cdp.eval("Boolean(document.querySelector('.login'))")) {
      // 重试一次：刷新后 Vue 挂载与 CDP 点击可能存在时序竞争
      //（实测点击未触发提交、无错误提示）
      let loggedIn = await login(cdp)
      if (!loggedIn) {
        // 兜底：直接派发表单 submit 事件（排除按钮被遮挡/点击未命中）
        await new Promise(r => setTimeout(r, 1500))
        await cdp.eval(`(() => {
          const form = document.querySelector('.login__form')
          if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
        })()`)
        loggedIn = await waitFor(() => cdp.eval("Boolean(document.querySelector('.mobile-tabs')) && location.hash !== '#/login'"), 15000)
      }
      if (!loggedIn) {
        report('H 刷新后登录态保持（冷启动恢复）', false, '重新登录失败（挂载时序）')
        return
      }
    }
    // 刷新：不得被打回登录页
    await cdp.send('Page.reload')
    const staysLoggedIn = await waitFor(async () => {
      const onLogin = await cdp.eval("Boolean(document.querySelector('.login'))")
      const hasTabs = await cdp.eval("document.querySelectorAll('.tab, .mobile-tabs').length > 0")
      return !onLogin && hasTabs
    }, 20000)
    if (!staysLoggedIn) {
      const diag = await cdp.eval(`JSON.stringify({
        apiBase: localStorage.getItem('edumind-api-base'),
        token: localStorage.getItem('edumind-auth-token'),
        session: localStorage.getItem('edumind-auth-session'),
        onLogin: Boolean(document.querySelector('.login')),
        body: document.body.innerText.slice(0, 200),
      })`)
      console.log('[H-diag]', diag)
    }
    report('H 刷新后登录态保持（冷启动恢复）', Boolean(staysLoggedIn),
      staysLoggedIn ? '' : '刷新后被登出或未恢复')
  } finally {
    if (ws) ws.close()
    // Windows：树杀（/T）确保渲染进程等子进程一并退出
    if (process.platform === 'win32' && chrome.pid) {
      try {
        spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)], { stdio: 'ignore' })
      } catch {
        chrome.kill()
      }
    } else {
      chrome.kill()
    }
    // Chromium profile 清理改为分离的后台进程：同步 rmSync 在 Windows 上
    // 会因句柄未释放阻塞主线程（实测挂住 2 分钟以上），且临时目录本就
    // 由操作系统回收——fire-and-forget 后主进程立即退出（P4-2A）。
    try {
      const cleaner = process.platform === 'win32'
        ? spawn('cmd', ['/c', 'rd', '/s', '/q', `"${userDataDir}"`], { detached: true, stdio: 'ignore', windowsHide: true })
        : spawn('rm', ['-rf', userDataDir], { detached: true, stdio: 'ignore' })
      cleaner.unref()
    } catch {
      /* 清理失败不影响测试结果（Temp 由 OS 回收） */
    }
  }

  const failed = results.filter(r => !r.ok)
  console.log(`\nE2E 汇总${CROSS_ORIGIN ? '（跨 Origin → 远程 API 模式）' : '（同源代理模式）'}: ${results.length - failed.length}/${results.length} 通过`)
  // 强制退出：Chromium 子进程可能残留句柄使事件循环不空（测试工具链）
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('E2E 执行异常:', err)
  process.exitCode = 1
})
