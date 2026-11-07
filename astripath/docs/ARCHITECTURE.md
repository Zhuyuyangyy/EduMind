# 架构设计 · ARCHITECTURE

## 1. 总体架构

```text
┌─────────────────────────────────────────────────────────────┐
│                      评委浏览器（公网）                       │
│                                                             │
│  原版 EduMind 应用（Vue 3 + Vite + Three.js/PixiJS）          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 原版视图：Welcome(首页星座) / LearningPath(知识星座)  │    │
│  │           Dialogue(AI 导师) / EduMind(资源) / ...    │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │ 竞赛闭环视图（原版设计语言）：                          │    │
│  │   /diagnosis  8 题知识点诊断                          │    │
│  │   /knowledge-profile  3D 知识树画像（ThreeKnowledgeTree）│
│  │   /plan  7 天动态计划                                 │    │
│  │   /practice/:kpId  针对性练习                         │    │
│  │   /report  学习报告                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                         ↓ 读写                               │
│  src/demo/demoState.ts（响应式状态 + localStorage 持久化）     │
│                         ↓ 数据/算法                          │
│  astripath/src/logic（判分/掌握度/计划/导师检索，纯函数）        │
│  astripath/src/data（演示课程/题库/知识库）                    │
│                         ↑ 拦截                               │
│  src/demo/mockApi.ts（fetch 拦截 → /api/* 演示数据）           │
│     未覆盖端点 → 404 → 原版视图本地回退                        │
└─────────────────────────────────────────────────────────────┘
                         │ 构建
                         ▼
        Qoder Sites（静态托管 · SPA fallback · 公开访问）
```

## 2. 模块划分

### 2.1 演示模式 `src/demo/`

| 文件 | 职责 |
|---|---|
| `bootstrap.ts` | 免登录种子会话（写入演示学员 localStorage 会话）、预置关闭原版新手引导与 Live2D 桌宠 |
| `mockApi.ts` | fetch 拦截层：20+ 端点返回演示数据（画像/学习路径/评估/导师问答/资源/证据/工作流），未覆盖端点快速 404 触发原版回退 |
| `demoState.ts` | 演示学习状态：纯函数归约 + localStorage 持久化 + 响应式版本号（驱动视图更新） |
| `treeData.ts` | 演示知识点 → 原版 3D 知识树数据契约映射（含 AgentEvidence） |

### 2.2 共享逻辑 `astripath/src/logic/`（纯函数，可单测）

| 文件 | 职责 | 关键规则 |
|---|---|---|
| `scoring.ts` | 判分 | 移植自正式工程 `server/study/scoring.js`：选项下标严格相等、未知题型判错、会话汇总 |
| `mastery.ts` | 掌握度模型 | 移植自 `server/study/profile-updater.js`：诊断基线 = 正确率 × 75；证据量门槛 ≥2 题；稳定区间 [40%, 80%) 不调整；单次变化 ±8；钳制 0-100；证据必留痕 |
| `plan.ts` | 7 天计划生成 | 薄弱优先 + 先修闭包选点；链连续性排序；确定性；可解释理由 |
| `tutor.ts` | 演示知识库检索 | 关键词整体命中（3）> 标题（3）> 知识点名（2）> 正文（1）；阈值 4；未命中明确降级 |
| `state.ts` | 状态归约 + 持久化 | 纯函数（submitDiagnosis/submitPractice/togglePlanTask/appendChat）；版本化序列化；损坏数据安全降级 |

### 2.3 竞赛闭环视图 `src/views/`（原版设计语言）

- `DiagnosisQuiz.vue`：8 题诊断（进度/题号跳转/提交判分/正确率表/逐题解析/重新诊断）
- `KnowledgeProfile.vue`：3D 知识树（复用原版 `ThreeKnowledgeTree`）+ 薄弱点 + 全部知识点 + 变化记录 + 规则说明
- `LearningPlan.vue`：7 天计划（理由/打卡/重新生成/规则说明）
- `TargetedPractice.vue`：逐题即时判分 + 掌握度变化 + 累计练习 + 重练
- `LearningReport.vue`：前后对比 + 下一步推荐 + 学习流水 + 闭环说明

