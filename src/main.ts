import { createApp } from 'vue'
import { MotionPlugin } from '@vueuse/motion'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { restoreAuthSession } from './lib/auth'
import './assets/styles/global.css'
import './assets/styles/_tailwind.css'
import './assets/styles/universe-learning.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(MotionPlugin)

// 启动时用服务端会话校验本地登录态：失效（过期/服务端重启/伪造）则清除并回到登录页
restoreAuthSession().finally(() => {
  app.mount('#app')
})
