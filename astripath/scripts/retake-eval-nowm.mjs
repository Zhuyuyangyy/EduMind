import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
await page.goto('https://astripath-k78u5s6qgf1.qoder.zone/evaluation', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.cockpit-shell', { timeout: 30000 });
await page.getByText('综合掌握度', { exact: false }).first().waitFor({ timeout: 30000 });
await page.waitForTimeout(3000);
const box = await page.evaluate(() => {
  const shell = document.querySelector('.cockpit-shell');
  const r = shell.getBoundingClientRect();
  const cs = getComputedStyle(shell);
  const pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight);
  const summary = document.querySelector('.summary-grid');
  return { x: r.x + pl, y: r.y, w: r.width - pl - pr, contentH: shell.scrollHeight, summaryBottom: summary ? summary.getBoundingClientRect().bottom : r.y + 560 };
});
// Metrics header + summary only: stops above the trend (stale fixture dates)
// and above the fixed hosting badge at the viewport bottom.
const clip = { x: box.x, y: box.y, width: box.w, height: Math.max(200, box.summaryBottom - box.y) };
await page.screenshot({ path: 'astripath/screenshots/crops/eval-cockpit.png', clip });
console.log('eval-cockpit.png', JSON.stringify(clip));
await browser.close();
console.log('DONE');