<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAV_ITEMS } from './router/index.ts'
import { useLearningStore } from './stores/learning.ts'
import BrandMark from './components/BrandMark.vue'
import NavIcon from './components/NavIcon.vue'

const route = useRoute()
const router = useRouter()
const store = useLearningStore()
const drawerOpen = ref(false)

const isHome = computed(() => route.path === '/')

function confirmReset() {
  const ok = window.confirm('重置演示将清空当前所有学习记录（诊断、画像、计划、对话），恢复初始演示状态。确定继续？')
  if (!ok) return
  store.resetDemo()
  drawerOpen.value = false
  if (!isHome.value) router.push('/')
}
</script>

<template>
  <div class="app-shell">
    <!-- 移动端顶栏 -->
    <header class="mobile-topbar">
      <button class="icon-btn" aria-label="打开导航菜单" @click="drawerOpen = !drawerOpen">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      </button>
      <span class="brand">
        <BrandMark :size="22" />
        智学星枢
      </span>
      <span class="badge badge-demo" style="margin-left: auto">演示版</span>
    </header>

    <div class="drawer-mask" :class="{ open: drawerOpen }" @click="drawerOpen = false"></div>

    <!-- 侧边导航 -->
    <aside class="sidebar" :class="{ open: drawerOpen }">
      <div class="sidebar-brand">
        <BrandMark :size="34" />
        <div>
          <div class="sidebar-brand-name">智学星枢</div>
          <div class="sidebar-brand-sub">AstriPath</div>
        </div>
      </div>

      <div class="sidebar-section">学习闭环</div>
      <nav aria-label="主导航">
        <RouterLink
          v-for="item in NAV_ITEMS"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: route.path === item.path }"
          @click="drawerOpen = false"
        >
          <NavIcon :name="item.icon" />
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="sidebar-section">诊断与练习</div>
      <nav aria-label="学习操作">
        <RouterLink to="/diagnosis" class="nav-item" :class="{ active: route.path === '/diagnosis' }" @click="drawerOpen = false">
          <NavIcon name="diagnosis" />
          学习诊断
        </RouterLink>
        <RouterLink to="/practice/py-basics" class="nav-item" @click="drawerOpen = false">
          <NavIcon name="practice" />
          针对性练习
        </RouterLink>
      </nav>

      <div class="sidebar-footer">
        <span class="demo-pill">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16.5v.5" stroke-linecap="round" />
          </svg>
          演示模式 · 示例数据
        </span>
        <button class="reset-btn" @click="confirmReset">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
          </svg>
          重置演示
        </button>
        <p class="small" style="color: #7e8aab; font-size: 11px; line-height: 1.5">
          无需登录 · 数据仅存于本机浏览器<br />
          2026 Qoder 高校创造力大赛 · StudyHack
        </p>
      </div>
    </aside>

    <!-- 主内容区 -->
    <main class="app-main">
      <div class="app-content">
        <RouterView v-slot="{ Component }">
          <component :is="Component" :key="route.fullPath" />
        </RouterView>

        <footer class="app-footer no-print">
          <span>智学星枢 AstriPath · AI 个性化学习闭环演示</span>
          <span>
            演示数据均为虚构样本 · 掌握度为演示评估值，非真实学习能力测量 ·
            <template v-if="!store.storageAvailable">当前浏览器存储不可用，本次会话数据不会被保存</template>
            <template v-else>学习记录保存在本机浏览器</template>
          </span>
        </footer>
      </div>
    </main>
  </div>
</template>
