# App 端品牌开屏设计

## 目标

启动 EduMind Mobile 时先展示一次品牌开屏，让用户点击“进入学习”后再进入登录页；已有有效会话的用户点击后直接进入首页。开屏承担品牌记忆，不改变现有登录与路由逻辑。

## 方案

- 在 `AppMobile.vue` 中增加启动态渲染分支，启动时显示 `MobileSplash`，完成点击后再渲染现有移动端壳层。
- 使用已有 `MobileOrbit` 资源作为星枢核心视觉，叠加 CSS 星轨、光晕和品牌文字，不新增视频或大图片资源。
- 动效分为星轨聚合、Logo 呼吸、文案淡入和 CTA 出现四段，整体约 1.8–2.2 秒；用户可随时点击 CTA 跳过等待。
- 点击后根据 `getAuthSession()` 选择 `/today` 或当前登录页；启动态仅保存在内存中，因此一次启动只展示一次。
- 在 `prefers-reduced-motion: reduce` 下取消长动画，保留静态层级和可操作按钮。

## 组件与数据流

1. `AppMobile.vue` 创建 `splashOpen` 状态。
2. `MobileSplash.vue` 发出 `enter` 事件。
3. App 收到事件后关闭开屏，再调用 `router.replace()`。
4. 登录页、服务端会话、守卫和已登录首页保持原有实现。

## 错误与边界

- 开屏资源加载失败时仍显示文字 Logo 和 CTA，不阻塞进入。
- 已登录会话失效时，跳转 `/today` 会由现有守卫回到登录页。
- 不通过 localStorage 写入启动标记，避免跨账号或跨会话残留状态。

## 验证

- 390×844：首屏显示开屏，点击 CTA 进入登录页。
- 390×844：设置有效会话后点击 CTA 进入 `/today`。
- `prefers-reduced-motion`：动画被压缩但按钮仍可用。
- `npm run build:mobile`：移动端类型检查和构建通过。
