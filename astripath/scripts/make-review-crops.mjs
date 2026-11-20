import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const crops = [
  { src: 'astripath/screenshots/knowledge_map.png', out: 'kmap-tree-framed.png', x: 133, y: 376, w: 1174, h: 682 },
  { src: 'astripath/screenshots/mobile-tutor.png', out: 'mobile-tutor-a.png', x: 0, y: 0, w: 1082, h: 1440 },
  { src: 'astripath/screenshots/mobile-tutor.png', out: 'mobile-tutor-citation.png', x: 0, y: 2860, w: 1082, h: 800 },
];
const outDir = 'astripath/screenshots/crops';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
for (const c of crops) {
  const b64 = fs.readFileSync(c.src).toString('base64');
  const url = await page.evaluate(async ({ b64, x, y, w, h }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
    return cv.toDataURL('image/png');
  }, { ...c, b64 });
  const file = path.join(outDir, c.out);
  fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  console.log(file, `${c.w}x${c.h}`);
}
await browser.close();
console.log('DONE');