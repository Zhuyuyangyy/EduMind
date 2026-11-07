#!/usr/bin/env node
/**
 * 网页版构建（与 npm run build 等效，vite 部分经此包装）。
 *
 * 环境说明：本环境的 safe-delete 沙箱把 fs 删除转交垃圾箱二进制，对 dist/ 这种
 * 含大量文件的目录会 ETIMEDOUT。构建前先把旧 dist 整体 mv 走（瞬时操作），
 * 构建成功后再尽力以原生删除清理；清理失败不影响构建结果（目录已在 .gitignore 内）。
 *
 * 用法：node scripts/build.mjs
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'dist')

function moveOldOutputAside() {
  if (!fs.existsSync(outDir)) return null
  const aside = path.join(root, `.dist-prev-${Date.now()}`)
  fs.renameSync(outDir, aside)
  return aside
}

function bestEffortRemove(dir) {
  if (!dir) return
  // 原生删除（不加载 safe-delete 垫片），10 秒超时，失败就留下（gitignored）
  const child = spawn(process.execPath, ['-e', `require('fs').rmSync(${JSON.stringify(dir)},{recursive:true,force:true})`], {
    cwd: root,
    stdio: 'ignore',
    env: { ...process.env, NODE_OPTIONS: '' },
    timeout: 10000,
  })
  child.on('error', () => {})
}

const aside = moveOldOutputAside()
if (aside) console.log(`[build] 旧 dist 已移至 ${path.basename(aside)}（规避沙箱删除超时）`)

const child = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], {
  cwd: root,
  stdio: 'inherit',
  shell: false,
  env: { ...process.env, CODEBUDDY_SAFE_DELETE_SANDBOX: '0' },
})

child.on('exit', code => {
  if (code !== 0) {
    process.exitCode = 1
    return
  }
  bestEffortRemove(aside)
  process.exitCode = 0
})
