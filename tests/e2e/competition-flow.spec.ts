import { test, expect, type Page } from '@playwright/test'

/**
 * 竞赛演示闭环 E2E（原版 EduMind 界面 + 演示模式）
 * 覆盖任务书验收项：T01/T12 免登录公开访问、诊断判分、画像、计划、导师、练习反馈、重置、移动端。
 */

async function completeDiagnosis(page: Page) {
  await page.goto('/diagnosis')
  await page.locator('.comp-question').waitFor()
  for (let i = 0; i < 8; i++) {
    await expect(page.getByText(`第 ${i + 1} / 8 题`)).toBeVisible()
    await page.locator('.comp-choice').nth(i % 2).click()
    if (i < 7) {
      await page.locator('.comp-quiz-actions button', { hasText: '下一题' }).click()
    }
  }
  await page.locator('.comp-quiz-actions button', { hasText: '提交答卷' }).click()
  await expect(page.locator('.comp-card-title').first()).toContainText('诊断完成')
}

test.describe('智学星枢竞赛演示闭环', () => {
  test('T01/T12 免登录公开访问：根路径直达首页，无登录页', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/home$/)
    await expect(page.locator('.topbar-nav')).toBeVisible()
    // 原版导航栏目完整保留
    const nav = await page.locator('.topbar-nav .nav-item').allInnerTexts()
    expect(nav).toEqual(['首页', '画像生成', '学习路径', '学习资源', '智能评估', '反向更新', '设置'])
    // 竞赛入口横幅存在
    await expect(page.locator('.comp-entry')).toBeVisible()
    // 关键内容非空
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('T04 学习诊断：8 题作答、提交、自动判分、逐知识点正确率', async ({ page }) => {
    await page.goto('/diagnosis')
    await expect(page.locator('.comp-question')).toContainText('7 / 2')
    await completeDiagnosis(page)
    // 各知识点正确率表 8 行
    const rows = page.locator('.comp-table tbody tr')
    await expect(rows).toHaveCount(8)
    // 解析区 8 条
    await expect(page.locator('.comp-explain')).toHaveCount(8)
  })

  test('T05 知识画像：3D 知识树渲染、分组统计、变化记录', async ({ page }) => {
    await completeDiagnosis(page)
    await page.goto('/knowledge-profile')
    await expect(page.locator('.comp-title')).toContainText('知识')
    // 3D 知识树 canvas
    await expect(page.locator('canvas').first()).toBeVisible()
    // 统计卡
    await expect(page.getByText('总体掌握度').first()).toBeVisible()
    // 变化记录表有数据（诊断基线）
    await expect(page.locator('.comp-table tbody tr').first()).toBeVisible()
  })

  test('T06 学习计划：7 天生成、推荐理由、完成打卡', async ({ page }) => {
    await completeDiagnosis(page)
    await page.goto('/plan')
    await expect(page.locator('.comp-plan-day')).toHaveCount(7)
    const reasons = page.locator('.comp-plan-reason')
    await expect(reasons).toHaveCount(7)
    for (let i = 0; i < 7; i++) {
      expect((await reasons.nth(i).innerText()).length).toBeGreaterThan(10)
    }
    await page.locator('.comp-plan-check').first().click()
    await expect(page.getByText(/已完成 1 \/ 7 个任务/)).toBeVisible()
  })

  test('T07 AI 导师：课程问答可用，附引用依据，演示模式明示', async ({ page }) => {
    await page.goto('/dialogue')
    await page.waitForTimeout(1200)
    const input = page.locator('textarea, input[type="text"]').first()
    await input.fill('什么是广播？')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(2000)
    const body = await page.locator('body').innerText()
    expect(body).toContain('广播')
    expect(body).toContain('引用依据')
    expect(body).toContain('演示模式')
  })

  test('T08/T09 练习：即时判分、掌握度更新、计划联动', async ({ page }) => {
    await completeDiagnosis(page)
    await page.goto('/practice/numpy-basics')
    await expect(page.locator('.comp-question')).toBeVisible()
    for (let i = 0; i < 3; i++) {
      await expect(page.getByText(`第 ${i + 1} / 3 题`)).toBeVisible()
      await page.locator('.comp-choice').first().click()
      await expect(page.locator('.comp-explain')).toBeVisible()
      if (i < 2) await page.locator('.comp-quiz-actions button', { hasText: '下一题' }).click()
    }
    await page.locator('.comp-quiz-actions button', { hasText: '提交并更新掌握度' }).click()
    await expect(page.locator('.comp-card-title').first()).toContainText('练习完成')
    // 掌握度变化与累计练习均展示
    await expect(page.getByText('掌握度变化')).toBeVisible()
    await expect(page.getByText('累计练习')).toBeVisible()
    // 报告页体现闭环
    await page.goto('/report')
    await expect(page.getByText('学习前后对比')).toBeVisible()
  })

  test('T10 重置演示：恢复初始状态', async ({ page }) => {
    await completeDiagnosis(page)
    await page.goto('/diagnosis')
    // 刷新后进入「历史已诊断」分支，点击重新诊断恢复初始状态
    await page.getByRole('button', { name: '重新诊断' }).click()
    await expect(page.locator('.comp-question')).toBeVisible()
    await expect(page.getByText('已作答 0 / 8')).toBeVisible()
  })

  test('本地持久化：刷新后学习记录保留', async ({ page }) => {
    await completeDiagnosis(page)
    await page.goto('/')
    await page.reload()
    await page.goto('/knowledge-profile')
    await expect(page.getByText('总体掌握度').first()).toBeVisible()
    const stored = await page.evaluate(() => localStorage.getItem('astripath.demo.v1'))
    expect(stored).toBeTruthy()
  })

  test('智能评估页：演示夹具可用（VITE_EDUMIND_DEMO_MODE）', async ({ page }) => {
    await completeDiagnosis(page)
    await page.goto('/evaluation')
    await page.waitForTimeout(1500)
    const body = await page.locator('body').innerText()
    // 不应出现「评估暂不可用」
    expect(body).not.toContain('评估暂不可用')
  })
})
