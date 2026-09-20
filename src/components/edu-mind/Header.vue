<template>
  <header class="edu-header px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-30" id="main-header">
    <button
      @click="emit('toggleSidebar')"
      class="lg:hidden mr-3 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 cursor-pointer shrink-0 transition-all border-none"
      title="打开菜单"
    >
      <Menu class="w-5 h-5" />
    </button>

    <div class="leading-tight shrink-0 hidden">
      <h2 class="text-[15px] sm:text-[18px] font-semibold text-slate-800 dark:text-white">资源中心</h2>
      <p class="text-[13px] sm:text-[14px] text-slate-400 dark:text-slate-400 mt-0.5 hidden md:block">汇集平台所有学习材料，助力你的学习之旅</p>
    </div>

    <div class="edu-header__search flex items-center rounded-lg px-3 py-2 flex-1 max-w-[320px] sm:max-w-[420px] md:max-w-[520px] ml-2 focus-within:ring-2 transition-all duration-200" id="header-search-box">
      <Search class="w-4 h-4 text-slate-400 dark:text-slate-400 mr-1.5 sm:mr-2 shrink-0" />
      <input
        ref="searchInputRef"
        type="text"
        :value="props.searchValue"
        @input="emit('searchChange', ($event.target as HTMLInputElement).value)"
        placeholder="搜索资源..."
        class="border-none bg-transparent outline-none flex-1 text-[14px] sm:text-[15px] text-[#dce3ff] placeholder-[#586096] min-w-0"
      />
        <span class="bg-white/5 px-1.5 py-0.5 rounded text-[12px] text-[#a5b4d8] border border-white/10 font-mono select-none hidden md:inline-block" title="按下 ⌘K 或 Ctrl+K 聚焦搜索">
        ⌘ K
      </span>
    </div>

    <div class="flex items-center gap-4 ml-auto shrink-0">
      <button
        @click="emit('addNewResourceClick')"
        class="edu-icon-btn edu-icon-btn--primary flex items-center justify-center font-medium text-[14px] w-9 h-9 rounded-lg cursor-pointer active:transform active:scale-95 transition-all"
        id="add-resource-btn"
        title="新增资源"
      >
        <Plus class="w-4 h-4" />
      </button>

      <div class="relative">
        <button
          @click="showNotifications = !showNotifications"
          class="edu-icon-btn p-2 rounded-lg text-[#a5b4d8] hover:text-white transition-colors relative cursor-pointer"
          id="notification-trigger"
        >
          <Bell class="w-5 h-5" />
          <span
            v-if="unreadCount > 0"
            class="absolute top-1.5 right-1.5 min-w-[16px] h-4 bg-[#ff4d4f] text-white text-[12px] font-bold rounded-full flex items-center justify-center px-1 border border-white dark:border-slate-900"
          >
            {{ unreadCount }}
          </span>
        </button>

        <div
          v-if="showNotifications"
          class="absolute right-0 mt-2 w-80 bg-white dark:bg-[#1e293b] rounded-xl shadow-xl border border-[#e8e8e8] dark:border-slate-700/60 py-2 z-50 animate-fade-in"
          id="notification-dropdown"
        >
          <div class="flex justify-between items-center px-4 py-1.5 border-b border-[#e8e8e8] dark:border-slate-700/60 mb-1">
            <span class="text-[14px] font-semibold text-slate-800 dark:text-white">最新消息</span>
            <button
              v-if="notifications.length > 0"
              @click="clearAllNotifications"
              class="text-[13px] text-accent hover:underline"
            >
              全部清空
            </button>
          </div>

          <div class="max-h-64 overflow-y-auto">
            <div v-if="notifications.length === 0" class="py-6 text-center text-[14px] text-slate-400 dark:text-slate-400">
              暂无新消息通知
            </div>
            <div
              v-for="item in notifications"
              :key="item.id"
              @click="markNotificationAsRead(item.id)"
              :class="[
                'px-4 py-2.5 hover:bg-[#f8faff] dark:hover:bg-slate-800/60 cursor-pointer transition-colors border-b border-[#e8e8e8] dark:border-slate-700/60 flex gap-2.5 items-start',
                !item.read ? 'bg-[#f0f4ff]/40 dark:bg-slate-800' : ''
              ]"
            >
              <Info :class="['w-3.5 h-3.5 mt-0.5 shrink-0', !item.read ? 'text-accent' : 'text-slate-400 dark:text-slate-400']" />
              <div class="flex-1">
                <p :class="['text-[13px] leading-tight', !item.read ? 'text-slate-800 dark:text-white font-medium' : 'text-slate-500 dark:text-slate-400']">
                  {{ item.text }}
                </p>
                <span class="text-[11px] text-slate-400 dark:text-slate-500 mt-1 block">{{ item.time }}</span>
              </div>
              <span v-if="!item.read" class="w-1.5 h-1.5 rounded-full bg-[#00d4ff] mt-1.5"></span>
            </div>
          </div>
        </div>
      </div>

      <div class="relative">
        <div
          @click="showProfileMenu = !showProfileMenu"
          class="edu-profile-trigger flex items-center gap-1.5 p-1 rounded-lg cursor-pointer transition-colors shrink-0"
          id="user-profile-trigger"
        >
          <div class="w-[28px] h-[28px] rounded-full bg-slate-200 dark:bg-slate-600 overflow-hidden border border-slate-300 dark:border-slate-500">
            <img
              src="https://api.dicebear.com/7.x/avataaars/svg?seed=xiaoming"
              alt="avatar"
              class="w-full h-full object-cover"
              referrerpolicy="no-referrer"
            />
          </div>
          <span class="text-[15px] text-slate-500 dark:text-slate-400 font-medium hidden sm:inline">小明同学</span>
          <ChevronDown class="w-3.5 h-3.5 text-slate-400 dark:text-slate-400" />
        </div>

        <div
          v-if="showProfileMenu"
          class="absolute right-0 mt-2 w-48 bg-white dark:bg-[#1e293b] rounded-lg shadow-xl border border-[#e8e8e8] dark:border-slate-700/60 py-1 z-50 animate-fade-in"
          id="profile-dropdown"
        >
          <div class="px-4 py-2 border-b border-[#e8e8e8] dark:border-slate-700/60 mb-1">
            <p class="text-[14px] font-semibold text-slate-800 dark:text-white">学习者</p>
            <p class="text-[12px] text-slate-400 dark:text-slate-400">demo@zhixue.local</p>
          </div>
          <a href="#profile" class="block px-4 py-2 text-[14px] text-slate-500 dark:text-slate-400 hover:bg-[#f5f7fa] dark:hover:bg-slate-800">个人账户设置</a>
          <a href="#stats" class="block px-4 py-2 text-[14px] text-slate-500 dark:text-slate-400 hover:bg-[#f5f7fa] dark:hover:bg-slate-800">我的学习周报</a>
          <a href="#help" class="block px-4 py-2 text-[14px] text-slate-500 dark:text-slate-400 hover:bg-[#f5f7fa] dark:hover:bg-slate-800">获取帮助</a>
          <div class="border-t border-[#e8e8e8] dark:border-slate-700/60 mt-1"></div>
          <button
            @click="handleLogout"
            class="w-full text-left block px-4 py-2 text-[14px] text-red-500 hover:bg-red-50"
          >
            退出登录
          </button>
        </div>
      </div>

      <button class="edu-icon-btn hidden sm:grid place-items-center w-9 h-9 rounded-lg text-[#a5b4d8]" title="应用菜单">
        <LayoutGrid class="w-4 h-4" />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Bell, ChevronDown, Check, Info, Menu, Plus, LayoutGrid } from 'lucide-vue-next'
