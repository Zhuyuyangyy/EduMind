# 提交清单 · SUBMISSION_CHECKLIST

截止：2026 年 11 月 30 日 18:00（报名与作品发布同一截止）。初筛 12/1–12/7（每赛道 14 队进决赛），决赛为线上直播路演 12/1–12/15。
内部目标 11 月 28 日完成最终公开部署（已于 11 月 7 日提前完成，含横幅修复版）。

> 注意：参与奖「提交合格即领」限额 2000 个，官网显示已报名 2555 队——尽早发布合格帖子。

## 一、赛规硬条件（不满足则不合格 / 取消获奖资格）

- [x] 作品用 Qoder 完成开发与部署（过程记录 `docs/QODER_USAGE.md`，帖子第四节已内嵌）
- [x] Qoder Sites 公网地址且能打开：https://astripath-k78u5s6qgf1.qoder.zone（公开访问、免登录，线上 12/12 验收）
- [x] **天池平台报名**（StudyHack 赛道，2 人团队：朱玉阳 + 刘宏伟，已报名）
- [ ] **全体参赛成员完成天池实名认证**（截止前，否则取消获奖资格；需确认刘宏伟也已完成）
- [ ] **全体参赛成员完成阿里云大学生认证**（截止前，否则取消获奖资格；需确认刘宏伟也已完成）
- [x] 帖子填写**所用 Qoder 账号**（17368893899，合格条件明文要求）
- [x] 帖子五部分齐全：自我介绍 / 作品是什么 / 为什么做 / 怎么用（≤5 步）/ Qoder 过程（含 12 张截图）
- [x] 帖子发布至天池赛题页论坛（2026-11-08）：https://tianchi.aliyun.com/forum/post/1095688

## 二、任务书 §8.3 最终验收

- [x] 构建通过（`npm run build`：vue-tsc 0 错误；产物约 39MB，资源裁剪压缩后低于 50MB 限额）
- [x] 核心功能测试通过（44 逻辑单元测试 + 原工程 278 项回归，`evidence/test_results/astripath-unit-tests.txt`）
- [x] 端到端测试通过（10 E2E + 线上 12 项验收，`evidence/test_results/astripath-e2e-tests.txt`）
- [x] 桌面端检查完成（1440px 全流程截图 + 线上验收）
- [x] 手机端检查完成（375px E2E + 截图，无横向溢出）
- [x] 无需登录即可体验（T01/T12 通过）
- [x] 无敏感信息泄露（无 .env/密钥/真实个人信息；产物已检查）
- [x] AI 生成内容标识保留（演示模式标注 + 引用依据 + 掌握度演示评估值声明）
- [x] Qoder 使用证据完整（`docs/QODER_USAGE.md` + evidence/ 目录 + 帖子内嵌截图）
- [x] 作品介绍帖子完成并已发布（`submission/FORUM_POST.md` → https://tianchi.aliyun.com/forum/post/1095688）

## 三、提交前人工待办

1. 确认全体成员实名认证 + 阿里云大学生认证已完成（硬条件，见第一节；特别是刘宏伟）。
2. ~~填写自我介绍 / Qoder 账号 / 团队分工~~（已完成）。
3. ~~上传截图并替换图片链接~~（已完成，12 张已传天池 CDN）。
4. ~~发布帖子到天池赛题页论坛~~（已完成：https://tianchi.aliyun.com/forum/post/1095688）。
5. 发布后重新打开公网链接做一次最终冒烟（首页 → 立即体验 → 提交诊断）。
6. 确认竞赛分支已推送 GitHub：`git push -u origin competition/qoder-2026-studyhack`（当前被本地代理 127.0.0.1:7890 阻塞，恢复后补推；帖子证据已内嵌，不依赖仓库链接）。

## 四、可选加分项

- [ ] 学生权益：https://university.aliyun.com/action/qoder 学生认证领 Qoder CN 一个月免费
- [ ] 社交传播奖：小红书/抖音/X 发布分享，带【2026 Qoder 高校创造力大赛】并 @qoder 官方账号（限 1000 名），链接填入帖子「分享链接」节
- [ ] 决赛路演准备：若进初筛（12/7 前公布），准备 5 分钟直播演示脚本（建议路径：诊断→画像→导师→练习 75→83→报告）

## 五、仓库与分支

- 仓库：https://github.com/Zhuyuyangyy/EduMind（分支 `competition/qoder-2026-studyhack`）
- 隔离声明：本分支基于 main 创建，未修改 main 与其他分支；原工程源码完整保留，竞赛改动为演示模式新增。

## 六、交付物索引

| 交付物 | 位置 |
|---|---|
| 竞赛逻辑与数据 | `astripath/src/logic/`、`astripath/src/data/` |
| 演示模式与闭环视图 | `src/demo/`、`src/views/{DiagnosisQuiz,KnowledgeProfile,LearningPlan,TargetedPractice,LearningReport}.vue` |
| 逻辑单元测试 | `astripath/tests/`（E2E 在仓库根 `tests/e2e/`） |
| 审计报告 | `astripath/docs/AUDIT_REPORT.md` |
| 项目概览/架构/用户指南 | `astripath/docs/PROJECT_OVERVIEW.md`、`ARCHITECTURE.md`、`USER_GUIDE.md` |
| 测试报告 | `astripath/docs/TEST_REPORT.md` |
| Qoder 使用记录 | `astripath/docs/QODER_USAGE.md` |
| 测试/部署证据 | `astripath/evidence/`（线上验收 12/12 已刷新） |
| 截图（全部为当前线上版本实拍） | `astripath/screenshots/`（首页、横幅、诊断×2、画像、计划、导师、练习结果、报告、知识星座、移动端×4） |
| 参赛帖子与清单 | `astripath/submission/` |
| 截图重拍脚本 | `astripath/scripts/retake-screenshots.mjs` |