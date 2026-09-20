<script setup lang="ts">
import { computed, onMounted, ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useTheme } from '../../composables/useEduMindTheme'
import { clearAuthSession, getAuthSession, setAuthSession } from '@/lib/auth'
import { fetchAccountSettings, saveAccountSettings } from '@/lib/api'
import {
  User,
  Bell,
  Palette,
  Shield,
  Globe,
  Monitor,
  ChevronRight,
  Volume2,
  VolumeX,
  Save,
  RotateCcw,
  CheckCircle,
  Camera,
  Mail,
  Phone,
  MapPin,
  BookOpen,
  Clock,
  Target,
  LogOut
} from 'lucide-vue-next'

const activeSection = ref<string>('profile')
const router = useRouter()
const { themeMode, isDark, setTheme } = useTheme()
const authSession = getAuthSession()
const accountName = authSession?.name || authSession?.account || '学习者'
const accountId = authSession?.account || 'student'
const accountRole = computed(() => authSession?.role === 'admin' ? '管理员' : '学习者')

const profileForm = reactive({
  nickname: '学习者',
  email: 'demo@zhixue.local',
  phone: '',
  bio: '热爱编程，专注计算机科学与软件工程领域的学习与探索。',
  location: '北京',
  school: '示例大学',
  studentId: 'DEMO-001'
})

profileForm.nickname = accountName
profileForm.email = `${accountId}@edumind.local`
profileForm.studentId = accountId

onMounted(async () => {
  if (!authSession) return
  try {
    const settings = await fetchAccountSettings(authSession.account)
    if (settings?.displayName) {
      profileForm.nickname = settings.displayName
      setAuthSession({ ...authSession, name: settings.displayName })
    }
  } catch {
    // Keep the current session display name when the API is unavailable.
  }
})

const studySettings = reactive({
  dailyGoalHours: 2,
  weeklyGoalHours: 12.5,
  reminderEnabled: true,
  reminderTime: '09:00',
  soundEnabled: true,
  autoSaveNotes: true,
  focusMode: false
})

const displaySettings = reactive({
  fontSize: 'medium' as 'small' | 'medium' | 'large',
  language: 'zh-CN',
  sidebarCollapsed: false,
  showProgress: true,
  animationEnabled: true
})

const notificationSettings = reactive({
  courseUpdate: true,
  exerciseReminder: true,
  systemNotice: true,
  weeklyReport: true,
  emailNotification: false
})

const toastMsg = ref<string | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null

const showToast = (msg: string) => {
  toastMsg.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = null }, 2500)
}

const handleSaveProfile = async () => {
  if (authSession) {
    const name = profileForm.nickname.trim() || authSession.account
    try {
      const settings = await saveAccountSettings(name)
      profileForm.nickname = settings.displayName
      setAuthSession({ ...authSession, name: settings.displayName })
    } catch {
      setAuthSession({ ...authSession, name })
    }
  }
  showToast('个人资料已保存')
}

const handleSaveStudy = () => {
  showToast('学习设置已保存')
}

const handleSaveDisplay = () => {
  showToast('显示设置已保存')
}

const handleSaveNotification = () => {
  showToast('通知设置已保存')
}

const handleResetAll = () => {
  showToast('所有设置已重置为默认值')
}

const handleLogout = () => {
  clearAuthSession()
  window.location.href = '/login'
}

const sections = [
  { id: 'profile', name: '个人资料', icon: User },
  { id: 'study', name: '学习偏好', icon: Target },
  { id: 'display', name: '显示外观', icon: Palette },
  { id: 'notification', name: '通知管理', icon: Bell },
  { id: 'security', name: '隐私安全', icon: Shield },
  { id: 'about', name: '关于平台', icon: Globe }
]
</script>

