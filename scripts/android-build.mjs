#!/usr/bin/env node
/**
 * Android Debug 构建（P1 · feat/mobile-v1）
 * 跨平台调用 android/gradlew(.bat) assembleDebug。
 * 前置：ANDROID_HOME 指向 Android SDK；JDK 17。
 * 用法：node scripts/android-build.mjs
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const androidDir = path.join(root, 'android')

if (!fs.existsSync(androidDir)) {
  console.error('[android-build] 找不到 android/ 目录，请先执行: npx cap add android')
  process.exit(1)
}

if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT) {
  console.error('[android-build] 未设置 ANDROID_HOME / ANDROID_SDK_ROOT')
  process.exit(1)
}

const isWindows = os.platform() === 'win32'
const gradlew = path.join(androidDir, isWindows ? 'gradlew.bat' : 'gradlew')

const child = spawn(gradlew, ['assembleDebug', '--no-daemon'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: isWindows,
  env: process.env,
})

child.on('exit', code => {
  process.exitCode = code === 0 ? 0 : 1
})
