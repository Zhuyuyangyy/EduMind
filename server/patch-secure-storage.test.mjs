import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * P4-2D 补丁加固门禁（复核发现旧版模式不匹配仍返回成功）。
 */

const { computePatch, checkPluginVersion, runPatch } = await import('../scripts/patch-secure-storage.mjs')

const ORIGINAL_BUILD_GRADLE = `ext {
    androidxAppCompatVersion = project.hasProperty('androidxAppCompatVersion') ? rootProject.ext.androidxAppCompatVersion : '1.7.0'
}

buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.13.0'
    }
}

apply plugin: 'com.android.library'

android {
    namespace "com.aparajita.capacitor.securestorage"
}
`

const PATCHED_BUILD_GRADLE = `ext {
    androidxAppCompatVersion = project.hasProperty('androidxAppCompatVersion') ? rootProject.ext.androidxAppCompatVersion : '1.7.0'
}

apply plugin: 'com.android.library'

android {
    namespace "com.aparajita.capacitor.securestorage"
}
`

test('D 正常路径：检测到 8.13.0 classpath → 移除并报告 patched', () => {
  const outcome = computePatch(ORIGINAL_BUILD_GRADLE)
  assert.equal(outcome.status, 'patched')
  assert.ok(!/com\.android\.tools\.build:gradle/.test(outcome.content), '补丁后不得残留 AGP classpath')
  assert.match(outcome.content, /apply plugin: 'com\.android\.library'/, '补丁不得误删插件应用声明')
  assert.match(outcome.content, /namespace/, '补丁不得误删 android 配置')
})

test('D 幂等：已是修补后状态 → already-patched（成功，非失败）', () => {
  const outcome = computePatch(PATCHED_BUILD_GRADLE)
  assert.equal(outcome.status, 'already-patched')
})

test('D 漂移：上游改版本号 → mismatch（旧版此处静默成功）', () => {
  const drifted = ORIGINAL_BUILD_GRADLE.replace('gradle:8.13.0', 'gradle:9.0.0')
  const outcome = computePatch(drifted)
  assert.equal(outcome.status, 'mismatch', '版本号变化必须判漂移')
  assert.match(outcome.detail, /不符|需重新评估/)
})

test('D 漂移：buildscript 块写法变化导致模式不匹配 → mismatch', () => {
  // classpath 在，但块结构不同（无空行分隔）→ 移除模式不匹配
  const weird = ORIGINAL_BUILD_GRADLE.replace('}\n\napply plugin', '}\napply plugin')
  const outcome = computePatch(weird)
  assert.equal(outcome.status, 'mismatch', '模式不匹配必须明确失败，不得静默跳过')
})

test('D 版本断言：非 7.x 主版本拒绝', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edumind-patch-ver-'))
  try {
    const pluginRoot = path.join(root, 'node_modules/@aparajita/capacitor-secure-storage')
    fs.mkdirSync(path.join(pluginRoot, 'android'), { recursive: true })
    fs.writeFileSync(path.join(pluginRoot, 'package.json'), JSON.stringify({ version: '8.0.1' }))
    fs.writeFileSync(path.join(pluginRoot, 'android/build.gradle'), ORIGINAL_BUILD_GRADLE)

    const check = checkPluginVersion(pluginRoot)
    assert.equal(check.ok, false, '8.x 不得通过版本断言')
    assert.match(check.detail, /拒绝静默应用/)

    // runPatch 对漂移版本返回退出码 1（而非 0）
    assert.equal(runPatch(root), 1, '版本不符时 runPatch 必须失败')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('D 端到端：runPatch 成功打补丁且可重复执行（幂等）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edumind-patch-e2e-'))
  try {
    const pluginRoot = path.join(root, 'node_modules/@aparajita/capacitor-secure-storage')
    fs.mkdirSync(path.join(pluginRoot, 'android'), { recursive: true })
    fs.writeFileSync(path.join(pluginRoot, 'package.json'), JSON.stringify({ version: '7.1.6' }))
    const target = path.join(pluginRoot, 'android/build.gradle')
    fs.writeFileSync(target, ORIGINAL_BUILD_GRADLE)

    assert.equal(runPatch(root), 0, '首次打补丁应成功')
    const afterFirst = fs.readFileSync(target, 'utf8')
    assert.ok(!/com\.android\.tools\.build:gradle/.test(afterFirst))

    assert.equal(runPatch(root), 0, '重复执行应幂等成功')
    assert.equal(fs.readFileSync(target, 'utf8'), afterFirst, '幂等执行不得改动文件')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('D 插件缺失：跳过且不失败', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edumind-patch-none-'))
  try {
    assert.equal(runPatch(root), 0, '插件未安装应跳过（非失败）')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
