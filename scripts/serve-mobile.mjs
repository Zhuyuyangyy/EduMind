#!/usr/bin/env node
/**
 * 移动端生产包本地静态服务（P1 · feat/mobile-v1）
 * 服务 dist-mobile 到 5174，并把 /api 代理到 API 服务器（默认 127.0.0.1:8788），
 * 使浏览器/WebView 下的移动端应用与网页版一样走同源相对路径。
 * 用法：node scripts/serve-mobile.mjs [port] [apiTarget]
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const webRoot = path.join(root, 'dist-mobile')
const port = Number(process.argv[2] || 5174)
const apiTarget = process.argv[3] || 'http://127.0.0.1:8788'

if (!fs.existsSync(path.join(webRoot, 'index.html'))) {
  console.error('[serve-mobile] dist-mobile/index.html 不存在，请先执行: npm run build:mobile')
  process.exit(1)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers })
  res.end(body)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)

  if (url.pathname.startsWith('/api/')) {
    // 代理到 API 服务器（透传方法与请求体）
    const target = new URL(apiTarget)
    const proxyReq = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: target.host },
      },
      proxyRes => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers)
        proxyRes.pipe(res)
      },
    )
    proxyReq.on('error', err => {
      send(res, 502, `proxy error: ${err.message}`)
    })
    req.pipe(proxyReq)
    return
  }

  // 静态文件：hash 路由下任何路径都回退到 index.html
  let filePath = path.join(webRoot, decodeURIComponent(url.pathname))
  if (!filePath.startsWith(webRoot)) {
    send(res, 403, 'forbidden')
    return
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(webRoot, 'index.html')
  }
  const ext = path.extname(filePath)
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
})

server.listen(port, () => {
  console.log(`[serve-mobile] http://127.0.0.1:${port}  (静态: dist-mobile, /api -> ${apiTarget})`)
})
