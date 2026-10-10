# EduMind Mobile P1 — Android 最小原型

分支：`feat/mobile-v1`（基线 `b29f727` 之后）
状态：**原型完成，未合入 main**。本文记录构建方式、API 配置、验证结果与遗留问题。

## 1. 架构与边界

- **双入口**：网页版 `index.html` → `src/main.ts`（原样未动）；移动端 `mobile.html` → `src/mobile/main.ts`（新增）。
  两套入口共享 `src/lib/`（api / auth / api-config）与 `src/types/`，互不影响。
- **独立产物**：`MOBILE_BUILD=1 vite build` 只打包移动端入口到 `dist-mobile/`（约 112 KB JS + 5.7 KB CSS，
  不包含任何 3D / Live2D / public 大资源）；网页版产物仍在 `dist/`。
- **Capacitor 7**：`android/` 工程已入库（`appId=com.zhixuexingshu.mobile`，appName=智学星枢），
  `webDir=dist-mobile`，`androidScheme=https`（WebView 源 `https://localhost` 已在服务端 CORS 白名单）。
- **路由**：移动端用 hash 路由（Capacitor 文件源下无服务端重写）；网页版仍是 history 路由，未改。
- **不重写**：Vue 3 前端未迁移 React Native；原有路由、页面、实验脚本、后端 API 全部保持兼容。

## 2. 构建与运行

```powershell
# 1. 安装依赖（含 Capacitor）
npm ci

# 2. 构建移动端 Web 产物（自动重命名 mobile.html -> index.html）
npm run build:mobile

# 3. 同步进 Android 工程（拷贝资源 + 更新插件）
npm run cap:sync

# 4. 构建 Debug APK（需 ANDROID_HOME 与 JDK 17+）
npm run android:build
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

浏览器内验证移动端逻辑（不经过原生壳）：

```powershell
# 终端 1：API 服务器
npm run server
# 终端 2：静态服务 + /api 代理（5174）
node scripts/serve-mobile.mjs
# 终端 3：E2E（无头 Chromium 驱动生产包）
node scripts/mobile-e2e.mjs
```

## 3. API 配置（移动端关键）

移动端 WebView 的源是 `capacitor://localhost` / `https://localhost`，**相对路径 `/api` 会打到 App 自身**，
必须配置绝对地址。三级优先级（`src/lib/api-config.ts`）：

| 优先级 | 来源 | 说明 |
|---|---|---|
| 1 | 设置页「状态 → API 地址」 | 运行时切换，存 localStorage（`edumind-api-base`），保存后立即重新检测 |
| 2 | 构建时环境变量 `VITE_API_BASE_URL` | 写进 `.env`，如 `https://yx.shushubiye.fun` |
| 3 | 空值 | 相对路径，仅网页版同源代理可用 |

- 请求一律带 `Authorization: Bearer <token>`（登录响应返回）+ `credentials: 'include'`（Cookie 双通道）。
- 401 自动清本地会话并跳登录页（移动端 `#/login`，网页版 `/login`）。
- 统一 60 秒超时（`VITE_API_TIMEOUT_MS` 可覆盖），超时/断网/500 等在 UI 上有明确中文反馈
  （`src/mobile/errors.ts`）。
- 服务端 CORS 白名单默认已放行 `https://localhost`（Android）与 `capacitor://localhost`（iOS）。

**Token 存储风险（原型阶段已知）**：Bearer token 目前存 localStorage，WebView 内存在 XSS 敞口。
正式版需迁移 Capacitor Preferences + Keychain/Keystore，已列入遗留问题。

## 4. 验证结果（全部真实执行）

