#!/usr/bin/env node
/**
 * 统一开发入口：同时拉起 API 服务（:8788）与前端 Vite（:5174）。
 *
 * 说明：package.json 的 "dev" 脚本指向 scripts/dev.mjs，但该文件在原源码包中缺失，
 * 导致 npm run dev 直接失败。此文件补全该入口。
 *
 * - API 端口可通过 PORT 覆盖（server/index.js 读取 PORT，默认 8788）
 * - 前端端口在 vite.config.ts 中固定为 5174，并由 proxy 转发 /api 到 :8788
 * - 任一子进程退出时整体退出，避免留下孤儿进程
 */
import { spawn } from 'node:child_process'
import process from 'node:process'

const children = []

function run(name, command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  })

  child.on('exit', (code, signal) => {
    console.log(`[dev] ${name} 退出 (code=${code}, signal=${signal})，正在关闭其余进程...`)
    shutdown(code === null ? 1 : code)
  })

  child.on('error', (error) => {
    console.error(`[dev] ${name} 启动失败:`, error.message)
    shutdown(1)
  })

  children.push(child)
  return child
}

let shuttingDown = false
function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
    }
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

console.log('[dev] 启动顺序：API(:8788) -> 前端(:5174)')

run('api', process.execPath, ['server/index.js'])

// 给后端一个先起步的窗口，避免前端首屏直接打到尚未监听的代理。
setTimeout(() => {
  run('vite', process.execPath, ['node_modules/vite/bin/vite.js'])
}, 800)
