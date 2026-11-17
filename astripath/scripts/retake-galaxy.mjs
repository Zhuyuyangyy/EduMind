/** 重拍首页「个性化学习路径星图」：以当前线上版本为准（桌面 1440） */
import { chromium } from '@playwright/test';
const BASE = process.argv[2] || 'https://astripath-k78u5s6qgf1.qoder.zone';
const OUT = new URL('../screenshots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(BASE + '/home');
await page.locator('.home-breathe-galaxy').waitFor();
// 等 24 个星球模型加载并渲染
await page.waitForTimeout(6000);
// 让星图区块顶部对齐到固定导航栏下方
await page.evaluate(() => {
  const el = document.querySelector('.home-breathe-galaxy');
  const top = el.getBoundingClientRect().top + window.scrollY;
  window.scrollTo(0, Math.max(0, top - 40));
});
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT + 'home-galaxy.png' });
console.log('OK home-galaxy.png');
await browser.close();