<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from './components/layout/AppLayout.vue'
import GlobalCompanionPet from './components/tutor/GlobalCompanionPet.vue'
import NewUserPetGuide from './components/tutor/NewUserPetGuide.vue'
import { useAppStore, BLUR_PX } from '@/store'

const showScanLine = ref(true)
const appStore = useAppStore()
const route = useRoute()
const isAuthShellPage = computed(() => route.path === '/login' || route.path === '/admin')
const resourceShellPages = ['/edu-mind', '/resources']
const showCompanionPet = computed(() =>
  appStore.desktopPetEnabled && !resourceShellPages.includes(route.path) && !isAuthShellPage.value
)

// 将 blurStrength 同步为全局 CSS 变量，供所有毛玻璃样式使用
watchEffect(() => {
  const px = BLUR_PX[appStore.blurStrength]
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--blur-base', `${px}px`)
  }
})
</script>

<template>
  <div :class="['app-wrapper', { 'scan-effect': showScanLine }]">
    <AppLayout />
    <GlobalCompanionPet v-if="showCompanionPet" />
    <NewUserPetGuide v-if="!isAuthShellPage" />
  </div>
</template>

<style scoped>
.app-wrapper {
  position: relative;
}

:global(html.new-user-guide-open),
:global(html.new-user-guide-open body) {
  overflow: hidden;
}
</style>
