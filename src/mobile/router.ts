import { createRouter, createWebHashHistory } from 'vue-router'
import MobileLogin from './views/MobileLogin.vue'
import MobileTutor from './views/MobileTutor.vue'
import MobileStatus from './views/MobileStatus.vue'
import { getAuthSession } from '@/lib/auth'

// Capacitor 与本地预览都用 hash 路由：file/capacitor 源下没有服务端重写
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/tutor' },
    { path: '/login', name: 'login', component: MobileLogin, meta: { public: true } },
    { path: '/tutor', name: 'tutor', component: MobileTutor },
    { path: '/status', name: 'status', component: MobileStatus },
  ],
})

router.beforeEach(to => {
  // 客户端守卫只做体验兜底；真正的准入在服务端会话（401 会被打回登录页）
  if (to.meta.public) return true
  if (!getAuthSession()) return { path: '/login', query: { redirect: to.fullPath } }
  return true
})

export default router
