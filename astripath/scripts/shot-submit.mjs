import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const S = 'astripath/screenshots/';

// 首页（原版导航 + 竞赛入口）
await page.goto('http://localhost:4174/home', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: S + 'home.png' });

// 诊断答题 + 结果
await page.goto('http://localhost:4174/diagnosis', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: S + 'diagnosis.png' });
for (let i = 0; i < 8; i++) {
  await page.locator('.comp-choice').nth(i < 4 ? 0 : 1).click();
  await page.waitForTimeout(60);
  const next = page.locator('.comp-quiz-actions button', { hasText: '下一题' });
  if (await next.count()) { await next.click(); await page.waitForTimeout(60); }
}
await page.locator('.comp-quiz-actions button', { hasText: '提交答卷' }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: S + 'diagnosis-result.png', fullPage: true });

// 知识画像
await page.goto('http://localhost:4174/knowledge-profile', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.screenshot({ path: S + 'knowledge_map.png', fullPage: true });

// 学习计划
await page.goto('http://localhost:4174/plan', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.screenshot({ path: S + 'learning_plan.png', fullPage: true });

// AI 导师
await page.goto('http://localhost:4174/dialogue', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.locator('textarea, input[type="text"]').first().fill('什么是广播？');
await page.keyboard.press('Enter');
await page.waitForTimeout(2000);
await page.screenshot({ path: S + 'ai_tutor.png', fullPage: true });

// 练习
await page.goto('http://localhost:4174/practice/numpy-basics', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.locator('.comp-choice').first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: S + 'practice.png', fullPage: true });

// 报告
await page.goto('http://localhost:4174/report', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.screenshot({ path: S + 'learning_report.png', fullPage: true });

// 移动端
const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
await mobile.goto('http://localhost:4174/home', { waitUntil: 'networkidle' });
await mobile.waitForTimeout(2000);
await mobile.screenshot({ path: S + 'mobile-home.png' });
await mobile.goto('http://localhost:4174/knowledge-profile', { waitUntil: 'networkidle' });
await mobile.waitForTimeout(2500);
await mobile.screenshot({ path: S + 'mobile-profile.png' });

await browser.close();
console.log('submission screenshots done');
