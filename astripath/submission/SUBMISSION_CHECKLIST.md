# 提交清单 · SUBMISSION_CHECKLIST

截止：2026 年 11 月 30 日 18:00。内部目标 11 月 28 日完成最终公开部署（已于 11 月 7 日提前完成）。

## 一、任务书 §8.3 最终验收

- [x] 构建通过（`npm run build`：vue-tsc 0 错误 + Vite 产物 690KB）
- [x] 核心功能测试通过（44 逻辑单元测试 + 原工程 278 项回归，`evidence/test_results/astripath-unit-tests.txt`）
- [x] 端到端测试通过（10 E2E + 线上 12 项验收，`evidence/test_results/astripath-e2e-tests.txt`）
- [x] 桌面端检查完成（1440px 全流程截图 + 线上验收）
- [x] 手机端检查完成（375px E2E + 截图，无横向溢出）
- [x] 公网链接可访问（https://astripath-k78u5s6qgf1.qoder.zone，线上 11/11 验收）
- [x] 无需登录即可体验（无任何认证逻辑，T01/T12 通过）
- [x] 无敏感信息泄露（无 .env/密钥/真实个人信息；产物已检查）
- [x] AI 生成内容标识保留（演示模式横幅 + 引用依据 + 掌握度演示评估值声明）
- [x] Qoder 使用证据完整（`docs/QODER_USAGE.md` + evidence/ 目录）
- [x] 作品介绍帖子完成（`submission/FORUM_POST.md`，待填 Qoder 账号与个人介绍）

## 二、任务书 §10.1 必须提交材料

- [x] 公网作品链接：https://astripath-k78u5s6qgf1.qoder.zone
- [x] 天池论坛作品介绍：`submission/FORUM_POST.md`
- [ ] 个人自我介绍：待人工填写
- [ ] Qoder 账号信息：待人工填写
- [x] 作品操作说明：`docs/USER_GUIDE.md`（五分钟体验路径）
- [x] 项目截图：`screenshots/`（首页、诊断、诊断结果、知识画像、学习计划、AI 导师、练习结果、学习报告、课程图谱、移动端 ×3）

## 三、提交前人工待办

1. 在 `submission/FORUM_POST.md` 填写「个人自我介绍」与「Qoder 账号」。
2. 将帖子发布至天池论坛（标题：〖StudyHack〗智学星枢：一个能够持续理解学生、规划学习路径的 AI 导师）。
3. 如更换设备/网络环境，重新打开公网链接做一次最终冒烟（首页 → 立即体验 → 提交诊断）。
4. 确认竞赛分支已推送 GitHub：`git push -u origin competition/qoder-2026-studyhack`。

## 四、仓库与分支

- 仓库：https://github.com/Zhuyuyangyy/EduMind（分支 `competition/qoder-2026-studyhack`）
- 隔离声明：本分支基于 main 创建，未修改 main 与其他分支；原工程源码完整保留未改动；竞赛版本位于 `astripath/` 子目录。

## 五、交付物索引

| 交付物 | 位置 |
|---|---|
| 竞赛应用源码 | `astripath/src/` |
| 逻辑单元测试 | `astripath/tests/`（E2E 在仓库根 `tests/e2e/`） |
| 审计报告 | `astripath/docs/AUDIT_REPORT.md` |
| 项目概览/架构/用户指南 | `astripath/docs/PROJECT_OVERVIEW.md`、`ARCHITECTURE.md`、`USER_GUIDE.md` |
| 测试报告 | `astripath/docs/TEST_REPORT.md` |
| Qoder 使用记录 | `astripath/docs/QODER_USAGE.md` |
| 测试/部署证据 | `astripath/evidence/` |
| 截图 | `astripath/screenshots/` |
| 参赛帖子与清单 | `astripath/submission/` |
