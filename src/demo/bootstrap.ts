/**
 * 竞赛演示模式引导（无登录公网演示）
 *
 * 1. 种子会话：原版 Web 端路由守卫只校验 localStorage 会话，
 *    未登录时自动写入演示学员会话，评委打开即用；
 * 2. 本地 API 模拟：拦截 /api/* 请求返回演示数据，
 *    未覆盖的端点返回 404（触发原版视图自带的本地回退，不报错、不卡死）；
 * 3. 重置演示：清除会话与学习状态，恢复初始演示。
 */
import { getAuthSession, setAuthSession, clearAuthSession } from '../lib/auth.ts'

const DEMO_ACCOUNT = 'demo-reviewer'
/** 原版新手引导（NewUserPetGuide）的关闭标记：演示模式预置关闭，评委直接进入产品 */
const GUIDE_DISMISSED_KEY = 'edumind-new-user-pet-guide-dismissed'
/** 原版应用设置的存储键：演示模式预置关闭 Live2D 桌宠（其模型资源未随竞赛版分发，且移动端会遮挡内容） */
const APP_SETTINGS_KEY = 'app-settings'

export function bootstrapDemoSession(): void {
  if (typeof window === 'undefined') return
  if (getAuthSession()) return
  setAuthSession({
    role: 'student',
    name: '演示学员',
    account: DEMO_ACCOUNT,
    loginAt: new Date().toISOString()
  })
  try {
    // 竞赛流程以「学习诊断」为起点，预置关闭原版新手引导
    window.localStorage.setItem(GUIDE_DISMISSED_KEY, '1')
    // 预置关闭 Live2D 桌宠（模型资源未分发；移动端浮动 canvas 会遮挡底部操作）
    const raw = window.localStorage.getItem(APP_SETTINGS_KEY)
    const settings = raw ? JSON.parse(raw) : {}
    window.localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify({ ...settings, desktopPetEnabled: false }))
  } catch {
    /* 隐私模式：忽略 */
  }
}

export function resetDemoSession(): void {
  clearAuthSession()
  bootstrapDemoSession()
}
