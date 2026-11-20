import { chromium, devices } from '@playwright/test';
const BASE = process.argv[2] || 'https://astripath-k78u5s6qgf1.qoder.zone';
const OUT = new URL('../screenshots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const browser = await chromium.launch({ channel: 'chrome' });
const mobile = await browser.newPage({ ...devices['Pixel 7'] });
await mobile.goto(BASE + '/dialogue');
await mobile.waitForTimeout(2500);
const hide = mobile.locator('[title="隐藏互动舱"]');
if (await hide.count()) await hide.click();
await mobile.locator('textarea, input[type="text"]').first().fill('什么是广播？');
await mobile.keyboard.press('Enter');
await mobile.waitForTimeout(3000);

// 消息区为内部滚动容器，需滚动容器而非 window
const scrollChat = (mode) => {
  const ans = [...document.querySelectorAll('.whitespace-pre-line')].find((el) => el.textContent.includes('引用依据'));
  if (!ans) return;
  let sc = ans.parentElement;
  while (sc && sc.scrollHeight <= sc.clientHeight + 4) sc = sc.parentElement;
  if (!sc) return;
  sc.scrollTop = mode === 'top' ? 0 : Math.max(0, sc.scrollHeight - sc.clientHeight - 150);
};

// 完整手机屏 A：顶部导航 + 提问 + 讲解开头
await mobile.evaluate(scrollChat, 'top');
await mobile.waitForTimeout(600);
await mobile.screenshot({ path: OUT + 'crops/mobile-tutor-a.png' });
console.log('OK crops/mobile-tutor-a.png (full viewport)');

// 完整手机屏 B：引用依据 + 推荐追问 + 底部输入栏
await mobile.evaluate(scrollChat, 'bottom');
await mobile.waitForTimeout(600);
await mobile.screenshot({ path: OUT + 'crops/mobile-tutor-citation.png' });
console.log('OK crops/mobile-tutor-citation.png (full viewport)');
await browser.close();