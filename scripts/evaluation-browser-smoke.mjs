#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const baseUrl = 'http://127.0.0.1'

function startVite(port, demoEnabled) {
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env: { ...process.env, VITE_EDUMIND_DEMO_MODE: demoEnabled ? 'true' : 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const output = []
  child.stdout.on('data', (chunk) => output.push(String(chunk)))
  child.stderr.on('data', (chunk) => output.push(String(chunk)))
  return { child, output }
}

async function waitForServer(url, output) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Vite did not start at ${url}\n${output.join('')}`)
}

async function openEvaluation(browser, port, evaluationResponse, { networkFailure = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(() => {
    localStorage.setItem('edumind-auth-session', JSON.stringify({
      role: 'student',
      name: 'Smoke Test',
      account: 'smoke-test',
      loginAt: new Date().toISOString(),
    }))
  })
  await context.route('**/api/auth/session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ account: 'smoke-test', role: 'student', displayName: 'Smoke Test' }),
  }))
  await context.route('**/api/evaluation', (route) => {
    if (networkFailure) return route.abort('failed')
    return route.fulfill({
      status: evaluationResponse.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(evaluationResponse.body ?? {}),
    })
  })
  const page = await context.newPage()
  await page.goto(`${baseUrl}:${port}/evaluation`, { waitUntil: 'domcontentloaded' })
  await page.locator('.evaluation-page').waitFor()
  return { context, page }
}

async function waitForText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 })
}

const noHistoryBody = {
  generatedAt: '2026-10-21T00:00:00.000Z',
  dataSource: 'real',
  simulated: false,
  stats: [{ label: '已完成测评', value: '1', change: '', color: '#46b5d1' }],
  suggestions: [],
  dashboard: {
    flow: [],
    profileMetrics: [{ key: 'concept', label: '概念理解', stage1: 0, stage2: 72 }],
    weaknesses: [],
    evidenceRounds: [],
  },
}

const realBody = {
  ...noHistoryBody,
  stats: [{ label: '评估轮次', value: '2', change: '', color: '#46b5d1' }],
  dashboard: {
    ...noHistoryBody.dashboard,
    profileMetrics: [{ key: 'concept', label: '概念理解', stage1: 64, stage2: 72 }],
    weaknesses: [{ id: 'trees', label: '树结构', reason: '递归边界条件仍需观察', action: '完成专项练习' }],
  },
}

const browser = await chromium.launch({ headless: true })
const normal = startVite(5174, false)
const demo = startVite(5175, true)
try {
  await Promise.all([
    waitForServer(`${baseUrl}:5174/`, normal.output),
    waitForServer(`${baseUrl}:5175/`, demo.output),
  ])

  {
    const { context, page } = await openEvaluation(browser, 5174, {
      status: 503,
      body: { error: 'Service Unavailable', code: 'demo-data-disabled' },
    })
    await waitForText(page, '评估暂不可用')
    assert.equal(await page.getByText('演示数据，仅供体验').count(), 0)
    assert.equal((await page.locator('body').innerText()).includes('本周提升'), false)
    await context.close()
  }

  {
    const { context, page } = await openEvaluation(browser, 5174, { body: { ...noHistoryBody, dashboard: undefined, stats: [] } })
    await waitForText(page, '暂无真实测评数据')
    assert.equal((await page.locator('body').innerText()).includes('+0%'), false)
    await context.close()
  }

  {
    const { context, page } = await openEvaluation(browser, 5174, { body: realBody })
    await waitForText(page, '当前评估统计：评估轮次: 2')
    await waitForText(page, '能力诊断')
    assert.equal(await page.getByText('演示数据，仅供体验').count(), 0)
    await context.close()
  }

  {
    const { context, page } = await openEvaluation(browser, 5174, { body: noHistoryBody })
    await waitForText(page, '暂无可验证历史记录')
    assert.equal((await page.locator('body').innerText()).includes('较上周'), false)
    assert.equal((await page.locator('body').innerText()).includes('+0%'), false)
    assert.equal(await page.locator('select[aria-label="选择时间范围"]').isDisabled(), true)
    await waitForText(page, '时间筛选暂未接入')
    await context.close()
  }

  {
    const { context, page } = await openEvaluation(browser, 5174, {}, { networkFailure: true })
    await waitForText(page, '数据加载失败')
    await page.getByRole('button', { name: '重试' }).first().waitFor({ state: 'visible' })
    await context.close()
  }

  {
    const { context, page } = await openEvaluation(browser, 5174, { body: { ...noHistoryBody, dataSource: 'demo-fixture', simulated: true } })
    await waitForText(page, '评估暂不可用')
    assert.equal(await page.getByText('演示数据，仅供体验').count(), 0)
    await context.close()
  }

  {
    const { context, page } = await openEvaluation(browser, 5175, { body: { ...noHistoryBody, dataSource: 'demo-fixture', simulated: true } })
    await waitForText(page, '演示数据，仅供体验')
    assert.equal(await page.getByText('演示数据，仅供体验').count(), 1)
    await context.close()
  }

  console.log('evaluation browser smoke: 7 scenarios passed')
} finally {
  await browser.close()
  normal.child.kill('SIGTERM')
  demo.child.kill('SIGTERM')
}
