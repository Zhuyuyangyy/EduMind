import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const jobs = [
  { src: 'astripath/screenshots/mobile-tutor.png', out: 'mobile', chunk: 1600 },
  { src: 'astripath/screenshots/knowledge_map.png', out: 'kmap', chunk: 1450 },
];
const tmp = 'C:/Users/联想/AppData/Local/Temp/astripath-work';
fs.mkdirSync(tmp, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
for (const job of jobs) {
  const b64 = fs.readFileSync(job.src).toString('base64');
  const dims = await page.evaluate(async ({ b64, chunk }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    const parts = [];
    for (let y = 0, i = 1; y < h; y += chunk, i++) {
      const ch = Math.min(chunk, h - y);
      const c = document.createElement('canvas');
      c.width = w; c.height = ch;
      c.getContext('2d').drawImage(img, 0, y, w, ch, 0, 0, w, ch);
      parts.push({ i, y, ch, url: c.toDataURL('image/png') });
    }
    return { w, h, parts };
  }, { b64, chunk: job.chunk });
  for (const p of dims.parts) {
    const file = path.join(tmp, `${job.out}-part${p.i}-y${p.y}.png`);
    fs.writeFileSync(file, Buffer.from(p.url.split(',')[1], 'base64'));
    console.log(file, `${dims.w}x${p.ch}`);
  }
}
await browser.close();
console.log('DONE');