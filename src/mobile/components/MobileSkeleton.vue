<template>
  <div class="m-skeleton" :class="`m-skeleton--${variant}`" aria-busy="true" aria-live="polite">
    <span class="m-skeleton__sr">加载中</span>
    <template v-for="n in count" :key="n">
      <div class="m-skel-card" v-if="variant === 'card'">
        <div class="m-skel m-skel--title" />
        <div class="m-skel m-skel--line" />
        <div class="m-skel m-skel--line m-skel--short" />
      </div>
      <div class="m-skel-row" v-else-if="variant === 'list'">
        <div class="m-skel m-skel--avatar" />
        <div class="m-skel-row__lines">
          <div class="m-skel m-skel--line" />
          <div class="m-skel m-skel--line m-skel--short" />
        </div>
      </div>
      <div class="m-skel-hero" v-else>
        <div class="m-skel m-skel--ring" />
        <div class="m-skel-row__lines">
          <div class="m-skel m-skel--line" />
          <div class="m-skel m-skel--line m-skel--short" />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 骨架屏（P4-2C · A6）。替代首屏/列表的空白与转圈，降低感知等待。
 * shimmer 为纯 CSS 渐位移移动画（GPU 友好，无 JS 驱动）。
 */
withDefaults(defineProps<{
  variant?: 'card' | 'list' | 'hero'
  count?: number
}>(), { variant: 'card', count: 3 })
</script>

<style scoped>
.m-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-3);
}
.m-skeleton__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.m-skel {
  position: relative;
  overflow: hidden;
  background: var(--m-surface-2);
  border-radius: var(--m-radius-sm);
}
.m-skel::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(84, 214, 255, 0.10), transparent);
  transform: translateX(-100%);
  animation: m-skel-shimmer 1.4s infinite;
}
@keyframes m-skel-shimmer {
  to {
    transform: translateX(100%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .m-skel::after {
    animation: none;
  }
}
.m-skel-card {
  background: var(--m-surface);
  border: 1px solid var(--m-border);
  border-radius: var(--m-radius-lg);
  padding: var(--m-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--m-space-3);
}
.m-skel--title {
  height: 18px;
  width: 45%;
}
.m-skel--line {
  height: 12px;
  width: 100%;
}
.m-skel--short {
  width: 65%;
}
.m-skel--avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--m-radius-full);
  flex: none;
}
.m-skel-row {
  display: flex;
  align-items: center;
  gap: var(--m-space-3);
}
.m-skel-row__lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--m-space-2);
}
.m-skel-hero {
  display: flex;
  align-items: center;
  gap: var(--m-space-4);
  background: var(--m-surface);
  border: 1px solid var(--m-border);
  border-radius: var(--m-radius-lg);
  padding: var(--m-space-4);
}
.m-skel--ring {
  width: 64px;
  height: 64px;
  border-radius: var(--m-radius-full);
  flex: none;
}
</style>
