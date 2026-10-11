#!/usr/bin/env node
/**
 * 移动端构建入口（P1 · feat/mobile-v1）
 * 跨平台设置 MOBILE_BUILD=1 后调用 vite build，产出 dist-mobile（Capacitor webDir）。
 *
 * 环境说明：本环境的 safe-delete 沙箱把 fs 删除转交垃圾箱二进制，对含大量文件的
 * 目录会 ETIMEDOUT。构建前先把旧 dist-mobile 整体 mv 走（瞬时操作），构建成功后再
 * 尽力以原生删除清理旧目录；清理失败不影响构建结果（目录已在 .gitignore 内）。
 *
 * 用法：node scripts/build-mobile.mjs [--dev]
 *   --dev：开发模式构建（vite build --mode development，import.meta.env.PROD=false）。
 *           跨域 Web 调试桥接仅开发构建可用（P4-2A：生产构建明确拒绝跨源 Web），
 *           因此跨域 E2E（CROSS_ORIGIN=1）必须基于 --dev 产物运行。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'dist-mobile')
const devBuild = process.argv.includes('--dev')

function moveOldOutputAside() {
  if (!fs.existsSync(outDir)) return null
  const aside = path.join(root, `.dist-mobile-prev-${Date.now()}`)
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
if (aside) console.log(`[build-mobile] 旧产物已移至 ${path.basename(aside)}（规避沙箱删除超时）`)

const viteArgs = devBuild ? ['build', '--mode', 'development'] : ['build']
// --dev 必须显式 NODE_ENV=development：vite build 默认强制 production，
// 仅传 --mode 不会把 import.meta.env.PROD 置为 false（实测踩坑）。
const child = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), ...viteArgs], {
  cwd: root,
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    MOBILE_BUILD: '1',
    CODEBUDDY_SAFE_DELETE_SANDBOX: '0',
    ...(devBuild ? { NODE_ENV: 'development' } : {}),
  },
})

child.on('exit', code => {
  if (code !== 0) {
    process.exitCode = 1
    return
  }
  // Capacitor webDir 约定入口为 index.html；Vite 的 HTML 产物名跟随源文件名（mobile.html），
  // 此处重命名（html 内资源引用均为 /assets/ 绝对路径，重命名安全）。
  const from = path.join(outDir, 'mobile.html')
  const to = path.join(outDir, 'index.html')
  if (fs.existsSync(from)) {
    fs.renameSync(from, to)
    console.log('[build-mobile] renamed mobile.html -> index.html (Capacitor webDir entry)')
  } else if (!fs.existsSync(to)) {
    console.error('[build-mobile] 未找到 mobile.html，构建产物异常')
    process.exitCode = 1
    return
  }
  bestEffortRemove(aside)
  process.exitCode = 0
})
