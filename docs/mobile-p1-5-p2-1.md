# EduMind Mobile P1.5 → P2-1 阶段报告

分支：`feat/mobile-v1`（基线 P1 `28da108` 之后）
状态：P1.5 稳定性门禁代码与自动化验证完成；P2-1 设计系统与四页骨架完成。
**真机/模拟器验收仍未完成（环境阻塞，见 §4），不宣称设备验收通过。main 未合入。**

## 1. P1.5 稳定性门禁（提交 `f39cabd`）

外部评审指出的三个 P1 遗留风险，全部修复并测试：

| 问题 | 修复 | 验证 |
|---|---|---|
| `restoreAuthSession()` 冷启动校验用相对路径（WebView 会打到 App 自身） | 改用 `resolveApiUrl('/api/auth/session')`，与全应用 API Base 解析统一 | 跨域 E2E 7/7（见下） |
| `MobileStatus.vue` 诊断接口裸 fetch、只带 Cookie | 三个接口（health / llm/status / evidence/traces）全部走共享客户端 `apiGet`（自动 Bearer + 401 处理） | 跨域 E2E D 场景 |
| 浏览器 E2E 只验证了同源代理 | E2E 增加 `CROSS_ORIGIN=1` 模式：页面与 API 不同源、不走代理，模拟 Capacitor 真机网络路径 | 同源 / 跨域两种模式均 7/7 |

新增安全能力：`validateApiBase()`——正式构建仅允许 HTTPS 非本机地址，开发构建例外仅限
`http://localhost/127.0.0.1`，防止把 Bearer Token 发往不可信服务；设置页保存走统一校验。

新增服务端测试（`npm test` 38→40 中的 2 例）：
- CORS 预检：白名单 Origin（localhost:5174 / https://localhost / capacitor://localhost）反射 +
  Allow-Credentials + Authorization 头放行；陌生 Origin（evil.example.com）不下发 ACAO；
- 跨 Origin Bearer 业务请求 200，乱码 Token 401。

**干净构建门禁通过**：`./gradlew clean assembleDebug --no-daemon --offline`
→ `BUILD SUCCESSFUL`，**退出码 0**（43 分钟，JDK 24 + SDK 35）。这解决了 P1 遗留的
「APK 存在 ≠ 构建成功」问题——此前一次构建在打包后因依赖下载超时返回非 0。

## 2. P2-1 设计系统与四页骨架

### 设计 Token（`src/mobile/styles/tokens.css`）
色彩（深空科技感：bg/surface/border/primary/success/warn/danger）、
字号（11–26px 七级）、间距（4–32px）、圆角、安全区变量、动效曲线。
所有页面只允许引用变量，不允许散落硬编码色值。

### 组件（同文件）
按钮（primary/ghost/danger × 尺寸）、卡片、输入框、对话气泡（AI/用户）、
徽标（信息/警告/危险/成功）、骨架屏（shimmer）、空状态、错误条（含重试）、
列表行、进度条、区块标题、**示例数据标记**（虚线黄框 `m-demo-tag`）。

### 信息架构（四页 + 底部导航）
| 页面 | 路由 | 内容 | 数据性质 |
|---|---|---|---|
| 今日学习 | `/today` | 问候、今日唯一任务卡（"用 8 分钟理解 BFS"）、目标进度、推荐任务 | **示例数据**（顶栏统一「示例数据」标记） |
| AI 导师 | `/tutor` | 对话气泡、思考骨架、降级徽标、错误重试、会话内历史 | **真实数据**（`/api/tutoring/ask`） |
| 学习成长 | `/growth` | 学习路径（诊断→练习→评估）、能力画像、错题反馈、阶段统计 | **示例数据** |
| 我的 | `/profile` | 账号卡、服务连接诊断、API 地址配置、学习偏好、帮助关于、退出 | **真实数据**（会话/诊断）+ 示例（偏好） |

