/**
 * 共享测试服务器 harness（P2-2A 起供各测试文件复用）。
 * - 每个测试进程一个独立端口（由 pid 派生），node --test 并行执行文件时不冲突；
 * - 独立数据文件（pid 隔离），JSON 存储模式；
 * - 提供 { baseUrl, get, post } 三个助手，调用方自行断言。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = 20000 + (process.pid % 20000)
export const baseUrl = `http://127.0.0.1:${port}`

async function waitForServer(child, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`API server exited early with code ${child.exitCode}`)
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) return
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  throw new Error('Timed out waiting for API server')
}

export async function withTestServer(fn) {
  const dataFile = path.join(os.tmpdir(), `edumind-test-${process.pid}-${Date.now()}.json`)
  const traceFile = path.join(os.tmpdir(), `edumind-test-traces-${process.pid}-${Date.now()}.json`)

  const api = spawn(process.execPath, ['server/index.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      ZHIXUE_DATA_FILE: dataFile,
      ZHIXUE_CHAT_STORE_FILE: dataFile,
      ZHIXUE_TRACE_FILE: traceFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stderr = ''
  api.stderr.on('data', chunk => {
    stderr += chunk.toString()
  })

  try {
    await waitForServer(api)
    const helpers = {
      baseUrl,
      get: (p, init) => fetch(`${baseUrl}${p}`, init),
      post: (p, body, init) => fetch(`${baseUrl}${p}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
        ...init,
      }),
    }
    await fn(helpers)
  } finally {
    api.kill()
    try {
      fs.rmSync(dataFile, { force: true })
      fs.rmSync(traceFile, { force: true })
    } catch {
      /* 临时文件清理失败不影响测试结果 */
    }
  }
}
