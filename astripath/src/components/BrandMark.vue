<script setup lang="ts">
/** 智学星枢品牌标识：星枢（星际枢纽）六芒星 + 轨道 */
defineProps<{ size?: number }>()
</script>

<template>
  <svg :width="size ?? 28" :height="size ?? 28" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="brandGrad" x1="0" y1="0" x2="48" y2="48">
        <stop offset="0%" stop-color="#8b93ff" />
        <stop offset="100%" stop-color="#4c5bd4" />
      </linearGradient>
    </defs>
    <circle cx="24" cy="24" r="21" stroke="url(#brandGrad)" stroke-width="2.5" opacity="0.55" />
    <ellipse cx="24" cy="24" rx="21" ry="8.5" stroke="url(#brandGrad)" stroke-width="1.6" opacity="0.4" transform="rotate(-24 24 24)" />
    <path
      d="M24 8l4.2 9.6L38 15.4l-5.4 8.8 5.4 8.8-9.8-2.2L24 40l-4.2-9.2L10 33l5.4-8.8L10 15.4l9.8 2.2z"
      fill="url(#brandGrad)"
    />
    <circle cx="24" cy="24" r="3.4" fill="#fff" />
  </svg>
</template>
