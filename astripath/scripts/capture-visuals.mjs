import { chromium } from '@playwright/test';

const BASE = 'https://astripath-k78u5s6qgf1.qoder.zone';
const browser = await chromium.launch();

// 中枢：整块协同工作台（模块说明 + 3D 编排枢纽）
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
await page.goto(BASE + '/home', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
const hubSection = page.locator('.home-breathe-hub').first();
await hubSection.scrollIntoViewIfNeeded();
await page.waitForTimeout(2000);
await hubSection.screenshot({ path: 'screenshots/home-agent-hub.png' });

// 反向更新：执行一次反向评估后截图
const rev = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await rev.goto(BASE + '/reverse-evaluation', { waitUntil: 'networkidle' });
await rev.waitForTimeout(1500);
const runBtn = rev.getByRole('button', { name: /一键检查当前学习进度/ });
if (await runBtn.count()) {
  await runBtn.first().click();
  await rev.waitForTimeout(9000);
}
await rev.screenshot({ path: 'screenshots/reverse-update.png', fullPage: true });

await browser.close();
console.log('done');
