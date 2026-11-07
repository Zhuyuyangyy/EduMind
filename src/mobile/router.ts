import { createRouter, createWebHashHistory } from 'vue-router'
import MobileLogin from './views/MobileLogin.vue'
import MobileToday from './views/MobileToday.vue'
import MobileTutor from './views/MobileTutor.vue'
import MobileGrowth from './views/MobileGrowth.vue'
import MobileProfile from './views/MobileProfile.vue'
import MobileDiagnose from './views/MobileDiagnose.vue'
import MobilePractice from './views/MobilePractice.vue'
import MobileResult from './views/MobileResult.vue'
import MobileLearn from './views/MobileLearn.vue'
import MobileAgent from './views/MobileAgent.vue'
import MobileAtlas from './views/MobileAtlas.vue'
import MobileWorkspace from './views/MobileWorkspace.vue'
import MobileReview from './views/MobileReview.vue'
import MobileLibrary from './views/MobileLibrary.vue'
import MobilePet from './views/MobilePet.vue'
import MobileDashboard from './views/MobileDashboard.vue'
import MobileFocus from './views/MobileFocus.vue'
import MobileLearningHub from './views/MobileLearningHub.vue'
import MobileConstellation from './views/MobileConstellation.vue'
import MobileSelfTest from './views/MobileSelfTest.vue'
import { getAuthSession } from '@/lib/auth'

// Capacitor 与本地预览都用 hash 路由：file/capacitor 源下没有服务端重写
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/today' },
    { path: '/login', name: 'login', component: MobileLogin, meta: { public: true, title: '登录' } },
    { path: '/today', name: 'today', component: MobileDashboard, meta: { title: '首页' } },
    { path: '/today/classic', component: MobileToday, meta: { title: '经典学习视图' } },
    { path: '/tutor', name: 'tutor', component: MobileTutor, meta: { title: 'AI 导师' } },
    { path: '/growth', name: 'growth', component: MobileGrowth, meta: { title: '学习成长' } },
    { path: '/profile', name: 'profile', component: MobileProfile, meta: { title: '我的' } },
    { path: '/learn', component: MobileLearningHub, meta: { title: '学习' } },
    { path: '/learn/classic', component: MobileLearn, meta: { title: '经典学习工作台' } },
    { path: '/agent', component: MobileAgent, meta: { title: '星枢' } },
    { path: '/atlas', component: MobileConstellation, meta: { title: '星图' }, beforeEnter: to => typeof to.query.material==='string'?{path:'/library',query:to.query}:true },
    { path: '/atlas/classic', component: MobileAtlas, meta: { title: '经典资料视图' } },
    { path: '/library', component: MobileLibrary, meta: { title: '知识库' } },
    { path: '/pet', component: MobilePet, meta: { title: '我的星航伙伴' } },
    { path: '/self-test', component: MobileSelfTest, meta: { title: '本地多题型自测' } },
    { path: '/workspace', component: MobileWorkspace, meta: { title: '我的学习工作区' } },
    { path: '/focus', component: MobileFocus, meta: { title: '专注学习' } },
    { path: '/review', component: MobileReview, meta: { title: '错题与复习' } },
    { path: '/diagnose', name: 'diagnose', component: MobileDiagnose, meta: { title: '学习画像' } },
    { path: '/planning', name: 'planning', component: MobileDiagnose, meta: { title: '制定学习计划' } },
    { path: '/study/session/:sessionId', name: 'practice', component: MobilePractice, meta: { title: '练习' } },
    { path: '/study/session/:sessionId/result', name: 'result', component: MobileResult, meta: { title: '练习结果' } },
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
