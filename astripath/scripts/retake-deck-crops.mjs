/** PPT 用 1440x900 视口裁切图 + 反向更新执行后全页图 */
import { chromium } from '@playwright/test';
const BASE = process.argv[2] || 'https://astripath-k78u5s6qgf1.qoder.zone';
const OUT = new URL('../screenshots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const shot = (n) => page.screenshot({ path: OUT + n }).then(() => console.log('OK ' + n));

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
await page.waitForTimeout(1500);
await shot('deck-diagnosis.png');

await page.goto(BASE + '/knowledge-profile');
await page.waitForTimeout(3500);
await page.evaluate(() => {
  const el = document.querySelector('canvas');
  if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 120);
});
await page.waitForTimeout(1500);
await shot('deck-profile.png');

const practiceChoices = [1, 2, 2];
await page.goto(BASE + '/practice/numpy-basics');
for (let i = 0; i < 3; i++) {
  await page.locator('.comp-choice').nth(practiceChoices[i]).click();
  const next = page.locator('.comp-quiz-actions button', { hasText: '下一题' });
  if (await next.count()) await next.click();
}
await page.locator('.comp-quiz-actions button', { hasText: '提交并更新掌握度' }).click();
await page.locator('.comp-card-title').first().waitFor();
await page.waitForTimeout(1200);
await shot('deck-practice.png');
await page.goto(BASE + '/report');
await page.waitForTimeout(1800);
await shot('deck-report.png');

await page.goto(BASE + '/reverse-evaluation');
await page.waitForTimeout(2500);
const run = page.locator('button', { hasText: /一键检查|重新评估/ }).first();
await run.click();
await page.waitForTimeout(9000);
let h = Math.min(await page.evaluate(() => document.documentElement.scrollHeight), 4000);
await page.setViewportSize({ width: 1440, height: h });
await page.waitForTimeout(2600);
await page.screenshot({ path: OUT + 'reverse-update.png' });
console.log('OK reverse-update.png @1440x' + h);
await page.setViewportSize({ width: 1440, height: 810 });
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1200);
await shot('deck-reverse.png');

await page.goto(BASE + '/dialogue');
await page.waitForTimeout(2000);
const hide = page.locator('[title="隐藏互动舱"]');
if (await hide.count()) await hide.click();
await page.locator('textarea, input[type="text"]').first().fill('什么是广播？');
await page.keyboard.press('Enter');
await page.waitForTimeout(3000);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(600);
await shot('deck-tutor.png');

await page.goto(BASE + '/home');
await page.locator('.hub-workbench').waitFor();
await page.waitForTimeout(3000);
await page.evaluate(() => {
  const el = document.querySelector('.hub-workbench');
  window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 60);
});
await page.waitForTimeout(2500);
await shot('deck-hub.png');

await page.goto(BASE + '/home');
await page.waitForTimeout(2500);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(600);
await shot('deck-home.png');

await page.goto(BASE + '/learning-path');
await page.waitForTimeout(2200);
await shot('deck-path.png');

await page.goto(BASE + '/evaluation');
await page.waitForTimeout(2200);
await shot('deck-eval.png');

await browser.close();
