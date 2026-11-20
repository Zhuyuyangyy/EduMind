import { chromium } from 'playwright';

const base = 'https://github.com/Zhuyuyangyy/EduMind';
const out = 'astripath/evidence/qoder-dev/02-core-logic-fix-commit.png';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

let ready = false;
for (let attempt = 0; attempt < 4 && !ready; attempt++) {
  await page.goto(`${base}/commit/ed1afce`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  try { await page.waitForSelector('#diff-content-parent', { timeout: 20000 }); ready = true; } catch { await page.waitForTimeout(2000); }
}
if (!ready) { console.error('commit shell never rendered'); await browser.close(); process.exit(1); }
await page.waitForTimeout(1200);

const findBlock = () => {
  const norm = (s) => (s || '').replace(/[‎‏\s]/g, '');
  const p = document.getElementById('diff-content-parent');
  if (!p) return null;
  const big = [...p.children].find((c) => c.tagName === 'DIV' && c.children.length > 3);
  if (!big) return null;
  const block = [...big.children].find((c) => norm(c.textContent).startsWith('Collapsefileastripath/src/logic/mastery.ts'));
  if (!block) return null;
  const r = block.getBoundingClientRect();
  return { x: r.x, y: r.y + window.scrollY, w: r.width, h: r.height };
};

let rect = null;
for (let i = 0; i < 60 && !rect; i++) {
  rect = await page.evaluate(findBlock);
  if (!rect) { await page.evaluate(() => window.scrollBy(0, 700)); await page.waitForTimeout(400); }
}
if (!rect) { console.error('mastery file block never rendered'); await browser.close(); process.exit(1); }

await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 90)), rect.y);
await page.waitForTimeout(800);
const measure = () => {
  const p = document.getElementById('diff-content-parent');
  const big = [...p.children].find((c) => c.tagName === 'DIV' && c.children.length > 3);
  const block = [...big.children].find((c) => (c.textContent || '').replace(/[\u200e\u200f\s]/g, '').startsWith('Collapsefileastripath/src/logic/mastery.ts'));
  if (!block) return null;
  const r = block.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
};
let view = await page.evaluate(measure);
for (let i = 0; i < 10 && view && (view.y < 60 || view.y > 140); i++) {
  await page.evaluate((dy) => window.scrollBy(0, dy), view.y - 90);
  await page.waitForTimeout(500);
  view = await page.evaluate(measure);
}
console.log('view final', JSON.stringify(view));
if (!view || view.h <= 0) { console.error('block lost after scroll'); await browser.close(); process.exit(1); }

const cy = Math.max(0, view.y);
const clip = { x: Math.max(0, view.x), y: cy, width: Math.min(1440 - Math.max(0, view.x), view.w), height: Math.min(860, view.h, 1000 - cy) };
await page.screenshot({ path: out, clip });
console.log('clip', JSON.stringify(clip), 'hasEmail', await page.evaluate(() => /@qq\.com|1578804454/.test(document.body.innerText)));
await browser.close();
console.log('DONE');