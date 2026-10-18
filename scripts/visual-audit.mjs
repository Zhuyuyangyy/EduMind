/**
 * EduMind 视觉审计截图脚本（P4-2C 前置 · 真实运行截图）。
 *
 * 目标：把「线上旧构建（yx.shushubiye.fun）」与「本地当前源码构建」
 * 放在同一视口下截图，供桌面/移动两端同页面对比，作为统一设计规范
 * 的实证输入。不再凭 CSS 猜测。
 *
 * 覆盖：
 * - 线上 Web：/home 首页、/learning-path 学习路径、/tutoring AI 导师
 * - 本地 Web：同三页（dist 生产构建，经静态服务器）
 * - 本地 Mobile（390×844）：/today 今日、/growth 成长、/tutor AI 导师
 *
 * 登录：演示账号 reviewer / Zhixue2026!（线上旧构建与本地一致）；
 *       用 fetch 取 Set-Cookie 后经 CDP Network.setCookie 注入，
 *       免表单自动化时序问题。
 *
 * 用法：
 *   node scripts/visual-audit.mjs --web-url http://127.0.0.1:5173 \
 *     --mobile-url http://127.0.0.1:5174 --online https://yx.shushubiye.fun
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

const CHROME = process.argv[2]?.startsWith('D:') ? process.argv[2] : 'D:/cloakbrowser-windows-x64/chrome.exe'
const CDP_PORT = 9347
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || 'http://127.0.0.1:58278'

function flag(name, fallback) {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}
const WEB_URL = flag('--web-url', 'http://127.0.0.1:5175')
const MOBILE_URL = flag('--mobile-url', 'http://127.0.0.1:5174')
const ONLINE = flag('--online', 'https://yx.shushubiye.fun')
const OUT_DIR = path.resolve(flag('--out', 'outputs/visual-audit'))

const CREDS = { account: 'reviewer', password: 'Zhixue2026!' }

/* ———————————— CDP 客户端（与 mobile-e2e 同款最小实现） ———————————— */

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
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    return r.result?.value
  }
  async goto(url) {
    await this.send('Page.navigate', { url })
  }
}

/* ———————————— 工具 ———————————— */

/**
 * 真实表单登录（E2E 验证过的路径）：cookie 注入在路由守卫时序下
 * 不可靠（守卫挂载前已渲染登录页），改用表单输入 + 提交。
 */
async function loginByForm(cdp, origin, { accountSelector, passwordSelector, buttonSelector, successExpr }) {
  await cdp.goto(`${origin}/login`)
  await waitFor(cdp, `Boolean(document.querySelector(${JSON.stringify(accountSelector)}))`, 15000)
  await cdp.eval(`(() => {
    const a = document.querySelector(${JSON.stringify(accountSelector)})
    a.focus(); a.setSelectionRange(0, a.value.length)
  })()`)
  await cdp.send('Input.insertText', { text: CREDS.account })
  await cdp.eval(`(() => {
    const p = document.querySelector(${JSON.stringify(passwordSelector)})
    p.focus(); p.setSelectionRange(0, p.value.length)
  })()`)
  await cdp.send('Input.insertText', { text: CREDS.password })
  await cdp.eval(`document.querySelector(${JSON.stringify(buttonSelector)}).click()`)
  return waitFor(cdp, successExpr, 20000)
}

async function loginCookies(origin) {
  const res = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...CREDS, role: 'student' }),
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`登录失败 ${origin}: HTTP ${res.status}`)
  return res.headers.getSetCookie().map(c => c.split(';')[0])
}

async function injectCookies(cdp, origin, cookies) {
  const host = new URL(origin).hostname
  // Chrome 对 IP 主机拒绝带 domain 的 cookie——IP 时省略 domain
  // （host-only cookie），域名时才显式设置。
  const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(host)
  for (const cookie of cookies) {
    const [nameValue, ...attrs] = cookie.split(';')
    const eq = nameValue.indexOf('=')
    const name = nameValue.slice(0, eq)
    const value = nameValue.slice(eq + 1)
    const secure = attrs.some(a => a.trim().toLowerCase() === 'secure')
    // CDP：IP 主机用 url（domain 对 IP 无效）；域名主机用 domain
    const originUrl = new URL(origin).origin
    await cdp.send('Network.setCookie', {
      name, value, path: '/', secure,
      ...(isIp ? { url: `${originUrl}/` } : { domain: host }),
    })
  }
}

