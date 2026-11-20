/** 擦除路演 PPT 封面/结尾旧背景图左上角的「中国软件杯」标识与文字，其余像素保持不变 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const SRC = 'C:/Users/联想/AppData/Local/Temp/deckx/out/ppt/media/';
const OUT = new URL('../submission/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const jobs = [
  { src: SRC + 'image2.jpg', out: OUT + 'cover-overlay-clean.jpg' },
  { src: SRC + 'image27.jpg', out: OUT + 'ending-overlay-clean.jpg' },
];

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
for (const job of jobs) {
  const b64 = fs.readFileSync(job.src).toString('base64');
  const result = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/jpeg;base64,' + b64;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    const x1 = Math.round(w * 0.455);
    const y1 = Math.round(h * 0.105);
    const xl = 6;
    const at = (x, y) => { const i = (y * w + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
    for (let y = 0; y < y1; y++) {
      const a = at(xl, y), b = at(x1, y);
      for (let x = 0; x <= x1; x++) {
        const t = x / x1;
        const i = (y * w + x) * 4;
        px[i] = a[0] + (b[0] - a[0]) * t;
        px[i + 1] = a[1] + (b[1] - a[1]) * t;
        px[i + 2] = a[2] + (b[2] - a[2]) * t;
      }
    }
    ctx.putImageData(data, 0, 0);
    return { url: canvas.toDataURL('image/jpeg', 0.95), w, h };
  }, b64);
  fs.writeFileSync(job.out, Buffer.from(result.url.split(',')[1], 'base64'));
  console.log('OK', job.out, result.w + 'x' + result.h);
}
await browser.close();