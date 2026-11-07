# EduMind 移动端轻盈原生动效设计

## 目标

让首页、学习工作台和移动端导航切换更顺滑，同时保持学习数据、路由、请求和提交行为立即可用。

## 设计

- 页面切换沿用 AppMobile 的 Vue transition，使用 180–240ms 的 opacity 与 translateY 转场，离场更短，避免等待业务状态。
- 首页 Widget、学习任务、快捷入口使用一次性错峰进入，只使用 opacity 与 transform，不改变布局尺寸。
- 底部导航给当前项增加轻微滑入的活动标记，保留 44px 以上触控区域和明显 focus 状态。
- 按钮与卡片使用 :active 的轻微压下反馈；hover 只在支持 hover 的精确指针设备生效。
- prefers-reduced-motion 下关闭错峰和位移动效，内容和状态保持可读。
- 不引入新的动效依赖，不修改业务数据流、路由、API 和持久化逻辑。

## 验证

- npm run build:mobile
- npm run test:mobile-onboarding（16 项）
- 390px、768px、1440px 截图检查
- reduced-motion 下确认内容直接呈现
