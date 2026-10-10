import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './AppMobile.vue'
import { restoreAuthSession } from '@/lib/auth'
import './styles.css'

// 标记移动端入口：共享代码（如 api.ts 的 401 跳转）据此选择 hash 路由
;(window as unknown as { __EDUMIND_MOBILE__?: boolean }).__EDUMIND_MOBILE__ = true

const app = createApp(App)
app.use(createPinia())
app.use(router)

// 启动时用服务端会话校验本地登录态，失效则清空重登
restoreAuthSession().finally(() => {
  app.mount('#app')
})
