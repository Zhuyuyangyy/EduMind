import { createApp } from 'vue'
import { MotionPlugin } from '@vueuse/motion'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { restoreAuthSession, migrateLegacyCredentials } from './lib/auth'
import './assets/styles/global.css'
import './assets/styles/_tailwind.css'
import './assets/styles/universe-learning.css'

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
