<script setup lang="ts">
import { useRoute } from 'vue-router'
import { computed, watch } from 'vue'
import { useAppStore } from '@/store'
import { useScrollReveal } from '@/composables/useScrollReveal'
import CosmicPageBackground from './CosmicPageBackground.vue'
import {
  Home,
  MessageCircle,
  Map,
  BarChart3,
  Settings,
  Sparkles,
  Library,
  Database,
} from 'lucide-vue-next'

const route = useRoute()
const appStore = useAppStore()
useScrollReveal(0.12)

const isShellFreePage = computed(() => route.path === '/login' || route.path === '/admin')
const isHomePage = computed(() => route.path === '/home')
const isUniversePage = computed(() => route.path === '/learning-path')
const isEduMindPage = computed(() => route.path === '/edu-mind')

const navItems = [
  { path: '/home', label: '首页', icon: Home, guideId: 'welcome' },
  { path: '/dialogue', label: '画像生成', icon: MessageCircle, guideId: 'dialogue' },
  { path: '/learning-path', label: '学习路径', icon: Map, guideId: 'learning-path' },
  { path: '/edu-mind', label: '学习资源', icon: Library, guideId: 'edu-mind' },
  { path: '/evaluation', label: '智能评估', icon: BarChart3, guideId: 'evaluation' },
  { path: '/reverse-evaluation', label: '反向更新', icon: Database, guideId: 'reverse-evaluation' },
  { path: '/settings', label: '设置', icon: Settings, guideId: 'settings' },
]
watch(
  () => route.fullPath,
  (nextPath, previousPath) => {
    if (!previousPath || nextPath === previousPath) return
    // appStore.triggerPageLoading()
  },
)
</script>

<template>
  <div class="layout">
    <!-- Top Navigation Bar -->
    <header v-if="!isShellFreePage" class="topbar" role="banner">
      <div class="topbar-inner">
      <router-link to="/home" class="topbar-brand" aria-label="智学星枢首页">
          <span class="brand-icon">
            <Sparkles :size="18" stroke-width="1.5" />
          </span>
          <span class="brand-text">智学星枢</span>
        </router-link>

        <nav class="topbar-nav" aria-label="主导航">
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            :class="['nav-item', { active: route.path === item.path }]"
            :data-guide-target="item.guideId"
            :aria-current="route.path === item.path ? 'page' : undefined"
          >
            <component :is="item.icon" :size="16" stroke-width="1.5" class="nav-icon-svg" aria-hidden="true" />
            <span class="nav-label">{{ item.label }}</span>
            <span class="nav-indicator" :class="{ visible: route.path === item.path }" />
          </router-link>
        </nav>
      </div>
    </header>

    <!-- Main Content -->
    <main class="main-content" id="main-content" :class="{
      'shell-free': isShellFreePage,
      'home-active': isHomePage,
      'universe-active': isUniversePage,
      'edu-mind-active': isEduMindPage,
    }">
      <CosmicPageBackground v-if="!isShellFreePage" />
      <div class="page-content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* === Top Bar === */
.topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--header-height);
  background:
    linear-gradient(180deg, rgba(3, 8, 18, 0.28), rgba(3, 8, 18, 0.06)),
    rgba(3, 8, 18, 0.08);
  backdrop-filter: blur(18px) saturate(1.25);
  -webkit-backdrop-filter: blur(18px) saturate(1.25);
  border-bottom: 1px solid rgba(116, 207, 255, 0.08);
  box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.025);
  z-index: var(--z-dropdown);
}

.topbar-inner {
  max-width: 1440px;
  margin: 0 auto;
  height: 100%;
  display: flex;
  align-items: center;
  padding: 0 24px;
  gap: 32px;
}

@media (min-width: 1024px) {
  .topbar-inner {
    padding: 0 40px;
    gap: 40px;
  }
}

/* === Brand === */
.topbar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  flex-shrink: 0;
}

.brand-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: linear-gradient(135deg, #00d4ff, #7c3aed);
  color: #fff;
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.4);
}

.brand-text {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0;
}

/* === Nav === */
.topbar-nav {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
}
.topbar-nav::-webkit-scrollbar {
  display: none;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  min-height: 44px;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  transition: all var(--duration-fast) var(--ease-out);
  position: relative;
  white-space: nowrap;
}

@media (min-width: 1024px) {
  .nav-item {
    padding: 10px 20px;
    font-size: 14px;
  }
}

.nav-item:hover {
  color: var(--color-text-primary);
  background: rgba(0, 212, 255, 0.08);
}

.nav-item.active {
  color: var(--color-accent-cyan);
  background: rgba(0, 212, 255, 0.14);
  box-shadow: inset 0 0 0 1px rgba(0, 212, 255, 0.14), 0 0 26px rgba(0, 212, 255, 0.08);
}

.nav-icon-svg {
  flex-shrink: 0;
  transition: transform var(--duration-fast) var(--ease-out);
}

.nav-item:hover .nav-icon-svg {
  transform: scale(1.1);
}

.nav-label {
  letter-spacing: 0;
}

.nav-indicator {
  position: absolute;
  bottom: -2px;
  left: 50%;
  transform: translateX(-50%) scaleX(0);
  width: 20px;
  height: 2px;
  background: var(--color-accent-cyan);
  border-radius: 1px;
  box-shadow: 0 0 8px rgba(0, 212, 255, 0.5);
  transition: transform var(--duration-normal) var(--ease-out);
}

.nav-indicator.visible {
  transform: translateX(-50%) scaleX(1);
}

/* === Main Content === */
.main-content {
  flex: 1;
  margin-top: var(--header-height);
  min-height: calc(100vh - var(--header-height));
  position: relative;
  overflow: hidden;
  background: transparent;
  isolation: isolate;
}

.main-content.home-active {
  margin-top: 0;
  min-height: 100vh;
}

.main-content.shell-free {
  margin-top: 0;
  min-height: 100vh;
  overflow: visible;
}

.main-content.universe-active {
  overflow: hidden;
}

.main-content.edu-mind-active {
  overflow: visible;
}

.page-content {
  position: relative;
  z-index: 1;
  min-height: inherit;
}
</style>
