<template>
  <div class="mobile-shell">
    <header class="mobile-header">
      <span class="mobile-logo">智学星枢</span>
      <span class="mobile-sub">Mobile P1</span>
    </header>
    <main class="mobile-body">
      <RouterView />
    </main>
    <nav v-if="showTabs" class="mobile-tabs">
      <RouterLink to="/tutor" class="tab">AI 导师</RouterLink>
      <RouterLink to="/status" class="tab">状态</RouterLink>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { getAuthSession } from '@/lib/auth'

const route = useRoute()
const showTabs = computed(() => route.path !== '/login' && Boolean(getAuthSession()))
</script>

<style scoped>
.mobile-shell {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: #07111f;
  color: #e9f4ff;
}

.mobile-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: calc(env(safe-area-inset-top, 0px) + 14px) 18px 12px;
  background: #0b1a2e;
  border-bottom: 1px solid #1d3552;
}

.mobile-logo {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.mobile-sub {
  font-size: 11px;
  color: #6f8ba6;
}

.mobile-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 16px 24px;
}

.mobile-tabs {
  display: flex;
  border-top: 1px solid #1d3552;
  background: #0b1a2e;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.tab {
  flex: 1;
  text-align: center;
  padding: 12px 0 14px;
  font-size: 13px;
  color: #8ca8bd;
  text-decoration: none;
}

.tab.router-link-active {
  color: #54d6ff;
  font-weight: 600;
}
</style>
