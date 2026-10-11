/**
 * secure-storage 插件 AGP 兼容补丁（P4-2D 加固版）。
 *
 * 背景：@aparajita/capacitor-secure-storage@7.1.6 的 android/build.gradle
 * 在自身 buildscript 里硬编码 classpath 'com.android.tools.build:gradle:8.13.0'，
 * 而主工程（android/build.gradle）使用 AGP 8.7.2。库模块重复声明 AGP
 * classpath 本无必要（根工程已提供），且 8.13.0 的部分传递依赖
 * （ddmlib 等）在受限网络下无法解析，导致配置阶段失败。
 *
 * P4-2D 加固（复核发现旧版在模式不匹配时仍返回成功）：
 * - 断言插件版本（必须是 ^7，Capacitor 7 兼容线）；
 * - 断言原始内容包含预期的 AGP classpath 行（内容特征）；
 * - 断言补丁结果：该行确已被移除；
 * - 区分「已是修补后状态」（幂等成功）与「模式意外不匹配」（漂移，
 *   退出码 1 明确失败）——依赖升级或补丁失效时必须响。
 *
 * 由 package.json 的 postinstall 调用，npm install 后自动重放。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const EXPECTED_PLUGIN_MAJOR = 7
const AGP_CLASSPATH_PATTERN = /classpath\s+'com\.android\.tools\.build:gradle:8\.13\.0'/
const BUILDSCRIPT_BLOCK_PATTERN = /buildscript\s*\{[\s\S]*?\n\}\n\n/

/** 纯函数：对给定 build.gradle 内容计算补丁结果（可单测）。 */
export function computePatch(original) {
  const hasExpectedClasspath = AGP_CLASSPATH_PATTERN.test(original)
  if (!hasExpectedClasspath) {
    // 已移除（幂等）还是内容漂移（上游改了版本号）？
    const hasAnyAgpClasspath = /classpath\s+'com\.android\.tools\.build:gradle:/.test(original)
    if (hasAnyAgpClasspath) {
      return {
        status: 'mismatch',
        detail: '插件内仍存在 AGP classpath，但版本号与预期（8.13.0）不符——上游可能已更改版本，需重新评估补丁',
      }
    }
    return { status: 'already-patched', detail: '插件内无 AGP classpath 硬编码（已是修补后状态）' }
  }

  const patched = original.replace(BUILDSCRIPT_BLOCK_PATTERN, '')
  if (patched === original) {
    return {
      status: 'mismatch',
      detail: '检测到 AGP 8.13.0 classpath，但 buildscript 块移除模式未匹配——补丁规则需更新',
    }
  }
  if (AGP_CLASSPATH_PATTERN.test(patched)) {
    return { status: 'mismatch', detail: '补丁后仍存在 AGP classpath——补丁不完整' }
  }
  return { status: 'patched', detail: '已移除插件内 AGP classpath 硬编码（改用根工程 AGP）', content: patched }
}

/** 读取插件版本并断言主版本号。 */
export function checkPluginVersion(pluginRoot) {
  const packageJsonPath = path.join(pluginRoot, 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    return { ok: false, detail: `插件 package.json 不存在: ${packageJsonPath}` }
  }
  let version = ''
  try {
    version = String(JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version || '')
  } catch (error) {
    return { ok: false, detail: `插件 package.json 解析失败: ${error instanceof Error ? error.message : error}` }
  }
  const major = Number(version.split('.')[0])
  if (!Number.isFinite(major) || major !== EXPECTED_PLUGIN_MAJOR) {
    return {
      ok: false,
      version,
      detail: `插件主版本为 ${version}，预期 ${EXPECTED_PLUGIN_MAJOR}.x（Capacitor 7 兼容线）——补丁未经该版本验证，拒绝静默应用`,
    }
  }
  return { ok: true, version, detail: `插件版本 ${version}（主版本 ${EXPECTED_PLUGIN_MAJOR}，符合预期）` }
}

/** 入口：对真实 node_modules 应用补丁。漂移/不匹配时退出码 1。 */
export function runPatch(projectRoot) {
  const pluginRoot = path.join(projectRoot, 'node_modules/@aparajita/capacitor-secure-storage')
  if (!fs.existsSync(pluginRoot)) {
    console.log('[patch-secure-storage] 插件未安装，跳过（Android 构建未启用安全存储）')
    return 0
  }

  const versionCheck = checkPluginVersion(pluginRoot)
  if (!versionCheck.ok) {
    console.error(`[patch-secure-storage] 版本断言失败: ${versionCheck.detail}`)
    return 1
  }

  const target = path.join(pluginRoot, 'android/build.gradle')
  if (!fs.existsSync(target)) {
    console.error(`[patch-secure-storage] 目标文件不存在: ${target}`)
    return 1
  }

  const original = fs.readFileSync(target, 'utf8')
  const outcome = computePatch(original)
  if (outcome.status === 'mismatch') {
    console.error(`[patch-secure-storage] 补丁漂移（明确失败）: ${outcome.detail}`)
    return 1
  }
  if (outcome.status === 'already-patched') {
    console.log(`[patch-secure-storage] ${outcome.detail}（版本 ${versionCheck.version}）`)
    return 0
  }

  fs.writeFileSync(target, outcome.content, 'utf8')
  console.log(`[patch-secure-storage] ${outcome.detail}（插件 ${versionCheck.version} → 根工程 AGP 8.7.2）`)
  return 0
}

// 直接执行时（node scripts/patch-secure-storage.mjs）运行入口
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (invokedDirectly) {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  process.exit(runPatch(projectRoot))
}
