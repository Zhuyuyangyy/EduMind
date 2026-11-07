import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './AppMobile.vue'
import { restoreAuthSession, migrateLegacyCredentials } from '@/lib/auth'
import './styles.css'
import './styles/refinement.css'

// 标记移动端入口：共享代码（如 api.ts 的 401 跳转）据此选择 hash 路由
;(window as unknown as { __EDUMIND_MOBILE__?: boolean }).__EDUMIND_MOBILE__ = true
// 首屏先使用已确认的浅色 Apple 风格，账号级偏好加载后再由 AppMobile 同步。
document.documentElement.dataset.mobileTheme = 'light'

// 构建模式标记（P4-2A）：跨域 Web 调试桥接仅开发构建可用，
// 跨域 E2E 据此自检（生产构建跑跨域场景会命中拒绝存储）
;(window as unknown as { __EDUMIND_PROD_BUILD__?: boolean }).__EDUMIND_PROD_BUILD__ = import.meta.env.PROD === true

const app = createApp(App)
app.use(createPinia())
app.use(router)

// 启动：先清理遗留明文 token，再用服务端会话校验本地登录态，失效则清空重登
migrateLegacyCredentials()
  .catch(() => { /* ignore */ })
  .finally(() => {
    restoreAuthSession().finally(() => {
      app.mount('#app')
    })
  })
