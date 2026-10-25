#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = path.join(root, process.env.MOBILE_E2E_OUTPUT || 'outputs/apple-mobile')
fs.mkdirSync(output, { recursive: true })
const apiBase = 'http://127.0.0.1:18890'
const webBase = 'http://127.0.0.1:5180'
const fixture = path.join(output, `runtime-${Date.now()}`)
const api = spawn(process.execPath, ['server/index.js'], {
  cwd: root, windowsHide: true, stdio: 'ignore',
  env: { ...process.env, PORT: '18890', ZHIXUE_ENV: 'demo', MYSQL_URL: '', MYSQL_HOST: '', MYSQL_USER: '', MYSQL_DATABASE: '', LLM_API_KEY: '',
    ZHIXUE_DATA_FILE: `${fixture}.json`, ZHIXUE_CHAT_STORE_FILE: `${fixture}.chat.json`, ZHIXUE_TRACE_FILE: `${fixture}.traces.json`, ZHIXUE_SESSION_FILE: `${fixture}.sessions.json`, ZHIXUE_IDENTITY_FILE: `${fixture}.identities.json` },
})
const web = spawn(process.execPath, ['scripts/serve-mobile.mjs', '5180', apiBase], { cwd: root, windowsHide: true, stdio: 'ignore' })
let browser
let page
const checks = []
function pass(name) { checks.push(name); console.log(`PASS ${name}`) }
try {
  for (const url of [`${apiBase}/api/health`, webBase]) {
    let ready = false
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(url)).ok) { ready = true; break } } catch {}
      await new Promise(resolve => setTimeout(resolve, 150))
    }
    assert.ok(ready, `server ready: ${url}`)
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'D:/cloakbrowser-windows-x64/chrome.exe', headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  context.setDefaultTimeout(15000)
  page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const shot = async name => {
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(100)
    return page.screenshot({ path: path.join(output, `${name}.png`), fullPage: false })
  }
  const browserGet = endpoint => page.evaluate(async url => {
    const response = await fetch(url, { credentials: 'include' })
    if (!response.ok) throw new Error(`Browser API read failed: ${response.status}`)
    return response.json()
  }, endpoint)
  const go = async route => { await page.goto(`${webBase}/#/${route}`); await page.locator('.mobile-header').waitFor() }
  await go('login')
  await page.locator('.login__form').waitFor()
  await shot('01-login')
  const account = `apple${Date.now()}`
  await page.getByRole('button', { name: '第一次来？创建学习账号', exact: true }).click()
  await page.getByLabel('昵称', { exact: true }).fill('试学同学')
  await page.getByLabel('账号', { exact: true }).fill(account)
  await page.getByLabel('密码', { exact: true }).fill('Onboarding-test-2026')
  await page.getByRole('button', { name: '创建账号并开始学习', exact: true }).click()
  await page.locator('.today__hello').waitFor()
  await page.locator('#mobile-content[aria-busy="false"]').waitFor()
  if (await page.getByRole('dialog').count()) await page.getByRole('button', { name: '稍后再说', exact: true }).click()
  await page.getByRole('button', { name: '开始学习诊断', exact: true }).waitFor()
  await shot('02-today-new')
  pass('真实注册、登录与新账号空态')
  await page.getByRole('button', { name: '开始学习诊断', exact: true }).click()
  await page.locator('.diagnose__steps').waitFor()
  await shot('03-needs-background')
  for (const [label, value] of [['你目前的学习阶段或身份', 'student'], ['想学习的方向', 'cs'], ['目前的基础', 'beginner'], ['相关学习或实践经历', 'less-than-1']]) await page.getByLabel(label, { exact: true }).selectOption(value)
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  for (const [label, value] of [['近期想完成什么', 'project'], ['更长远的目标', 'skill-up'], ['是什么让你想开始学习', 'interest']]) await page.getByLabel(label, { exact: true }).selectOption(value)
  await page.getByLabel('把你的目标再说具体一点').fill('从数据结构入门，完成一个图遍历小项目')
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('slider', { name: '知识基础', exact: true }).fill('0')
  await shot('04-needs-self-assessment')
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  for (const [label, value] of [['每周可以投入多少时间', '5-10'], ['习惯在哪个时段学习', 'evening'], ['更喜欢哪种学习方式', 'practice'], ['希望以怎样的节奏推进', 'steady']]) await page.getByLabel(label, { exact: true }).selectOption(value)
  await page.getByRole('button', { name: '生成画像与学习路径', exact: true }).click()
  await page.locator('.today__hero').waitFor({ timeout: 60000 })
  await page.locator('.learning-path__head').first().click()
  assert.equal(await page.locator('.learning-path__head').first().getAttribute('aria-expanded'), 'false')
  await page.locator('.learning-path__head').first().click()
  await page.locator('.learning-path__action').first().waitFor()
  assert.doesNotMatch(await page.locator('.learning-path').innerText(), /"level"|"text"|\[object Object\]/)
  const saved = (await browserGet('/api/profile/latest')).result
  assert.equal(saved.learnerNeeds.knowledgeBase, 0)
  assert.equal(saved.learnerNeeds.field, 'cs')
  assert.equal(saved.source, 'questionnaire')
  assert.ok(['rule', 'model'].includes(saved.analysisSource))
  await shot('05-today-plan')
  pass('完整问卷保存、零分保持、生成路径、Web API 读回一致')
  await page.reload()
  await page.locator('.today__hero').waitFor()
  pass('页面冷启动恢复同一账号画像和路径')
  await go('tutor')
  await page.locator('.tutor__composer textarea').waitFor()
  await page.getByRole('button', { name: '把一个概念讲简单一点', exact: false }).click()
  assert.match(await page.locator('.tutor__composer textarea').inputValue(), /生活中的例子/)
  await page.locator('.tutor__composer textarea').fill('BFS 的 visited 应该何时标记？')
  await page.locator('.tutor__send').click()
  await page.locator('.m-bubble--ai:not(.tutor__thinking)').first().waitFor({ timeout: 60000 })
  await shot('06-tutor')
  pass('学科辅导保留真实请求和回答')
  // 有界浏览器夹具：验证新答案排版与 HTML 执行边界，截图已在真实回答时保存。
  await page.route('**/api/tutoring/history', route => route.fulfill({ status: 200, json: { items: [{
    q: 'Markdown 呈现测试（浏览器夹具）',
    a: '# 概念讲解\n\n**BFS** 使用 `queue`。\n\n- 先入队\n- 再访问\n\n```js\nconst queue = []\n```\n\n<img src=x onerror="window.__tutorInjected = true">',
    time: '09:00', fallbackAgents: ['BrowserFixture'],
  }] } }))
  await go('today')
  await go('tutor')
  await page.locator('.tutor-answer h3').waitFor()
  assert.equal(await page.locator('.tutor-answer strong').first().innerText(), 'BFS')
  assert.equal(await page.locator('.tutor-answer li').count(), 2)
  assert.match(await page.locator('.tutor-answer pre').innerText(), /const queue/)
  assert.equal(await page.locator('.tutor-answer img').count(), 0)
  assert.equal(await page.evaluate(() => window.__tutorInjected), undefined)
  await page.unroute('**/api/tutoring/history')
  pass('导师回答排版与 HTML 文本安全边界（有界浏览器夹具）')
  await go('today')
  await page.locator('.today__hero').waitFor()
  await page.locator('.today__hero button.m-btn--primary').click()
  await page.locator('.practice__choice').first().waitFor()
  assert.equal(await page.locator('.mobile-tabs').count(), 0)
  await page.getByRole('link', { name: '返回上一层', exact: true }).waitFor()
  for (let i = 0; i < 3; i++) {
    await page.locator('.practice__choice').first().click()
    await page.locator('.practice__verdict').waitFor()
    if (i === 0) await shot('07-practice')
    if (i < 2) await page.getByRole('button', { name: '下一题', exact: true }).click()
  }
  await page.getByRole('button', { name: '完成练习并查看结果', exact: true }).click()
  await page.locator('.result__score-num').waitFor({ timeout: 60000 })
  assert.equal(await page.locator('.mobile-tabs').count(), 0)
  await shot('08-result')
  const stats = await browserGet('/api/study/stats')
  assert.equal(stats.completedSessions, 1)
  assert.equal(stats.totalAnswers, 3)
  pass('三题真实作答、服务端判分、完成事件与统计')
  await go('growth')
  await page.locator('.growth__stat-num').first().waitFor()
  await shot('09-growth')
  await go('profile')
  await page.locator('.profile__edit summary').click()
  await page.locator('.profile__name-form').waitFor()
  assert.equal(await page.locator('.profile__diagnostics').evaluate(el => el.open), false)
  await page.getByLabel('昵称', { exact: true }).fill('持续学习的同学')
  await page.getByRole('button', { name: '保存昵称', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '昵称已保存' }).waitFor()
  await page.locator('.profile__edit summary').click()
  await shot('10-profile')
  pass('昵称账号持久化与高级诊断折叠')
  await page.locator('.profile__logout').click()
  await page.locator('.login__form').waitFor()
  await page.getByLabel('账号', { exact: true }).fill(account)
  await page.getByLabel('密码', { exact: true }).fill('Onboarding-test-2026')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.locator('.today__hero').waitFor()
  const restored = (await browserGet('/api/profile/latest')).result
  assert.equal(restored.learnerNeeds.shortTermDetail, saved.learnerNeeds.shortTermDetail)
  pass('退出重登后服务端学习需求保持')
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    for (const route of ['today', 'tutor', 'growth', 'profile', 'diagnose']) {
      await go(route)
      await page.locator('main > section').waitFor()
      await page.waitForTimeout(200)
      const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, nav: document.querySelector('.mobile-tabs').getBoundingClientRect().bottom, height: innerHeight }))
      assert.ok(layout.scroll <= layout.width, `overflow ${route} at ${width}: ${JSON.stringify(layout)}`)
      assert.ok(layout.nav <= layout.height + 1)
    }
  }
  pass('320/390/430 宽度五页无横向溢出，底部导航可见')
  await page.setViewportSize({ width: 390, height: 844 })
  await go('today')
  await go('tutor')
  await page.locator('.tutor__composer').waitFor()
  const composer = await page.locator('.tutor__composer').boundingBox()
  const bottomNav = await page.locator('.mobile-tabs').boundingBox()
  assert.ok(composer && bottomNav && composer.y + composer.height < bottomNav.y, 'composer clears bottom navigation')
  await go('today')
  await page.route('**/api/profile/latest', route => route.abort())
  await page.reload()
  await page.getByText('学习数据加载失败', { exact: true }).waitFor()
  await page.unroute('**/api/profile/latest')
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await page.locator('.today__hero').waitFor()
  pass('网络失败明确报错，重试可恢复')
  await go('profile')
  await page.locator('.profile__logout').click()
  await page.locator('.login__form').waitFor()
  await page.getByRole('button', { name: '第一次来？创建学习账号', exact: true }).click()
  await page.getByLabel('昵称', { exact: true }).fill('另一位学习者')
  await page.getByLabel('账号', { exact: true }).fill(`${account}b`)
  await page.getByLabel('密码', { exact: true }).fill('Onboarding-test-2026')
  await page.getByRole('button', { name: '创建账号并开始学习', exact: true }).click()
  await page.locator('.today__hello').waitFor()
  await page.locator('#mobile-content[aria-busy="false"]').waitFor()
  if (await page.getByRole('dialog').count()) await page.getByRole('button', { name: '稍后再说', exact: true }).click()
  await page.getByRole('button', { name: '开始学习诊断', exact: true }).waitFor()
  assert.equal((await browserGet('/api/profile/latest')).result, null)
  assert.equal((await browserGet('/api/study/stats')).completedSessions, 0)
  await go('tutor')
  await page.getByRole('link', { name: '制定学习计划', exact: true }).click()
  await page.locator('.diagnose__options').waitFor()
  await shot('11-guided-planning')
  for (let i = 0; i < 11; i++) await page.locator('.diagnose__options button').first().click()
  await page.locator('.diagnose__steps').waitFor()
  assert.equal(await page.getByLabel('你目前的学习阶段或身份', { exact: true }).inputValue(), 'student')
  assert.equal(await page.getByLabel('想学习的方向', { exact: true }).inputValue(), 'cs')
  pass('新账号隔离与导师规划引导入口，采集结果回填待确认问卷')
  assert.deepEqual(errors, [])
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ checks, pageErrors: errors, screenshots: fs.readdirSync(output).filter(file => file.endsWith('.png')) }, null, 2))
  console.log(`${checks.length}/${checks.length} checks passed`)
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {})
    fs.writeFileSync(path.join(output, 'failure.txt'), await page.locator('body').innerText().catch(() => 'unavailable'))
  }
  throw error
} finally {
  await browser?.close()
  api.kill(); web.kill()
}
