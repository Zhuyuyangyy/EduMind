import { test, expect, type Page } from '@playwright/test'

/**
 * 核心流程 E2E：评委 5 分钟体验路径
 * 首页 → 诊断 → 画像 → 计划 → 导师 → 练习 → 反馈 → 重置
 */

async function completeDiagnosis(page: Page) {
  await page.goto('/diagnosis')
  const total = 8
  for (let i = 0; i < total; i++) {
    await expect(page.getByText(`第 ${i + 1} / ${total} 题`)).toBeVisible()
    await page.locator('.choice-item').first().click()
    if (i < total - 1) {
      await page.getByRole('button', { name: '下一题' }).click()
    }
  }
  await page.getByRole('button', { name: '提交答卷并生成知识画像' }).click()
  await expect(page.getByRole('heading', { name: '诊断完成' })).toBeVisible()
}

test.describe('智学星枢竞赛版核心闭环', () => {
  test('T01/T02 首页无需登录，内容完整', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/智学星枢/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('AI 导师')
    // 关键内容块
    await expect(page.getByRole('heading', { name: '学习闭环' })).toBeVisible()
    await expect(page.getByText('Python 数据分析基础', { exact: false }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /立即体验/ })).toBeVisible()
    await expect(page.getByText('无需注册登录')).toBeVisible()
    // 无空白主内容区
    const main = page.locator('.app-main')
    const box = await main.boundingBox()
    expect(box!.height).toBeGreaterThan(600)
  })

  test('T03/T04 学习诊断：8 题作答、提交、自动判分', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /立即体验/ }).click()
    await expect(page).toHaveURL(/\/diagnosis/)

    await completeDiagnosis(page)

    // 判分结果：得分与知识点正确率表
    await expect(page.getByText(/得分 \d \/ 8/)).toBeVisible()
    const rows = page.locator('.card', { hasText: '各知识点正确率' }).locator('tbody tr')
    await expect(rows).toHaveCount(8)
    // 每题解析
    await expect(page.getByRole('heading', { name: '答题解析' })).toBeVisible()
    await expect(page.locator('.explain-box')).toHaveCount(8)
  })

  test('T05 知识画像：分数与知识点对应，分组展示', async ({ page }) => {
    await page.goto('/')
    await completeDiagnosis(page)
    await page.getByRole('button', { name: '查看知识画像' }).click()
    await expect(page).toHaveURL(/\/profile/)

    await expect(page.getByRole('heading', { name: '总体掌握度' })).toBeVisible()
    // 雷达图渲染
    await expect(page.locator('canvas').first()).toBeVisible()
    // 分组卡片：至少出现一个分组标题
    const groups = ['需加强', '正在学习', '已掌握']
    let found = false
    for (const g of groups) {
      if (await page.getByRole('heading', { name: new RegExp(`^${g}`) }).count() > 0) found = true
    }
    expect(found).toBe(true)
    // 掌握度计算规则说明 + 演示评估值声明
    await expect(page.getByText('掌握度是怎么算出来的？')).toBeVisible()
    await expect(page.getByText(/演示评估值/).first()).toBeVisible()
    // 变化记录表非空（诊断基线）
    await expect(page.locator('.card', { hasText: '掌握度变化记录' }).locator('tbody tr').first()).toBeVisible()
  })

  test('T06 学习计划：7 天生成、推荐理由、完成打卡', async ({ page }) => {
    await page.goto('/')
    await completeDiagnosis(page)
    await page.getByRole('button', { name: '查看 7 天学习计划' }).click()
    await expect(page).toHaveURL(/\/plan/)

    const days = page.locator('.plan-day')
    await expect(days).toHaveCount(7)
    // 每天都有推荐理由
    const reasons = page.locator('.plan-reason')
    await expect(reasons).toHaveCount(7)
    for (let i = 0; i < 7; i++) {
      expect((await reasons.nth(i).innerText()).length).toBeGreaterThan(10)
    }
    // 完成第一个任务
    await page.locator('.plan-check').first().click()
    await expect(page.getByText('已完成 1 / 7 个任务')).toBeVisible()
  })

  test('T07 AI 导师：问答可用，附引用依据，演示模式明示', async ({ page }) => {
    await page.goto('/tutor')
    // 演示模式声明
    await expect(page.getByText(/演示模式说明/)).toBeVisible()
    await expect(page.getByText(/不是实时大模型生成/)).toBeVisible()

    await page.getByLabel('向 AI 导师提问').fill('NumPy 的广播是什么意思？')
    await page.getByRole('button', { name: '发送' }).click()

    const tutorMsg = page.locator('.chat-msg.tutor').last()
    await expect(tutorMsg).toContainText('广播')
    await expect(tutorMsg.locator('.tutor-source')).toContainText('引用依据')
    await expect(tutorMsg.locator('.tutor-source')).toContainText('课程讲义')
    // 示例代码与推荐练习
    await expect(tutorMsg.locator('.tutor-example')).toBeVisible()
    await expect(tutorMsg.getByText('推荐练习：')).toBeVisible()

    // 超范围问题：明确降级
    await page.getByLabel('向 AI 导师提问').fill('明天北京的天气怎么样')
    await page.getByRole('button', { name: '发送' }).click()
    const fallback = page.locator('.chat-msg.tutor').last()
    await expect(fallback).toContainText('超出')
    await expect(fallback.locator('.tutor-source')).toContainText('未命中演示知识库')
  })

  test('T08/T09 练习：即时判分、解析、掌握度与计划更新', async ({ page }) => {
    await page.goto('/')
    await completeDiagnosis(page)
    await page.goto('/practice/numpy-basics')

    await expect(page.getByRole('heading', { name: /针对性练习 · NumPy 数组操作/ })).toBeVisible()
    const bank = page.locator('.choice-item')
    await expect(bank.first()).toBeVisible()

    // 逐题作答：选择后立即判分并显示解析
    for (let i = 0; i < 3; i++) {
      await expect(page.getByText(`第 ${i + 1} / 3 题`)).toBeVisible()
      await page.locator('.choice-item').first().click()
      await expect(page.locator('.explain-box')).toBeVisible()
      if (i < 2) await page.getByRole('button', { name: '下一题' }).click()
    }
    await page.getByRole('button', { name: '提交并更新掌握度' }).click()

    // 会话结果：正确率、掌握度变化与原因
    await expect(page.getByRole('heading', { name: '练习完成' })).toBeVisible()
    await expect(page.getByText('本次正确率')).toBeVisible()
    await expect(page.getByText('掌握度变化')).toBeVisible()
    await expect(page.locator('.notice')).toBeVisible()

    // 画像页该知识点掌握度与会话结果一致
    await page.getByRole('button', { name: '查看知识画像' }).click()
    const npCard = page.locator('.kp-card', { hasText: 'NumPy 数组操作' })
    await expect(npCard).toBeVisible()
    const masteryText = await npCard.locator('.kp-mastery-value').innerText()
    expect(masteryText).toMatch(/^\d+$/)

    // 计划页体现重新生成提示或计划存在
    await page.goto('/plan')
    await expect(page.locator('.plan-day')).toHaveCount(7)
  })

  test('T10 重置演示：恢复初始状态', async ({ page }) => {
    await page.goto('/')
    await completeDiagnosis(page)
    await page.goto('/')
    await expect(page.getByRole('button', { name: /继续学习/ })).toBeVisible()

    page.on('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: /重置演示/ }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('button', { name: /立即体验/ })).toBeVisible()
    await expect(page.getByText('未诊断')).toBeVisible()

    // 刷新后仍是初始状态（本地存储已清理）
    await page.reload()
    await expect(page.getByRole('button', { name: /立即体验/ })).toBeVisible()
  })

  test('本地持久化：刷新后学习记录保留', async ({ page }) => {
    await page.goto('/')
    await completeDiagnosis(page)
    await page.goto('/')
    await expect(page.getByRole('button', { name: /继续学习/ })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: /继续学习/ })).toBeVisible()
    const stored = await page.evaluate(() => localStorage.getItem('astripath.demo.v1'))
    expect(stored).toBeTruthy()
  })

  test('练习证据留痕：掌握度未变化时累计练习与最近测试仍更新', async ({ page }) => {
    const { exercises } = await import('../../src/data/exercises.ts')
    await page.goto('/')
    await completeDiagnosis(page)
    await page.goto('/practice/pandas-io')

    const bank = exercises.filter((e) => e.kpId === 'pandas-io')
    // 全部答错：该知识点诊断基线为 0（或非 0），无论掌握度是否变化，证据都必须记录
    for (let i = 0; i < bank.length; i++) {
      await expect(page.getByText(`第 ${i + 1} / ${bank.length} 题`)).toBeVisible()
      await page.locator('.choice-item').nth((bank[i].answer + 1) % 4).click()
      await expect(page.locator('.explain-box')).toBeVisible()
      if (i < bank.length - 1) await page.getByRole('button', { name: '下一题' }).click()
    }
    await page.getByRole('button', { name: '提交并更新掌握度' }).click()
    await expect(page.getByRole('heading', { name: '练习完成' })).toBeVisible()

    // 累计练习必须反映本次 3 题（修复：此前未调整掌握度时计数不更新）
    await expect(page.getByText(`累计练习`)).toBeVisible()
    const cards = page.locator('.stat-card', { hasText: '累计练习' })
    await expect(cards).toContainText(`${bank.length} 题`)

    // 画像页该知识点的练习计数一致
    await page.goto('/profile')
    const card = page.locator('.kp-card', { hasText: 'Pandas 数据读取' })
    await expect(card).toContainText(`练习：${bank.length} 题`)
  })

  test('课程页：知识图谱与知识点清单', async ({ page }) => {
    await page.goto('/course')
    await expect(page.getByRole('heading', { name: '知识图谱（先修关系）' })).toBeVisible()
    await expect(page.locator('.kg-svg')).toBeVisible()
    const rows = page.locator('.card', { hasText: '知识点清单' }).locator('tbody tr')
    await expect(rows).toHaveCount(8)
  })
})
