import { test, expect } from '@playwright/test'

/** 移动端 375px 适配（T11） */

test.use({ viewport: { width: 375, height: 812 } })

test.describe('移动端适配', () => {
  test('T11 手机 375px：无横向溢出、诊断可答题', async ({ page }) => {
    await page.goto('/')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)

    await page.goto('/diagnosis')
    await expect(page.locator('.comp-question')).toBeVisible()
    await page.locator('.comp-choice').first().click()
    await expect(page.locator('.comp-choice.selected')).toBeVisible()
    await page.locator('.comp-quiz-actions button', { hasText: '下一题' }).click()
    await expect(page.getByText('第 2 / 8 题')).toBeVisible()
    const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow2).toBeLessThanOrEqual(1)
  })
})
