<script setup lang="ts">
/** 导航图标（内联 SVG，无外部依赖） */
defineProps<{ name: 'home' | 'course' | 'profile' | 'plan' | 'tutor' | 'report' | 'diagnosis' | 'practice' }>()
</script>

<template>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'home'">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </template>
    <template v-else-if="name === 'course'">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5V5.5" />
      <path d="M8 8h8M8 11.5h5" />
    </template>
    <template v-else-if="name === 'profile'">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1-4 3.6-5.5 7-5.5S18 16 19 20" />
      <circle cx="12" cy="12" r="9.2" opacity="0.35" />
    </template>
    <template v-else-if="name === 'plan'">
      <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
      <path d="M8 3v3M16 3v3M3.5 9.5h17" />
      <path d="M8 13.5h3M8 17h6" />
    </template>
    <template v-else-if="name === 'tutor'">
      <path d="M12 3a6 6 0 0 1 6 6c0 2.4-1.2 4.2-2.6 5.4-.9.8-1.4 1.4-1.4 2.6h-4c0-1.2-.5-1.8-1.4-2.6C7.2 13.2 6 11.4 6 9a6 6 0 0 1 6-6z" />
      <path d="M9.5 20.5h5" />
    </template>
    <template v-else-if="name === 'report'">
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 16v-4M12.5 16V8M17 16v-6" />
    </template>
    <template v-else-if="name === 'diagnosis'">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M15.8 15.8 21 21" />
      <path d="M8.5 11h5M11 8.5v5" />
    </template>
    <template v-else-if="name === 'practice'">
      <path d="M12 3.5 14.6 9l6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8 9.4 9z" />
    </template>
  </svg>
</template>
