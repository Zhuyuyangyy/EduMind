/** 重拍 deck-profile / deck-hub：等待 3D 场景真正就绪后再裁切 */
import { chromium } from '@playwright/test';
const BASE = process.argv[2] || 'https://astripath-k78u5s6qgf1.qoder.zone';
const OUT = new URL('../screenshots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });

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

await page.goto(BASE + '/knowledge-profile');
await page.locator('canvas.three-tree-canvas').waitFor({ timeout: 30000 });
await page.evaluate(() => {
  const el = document.querySelector('canvas.three-tree-canvas');
  if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 200);
});
await page.waitForFunction(() => !document.body.innerText.includes('生成知识树'), null, { timeout: 45000 });
await page.setViewportSize({ width: 1440, height: 2900 });
await page.waitForTimeout(2600);
await page.setViewportSize({ width: 1440, height: 810 });
await page.evaluate(() => {
  const el = document.querySelector('canvas.three-tree-canvas');
  if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 200);
});
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + 'deck-profile.png' });
console.log('OK deck-profile.png');

await page.goto(BASE + '/home');
await page.locator('.hub-workbench').waitFor();
await page.evaluate(() => {
  const el = document.querySelector('.hub-workbench');
  window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 60);
});
await page.frameLocator('iframe[src*="agenthub"]').locator('#load.hide').waitFor({ timeout: 60000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT + 'deck-hub.png' });
console.log('OK deck-hub.png');

await browser.close();