/** 重拍参赛截图：以当前线上版本为准（桌面 1440 + 移动端 Pixel 7） */
import { chromium, devices } from '@playwright/test';
const BASE = process.argv[2] || 'https://astripath-k78u5s6qgf1.qoder.zone';
const OUT = new URL('../screenshots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const browser = await chromium.launch();

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// 诊断（6 对 2 错：pandas-io / pandas-clean 留弱，numpy 基线 75）
const diagChoices = [0, 1, 0, 0, 1, 1, 1, 1];
await page.goto(BASE + '/diagnosis');
await page.locator('.comp-question').waitFor();
for (let i = 0; i < 8; i++) {
  await page.locator('.comp-choice').nth(diagChoices[i]).click();
  const next = page.locator('.comp-quiz-actions button', { hasText: '下一题' });
  if (await next.count()) await next.click();
}
await page.locator('.comp-quiz-actions button', { hasText: '提交答卷' }).click();
await page.locator('.comp-card-title').first().waitFor();

// 练习结果（numpy-basics 三题全对 → 75→83 已掌握）
const practiceChoices = [1, 2, 2];
await page.goto(BASE + '/practice/numpy-basics');
for (let i = 0; i < 3; i++) {
  await page.locator('.comp-choice').nth(practiceChoices[i]).click();
  const next = page.locator('.comp-quiz-actions button', { hasText: '下一题' });
  if (await next.count()) await next.click();
}
await page.locator('.comp-quiz-actions button', { hasText: '提交并更新掌握度' }).click();
await page.locator('.comp-card-title').first().waitFor();
await page.waitForTimeout(600);
await page.screenshot({ path: OUT + 'practice-result.png' });
console.log('OK practice-result.png');

// 原版学习路径页（知识星座 + 闯关图）
await page.goto(BASE + '/learning-path');
await page.locator('.lp-section--constellation').waitFor();
await page.waitForTimeout(3500);
await page.screenshot({ path: OUT + 'learning-path.png' });
console.log('OK learning-path.png');

// 移动端
const mobile = await browser.newPage({ ...devices['Pixel 7'] });
await mobile.goto(BASE + '/');
await mobile.waitForURL(/\/home$/, { timeout: 20000 });
await mobile.locator('.topbar-nav').waitFor();
await mobile.waitForTimeout(2500);
await mobile.screenshot({ path: OUT + 'mobile-nav.png' });
console.log('OK mobile-nav.png');

await mobile.goto(BASE + '/dialogue');
await mobile.setViewportSize({ width: 412, height: 2400 });
await mobile.waitForTimeout(1500);
await mobile.locator('[title="隐藏互动舱"]').click();
await mobile.locator('textarea, input[type="text"]').first().fill('什么是广播？');
await mobile.keyboard.press('Enter');
await mobile.waitForTimeout(3000);
await mobile.evaluate(() => {
  const msgs = [...document.querySelectorAll('.whitespace-pre-line')];
  const q = msgs.find((el) => el.textContent.includes('什么是广播'));
  if (q) q.scrollIntoView({ block: 'start' });
});
await mobile.waitForTimeout(400);
await mobile.screenshot({ path: OUT + 'mobile-tutor.png' });
console.log('OK mobile-tutor.png');

await browser.close();