import { useTheme } from '../../composables/useEduMindTheme'
import { clearAuthSession } from '@/lib/auth'

const router = useRouter()

const { isDark } = useTheme()

interface Notification {
  id: number
  text: string
  read: boolean
  time: string
}

const props = defineProps<{
  searchValue: string
}>()

const emit = defineEmits<{
  searchChange: [val: string]
  addNewResourceClick: []
  toggleSidebar: []
}>()

const searchInputRef = ref<HTMLInputElement | null>(null)
const showNotifications = ref(false)
const notifications = ref<Notification[]>([
  { id: 1, text: '架构大师上线了《微服务设计指南最佳实践》文档', read: false, time: '10分钟前' },
  { id: 2, text: '你收藏的《Spring Boot 入门教程》视频已被系统标星推荐', read: false, time: '1小时前' },
  { id: 3, text: '恭喜！本周学习已满62%，距离达成目标更近一步', read: false, time: '3小时前' },
])
const showProfileMenu = ref(false)

const unreadCount = computed(() => notifications.value.filter(n => !n.read).length)

function handleKeyDown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    searchInputRef.value?.focus()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

function markNotificationAsRead(id: number) {
  notifications.value = notifications.value.map(n =>
    n.id === id ? { ...n, read: true } : n
  )
}

function clearAllNotifications() {
  notifications.value = []
}

function handleLogout() {
  clearAuthSession()
  window.location.href = '/login'
}
</script>

<style scoped>
.edu-header {
  background: rgba(7, 6, 10, 0.85);
  border-bottom: 1px solid rgba(59, 130, 246, 0.1);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
}

.edu-header__search {
  background: rgba(14, 12, 21, 0.7);
  border: 1px solid rgba(59, 130, 246, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 0 18px rgba(59, 130, 246, 0.05);
}

.edu-header__search:focus-within {
  border-color: rgba(59, 130, 246, 0.4);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1), 0 0 18px rgba(59, 130, 246, 0.1);
}

.edu-icon-btn {
  background: rgba(14, 12, 21, 0.7);
  border: 1px solid rgba(59, 130, 246, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.edu-icon-btn:hover {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.25);
  box-shadow: 0 0 18px rgba(59, 130, 246, 0.12);
}

.edu-icon-btn--primary {
  color: #fff;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  border-color: rgba(59, 130, 246, 0.35);
  box-shadow: 0 0 16px rgba(59, 130, 246, 0.2);
}

.edu-profile-trigger {
  background: rgba(14, 12, 21, 0.5);
  border: 1px solid transparent;
}

.edu-profile-trigger:hover {
  border-color: rgba(59, 130, 246, 0.18);
  background: rgba(59, 130, 246, 0.06);
}
</style>
