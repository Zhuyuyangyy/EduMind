/** 重拍全页截图：视口高度=整页高度，触发 IntersectionObserver 显现动画，避免下半幅灰罩白底 */
import { chromium, devices } from '@playwright/test';
const BASE = process.argv[2] || 'https://astripath-k78u5s6qgf1.qoder.zone';
const OUT = new URL('../screenshots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function shootFull(name, maxH = 4000) {
  await page.waitForTimeout(1200);
  let h = await page.evaluate(() => document.documentElement.scrollHeight);
  h = Math.min(h, maxH);
  await page.setViewportSize({ width: 1440, height: h });
  await page.waitForTimeout(2600);
  const h2 = Math.min(await page.evaluate(() => document.documentElement.scrollHeight), maxH);
  if (Math.abs(h2 - h) > 20) {
    await page.setViewportSize({ width: 1440, height: h2 });
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: OUT + name });
  console.log('OK ' + name + ' @1440x' + h2);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(600);
}

// 诊断（6 对 2 错）→ 结果全页
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
await shootFull('diagnosis-result.png');

// 知识画像（知识树）全页
await page.goto(BASE + '/knowledge-profile');
await page.waitForTimeout(3500);
await shootFull('knowledge_map.png');

// 7 天计划全页（练习前）
await page.goto(BASE + '/plan');
await page.waitForTimeout(1500);
await shootFull('learning_plan.png');

// 练习 numpy-basics 三题全对 → 报告全页
const practiceChoices = [1, 2, 2];
await page.goto(BASE + '/practice/numpy-basics');
for (let i = 0; i < 3; i++) {
  await page.locator('.comp-choice').nth(practiceChoices[i]).click();
  const next = page.locator('.comp-quiz-actions button', { hasText: '下一题' });
  if (await next.count()) await next.click();
}
await page.locator('.comp-quiz-actions button', { hasText: '提交并更新掌握度' }).click();
await page.locator('.comp-card-title').first().waitFor();
await page.goto(BASE + '/report');
await page.waitForTimeout(1500);
await shootFull('learning_report.png');

// 反向更新全页
await page.goto(BASE + '/reverse-evaluation');
await page.waitForTimeout(2500);
await shootFull('reverse-update.png');

// 智能评估全页
await page.goto(BASE + '/evaluation');
await page.waitForTimeout(3000);
await shootFull('evaluation.png');

// AI 导师对话全页
await page.goto(BASE + '/dialogue');
await page.waitForTimeout(2000);
const hide = page.locator('[title="隐藏互动舱"]');
if (await hide.count()) await hide.click();
await page.locator('textarea, input[type="text"]').first().fill('什么是广播？');
await page.keyboard.press('Enter');
await page.waitForTimeout(3000);
await shootFull('ai_tutor.png');

// 首页编排中枢：整段进入视口后元素级截图
await page.goto(BASE + '/home');
await page.locator('.hub-workbench').waitFor();
await page.waitForTimeout(3000);
await page.setViewportSize({ width: 1440, height: 1600 });
await page.evaluate(() => {
  const el = document.querySelector('.hub-workbench');
  window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 10);
});
await page.waitForTimeout(3000);
await page.locator('.hub-workbench').screenshot({ path: OUT + 'home-agent-hub.png' });
console.log('OK home-agent-hub.png');
await page.setViewportSize({ width: 1440, height: 900 });

// 移动端导师对话全页
const mobile = await browser.newPage({ ...devices['Pixel 7'] });
await mobile.goto(BASE + '/dialogue');
await mobile.waitForTimeout(2500);
const mHide = mobile.locator('[title="隐藏互动舱"]');
if (await mHide.count()) await mHide.click();
await mobile.locator('textarea, input[type="text"]').first().fill('什么是广播？');
await mobile.keyboard.press('Enter');
await mobile.waitForTimeout(3000);
let mh = Math.min(await mobile.evaluate(() => document.documentElement.scrollHeight), 3000);
await mobile.setViewportSize({ width: 412, height: mh });
await mobile.waitForTimeout(2600);
await mobile.screenshot({ path: OUT + 'mobile-tutor.png' });
console.log('OK mobile-tutor.png @412x' + mh);

await browser.close();