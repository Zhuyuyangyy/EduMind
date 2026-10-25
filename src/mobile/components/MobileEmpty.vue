<template>
  <div class="m-empty">
    <div class="m-empty__art" aria-hidden="true">
      <MobileOrbit />
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
import MobileOrbit from './MobileOrbit.vue'
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
  padding: 14px var(--m-space-5) 28px;
  background: var(--m-surface);
  border: 1px solid var(--m-border);
  box-shadow: var(--m-shadow-card);
  border-radius: var(--m-radius-xl);
  color: var(--m-text-dim);
}
.m-empty__art {
  display: grid;
  place-items: center;
  width: 150px;
  height: 125px;
  border-radius: 24px;
  background: transparent;
  color: var(--m-primary);
  opacity: 1;
  margin-bottom: 8px;

}
.m-empty__title {
  margin: 0 0 var(--m-space-2);
  font-size: 23px;
  font-weight: 600;
  color: var(--m-text);
}
.m-empty__desc {
  margin: 0 0 var(--m-space-4);
  font-size: 13px;
  line-height: 1.6;
  max-width: 260px;
}
.m-empty__action {
  margin-top: var(--m-space-1);
}
</style>