async function waitFor(cdp, expression, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const v = await cdp.eval(expression).catch(() => null)
    if (v) return v
    await new Promise(r => setTimeout(r, 300))
  }
  return null
}

async function shot(cdp, name) {
  const file = path.join(OUT_DIR, `${name}.png`)
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs.writeFileSync(file, Buffer.from(data, 'base64'))
  const size = fs.statSync(file).size
  console.log(`  📸 ${name}.png (${(size / 1024).toFixed(0)}KB)`)
  return file
}

/* ———————————— 主流程 ———————————— */

const results = []

async function captureSet(cdp, { label, origin, routes, viewport, note, skipLogin = false, dismissGuide = false }) {
  console.log(`\n[${label}] ${origin}（${note}）`)
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.w, height: viewport.h, deviceScaleFactor: 1, mobile: viewport.mobile === true,
  })
  if (skipLogin) {
    // 线上旧构建（v2.0.0）无登录系统、业务端点公开——直接访问。
    // （注意：这本身是待整改项——公开 API 返回真实聊天历史，见报告）
    console.log('  （旧构建无登录系统，跳过登录）')
  } else {
    const isMobile = viewport.mobile === true
    const loggedIn = await loginByForm(cdp, origin, isMobile
      ? {
          accountSelector: '.m-field input[type="text"]',
          passwordSelector: '.m-field input[type="password"]',
          buttonSelector: '.login__form .m-btn',
          successExpr: "location.hash !== '#/login' && location.hash !== ''",
        }
      : {
          accountSelector: '.login-panel .login-form input:not([type="password"])',
          passwordSelector: '.login-panel .login-form input[type="password"]',
          buttonSelector: '.login-panel .login-button',
          successExpr: "location.pathname !== '/login'",
        })
    console.log(loggedIn ? '  表单登录成功' : '  ⚠️ 表单登录未确认成功（继续尝试截图）')
    if (dismissGuide) {
      // 注入新手引导已关闭标记（真实用户点「跳过引导」的等价状态），
      // 截取无浮层遮挡的主界面
      await cdp.eval(`window.localStorage.setItem('edumind-new-user-pet-guide-dismissed', '1')`)
      console.log('  已注入跳过引导标记')
    }
  }
  for (const route of routes) {
    if (route.path.includes('/#')) {
      // hash 路由：用 JS 赋值做 SPA 内导航——Page.navigate 同文档
      // hash 变化会触发完整 reload，reload 后 auth 守卫时序不稳定
      await cdp.eval(`location.hash = ${JSON.stringify(route.path.slice(route.path.indexOf('#')))}`)
    } else {
      await cdp.goto(`${origin}${route.path}`)
    }
    // 通用就绪判定：#app 已挂载且有子元素（新旧版根选择器不同），
    // 再叠加页面专属选择器（有则等，没有不强求——记录状态供人工确认）
    const mounted = await waitFor(cdp, "Boolean(document.querySelector('#app') && document.querySelector('#app').children.length > 0)", route.timeout || 20000)
    const specific = route.wait ? await waitFor(cdp, route.wait, 3000).catch(() => null) : true
    const ok = mounted
    if (ok) {
      await new Promise(r => setTimeout(r, route.settle || 2500)) // 等动画/数据落定
      await shot(cdp, `${label}-${route.name}`)
      results.push({ label, page: route.name, status: specific ? 'ok' : 'mounted(页面选择器未命中，已截图待人工确认)' })
    } else {
      // 未等到目标元素也截图（记录实际状态），标注待确认
      await new Promise(r => setTimeout(r, 1500))
      await shot(cdp, `${label}-${route.name}`)
      results.push({ label, page: route.name, status: 'selector-timeout(已截图待人工确认)' })
      console.log(`  ⚠️ ${route.name} 未等待到 ${route.wait}（可能未登录或路由不同）`)
    }
  }
}

