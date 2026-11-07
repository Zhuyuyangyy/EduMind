import { createRouter, createWebHistory } from 'vue-router'
import { getAuthSession } from '@/lib/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/login',
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/Login.vue'),
      meta: { public: true },
    },
    {
      path: '/home',
      name: 'welcome',
      component: () => import('@/views/Welcome.vue'),
    },
    // —— 竞赛演示闭环（无登录公网演示） ——
    {
      path: '/diagnosis',
      name: 'diagnosis',
      component: () => import('@/views/DiagnosisQuiz.vue'),
      meta: { title: '学习诊断' },
    },
    {
      path: '/knowledge-profile',
      name: 'knowledge-profile',
      component: () => import('@/views/KnowledgeProfile.vue'),
      meta: { title: '知识画像' },
    },
    {
      path: '/plan',
      name: 'plan',
      component: () => import('@/views/LearningPlan.vue'),
      meta: { title: '学习计划' },
    },
    {
      path: '/practice/:kpId',
      name: 'practice',
      component: () => import('@/views/TargetedPractice.vue'),
      meta: { title: '针对性练习' },
    },
    {
      path: '/practice',
      redirect: '/practice/py-basics',
    },
    {
      path: '/report',
      name: 'report',
      component: () => import('@/views/LearningReport.vue'),
      meta: { title: '学习报告' },
    },
    {
      path: '/admin',
      name: 'admin-dashboard',
      component: () => import('@/views/AdminDashboard.vue'),
      meta: { requiresAdmin: true },
    },
    {
      path: '/dialogue',
      name: 'dialogue',
      component: () => import('@/views/DialoguePage.vue'),
    },
    {
      path: '/chat',
      redirect: '/dialogue',
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/Profile.vue'),
    },
    {
      path: '/learning-path',
      name: 'learning-path',
      component: () => import('@/views/LearningPath.vue'),
    },
    {
      path: '/evaluation',
      name: 'evaluation',
      component: () => import('@/views/Evaluation.vue'),
    },
    {
      path: '/reverse-evaluation',
      name: 'reverse-evaluation',
      component: () => import('@/views/ReverseEvaluation.vue'),
    },
    {
      path: '/knowledge-base',
      redirect: '/reverse-evaluation',
    },
    {
      path: '/tutoring',
      name: 'tutoring',
      component: () => import('@/views/Tutoring.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/Settings.vue'),
    },
    {
      path: '/edu-mind',
      name: 'edu-mind',
      component: () => import('@/views/EduMind.vue'),
    },
    {
      path: '/resources',
      name: 'Resources',
      component: () => import('@/views/EduMind.vue'),
    },
    {
      path: '/universe',
      redirect: '/learning-path',
    },
    {
      path: '/trainflow',
      name: 'trainflow',
      component: () => import('@/views/TrainFlow.vue'),
    },
  ],
})

router.beforeEach((to) => {
  const session = getAuthSession()

  // 演示模式：已登录（含种子会话）时根路径直达首页
  if (to.path === '/' && session) {
    return session.role === 'admin' ? '/admin' : '/home'
  }

  if (to.meta.public) {
    if (!session) return true
    return session.role === 'admin' ? '/admin' : '/home'
  }

  if (!session) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (to.meta.requiresAdmin && session.role !== 'admin') {
    return '/home'
  }

  return true
})

export default router