交互规范：底部安全区（`env(safe-area-inset-bottom)`）、顶部 sticky 头、
页面切换淡入动效、输入区 sticky 吸底（键盘弹出随视口上移）、
新消息自动滚动、空状态/骨架/错误三态齐全。未引入任何 3D/Live2D/重型图表
（移动包 130KB JS + 15.7KB CSS）。

## 3. 验证矩阵（全部真实执行）

| 验证项 | 结果 |
|---|---|
| `npm test` | **40/40**（P0.3 隔离测试 + P1.5 CORS/跨域测试） |
| `vue-tsc --noEmit` | 0 错（含全部移动端视图） |
| `npm run build`（网页版） | 通过 |
| `npm run build:mobile` | 通过（dist-mobile 130KB JS） |
| `experiment:anomaly` | 全部断言通过 |
| `experiment:learning-cycle` | 3/3 案例，passRate=1 |
| 移动端 E2E 同源模式 | **7/7**（A 未登录拦截 / B 登录 / C 真实回答+降级徽标 / D 我的页诊断 / E 退出 / F 401 打回 / G 断网报错） |
| 移动端 E2E 跨域模式（CROSS_ORIGIN=1） | **7/7**（Bearer + CORS 全链路） |
| Gradle 干净构建 | **BUILD SUCCESSFUL，退出码 0**（离线模式） |

## 4. 真机/模拟器验收——**未完成（环境阻塞，如实标注）**

已尝试：安装 emulator + system-image（android-35, google_apis, x86_64，sdkmanager exit 0）、
创建 AVD（pixel_6）、三种启动参数组合（默认 / `-gpu off -accel off` / verbose + 提权）。
现象：qemu 进程启动但始终不注册 adb 端口（无 5554/5555 监听），日志停在特性初始化阶段——
判断为本机虚拟化支持（WHPX/Hyper-V）不可用。`adb devices` 无输出，无物理设备连接。

**因此：APK 未经任何真机/模拟器安装运行验证。** 已构建的 APK 内容经 aapt2 核验
（包名/标签/资源/权限正确，assets/public 含 P2-1 bundle）。设备就绪后的验收清单：
安装启动 → 登录 → 前后台恢复 → 冷启动会话保持 → 断网/401/服务重启反馈 → 退出。

## 5. 环境适配记录（本机复现必读）

- **JDK 24**（`/d/Java/jdk-24`）：Capacitor 7 的 capacitor-android 要求 source release 21，JDK 17 不够。
- **Android SDK**：`/d/android-sdk`（platforms 35、build-tools 35.0.0）。
- **Gradle 发行版**：wrapper 指向 8.14.3（本机缓存；模板原为 8.11.1）。
- **safe-delete 沙箱**：本环境对大目录 fs 删除会 ETIMEDOUT（转垃圾箱二进制）。
  构建脚本用「先 mv 旧产物」规避；`npx cap sync android` 的 removePluginsNativeFiles 步骤会因此失败——
  本次改用「手动 cp dist-mobile → android/app/src/main/assets/public」等效拷贝。
- **cap sync 中断恢复**：若 `capacitor-cordova-android-plugins` 被误删，从
  `node_modules/@capacitor/cli/assets/capacitor-cordova-android-plugins.tar.gz` 解压恢复，
  并在 build.gradle 的 `// PLUGIN GRADLE EXTENSIONS START` 后补
  `apply from: "cordova.variables.gradle"`。

## 6. 遗留问题与下一阶段

| 优先级 | 事项 |
|---|---|
| 发布阻断 | 真机/模拟器验收（§4 清单）；设备不可用不阻塞 P2 后续开发 |
| P2-2 | 今日学习/学习成长接入真实账号数据（画像、知识路径、学习状态均已按账号隔离可直连） |
| P2-3 | 窄屏/键盘遮挡/长文本 UI 测试补强；偏好设置账号级持久化 |
| P3 | 真实学习闭环数据流动 + 跨端一致性回归 |
| P4 | Token 安全存储（Keystore/Keychain，非 Preferences）、正式身份体系、真实 LLM 分场景统计、签名构建 |