<template>
  <div class="flex flex-col gap-6">
    <Transition name="toast">
      <div
        v-if="toastMsg"
        class="fixed top-8 left-1/2 -translate-x-1/2 bg-[#4a6cf7] text-white px-6 py-3 rounded-2xl shadow-2xl z-50 text-[14px] font-semibold flex items-center gap-2"
      >
        <CheckCircle :size="16" class="text-emerald-300 shrink-0" />
        <span>{{ toastMsg }}</span>
      </div>
    </Transition>

    <div class="flex items-center justify-between bg-white dark:bg-[#1e293b] px-6 py-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
      <div>
        <div class="flex items-center gap-2">
          <span class="bg-[#4a6cf7]/10 text-[#4a6cf7] px-2.5 py-1 text-[13px] font-bold tracking-wide uppercase rounded-md">Settings</span>
        </div>
        <h2 class="text-[20px] font-extrabold text-[#1e293b] dark:text-white mt-1 tracking-tight">平台设置</h2>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div class="lg:col-span-3 bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
        <div class="p-5 border-b border-slate-100 dark:border-slate-700">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-full bg-gradient-to-br from-[#4a6cf7] to-[#6a8cff] flex items-center justify-center shrink-0 shadow-md">
              <User :size="22" class="text-white" />
            </div>
            <div class="leading-tight">
              <h3 class="text-[15px] font-bold text-[#1a1a2e] dark:text-white">{{ profileForm.nickname }}</h3>
              <p class="text-[13px] text-[#8c8c8c] dark:text-slate-500 mt-0.5">{{ accountRole }} · {{ accountId }}</p>
            </div>
          </div>
        </div>

        <nav class="p-2">
          <button
            v-for="sec in sections"
            :key="sec.id"
            @click="activeSection = sec.id"
            :class="[
              'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium cursor-pointer transition-all border-none',
              activeSection === sec.id
                ? 'bg-[#f0f4ff] dark:bg-[#4a6cf7]/15 text-[#4a6cf7] dark:text-[#6a8cff]'
                : 'text-[#595959] dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-[#1a1a2e] dark:hover:text-white'
            ]"
          >
            <component :is="sec.icon" :size="16" :class="activeSection === sec.id ? 'text-[#4a6cf7] dark:text-[#6a8cff]' : 'text-[#8c8c8c] dark:text-slate-500'" />
            <span>{{ sec.name }}</span>
            <ChevronRight v-if="activeSection === sec.id" :size="14" class="ml-auto text-[#4a6cf7] dark:text-[#6a8cff]" />
          </button>
        </nav>

        <div class="p-4 border-t border-slate-100 dark:border-slate-700">
          <button
            @click="handleLogout"
            class="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-[14px] font-semibold rounded-xl border border-transparent cursor-pointer transition-colors"
          >
            <LogOut :size="16" />
            <span>退出登录</span>
          </button>
        </div>
      </div>

      <div class="lg:col-span-9 flex flex-col gap-6">

        <div v-if="activeSection === 'profile'" class="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-6">
          <h3 class="text-[16px] font-bold text-[#1e293b] dark:text-white mb-1">个人资料</h3>
          <p class="text-[13px] text-slate-400 dark:text-slate-500 mb-6">管理您的账户信息与个人形象</p>

          <div class="flex items-center gap-5 mb-6 pb-6 border-b border-slate-100 dark:border-slate-700">
            <div class="relative group">
              <div class="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#4a6cf7] to-[#6a8cff] flex items-center justify-center shadow-lg">
                <User :size="36" class="text-white" />
              </div>
              <div class="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                <Camera :size="20" class="text-white" />
              </div>
            </div>
            <div>
              <h4 class="text-[15px] font-bold text-[#1a1a2e] dark:text-white">{{ profileForm.nickname }}</h4>
              <p class="text-[13px] text-slate-400 dark:text-slate-500 mt-0.5">点击头像更换个人形象</p>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label class="block text-[13px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">昵称</label>
              <div class="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5">
                <User :size="14" class="text-slate-400 dark:text-slate-500 shrink-0" />
                <input v-model="profileForm.nickname" type="text" class="flex-1 bg-transparent border-none outline-none text-[14px] text-slate-800 dark:text-white font-medium" />
              </div>
            </div>
            <div>
              <label class="block text-[13px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">邮箱</label>
              <div class="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5">
                <Mail :size="14" class="text-slate-400 dark:text-slate-500 shrink-0" />
                <input v-model="profileForm.email" type="email" class="flex-1 bg-transparent border-none outline-none text-[14px] text-slate-800 dark:text-white font-medium" />
              </div>
            </div>
            <div>
              <label class="block text-[13px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">手机号</label>
              <div class="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5">
                <Phone :size="14" class="text-slate-400 dark:text-slate-500 shrink-0" />
                <input v-model="profileForm.phone" type="tel" class="flex-1 bg-transparent border-none outline-none text-[14px] text-slate-800 dark:text-white font-medium" />
              </div>
            </div>
            <div>
              <label class="block text-[13px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">所在地</label>
              <div class="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5">
                <MapPin :size="14" class="text-slate-400 dark:text-slate-500 shrink-0" />
                <input v-model="profileForm.location" type="text" class="flex-1 bg-transparent border-none outline-none text-[14px] text-slate-800 dark:text-white font-medium" />
              </div>
            </div>
            <div>
              <label class="block text-[13px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">学校</label>
              <div class="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5">
                <BookOpen :size="14" class="text-slate-400 dark:text-slate-500 shrink-0" />
                <input v-model="profileForm.school" type="text" class="flex-1 bg-transparent border-none outline-none text-[14px] text-slate-800 dark:text-white font-medium" />
              </div>
            </div>
            <div>
              <label class="block text-[13px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">学号</label>
              <div class="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5">
                <Shield :size="14" class="text-slate-400 dark:text-slate-500 shrink-0" />
                <input v-model="profileForm.studentId" type="text" class="flex-1 bg-transparent border-none outline-none text-[14px] text-slate-800 dark:text-white font-medium" />
              </div>
            </div>
          </div>

          <div class="mt-5">
            <label class="block text-[13px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">个人简介</label>
            <textarea
              v-model="profileForm.bio"
              rows="3"
              class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-[14px] text-slate-800 dark:text-white font-medium outline-none resize-none focus:border-[#4a6cf7] focus:ring-1 focus:ring-[#4a6cf7] transition-all"
              placeholder="介绍一下自己..."
            />
          </div>

          <div class="flex justify-end mt-6">
            <button
              @click="handleSaveProfile"
              class="flex items-center gap-2 px-5 py-2.5 bg-[#4a6cf7] hover:bg-[#3555db] text-white text-[14px] font-semibold rounded-xl shadow-sm border-none cursor-pointer transition-colors"
            >
              <Save :size="15" />
              <span>保存资料</span>
            </button>
          </div>
        </div>

        <div v-if="activeSection === 'study'" class="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-6">
          <h3 class="text-[16px] font-bold text-[#1e293b] dark:text-white mb-1">学习偏好</h3>
          <p class="text-[13px] text-slate-400 dark:text-slate-500 mb-6">自定义您的学习目标与习惯</p>

          <div class="flex flex-col gap-5">
            <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Clock :size="18" class="text-blue-600" />
                </div>
                <div>
                  <h4 class="text-[14px] font-bold text-slate-800 dark:text-slate-200">每日学习目标</h4>
                  <p class="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5">设定每天的学习时长</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <input v-model.number="studySettings.dailyGoalHours" type="number" min="0.5" max="12" step="0.5" class="w-16 text-center bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-[14px] font-bold text-slate-800 dark:text-white outline-none focus:border-[#4a6cf7]" />
                <span class="text-[13px] text-slate-500 dark:text-slate-400 font-medium">小时</span>
              </div>
            </div>

            <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <Target :size="18" class="text-emerald-600" />
                </div>
                <div>
                  <h4 class="text-[14px] font-bold text-slate-800 dark:text-slate-200">每周学习目标</h4>
                  <p class="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5">设定每周的学习时长</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <input v-model.number="studySettings.weeklyGoalHours" type="number" min="1" max="60" step="0.5" class="w-16 text-center bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-[14px] font-bold text-slate-800 dark:text-white outline-none focus:border-[#4a6cf7]" />
                <span class="text-[13px] text-slate-500 dark:text-slate-400 font-medium">小时</span>
              </div>
            </div>

            <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Bell :size="18" class="text-amber-600" />
                </div>
                <div>
                  <h4 class="text-[14px] font-bold text-slate-800 dark:text-slate-200">学习提醒</h4>
                  <p class="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5">每日定时提醒您开始学习</p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <input v-model="studySettings.reminderTime" type="time" class="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-[14px] font-bold text-slate-800 dark:text-white outline-none focus:border-[#4a6cf7]" />
                <button
                  @click="studySettings.reminderEnabled = !studySettings.reminderEnabled"
                  :class="[
                    'relative w-11 h-6 rounded-full transition-colors cursor-pointer border-none',
                    studySettings.reminderEnabled ? 'bg-[#4a6cf7]' : 'bg-slate-300'
                  ]"
                >
                  <span :class="['absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform', studySettings.reminderEnabled ? 'left-[22px]' : 'left-0.5']" />
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center">
                  <component :is="studySettings.soundEnabled ? Volume2 : VolumeX" :size="18" class="text-purple-600" />
                </div>
                <div>
                  <h4 class="text-[14px] font-bold text-slate-800 dark:text-slate-200">提示音效</h4>
                  <p class="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5">操作反馈与完成提示音</p>
                </div>
              </div>
              <button
                @click="studySettings.soundEnabled = !studySettings.soundEnabled"
                :class="[
                  'relative w-11 h-6 rounded-full transition-colors cursor-pointer border-none',
                  studySettings.soundEnabled ? 'bg-[#4a6cf7]' : 'bg-slate-300'
                ]"
              >
                <span :class="['absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform', studySettings.soundEnabled ? 'left-[22px]' : 'left-0.5']" />
              </button>
            </div>

            <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 bg-rose-100 rounded-lg flex items-center justify-center">
                  <Save :size="18" class="text-rose-600" />
                </div>
                <div>
                  <h4 class="text-[14px] font-bold text-slate-800 dark:text-slate-200">自动保存笔记</h4>
                  <p class="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5">编辑笔记时自动保存内容</p>
                </div>
              </div>
              <button
                @click="studySettings.autoSaveNotes = !studySettings.autoSaveNotes"
                :class="[
                  'relative w-11 h-6 rounded-full transition-colors cursor-pointer border-none',
                  studySettings.autoSaveNotes ? 'bg-[#4a6cf7]' : 'bg-slate-300'
                ]"
              >
                <span :class="['absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform', studySettings.autoSaveNotes ? 'left-[22px]' : 'left-0.5']" />
              </button>
            </div>

            <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 bg-cyan-100 rounded-lg flex items-center justify-center">
                  <Monitor :size="18" class="text-cyan-600" />
                </div>
                <div>
                  <h4 class="text-[14px] font-bold text-slate-800 dark:text-slate-200">专注模式</h4>
                  <p class="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5">隐藏侧边栏与通知，沉浸式学习</p>
                </div>
              </div>
              <button
                @click="studySettings.focusMode = !studySettings.focusMode"
                :class="[
                  'relative w-11 h-6 rounded-full transition-colors cursor-pointer border-none',
                  studySettings.focusMode ? 'bg-[#4a6cf7]' : 'bg-slate-300'
                ]"
              >
                <span :class="['absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform', studySettings.focusMode ? 'left-[22px]' : 'left-0.5']" />
              </button>
            </div>
          </div>

          <div class="flex justify-end mt-6">
            <button
              @click="handleSaveStudy"
              class="flex items-center gap-2 px-5 py-2.5 bg-[#4a6cf7] hover:bg-[#3555db] text-white text-[14px] font-semibold rounded-xl shadow-sm border-none cursor-pointer transition-colors"
            >
              <Save :size="15" />
              <span>保存设置</span>
            </button>
          </div>
        </div>

        <div v-if="activeSection === 'display'" class="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-6">
          <h3 class="text-[16px] font-bold text-[#1e293b] dark:text-white mb-1">显示外观</h3>
          <p class="text-[13px] text-slate-400 dark:text-slate-500 mb-6">自定义平台的视觉呈现方式</p>

          <div class="flex flex-col gap-5">
            <div>
              <label class="block text-[13px] font-semibold text-slate-400 mb-2.5">字体大小</label>
              <div class="grid grid-cols-3 gap-3">
                <button
                  v-for="opt in ([{ val: 'small' as const, label: '小', sample: '13px' }, { val: 'medium' as const, label: '中', sample: '15px' }, { val: 'large' as const, label: '大', sample: '17px' }])"
                  :key="opt.val"
                  @click="displaySettings.fontSize = opt.val"
                  :class="[
                    'flex flex-col items-center gap-1 p-4 rounded-xl border-2 cursor-pointer transition-all',
                    displaySettings.fontSize === opt.val
                      ? 'border-[#4a6cf7] bg-[#f0f4ff] dark:bg-[#4a6cf7]/15'
                      : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-[#1e293b] hover:border-slate-300 dark:hover:border-slate-500'
                  ]"
                >
                  <span :style="{ fontSize: opt.sample }" class="font-bold text-slate-700 dark:text-slate-200">Aa</span>
                  <span :class="['text-[12px] font-bold', displaySettings.fontSize === opt.val ? 'text-[#4a6cf7] dark:text-[#6a8cff]' : 'text-slate-500 dark:text-slate-400']">{{ opt.label }}</span>
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
              <div>
                <h4 class="text-[14px] font-bold text-slate-800 dark:text-slate-200">显示学习进度</h4>
                <p class="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5">在侧边栏显示学习进度条</p>
              </div>
              <button
                @click="displaySettings.showProgress = !displaySettings.showProgress"
                :class="[
                  'relative w-11 h-6 rounded-full transition-colors cursor-pointer border-none',
                  displaySettings.showProgress ? 'bg-[#4a6cf7]' : 'bg-slate-300'
                ]"
              >
                <span :class="['absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform', displaySettings.showProgress ? 'left-[22px]' : 'left-0.5']" />
              </button>
            </div>

            <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
              <div>
                <h4 class="text-[14px] font-bold text-slate-800 dark:text-slate-200">界面动画</h4>
                <p class="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5">启用页面切换与交互动画效果</p>
              </div>
              <button
                @click="displaySettings.animationEnabled = !displaySettings.animationEnabled"
                :class="[
                  'relative w-11 h-6 rounded-full transition-colors cursor-pointer border-none',
                  displaySettings.animationEnabled ? 'bg-[#4a6cf7]' : 'bg-slate-300'
                ]"
              >
                <span :class="['absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform', displaySettings.animationEnabled ? 'left-[22px]' : 'left-0.5']" />
              </button>
            </div>
          </div>

          <div class="flex justify-end mt-6">
            <button
              @click="handleSaveDisplay"
              class="flex items-center gap-2 px-5 py-2.5 bg-[#4a6cf7] hover:bg-[#3555db] text-white text-[14px] font-semibold rounded-xl shadow-sm border-none cursor-pointer transition-colors"
            >
              <Save :size="15" />
              <span>保存设置</span>
            </button>
          </div>
        </div>

        <div v-if="activeSection === 'notification'" class="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-6">
          <h3 class="text-[16px] font-bold text-[#1e293b] dark:text-white mb-1">通知管理</h3>
          <p class="text-[13px] text-slate-400 dark:text-slate-500 mb-6">控制平台向您推送的通知类型</p>

          <div class="flex flex-col gap-4">
            <div
              v-for="item in ([
                { key: 'courseUpdate' as const, label: '课程更新通知', desc: '课程内容更新、新章节发布时通知您', color: 'bg-blue-100 text-blue-600' },
                { key: 'exerciseReminder' as const, label: '练习提醒', desc: '每日练习任务与截止日期提醒', color: 'bg-emerald-100 text-emerald-600' },
                { key: 'systemNotice' as const, label: '系统公告', desc: '平台维护、功能更新等重要通知', color: 'bg-amber-100 text-amber-600' },
                { key: 'weeklyReport' as const, label: '学习周报', desc: '每周学习数据统计与进度报告', color: 'bg-purple-100 text-purple-600' },
                { key: 'emailNotification' as const, label: '邮件通知', desc: '将重要通知同步发送至您的邮箱', color: 'bg-rose-100 text-rose-600' }
              ])"
              :key="item.key"
              class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700"
            >
              <div class="flex items-center gap-3">
                <div :class="['w-9 h-9 rounded-lg flex items-center justify-center', item.color]">
                  <Bell :size="18" />
                </div>
                <div>
                  <h4 class="text-[14px] font-bold text-slate-800 dark:text-slate-200">{{ item.label }}</h4>
                  <p class="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5">{{ item.desc }}</p>
                </div>
              </div>
              <button
                @click="notificationSettings[item.key] = !notificationSettings[item.key]"
                :class="[
                  'relative w-11 h-6 rounded-full transition-colors cursor-pointer border-none',
                  notificationSettings[item.key] ? 'bg-[#4a6cf7]' : 'bg-slate-300'
                ]"
              >
                <span :class="['absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform', notificationSettings[item.key] ? 'left-[22px]' : 'left-0.5']" />
              </button>
            </div>
          </div>

          <div class="flex justify-end mt-6">
            <button
              @click="handleSaveNotification"
              class="flex items-center gap-2 px-5 py-2.5 bg-[#4a6cf7] hover:bg-[#3555db] text-white text-[14px] font-semibold rounded-xl shadow-sm border-none cursor-pointer transition-colors"
            >
              <Save :size="15" />
              <span>保存设置</span>
            </button>
          </div>
        </div>

        <div v-if="activeSection === 'security'" class="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-6">
          <h3 class="text-[16px] font-bold text-[#1e293b] dark:text-white mb-1">隐私安全</h3>
          <p class="text-[13px] text-slate-400 dark:text-slate-500 mb-6">保护您的账户安全与隐私数据</p>

          <div class="flex flex-col gap-5">
            <div class="p-5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
              <div class="flex items-center justify-between mb-4">
                <div>
                  <h4 class="text-[14px] font-bold text-slate-800 dark:text-slate-200">修改密码</h4>
                  <p class="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5">定期更换密码以保障账户安全</p>
                </div>
              </div>
              <div class="flex flex-col gap-3">
                <input type="password" placeholder="当前密码" class="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-[14px] text-slate-800 dark:text-white outline-none focus:border-[#4a6cf7] transition-all" />
                <input type="password" placeholder="新密码" class="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-[14px] text-slate-800 dark:text-white outline-none focus:border-[#4a6cf7] transition-all" />
                <input type="password" placeholder="确认新密码" class="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-[14px] text-slate-800 dark:text-white outline-none focus:border-[#4a6cf7] transition-all" />
              </div>
              <button class="mt-3 px-4 py-2 bg-[#4a6cf7] hover:bg-[#3555db] text-white text-[13px] font-semibold rounded-lg border-none cursor-pointer transition-colors">更新密码</button>
            </div>

            <div class="p-5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="text-[14px] font-bold text-slate-800 dark:text-slate-200">两步验证</h4>
                  <p class="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5">通过手机验证码增加额外安全层</p>
                </div>
                <span class="text-[12px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">已开启</span>
              </div>
            </div>

            <div class="p-5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="text-[14px] font-bold text-slate-800 dark:text-slate-200">登录设备管理</h4>
                  <p class="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5">查看和管理当前登录的设备</p>
                </div>
                <span class="text-[12px] font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-700 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600">2 台设备</span>
              </div>
            </div>

            <div class="p-5 bg-red-50/60 rounded-xl border border-red-100">
              <h4 class="text-[14px] font-bold text-red-700">危险操作</h4>
              <p class="text-[12px] text-red-400 mt-0.5 mb-3">以下操作不可逆，请谨慎执行</p>
              <div class="flex gap-3">
                <button class="px-4 py-2 text-red-600 hover:bg-red-100 text-[13px] font-semibold rounded-lg border border-red-200 cursor-pointer transition-colors bg-transparent">清除学习数据</button>
                <button class="px-4 py-2 text-red-600 hover:bg-red-100 text-[13px] font-semibold rounded-lg border border-red-200 cursor-pointer transition-colors bg-transparent">注销账户</button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="activeSection === 'about'" class="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-6">
          <h3 class="text-[16px] font-bold text-[#1e293b] dark:text-white mb-1">关于平台</h3>
      <p class="text-[13px] text-slate-400 dark:text-slate-500 mb-6">智学星枢智慧学习平台相关信息</p>

          <div class="flex flex-col gap-5">
            <div class="flex items-center gap-4 p-5 bg-gradient-to-r from-[#f0f4ff] dark:from-[#1e293b] to-white dark:to-[#0f172a] rounded-xl border border-[#dbe4ff] dark:border-slate-700">
              <div class="w-14 h-14 bg-gradient-to-br from-[#4a6cf7] to-[#6a8cff] rounded-2xl flex items-center justify-center shadow-lg shrink-0">
                <BookOpen :size="28" class="text-white" />
              </div>
              <div>
          <h4 class="text-[16px] font-extrabold text-[#1a1a2e] dark:text-white">智学星枢智慧学习平台</h4>
                <p class="text-[13px] text-slate-400 dark:text-slate-500 mt-0.5">版本 3.0.0 · 构建 20260526</p>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                <h4 class="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-2">平台信息</h4>
                <div class="flex flex-col gap-2 text-[13px]">
                  <div class="flex justify-between"><span class="text-slate-400 dark:text-slate-500">版本号</span><span class="text-slate-700 dark:text-slate-300 font-semibold">3.0.0</span></div>
                  <div class="flex justify-between"><span class="text-slate-400 dark:text-slate-500">发布日期</span><span class="text-slate-700 dark:text-slate-300 font-semibold">2026-05-26</span></div>
                  <div class="flex justify-between"><span class="text-slate-400 dark:text-slate-500">技术栈</span><span class="text-slate-700 dark:text-slate-300 font-semibold">Vue 3 + TypeScript</span></div>
                  <div class="flex justify-between"><span class="text-slate-400 dark:text-slate-500">UI 框架</span><span class="text-slate-700 dark:text-slate-300 font-semibold">Tailwind CSS v4</span></div>
                </div>
              </div>
              <div class="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                <h4 class="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-2">开发团队</h4>
                <div class="flex flex-col gap-2 text-[13px]">
        <div class="flex justify-between"><span class="text-slate-400 dark:text-slate-500">研发</span><span class="text-slate-700 dark:text-slate-300 font-semibold">智学星枢</span></div>
              <div class="flex justify-between"><span class="text-slate-400 dark:text-slate-500">联系方式</span><span class="text-slate-700 dark:text-slate-300 font-semibold">demo@zhixuexingshu.local</span></div>
                  <div class="flex justify-between"><span class="text-slate-400 dark:text-slate-500">许可证</span><span class="text-slate-700 dark:text-slate-300 font-semibold">MIT License</span></div>
                  <div class="flex justify-between"><span class="text-slate-400 dark:text-slate-500">仓库</span><span class="text-[#4a6cf7] dark:text-[#6a8cff] font-semibold">GitHub</span></div>
                </div>
              </div>
            </div>

            <div class="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
              <h4 class="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-2">功能模块</h4>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div v-for="mod in (['课程中心', '资源中心', '练习中心', '思维导图', '学习记录', '收藏夹', '笔记', '设置'])" :key="mod" class="flex items-center gap-1.5 text-[12px] text-slate-600 dark:text-slate-400">
                  <CheckCircle :size="12" class="text-emerald-500 shrink-0" />
                  <span>{{ mod }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.toast-enter-active {
  transition: all 0.25s ease-out;
}
.toast-leave-active {
  transition: all 0.2s ease-in;
}
.toast-enter-from {
  opacity: 0;
  transform: translate(-50%, -20px) scale(0.95);
}
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px) scale(0.95);
}
</style>
