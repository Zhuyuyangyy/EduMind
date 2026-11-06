/**
 * 线上部署验收（T01/T12 + 全闭环 + 深链接 + 移动端）
 * 用法: node scripts/verify-deployed.mjs https://<site-host>
 */
import { chromium } from '@playwright/test';
import { diagnosisQuestions } from '../src/data/diagnosis.ts';

const BASE = process.argv[2];
if (!BASE) { console.error('usage: node scripts/verify-deployed.mjs <base-url>'); process.exit(1); }
const browser = await chromium.launch();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// T01/T12: 公开访问、无登录
await page.goto(BASE + '/');
await page.locator('.hero-title').waitFor();
check('T01/T12 公网无登录访问首页', (await page.locator('.hero-title').innerText()).includes('AI 导师'));

// 全闭环
await page.goto(BASE + '/diagnosis');
await page.locator('.choice-item').first().waitFor();
for (let i = 0; i < diagnosisQuestions.length; i++) {
  const q = diagnosisQuestions[i];
  await page.locator('.choice-item').nth(i < 4 ? q.answer : (q.answer + 1) % 4).click();
  if (i < diagnosisQuestions.length - 1) await page.getByRole('button', { name: '下一题' }).click();
}
await page.getByRole('button', { name: '提交答卷并生成知识画像' }).click();
await page.getByRole('heading', { name: '诊断完成' }).waitFor();
check('T04 诊断提交判分', (await page.locator('body').innerText()).includes('各知识点正确率'));

await page.goto(BASE + '/profile');
await page.locator('.kp-card').first().waitFor();
check('T05 知识画像渲染', (await page.locator('.kp-card').count()) === 8, `${await page.locator('.kp-card').count()} 张知识点卡片`);

await page.goto(BASE + '/plan');
await page.locator('.plan-day').first().waitFor();
const planDays = await page.locator('.plan-day').count();
check('T06 学习计划 7 天', planDays === 7, `${planDays} 天`);

await page.goto(BASE + '/tutor');
await page.getByLabel('向 AI 导师提问').waitFor();
await page.getByLabel('向 AI 导师提问').fill('什么是广播？');
await page.getByRole('button', { name: '发送' }).click();
const tutorBody = await page.locator('.chat-msg.tutor').last().innerText();
check('T07 AI 导师问答与引用依据', tutorBody.includes('引用依据') && tutorBody.includes('广播'));

await page.goto(BASE + '/practice/numpy-basics');
await page.locator('.choice-item').first().waitFor();
await page.locator('.choice-item').first().click();
check('T08 练习即时判分', (await page.locator('.explain-box').count()) > 0);

await page.goto(BASE + '/report');
await page.getByRole('heading', { name: '学习前后对比' }).waitFor();
check('T09 学习报告', (await page.locator('body').innerText()).includes('学习流水'));

// 深链接直达（SPA fallback）
await page.goto(BASE + '/profile');
await page.locator('.kp-card').first().waitFor();
check('深链接直达 /profile', (await page.locator('body').innerText()).includes('知识点掌握度雷达'));

// T11 移动端
const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
await mobile.goto(BASE + '/');
await mobile.locator('.mobile-topbar').waitFor();
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check('T11 移动端 375px 无横向溢出', overflow <= 1, `overflow=${overflow}px`);
await mobile.getByRole('button', { name: '打开导航菜单' }).click();
await mobile.locator('.sidebar.open').waitFor();
await mobile.locator('.sidebar').getByRole('link', { name: 'AI 导师' }).click();
await mobile.getByLabel('向 AI 导师提问').waitFor();
check('T11 移动端导航可用', mobile.url().includes('/tutor'));

// 控制台错误检查
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(BASE + '/');
await page.locator('.hero-title').waitFor();
await page.waitForTimeout(1200);
check('无页面脚本错误', errors.length === 0, errors.slice(0, 2).join('; '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 项通过`);
process.exit(failed > 0 ? 1 : 0);
