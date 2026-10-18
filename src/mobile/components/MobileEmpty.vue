<template>
  <div class="m-empty">
    <div class="m-empty__art" aria-hidden="true">
      <!-- 星图碎片插画：低透明度节点+连线，各页复用同一母题 -->
      <svg viewBox="0 0 120 84" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
        <path d="M18 60 L44 30 L74 44 L102 20" opacity="0.55" />
        <path d="M44 30 L58 62 L90 66" opacity="0.35" />
        <circle cx="18" cy="60" r="3.4" />
        <circle cx="44" cy="30" r="4.6" />
        <circle cx="74" cy="44" r="3" />
        <circle cx="102" cy="20" r="2.6" />
        <circle cx="58" cy="62" r="2.4" opacity="0.7" />
        <circle cx="90" cy="66" r="2.4" opacity="0.7" />
      </svg>
    </div>
    <p class="m-empty__title">{{ title }}</p>
    <p v-if="desc" class="m-empty__desc">{{ desc }}</p>
    <button v-if="actionText" class="m-btn m-btn--primary m-btn--sm m-empty__action" type="button" @click="$emit('action')">
      <MobileIcon v-if="actionIcon" :name="actionIcon" :size="15" />
      {{ actionText }}
    </button>
    <!-- 附加内容（错误提示等），渲染在按钮下方 -->
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * 全局空状态体系（P4-2C · A5）。
 * 统一母题：星图碎片插画 + 标题 + 说明 + 单一行动按钮。
 * 替换各页自行拼装的字符图标空状态（如 ⌂/✦）。
 */
import MobileIcon from './MobileIcon.vue'
import type { IconName } from './MobileIcon.vue'

defineProps<{
  title: string
  desc?: string
  actionText?: string
  actionIcon?: IconName
}>()

defineEmits<{ (e: 'action'): void }>()
</script>

<style scoped>
.m-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--m-space-8) var(--m-space-5);
  color: var(--m-text-dim);
}
.m-empty__art {
  width: 132px;
  color: var(--m-primary);
  opacity: 0.85;
  margin-bottom: var(--m-space-4);
  filter: drop-shadow(0 0 10px rgba(84, 214, 255, 0.25));
}
.m-empty__title {
  margin: 0 0 var(--m-space-2);
  font-size: var(--m-text-base);
  font-weight: 600;
  color: var(--m-text);
}
.m-empty__desc {
  margin: 0 0 var(--m-space-4);
  font-size: var(--m-text-md);
  line-height: 1.6;
  max-width: 260px;
}
.m-empty__action {
  margin-top: var(--m-space-1);
}
</style>