| 验证项 | 结果 |
|---|---|
| `npm test` | **36/36**（P0.3 新增：协作看板账号边界、未处理 Promise rejection 移除、交错并发 trace 隔离） |
| `vue-tsc --noEmit` | 0 错（含移动端代码；修复了 TutoringReply 类型缺字段） |
| `npm run build`（网页版） | 通过（54s，产物 dist/） |
| `npm run build:mobile` | 通过（dist-mobile 共 121KB，3 个文件） |
| `npm run experiment:anomaly` | 全部断言通过 |
| `npm run experiment:learning-cycle` | 3/3 案例，15/15 检查，passRate=1 |
| Android Debug 构建 | **APK 已产出**：`android/app/build/outputs/apk/debug/app-debug.apk`（4.1MB，JDK 24 + SDK 35） |
| APK 内容核验 | aapt2 badging：package=com.zhixuexingshu.mobile，label=智学星枢，assets/public 含移动端 bundle，INTERNET 权限 ✓ |
| 移动端 E2E（`scripts/mobile-e2e.mjs`） | **7/7**：A 未登录拦截 / B 登录 / C AI 提问（81 字符回答 + 降级徽标准确显示）/ D 状态页 / E 退出 / F 会话失效 401 打回登录 / G 网络不可达清晰报错 |

E2E 用无头 Chromium（CDP）驱动**移动端生产包**完成，非单元模拟。

### 未验证项（如实标注）

- **Android 模拟器 / 真机安装运行**：本机无模拟器镜像、无连接的物理设备（`adb devices` 无输出），
  APK 未经真机安装验证。APK 本身构建与内容校验通过。
- **iOS**：未开始（无 macOS 构建环境）。
- **真实 LLM 链路**：本机未配置 `LLM_API_KEY`，AI 回答走规则降级（E2E 中降级徽标按预期显示）；
  降级标记的真实性由服务端 trace 测试覆盖（P0.3）。

## 5. Web 兼容性报告

| 检查 | 结果 |
|---|---|
| 网页版全部 36 项测试 | 通过（与移动端改造前同一基线） |
| 网页版构建 | 通过；`dist/` 产物与移动端构建相互独立 |
| 共享代码改动 | `src/lib/api.ts`（Base URL 前缀 + 超时 + 401 跳转按端分流）、`src/lib/api-config.ts`（新增）、`src/types/api.ts`（补 TutoringReply 字段）、`vite.config.ts`（双入口/双产物） |
| 网页版行为 | Base URL 为空时请求路径与改造前完全一致（相对 `/api`），同源代理行为不变 |
| 后端 API | 未删除/未修改任何既有接口契约；实验脚本全部通过 |

## 6. 遗留问题与下一阶段（P2 候选）

1. **Token 安全存储**：localStorage → Capacitor Preferences + Keychain/Keystore（正式版前置）。
2. **会话持久化**：服务端内存存储，重启需重登；MySQL 落库（多端同步前置）。
3. **真机验收**：模拟器/真机安装、冷启动时间、弱网表现。
4. **移动端 UI 设计语言**：P1 为功能优先的最小界面；P2 做独立设计语言（可借鉴 daily-zero-decision 的轻量体验，不搬 React 代码）。
5. **3D/Live2D 不进核心流程**：网页版 Evaluation chunk 4MB 的问题在移动端已天然规避（不加载）。
6. **环境适配记录**：`android/gradle/wrapper/gradle-wrapper.properties` 的 Gradle 发行版指向 8.14.3
   （本机缓存版本；原模板为 8.11.1，两者均兼容 Capacitor 7）。

## 7. 环境备注（本机构建要点）

- JDK：`/d/Java/jdk-24`（Capacitor 7 的 capacitor-android 要求 source release 21，JDK 17 不够）。
- Android SDK：`/d/android-sdk`（platforms 35、build-tools 35.0.0）。
- 构建命令示例：
  `cd android && JAVA_HOME=/d/Java/jdk-24 ANDROID_HOME=/d/android-sdk ./gradlew assembleDebug --no-daemon`
- 本环境 safe-delete 沙箱会在清空 dist/ 时超时，构建脚本已用「先 mv 走旧产物」规避
  （`scripts/build.mjs`、`scripts/build-mobile.mjs`）。
