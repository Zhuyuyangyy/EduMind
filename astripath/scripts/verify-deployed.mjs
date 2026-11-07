/** 线上部署验收：竞赛闭环 + 原版界面 + 移动端 */
import { chromium, devices } from '@playwright/test';
const BASE = process.argv[2] || 'https://astripath-k78u5s6qgf1.qoder.zone';
const browser = await chromium.launch();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// T01/T12 免登录 + 原版导航
await page.goto(BASE + '/');
await page.waitForURL(/\/home$/, { timeout: 20000 });
await page.locator('.topbar-nav').waitFor();
check('T01/T12 公网免登录直达首页', page.url().includes('/home'));
const nav = await page.locator('.topbar-nav .nav-item').allInnerTexts();
check('原版导航栏目完整', nav.join(',') === '首页,画像生成,学习路径,学习资源,智能评估,反向更新,设置', nav.join(','));
check('竞赛入口横幅', await page.locator('.comp-entry').count() === 1);

// 诊断
await page.goto(BASE + '/diagnosis');
await page.locator('.comp-question').waitFor();
for (let i = 0; i < 8; i++) {
  await page.locator('.comp-choice').nth(i < 4 ? 0 : 1).click();
  const next = page.locator('.comp-quiz-actions button', { hasText: '下一题' });
  if (await next.count()) await next.click();
}
await page.locator('.comp-quiz-actions button', { hasText: '提交答卷' }).click();
await page.locator('.comp-card-title').first().waitFor();
check('T04 诊断判分（8 题 + 正确率表 + 解析）', (await page.locator('.comp-table tbody tr').count()) === 8);

// 画像
await page.goto(BASE + '/knowledge-profile');
await page.locator('canvas').first().waitFor();
check('T05 知识画像（3D 知识树）', (await page.locator('canvas').count()) >= 1);

// 计划
await page.goto(BASE + '/plan');
await page.locator('.comp-plan-day').first().waitFor();
check('T06 学习计划 7 天', (await page.locator('.comp-plan-day').count()) === 7);

// 导师
await page.goto(BASE + '/dialogue');
await page.waitForTimeout(1500);
await page.locator('textarea, input[type="text"]').first().fill('什么是广播？');
await page.keyboard.press('Enter');
await page.waitForTimeout(2500);
const tutorBody = await page.locator('body').innerText();
check('T07 AI 导师问答 + 引用依据 + 演示模式', tutorBody.includes('广播') && tutorBody.includes('引用依据') && tutorBody.includes('演示模式'));

// 练习闭环
await page.goto(BASE + '/practice/numpy-basics');
await page.locator('.comp-choice').first().click();
await page.locator('.comp-quiz-actions button', { hasText: '下一题' }).click();
await page.locator('.comp-choice').first().click();
await page.locator('.comp-quiz-actions button', { hasText: '下一题' }).click();
await page.locator('.comp-choice').first().click();
await page.locator('.comp-quiz-actions button', { hasText: '提交并更新掌握度' }).click();
await page.locator('.comp-card-title').first().waitFor();
const practiceBody = await page.locator('body').innerText();
check('T08/T09 练习判分 + 掌握度变化 + 累计练习', practiceBody.includes('掌握度变化') && practiceBody.includes('累计练习'));

// 报告
await page.goto(BASE + '/report');
await page.getByText('学习前后对比').waitFor();
check('T09 学习报告', true);

// 深链接
await page.goto(BASE + '/plan');
await page.locator('.comp-plan-day').first().waitFor();
check('深链接直达 /plan', true);

// 移动端
const mobile = await browser.newPage({ ...devices['Pixel 7'] });
await mobile.goto(BASE + '/');
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check('T11 移动端 375px 无横向溢出', overflow <= 1, `overflow=${overflow}px`);
await mobile.goto(BASE + '/diagnosis');
await mobile.locator('.comp-choice').first().click();
await mobile.locator('.comp-quiz-actions button', { hasText: '下一题' }).click();
check('T11 移动端诊断可答题', (await mobile.locator('.comp-quiz-progress').innerText()).includes('第 2 / 8'));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 项通过`);
process.exit(failed > 0 ? 1 : 0);
