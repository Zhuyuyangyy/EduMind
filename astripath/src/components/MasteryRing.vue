<script setup lang="ts">
/** 掌握度圆环（SVG，无外部依赖） */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number | null
    size?: number
    label?: string
    caption?: string
  }>(),
  { size: 148, label: '总体掌握度' }
)

const display = computed(() => (props.value === null ? '—' : `${Math.round(props.value)}`))
const stroke = 11
const radius = computed(() => (props.size - stroke) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const offset = computed(() =>
  props.value === null ? circumference.value : circumference.value * (1 - Math.max(0, Math.min(100, props.value)) / 100)
)
const color = computed(() => {
  if (props.value === null) return 'var(--idle)'
  if (props.value >= 80) return 'var(--ok)'
  if (props.value >= 40) return 'var(--warn)'
  return 'var(--bad)'
})
</script>

<template>
  <div class="ring-wrap">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" role="img" :aria-label="`${label}：${display}%`">
      <circle :cx="size / 2" :cy="size / 2" :r="radius" fill="none" stroke="var(--idle-soft)" :stroke-width="stroke" />
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        :stroke="color"
        :stroke-width="stroke"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="offset"
        transform="rotate(-90 24 24)"
        :style="{ transition: 'stroke-dashoffset 600ms ease' }"
      />
      <text x="50%" y="47%" text-anchor="middle" dominant-baseline="middle" font-size="30" font-weight="750" fill="var(--site-fg)">
        {{ display }}<tspan v-if="value !== null" font-size="14" dy="-6">%</tspan>
      </text>
      <text x="50%" y="64%" text-anchor="middle" font-size="11" fill="var(--site-muted)">{{ label }}</text>
    </svg>
    <p v-if="caption" class="ring-label">{{ caption }}</p>
  </div>
</template>
