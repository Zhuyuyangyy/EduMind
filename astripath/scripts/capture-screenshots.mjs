import { chromium } from '@playwright/test';
import { diagnosisQuestions } from '../src/data/diagnosis.ts';
import { exercises } from '../src/data/exercises.ts';

const BASE = 'http://localhost:4173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// 1. 首页（初始状态）
await page.goto(BASE + '/');
await page.waitForTimeout(600);
await page.screenshot({ path: 'screenshots/home.png' });

// 2. 诊断答题中
await page.goto(BASE + '/diagnosis');
await page.waitForTimeout(400);
await page.screenshot({ path: 'screenshots/diagnosis.png' });

// 3. 完成诊断：前 4 题答对，后 4 题答错（形成有层次的画像）
for (let i = 0; i < diagnosisQuestions.length; i++) {
  const q = diagnosisQuestions[i];
  const choice = i < 4 ? q.answer : (q.answer + 1) % 4;
  await page.locator('.choice-item').nth(choice).click();
  if (i < diagnosisQuestions.length - 1) await page.getByRole('button', { name: '下一题' }).click();
}
await page.getByRole('button', { name: '提交答卷并生成知识画像' }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: 'screenshots/diagnosis-result.png', fullPage: true });

// 4. 知识画像
await page.goto(BASE + '/profile');
await page.waitForTimeout(900);
await page.screenshot({ path: 'screenshots/knowledge_map.png', fullPage: true });

// 5. 学习计划
await page.goto(BASE + '/plan');
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/learning_plan.png', fullPage: true });

// 6. AI 导师
await page.goto(BASE + '/tutor');
await page.getByLabel('向 AI 导师提问').fill('缺失值应该删除还是填充？');
await page.getByRole('button', { name: '发送' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/ai_tutor.png', fullPage: true });

// 7. 针对性练习（NumPy 全对，展示掌握度提升）
await page.goto(BASE + '/practice/numpy-basics');
const npExercises = exercises.filter((e) => e.kpId === 'numpy-basics');
for (let i = 0; i < npExercises.length; i++) {
  await page.locator('.choice-item').nth(npExercises[i].answer).click();
  await page.waitForTimeout(150);
  if (i < npExercises.length - 1) await page.getByRole('button', { name: '下一题' }).click();
}
await page.getByRole('button', { name: '提交并更新掌握度' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/practice-result.png', fullPage: true });

// 8. 学习报告
await page.goto(BASE + '/report');
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/learning_report.png', fullPage: true });

// 9. 我的课程（知识图谱）
await page.goto(BASE + '/course');
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/course-kg.png', fullPage: true });

await browser.close();
console.log('screenshots done');
