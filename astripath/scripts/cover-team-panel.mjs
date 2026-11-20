/** 封面旧图底部三行旧赛事信息（A3 赛题/指导组/旧名单）用路演风格信息面板覆盖，写入当前团队信息 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const SRC = new URL('../submission/cover-overlay-clean.jpg', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = new URL('../submission/cover-overlay-final.jpg', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const b64 = fs.readFileSync(SRC).toString('base64');
const result = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = 'data:image/jpeg;base64,' + b64;
  await img.decode();
  const w = img.naturalWidth, h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const x = Math.round(w * 0.075), y = Math.round(h * 0.66);
  const pw = Math.round(w * 0.425), ph = Math.round(h * 0.32);
  const r = 12;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + pw, y, x + pw, y + ph, r);
  ctx.arcTo(x + pw, y + ph, x, y + ph, r);
  ctx.arcTo(x, y + ph, x, y, r);
  ctx.arcTo(x, y, x + pw, y, r);
  ctx.closePath();
  ctx.fillStyle = '#06285B';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#20D7FF';
  ctx.stroke();

  const font = (px, weight = 700) => `${weight} ${px}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFD76A';
  ctx.font = font(Math.round(h * 0.0315));
  ctx.fillText('2026 Qoder 高校创造力大赛 · StudyHack 赛道', x + 40, y + ph * 0.22);
  ctx.fillStyle = '#F4FAFF';
  ctx.font = font(Math.round(h * 0.028));
  ctx.fillText('团队成员：朱玉阳、刘宏伟', x + 40, y + ph * 0.5);
  ctx.fillStyle = '#20D7FF';
  ctx.font = font(Math.round(h * 0.026), 400);
  ctx.fillText('工程实现：Qoder Agent（AI 编程）', x + 40, y + ph * 0.78);

  return { url: canvas.toDataURL('image/jpeg', 0.95), w, h };
}, b64);
fs.writeFileSync(OUT, Buffer.from(result.url.split(',')[1], 'base64'));
console.log('OK', OUT, result.w + 'x' + result.h);
await browser.close();