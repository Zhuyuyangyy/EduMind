import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = 'astripath/evidence/qoder-dev';
fs.mkdirSync(outDir, { recursive: true });
const base = 'https://github.com/Zhuyuyangyy/EduMind';
const branch = 'competition/qoder-2026-studyhack';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

async function shot(url, file, prepare, skipFinal = false) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await prepare();
  await page.waitForTimeout(1200);
  if (!skipFinal) await page.screenshot({ path: `${outDir}/${file}` });
  console.log(file);
}

await shot(`${base}/blob/${branch}/astripath/docs/AUDIT_REPORT.md`, '01-engineering-audit.png', async () => {
  await page.waitForSelector('article.markdown-body', { timeout: 30000 });
});

await shot(`${base}/commit/ed1afce.patch`, '02-core-logic-fix-commit.png', async () => {
  await page.waitForSelector('pre', { timeout: 30000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/_tmp-commit-top.png`, clip: { x: 0, y: 0, width: 1440, height: 400 } });
  const y = await page.evaluate(() => {
    const pre = document.querySelector('pre');
    const node = [...pre.childNodes].find((n) => n.nodeType === 3) || pre.firstChild;
    const text = node.textContent;
    const idx = text.indexOf('diff --git a/astripath/src/logic/mastery.ts');
    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + 1);
    return Math.max(0, range.getBoundingClientRect().top + window.scrollY - 30);
  });
  await page.evaluate((y) => window.scrollTo(0, y), y);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/_tmp-commit-diff.png`, clip: { x: 0, y: 0, width: 1440, height: 1000 } });
  const stack = async () => {
    const fsmod = await import('node:fs');
    const a = fsmod.readFileSync(`${outDir}/_tmp-commit-top.png`).toString('base64');
    const b = fsmod.readFileSync(`${outDir}/_tmp-commit-diff.png`).toString('base64');
    const url = await page.evaluate(async ({ a, b }) => {
      const load = (s) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + s; });
      const ia = await load(a), ib = await load(b);
      const cv = document.createElement('canvas');
      cv.width = 1440; cv.height = ia.naturalHeight + ib.naturalHeight;
      const ctx = cv.getContext('2d');
      ctx.drawImage(ia, 0, 0);
      ctx.drawImage(ib, 0, ia.naturalHeight);
      return cv.toDataURL('image/png');
    }, { a, b });
    fsmod.writeFileSync(`${outDir}/02-core-logic-fix-commit.png`, Buffer.from(url.split(',')[1], 'base64'));
    fsmod.unlinkSync(`${outDir}/_tmp-commit-top.png`);
    fsmod.unlinkSync(`${outDir}/_tmp-commit-diff.png`);
  };
  await stack();
}, true);

await shot(`${base}/blob/${branch}/astripath/evidence/deployment/qoder-sites-deployment.txt`, '03-sites-deploy-record.png', async () => {
  await page.getByText('publish_site', { exact: false }).first().waitFor({ timeout: 30000 });
});

await browser.close();
console.log('DONE');