/** 本地 web 静态服务 + /api 代理（vite preview 不带 API 代理） */
async function startWebProxy(port, distDir, apiTarget) {
  const http = await import('node:http')
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api')) {
      const target = new URL(apiTarget + req.url)
      const proxyReq = http.request(target, { method: req.method, headers: { ...req.headers, host: target.host } }, proxyRes => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers)
        proxyRes.pipe(res)
      })
      proxyReq.on('error', () => { res.writeHead(502); res.end('api proxy error') })
      req.pipe(proxyReq)
      return
    }
    let filePath = path.join(distDir, req.url === '/' ? 'index.html' : req.url.split('?')[0])
    if (!filePath.startsWith(distDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html') // SPA 回退
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' })
    fs.createReadStream(filePath).pipe(res)
  })
  await new Promise(resolve => server.listen(port, resolve))
  return server
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  // 本地 web 代理（dist → /api 8789）
  const webProxy = await startWebProxy(5175, path.resolve('dist'), 'http://127.0.0.1:8789')
  console.log('[visual-audit] 本地 web 代理: http://127.0.0.1:5175 → API 8789')
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edumind-visual-audit-'))
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    `--proxy-server=${PROXY}`,
    '--proxy-bypass-list=127.0.0.1;localhost', // 本地直连，线上走代理
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--force-device-scale-factor=1',
    '--hide-scrollbars',
    'about:blank',
  ], { stdio: 'ignore' })

  let ws = null
  let cdp = null
  try {
    const target = await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/list`)
    const page = target.find(t => t.type === 'page' && t.webSocketDebuggerUrl)
    if (!page) throw new Error('CDP page target 未就绪')
    // Node 22 原生全局 WebSocket（与 mobile-e2e.mjs 一致，无 ws 依赖）
    ws = new WebSocket(page.webSocketDebuggerUrl)
    await once(ws, 'open')
    cdp = new CdpClient(ws)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Network.enable')

    const webRoutes = [
      { name: 'home', path: '/home', wait: "Boolean(document.querySelector('.welcome'))" },
      { name: 'learning-path', path: '/learning-path', wait: "Boolean(document.querySelector('.lp-page'))" },
      { name: 'tutoring', path: '/tutoring', wait: "Boolean(document.querySelector('.tutoring-page'))" },
    ]
    const mobileRoutes = [
      { name: 'today', path: '/#/today', wait: "Boolean(document.querySelector('.today'))" },
      { name: 'growth', path: '/#/growth', wait: "Boolean(document.querySelector('.growth'))" },
      { name: 'tutor', path: '/#/tutor', wait: "Boolean(document.querySelector('.tutor'))" },
    ]

    await captureSet(cdp, { label: 'online-web', origin: ONLINE, routes: webRoutes, viewport: { w: 1440, h: 900 }, note: '线上旧构建 · 桌面', skipLogin: true })
    await captureSet(cdp, { label: 'local-web', origin: WEB_URL, routes: webRoutes, viewport: { w: 1440, h: 900 }, note: '本地当前构建 · 桌面' })
    // 补拍：跳过新手引导后的桌面首页与学习路径（主视觉无浮层遮挡）
    await captureSet(cdp, { label: 'local-web-ng', origin: WEB_URL, routes: [
      { name: 'home', path: '/home', wait: "Boolean(document.querySelector('.welcome'))" },
      { name: 'learning-path', path: '/learning-path', wait: "Boolean(document.querySelector('.lp-page'))" },
    ], viewport: { w: 1440, h: 900 }, note: '本地当前构建 · 桌面（跳过引导）', dismissGuide: true })
    await captureSet(cdp, { label: 'local-mobile', origin: MOBILE_URL, routes: mobileRoutes, viewport: { w: 390, h: 844, mobile: true }, note: '本地当前构建 · 移动' })

    const report = {
      generatedAt: new Date().toISOString(),
      viewport: { desktop: '1440x900', mobile: '390x844' },
      shots: results,
      outputDir: OUT_DIR,
    }
    fs.writeFileSync(path.join(OUT_DIR, 'audit-index.json'), JSON.stringify(report, null, 2))
    console.log(`\n截图审计完成：${results.filter(r => r.status === 'ok').length}/${results.length} 页命中目标元素，输出目录 ${OUT_DIR}`)
  } finally {
    try { ws?.close() } catch { /* ignore */ }
    chrome.kill()
    await once(chrome, 'exit').catch(() => {})
    webProxy.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
}

async function waitForHttp(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (res.ok) return res.json()
    } catch { /* not up */ }
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error(`CDP 未就绪: ${url}`)
}

main().catch(error => {
  console.error('截图审计失败:', error?.message || error)
  process.exit(1)
})
