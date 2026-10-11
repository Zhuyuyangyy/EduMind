import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const TEST_PORT = 8791
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`
// 与其他测试文件隔离数据文件，避免并行执行时争抢 store.json / traces.json
const DATA_FILE = path.join(os.tmpdir(), `edumind-test-chat-${process.pid}.json`)
const TRACE_FILE = path.join(os.tmpdir(), `edumind-test-chat-traces-${process.pid}.json`)

async function waitForServer(process) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`API server exited early with code ${process.exitCode}`)
    }

    try {
      const response = await fetch(`${BASE_URL}/api/health`)
      if (response.ok) return
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  throw new Error('Timed out waiting for API server')
}

async function withApiServer(fn) {
  const api = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      ZHIXUE_DATA_FILE: DATA_FILE,
      ZHIXUE_CHAT_STORE_FILE: DATA_FILE,
      ZHIXUE_TRACE_FILE: TRACE_FILE,
      // P4-1B：会话/身份文件按测试隔离 + 强制 JSON 模式
      ZHIXUE_SESSION_FILE: `${DATA_FILE}.sessions.json`,
      ZHIXUE_IDENTITY_FILE: `${DATA_FILE}.identities.json`,
      MYSQL_URL: '', MYSQL_HOST: '', MYSQL_PORT: '', MYSQL_USER: '', MYSQL_PASSWORD: '', MYSQL_DATABASE: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stderr = ''
  api.stderr.on('data', chunk => {
    stderr += chunk.toString()
  })

  try {
    await waitForServer(api)
    await fn()
  } finally {
    if (api.exitCode === null) {
      api.kill()
      await once(api, 'exit')
    }
    fs.rmSync(DATA_FILE, { force: true })
    fs.rmSync(TRACE_FILE, { force: true })
  }

  assert.equal(stderr, '')
}

/**
 * 登录演示账号，返回 { cookie, csrf }（P0 认证改造后所有业务接口都需要
 * 会话；P4-1C 起 Cookie 认证的写操作还必须双提交 CSRF Token）。
 */
async function loginAsStudent() {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: 'reviewer', password: 'Zhixue2026!', role: 'student' }),
  })
  assert.equal(response.status, 200)
  const setCookies = response.headers.getSetCookie?.() || []
  const cookie = setCookies.map(item => item.split(';')[0].trim()).filter(Boolean).join('; ')
  assert.ok(cookie.startsWith('edumind_session='), `login should issue session cookie, got: ${cookie}`)
  let csrf = ''
  for (const item of setCookies) {
    const pair = item.split(';')[0]
    const index = pair.indexOf('=')
    if (index > 0 && pair.slice(0, index).trim() === 'edumind_csrf') {
      csrf = decodeURIComponent(pair.slice(index + 1).trim())
    }
  }
  return { cookie, csrf }
}

test('/api/chat accepts dialogue messages payload and returns dialogue shape', async () => {
  await withApiServer(async () => {
    const { cookie, csrf } = await loginAsStudent()
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf },
      body: JSON.stringify({
        messages: [{ sender: 'user', text: '你好' }],
        currentDimensions: { identity: 'student' },
      }),
    })

    assert.equal(response.status, 200)
    const data = await response.json()
    assert.equal(typeof data.reply, 'string')
    assert.ok(data.reply.length > 0)
    assert.deepEqual(data.extractedDimensions, {})
    assert.ok(Array.isArray(data.suggestChips))
  })
})
