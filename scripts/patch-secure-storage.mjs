/**
 * 应用 secure-storage 插件的 AGP 兼容补丁。
 *
 * 背景：@aparajita/capacitor-secure-storage@7.1.6 的 android/build.gradle
 * 在自身 buildscript 里硬编码 classpath 'com.android.tools.build:gradle:8.13.0'，
 * 而主工程（android/build.gradle）使用 AGP 8.7.2。库模块重复声明 AGP
 * classpath 本无必要（根工程已提供），且 8.13.0 的部分传递依赖
 * （ddmlib 等）在受限网络下无法解析，导致配置阶段失败。
 *
 * 处理：删除该库模块的 buildscript dependencies 块（保留 repositories
 * 以备其他 classpath 需要）。由 package.json 的 postinstall 调用，
 * npm install 后自动重新应用。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(
  projectRoot,
  'node_modules/@aparajita/capacitor-secure-storage/android/build.gradle',
)

if (!fs.existsSync(target)) {
  console.log('[patch-secure-storage] 插件未安装，跳过')
  process.exit(0)
}

const original = fs.readFileSync(target, 'utf8')
const patched = original.replace(
  /buildscript \{[\s\S]*?\n\}\n\n/,
  '',
)

if (patched === original) {
  console.log('[patch-secure-storage] 已是修补后状态（或模式不匹配），无需处理')
  process.exit(0)
}

fs.writeFileSync(target, patched, 'utf8')
console.log('[patch-secure-storage] 已移除插件内 AGP classpath 硬编码（改用根工程 AGP 8.7.2）')
