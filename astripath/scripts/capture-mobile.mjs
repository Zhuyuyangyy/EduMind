import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
await page.goto('http://localhost:4173/');
await page.waitForTimeout(600);
await page.screenshot({ path: 'screenshots/mobile-home.png' });
// 打开抽屉导航
await page.getByRole('button', { name: '打开导航菜单' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: 'screenshots/mobile-nav.png' });
// 导师页移动端
await page.locator('.sidebar').getByRole('link', { name: 'AI 导师' }).click();
await page.getByLabel('向 AI 导师提问').fill('什么是广播？');
await page.getByRole('button', { name: '发送' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/mobile-tutor.png', fullPage: true });
await browser.close();
console.log('mobile screenshots done');
