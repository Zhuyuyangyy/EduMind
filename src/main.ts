import { createApp } from 'vue'
import { MotionPlugin } from '@vueuse/motion'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { restoreAuthSession, migrateLegacyCredentials } from './lib/auth'
import './assets/styles/global.css'
import './assets/styles/_tailwind.css'
import './assets/styles/universe-learning.css'

// 构建模式标记（P4-2A）：跨域 Web 调试桥接仅开发构建可用，
// 跨域 E2E 据此自检（生产构建跑跨域场景会命中拒绝存储）
;(window as unknown as { __EDUMIND_PROD_BUILD__?: boolean }).__EDUMIND_PROD_BUILD__ = import.meta.env.PROD === true

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(MotionPlugin)

// 启动：先清理 P4-1C 之前的遗留明文 token，再用服务端会话校验本地登录态
// （失效则清除并回到登录页）
migrateLegacyCredentials()
  .catch(() => { /* ignore */ })
  .finally(() => {
    restoreAuthSession().finally(() => {
      app.mount('#app')
    })
  })
