import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Local sandbox operator tool, not a product checkout or a production process.
const root = fileURLToPath(new URL('..', import.meta.url))
const directory = path.join(root, 'outputs', `sandbox-experience-${Date.now()}`)
fs.mkdirSync(directory, { recursive: true })
const reserve = net.createServer().listen(Number(process.env.EDUMIND_SANDBOX_API_PORT || 0), '127.0.0.1')
await new Promise(resolve => reserve.once('listening', resolve))
const apiPort = reserve.address().port
await new Promise(resolve => reserve.close(resolve))
const apiOrigin = `http://127.0.0.1:${apiPort}`
const child = spawn(process.execPath, ['server/index.js'], { cwd: root, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'], env: {
  ...process.env, NODE_ENV: 'development', ZHIXUE_ENV: 'demo', PORT: String(apiPort), ZHIXUE_API_HOST: '127.0.0.1',
  MYSQL_URL: '', MYSQL_HOST: '', MYSQL_USER: '', MYSQL_DATABASE: '',
  PAYMENT_PROVIDER: 'vibe-pay', VIBE_PAY_CONFIG_SOURCE: 'sandbox-file', EDUMIND_PAYMENT_ENABLED: 'true', EDUMIND_PAYMENT_PRICE_CENTS: '1', PAYMENT_BASE_URL: apiOrigin,
  ZHIXUE_DATA_FILE: path.join(directory, 'data.json'), ZHIXUE_CHAT_STORE_FILE: path.join(directory, 'chat.json'), ZHIXUE_TRACE_FILE: path.join(directory, 'traces.json'),
  ZHIXUE_PAYMENT_FILE: path.join(directory, 'payments.json'), ZHIXUE_SESSION_FILE: path.join(directory, 'sessions.json'), ZHIXUE_IDENTITY_FILE: path.join(directory, 'identities.json'),
} })
let token, orderId, origin
const idempotencyKey = crypto.randomUUID()
const stop = () => { child.kill(); preview.close() }
process.once('SIGINT', stop); process.once('SIGTERM', stop)
process.once('exit', () => child.kill())
const api = async (endpoint, body) => {
  const res = await fetch(`${apiOrigin}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })
  const result = await res.json()
  if (!res.ok) throw new Error(result.code || 'sandbox-api-request-failed')
  return result
}
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const preview = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'" })
      res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>智学星枢沙箱付款体验</title><main><h1>支付宝沙箱体验</h1><p>仅沙箱测试，测试金额 ¥0.01，不涉及真实资金，不代表商品已上线。</p><form method="post" action="/pay" target="_blank"><button>打开沙箱收银台</button></form><form method="post" action="/query" target="_blank"><button>查询本次订单</button></form><p>支付页面或回跳页不代表付款成功，以服务端验签查询为准。回跳使用已启动后端的中性结果页；本页保留查询入口。</p></main></html>')
      return
    }
    if (req.method !== 'POST' || req.headers.origin !== origin || !['/pay', '/query'].includes(req.url)) { res.writeHead(403); res.end('Forbidden'); return }
    if (req.url === '/pay') {
      const result = await api('/api/payments/orders', { idempotencyKey })
      orderId = result.order.id
      if (!result.checkout?.paymentHtml) throw new Error('sandbox-order-already-final')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
      res.end(result.checkout.paymentHtml)
    } else {
      if (!orderId) throw new Error('请先打开沙箱收银台生成测试订单')
      const result = await api(`/api/payments/orders/${orderId}/query`, {})
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><h1>服务端查询结果（沙箱）</h1><pre>${escape(JSON.stringify({ status: result.result.order.status, providerState: result.result.providerState, dataSource: result.result.order.dataSource }, null, 2))}</pre></html>`)
    }
  } catch (error) {
    res.writeHead(409, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><h1>暂未确认付款结果</h1><p>${escape(error.message)}</p><p>请稍后查询，不要重复付款。</p></html>`)
  }
})
try {
  let ready = false
  for (let n = 0; n < 80; n++) {
    if (child.exitCode !== null) throw new Error('sandbox-backend-exited')
    try { if ((await fetch(`${apiOrigin}/api/health`)).ok) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (!ready) throw new Error('sandbox-backend-start-timeout')
  token = (await api('/api/auth/login', { account: 'reviewer', password: 'Zhixue2026!', role: 'student' })).token
  await new Promise(resolve => preview.listen(Number(process.env.EDUMIND_SANDBOX_PREVIEW_PORT || 0), '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${preview.address().port}`
  console.log(`Sandbox browser entry: ${origin}/`)
  console.log(`Verified backend return route: ${apiOrigin}/api/payments/return`)
  console.log('Local sandbox only; amount 0.01 CNY; no production sale enabled. Stop with Ctrl+C.')
} catch (error) { console.error(error.message); stop(); process.exitCode = 1 }
