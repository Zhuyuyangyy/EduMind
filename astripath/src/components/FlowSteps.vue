<script setup lang="ts">
/** 学习闭环流程指示器：诊断 → 画像 → 计划 → 辅导 → 练习 → 反馈 */
import { computed } from 'vue'

const props = defineProps<{ current: string }>()

const STEPS = [
  { key: 'diagnosis', label: '学习诊断' },
  { key: 'profile', label: '知识画像' },
  { key: 'plan', label: '动态计划' },
  { key: 'tutor', label: 'AI 辅导' },
  { key: 'practice', label: '针对性练习' },
  { key: 'feedback', label: '效果反馈' }
]

const currentIndex = computed(() => Math.max(0, STEPS.findIndex((s) => s.key === props.current)))
</script>

<template>
  <div class="flow-steps" aria-label="学习闭环流程">
    <template v-for="(step, index) in STEPS" :key="step.key">
      <span v-if="index > 0" class="flow-arrow" aria-hidden="true">→</span>
      <span class="flow-step" :class="{ done: index < currentIndex, current: index === currentIndex }">
        <span class="dot"></span>
        {{ step.label }}
      </span>
    </template>
  </div>
</template>
