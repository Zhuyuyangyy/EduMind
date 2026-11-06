import { test, expect } from '@playwright/test'

/** 移动端 375px 适配检查（T11） */

test.describe('移动端适配', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('T11 手机 375px：导航可操作、无横向溢出、内容完整', async ({ page }) => {
    await page.goto('/')

    // 无横向溢出
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)

    // 移动端顶栏与汉堡菜单可见，桌面侧栏隐藏
    await expect(page.locator('.mobile-topbar')).toBeVisible()
    const sidebarTransform = await page.locator('.sidebar').evaluate((el) => getComputedStyle(el).transform)
    expect(sidebarTransform).not.toBe('none') // 画布外（translateX 负值）

    // 打开抽屉导航
    await page.getByRole('button', { name: '打开导航菜单' }).click()
    await expect(page.locator('.sidebar.open')).toBeVisible()
    await expect(page.getByRole('link', { name: 'AI 导师' })).toBeVisible()

    // 抽屉内跳转到诊断页
    await page.locator('.sidebar').getByRole('link', { name: '学习诊断' }).click()
    await expect(page).toHaveURL(/\/diagnosis/)
    const overflowAfterNav = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflowAfterNav).toBeLessThanOrEqual(1)

    // 诊断题在移动端可读可点
    await page.locator('.choice-item').first().click()
    await expect(page.locator('.choice-item.selected')).toBeVisible()
    await page.getByRole('button', { name: '下一题' }).click()
    await expect(page.getByText('第 2 / 8 题')).toBeVisible()
  })

  test('移动端：导师页对话与输入可用', async ({ page }) => {
    await page.goto('/tutor')
    await page.getByLabel('向 AI 导师提问').fill('什么是广播？')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.locator('.chat-msg.tutor').last()).toContainText('广播')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
