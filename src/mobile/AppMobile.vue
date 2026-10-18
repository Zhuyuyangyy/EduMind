<template>
  <div class="mobile-shell">
    <!-- P4-2C A7：深空星点背景层（纯 CSS，无 canvas；opacity 极低不扰内容） -->
    <div class="mobile-stars" aria-hidden="true" />
    <header class="mobile-header">
      <span class="mobile-logo">智学星枢</span>
      <span class="mobile-header__sub">{{ route.meta.title || 'Mobile' }}</span>
      <span v-if="isDemoData" class="m-demo-tag mobile-header__demo">示例数据</span>
    </header>
    <main class="mobile-body">
      <RouterView v-slot="{ Component }">
        <transition name="m-fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </RouterView>
    </main>
    <nav v-if="showTabs" class="mobile-tabs">
      <RouterLink v-for="tab in tabs" :key="tab.to" :to="tab.to" class="tab">
        <span class="tab__icon" aria-hidden="true"><MobileIcon :name="tab.icon" :size="22" /></span>
        <span class="tab__label">{{ tab.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { getAuthSession } from '@/lib/auth'
import MobileIcon from './components/MobileIcon.vue'
import type { IconName } from './components/MobileIcon.vue'

const route = useRoute()

// P4-2C A2：统一线性图标（MobileIcon 体系），禁止字符图标
const tabs: { to: string; label: string; icon: IconName }[] = [
  { to: '/today', label: '今日学习', icon: 'today' },
  { to: '/tutor', label: 'AI 导师', icon: 'tutor' },
  { to: '/growth', label: '学习成长', icon: 'growth' },
  { to: '/profile', label: '我的', icon: 'profile' },
]

const showTabs = computed(() => route.path !== '/login' && Boolean(getAuthSession()))

// P2-2B 起今日/成长页已接入真实账号数据，不再有全局示例数据页；
// 保留机制：如未来新增演示页，把路由加进来即可显示统一标记。
const DEMO_ROUTES: string[] = []
const isDemoData = computed(() => DEMO_ROUTES.includes(route.path))
</script>

<style scoped>
.mobile-shell {
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(120% 60% at 50% -10%, rgba(31, 111, 235, 0.14), transparent 60%),
    var(--m-bg);
  color: var(--m-text);
  isolation: isolate;
}

/* 星点层：radial-gradient 平铺 + 超缓闪烁（transform 动画，GPU 友好） */
.mobile-stars {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image:
    radial-gradient(1.5px 1.5px at 18px 26px, rgba(233, 244, 255, 0.55) 50%, transparent 51%),
    radial-gradient(1px 1px at 62px 88px, rgba(84, 214, 255, 0.45) 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 108px 140px, rgba(233, 244, 255, 0.35) 50%, transparent 51%),
    radial-gradient(1px 1px at 150px 40px, rgba(139, 124, 255, 0.40) 50%, transparent 51%);
  background-size: 180px 180px;
  opacity: 0.5;
  animation: m-stars-drift 90s linear infinite;
}
@keyframes m-stars-drift {
  to {
    background-position: 180px 180px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .mobile-stars {
    animation: none;
  }
}

.mobile-header {
  display: flex;
  align-items: center;
  gap: var(--m-space-2);
  padding: calc(var(--m-safe-top) + 14px) var(--m-space-4) var(--m-space-3);
  background: var(--m-bg-elevated);
  border-bottom: 1px solid var(--m-border);
  position: sticky;
  top: 0;
  z-index: 10;
}

.mobile-logo {
  font-size: var(--m-text-lg);
  font-weight: 700;
  letter-spacing: 0.5px;
}

.mobile-header__sub {
  font-size: var(--m-text-sm);
  color: var(--m-text-faint);
}

.mobile-header__demo {
  margin-left: auto;
}

.mobile-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--m-space-4) var(--m-space-4) var(--m-space-8);
}

.mobile-tabs {
  display: flex;
  border-top: 1px solid var(--m-border);
  background: var(--m-bg-elevated);
  padding-bottom: var(--m-safe-bottom);
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--m-space-2) 0 calc(var(--m-space-2) + 2px);
  font-size: var(--m-text-xs);
  color: var(--m-text-faint);
  text-decoration: none;
  transition: color var(--m-duration) var(--m-ease);
}

.tab__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  transition: transform var(--m-duration) var(--m-ease), filter var(--m-duration) var(--m-ease);
}
.tab.router-link-active .tab__icon {
  filter: drop-shadow(0 0 5px rgba(84, 214, 255, 0.55));
  transform: translateY(-1px);
}

.tab.router-link-active {
  color: var(--m-primary);
  font-weight: 600;
}

/* 页面切换动效（服务于导航反馈） */
.m-fade-enter-active,
.m-fade-leave-active {
  transition: opacity var(--m-duration) var(--m-ease), transform var(--m-duration) var(--m-ease);
}
.m-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.m-fade-leave-to {
  opacity: 0;
}
</style>