样式：`src/assets/styles/competition.css`，消费原版 `variables.css` 设计变量（深色玻璃态/辉光/圆角/动效曲线）。

## 3. 核心算法

### 3.1 掌握度更新（证据驱动，移植自正式工程）

```
诊断：baseline = round(正确率 × 75)          # 一题不定生死
练习会话（某知识点 n 题，c 对）：
  n < 2                → 掌握度不变，但记录证据（计数/最近测试/流水）
  0.4 ≤ c/n < 0.8      → 不变（稳定区间），记录证据
  c/n ≥ 0.8            → +round(8 × (rate-0.8)/0.2)，钳制 100
  c/n < 0.4            → -round(8 × (0.4-rate)/0.4)，钳制 0
每次变化写入 history（before/after/reason），界面可追溯。
```

### 3.2 计划生成（确定性）

```
1. 选点：知识点按掌握度升序；从最薄弱者开始连带先修闭包选入（容量 5）；放不下则跳过试下一个；
2. 排序：先修在前；同轮优先「能解锁链上后续薄弱点」的知识点；其次掌握度升序；最后按 id 平局裁决；
3. Day 1-5 专项任务（薄弱→专项学习+AI 讲解，其余→针对性练习）；Day 6 综合项目；Day 7 综合测评；
4. 每个任务附带推荐理由（引用掌握度、最近测试、先修状态）；
5. 掌握度变化 → 计划重新生成。
```

### 3.3 导师检索（演示模式）

```
分词：中文二元滑窗 + 英文数字词
评分：关键词整体命中查询 +3；命中标题 +3；命中知识点名 +2；命中正文 +1
阈值：≥4 返回课程卡片；否则明确降级（列出可问范围，不编造）
响应：讲解 + 示例 + 常见错误 + 关联练习 + 引用依据 + 命中词项 + 追问建议
```

## 4. 状态与持久化

```typescript
LearningState {
  version, courseId,
  diagnosis: { answers, submitted, submittedAt },
  kpStates: Record<kpId, { mastery, diagnosis, practiceCount, practiceCorrect, lastResult, history[] }>,
  practice: Record<kpId, Record<exerciseId, choice>>,
  planCompletion: Record<taskKey, boolean>,
  chat: TutorMessage[],     // 含引用依据与结构化内容
  events: LearningEvent[]   // 诊断/练习/任务完成流水
}
```

- 存储键：`astripath.demo.v1`；版本不匹配或结构损坏 → 安全降级为初始状态。
- `demoState.ts` 以响应式版本号驱动 Vue 更新；存储不可用（隐私模式）时降级内存存储。

## 5. 部署架构

- 构建：`npm run build` → `dist/`（39MB，低于 Qoder Sites 50MB 限额）。
- 静态资源裁剪：public 371MB → 30MB（大 PNG 转 JPEG 并同步更新引用、行星模型保留 10 个、移除 HDRI、agenthub 模型 meshopt 21.8MB→2MB 并给 iframe 应用打解码器补丁）。
- 托管：Qoder Sites 静态托管，`spa: true`（深链接 fallback），public 访问，无后端、无密钥、无数据库写入。
- 原版评估页演示夹具通过构建常量 `VITE_EDUMIND_DEMO_MODE=true` 显式开启（原版要求的 opt-in 机制）。

## 6. 安全设计

- 无任何密钥（前端不存 API Key）；无管理员接口；无真实个人信息；无支付。
- 演示数据全部虚构并标注；AI 能力边界明示（演示模式 + 引用依据 + 超范围降级）。
- localStorage 仅存设备本地演示状态，不构成数据暴露面。
