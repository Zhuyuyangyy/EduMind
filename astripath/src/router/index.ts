import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useLearningStore } from '../stores/learning.ts'

const HomeView = () => import('../views/HomeView.vue')
const CourseView = () => import('../views/CourseView.vue')
const DiagnosisView = () => import('../views/DiagnosisView.vue')
const ProfileView = () => import('../views/ProfileView.vue')
const PlanView = () => import('../views/PlanView.vue')
const TutorView = () => import('../views/TutorView.vue')
const PracticeView = () => import('../views/PracticeView.vue')
const ReportView = () => import('../views/ReportView.vue')

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: HomeView, meta: { title: '学习首页' } },
  { path: '/course', name: 'course', component: CourseView, meta: { title: '我的课程' } },
  { path: '/diagnosis', name: 'diagnosis', component: DiagnosisView, meta: { title: '学习诊断' } },
  { path: '/profile', name: 'profile', component: ProfileView, meta: { title: '知识画像' } },
  { path: '/plan', name: 'plan', component: PlanView, meta: { title: '学习计划' } },
  { path: '/tutor', name: 'tutor', component: TutorView, meta: { title: 'AI 导师' } },
  { path: '/practice/:kpId', name: 'practice', component: PracticeView, meta: { title: '针对性练习' } },
  { path: '/report', name: 'report', component: ReportView, meta: { title: '学习报告' } },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

export const router = createRouter({
  history: createWebHistory('/'),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

router.afterEach((to) => {
  const store = useLearningStore()
  store.touchRoute(String(to.meta.title ?? to.name ?? ''))
})

// 供视图复用的导航清单
export const NAV_ITEMS = [
  { path: '/', label: '学习首页', icon: 'home' as const },
  { path: '/course', label: '我的课程', icon: 'course' as const },
  { path: '/profile', label: '知识画像', icon: 'profile' as const },
  { path: '/plan', label: '学习计划', icon: 'plan' as const },
  { path: '/tutor', label: 'AI 导师', icon: 'tutor' as const },
  { path: '/report', label: '学习报告', icon: 'report' as const }
]
