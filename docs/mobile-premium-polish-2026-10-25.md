# 智学星枢 App：参照网页端的界面精修

日期：2026-10-25。工作区分支：`codex/mobile-apple-onboarding`。

## 设计与实现

沿用用户指定的简约 Apple 风格，以现有网页端的学习宇宙、轨道、画像与知识路径作为品牌参照。本批调整移动端页面与交互，没有增加支付或改动线上部署。

- **品牌插图**：参考 `public/homepage/profile-evidence-orb.png` 生成独立的浅色玻璃轨道插图。原图保存在 `outputs/premium-mobile/orbit-source.png`，项目使用带透明通道的 `src/mobile/assets/learning-orbit.webp`，大小 34,632 字节。使用真实图像资源，未引入网页端的 3D 渲染依赖。
- **统一界面**：雾白背景、钴蓝主操作、白色分组卡片、克制的描边与阴影；调整字阶、间距、图标、表单和悬浮底部导航。
- **首页**：突出一个当前学习主题与开始练习入口；保留掌握度估计标记，推荐依据可展开。学习档案和导师成为两个次级入口。
- **学习路径**：新增共享阶段组件 `MobileLearningPath.vue`，阶段可以展开/收起，每个知识点可以直接进入导师。主页与成长页使用同一套真实路径数据；掌握度始终是估计标签。
- **导师**：保留制定计划与学科辅导的独立入口；新增三个可回填输入框的快捷提问。回复支持标题、加粗、行内代码、代码块与列表，辅导模式信息收进说明区域。使用 Vue 文本插值，模型文本中的 HTML 不会作为 DOM 执行。
- **成长**：真实练习统计前置，能力画像改为紧凑的六维网格，减少重复的大段信息。
- **个人中心**：账号卡与学习入口分组；昵称编辑按需展开；高级服务诊断保持次级入口。
- **练习与结果**：新增题目进度与已提交选项的视觉反馈；不提前公开未作答题的标准答案。练习和结果页收起底部导航，保留返回入口，减少对作答的遮挡。

截图检查中修正了路径标签序列化对象直接显示的问题，并补充浏览器断言，避免把内部对象字段当作用户文案。

## 本轮实际验证

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| Mobile 类型检查与生产构建 | 通过；主 JS 约 205.56 KB，gzip 74.27 KB；插图 34.63 KB | `outputs/premium-mobile-build.log` |
| Web 构建 | 通过；保留既有大 chunk 警告 | `outputs/premium-web-build.log` |
| 全量 JSON 测试 | 206 项，160 通过、46 项 MySQL 专项跳过，0 失败 | `outputs/premium-json-tests.log` |
| 移动端入口回归 | **8/8** | `outputs/premium-mobile-base-e2e.log` |
| 数据与双账号回归 | **13/13** | `outputs/premium-mobile-data-e2e.log` |
| 学习闭环回归 | **20/20** | `outputs/premium-mobile-study-e2e.log` |
| 新手流程与界面验收 | **11/11** | `outputs/premium-onboarding-e2e.log` |
| Android 同步与 Debug 构建 | 通过，`BUILD SUCCESSFUL` | `outputs/premium-cap-sync.log`、`outputs/premium-android-build.log` |
| APK 内容校验 | ZIP CRC 通过；包内 7 个移动端产物全部逐字节匹配当前 `dist-mobile` | `outputs/premium-mobile/apk-verification.json` |

新手验收包含真实注册、完整问卷、画像和路径持久化、刷新和重登恢复、导师问答、作答判分、昵称保存、网络失败重试与第二账号隔离。本轮新增阶段展开/收起、快捷提问回填、题目专注布局、320/390/430 像素五页布局与导师输入区不被导航遮挡的检查。

答案排版与 HTML 执行边界使用单独标明的有界浏览器夹具检查；截图中的导师回答在此夹具启用前保存，来自实际本地服务回答。没有真实模型密钥时仍明确显示规则降级。

## 产物

- 本地预览：`http://127.0.0.1:5174/`。
- 安装包：`outputs/premium-mobile/智学星枢_App_精修版_20261025.apk`，4,349,671 字节。
- SHA-256：`bc43b323270813daeca33d2d760008b34789fbe7eb4d1778aa2934d45457f1fc`。
- 真实页面截图：`outputs/premium-mobile/01-login.png` 至 `11-guided-planning.png`。
- 网页端参照截图：`outputs/premium-mobile/reference-web-login.png`。

复跑：

```powershell
npm run build:mobile
$env:MOBILE_E2E_OUTPUT='outputs/premium-mobile'
npm run test:mobile-onboarding
```

本批改动保留在当前工作区，未提交或推送。没有修改 `main` 或合并远程 PR。

Android 包为 Debug 包；真机安装、系统键盘、手势返回和原生安全存储未验收。原生联网仍需要项目已有机制配置可信 HTTPS 后端；没有将未经验证的旧公网地址写进安装包。本轮没有重新执行 MySQL 专项，前一批数据库验收记录不计作本轮执行结果。
