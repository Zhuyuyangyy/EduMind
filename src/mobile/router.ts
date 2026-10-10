import { createRouter, createWebHashHistory } from 'vue-router'
import MobileLogin from './views/MobileLogin.vue'
import MobileToday from './views/MobileToday.vue'
import MobileTutor from './views/MobileTutor.vue'
import MobileGrowth from './views/MobileGrowth.vue'
import MobileProfile from './views/MobileProfile.vue'
import MobileDiagnose from './views/MobileDiagnose.vue'
import { getAuthSession } from '@/lib/auth'

// Capacitor 与本地预览都用 hash 路由：file/capacitor 源下没有服务端重写
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/today' },
    { path: '/login', name: 'login', component: MobileLogin, meta: { public: true, title: '登录' } },
    { path: '/today', name: 'today', component: MobileToday, meta: { title: '今日学习' } },
    { path: '/tutor', name: 'tutor', component: MobileTutor, meta: { title: 'AI 导师' } },
    { path: '/growth', name: 'growth', component: MobileGrowth, meta: { title: '学习成长' } },
    { path: '/profile', name: 'profile', component: MobileProfile, meta: { title: '我的' } },
    { path: '/diagnose', name: 'diagnose', component: MobileDiagnose, meta: { title: '学习自评' } },
    // P1 旧路由兼容：/status 并入「我的」
    { path: '/status', redirect: '/profile' },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach(to => {
  // 客户端守卫只做体验兜底；真正的准入在服务端会话（401 会被打回登录页）
  if (to.meta.public) return true
  if (!getAuthSession()) return { path: '/login', query: { redirect: to.fullPath } }
  return true
})

export default router
