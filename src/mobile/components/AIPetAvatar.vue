<template>
  <svg class="ai-pet-avatar" :class="{ 'ai-pet-avatar--animated': animated, 'ai-pet-avatar--happy': happy }" viewBox="0 0 180 180" role="img" :aria-label="`${names[kind]}，${stage}阶段`">
    <defs><radialGradient :id="`${id}-glow`"><stop stop-color="#4dd8f0" stop-opacity=".2"/><stop offset="1" stop-color="#4dd8f0" stop-opacity="0"/></radialGradient><linearGradient :id="`${id}-suit`" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e3f4ff"/><stop offset="1" stop-color="#9fbbdc"/></linearGradient></defs>
    <circle cx="90" cy="90" r="85" :fill="`url(#${id}-glow)`"/>
    <ellipse cx="91" cy="154" rx="40" ry="7" fill="#020b1c" opacity=".25"/>
    <g class="pet-body"><ellipse cx="91" cy="126" rx="35" ry="29" :fill="`url(#${id}-suit)`"/>
      <path d="M64 116 Q42 112 46 132 Q50 142 63 134" :fill="`url(#${id}-suit)`"/><path d="M118 116 Q140 110 137 130 Q133 141 120 134" :fill="`url(#${id}-suit)`"/>
      <ellipse cx="73" cy="149" rx="13" ry="7" fill="#819bbf"/><ellipse cx="111" cy="149" rx="13" ry="7" fill="#819bbf"/>
      <rect x="76" y="119" width="29" height="20" rx="7" fill="#1d3558"/><path d="m90 122 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#4dd8f0"/>
      <path v-if="stage !== '初遇'" d="M123 127 139 141 144 119 126 114" fill="#8d7bff" opacity=".8"/>
      <circle cx="90" cy="79" r="48" fill="#173252" stroke="#68cfeb" stroke-opacity=".7" stroke-width="2"/>
      <path v-if="kind === 'rabbit'" d="M64 54 Q48 0 66 10 Q80 24 78 53 M99 51 Q105 3 119 13 Q129 25 115 60" :fill="fur" stroke="#c08eb6" stroke-width="2"/>
      <path v-else-if="kind !== 'owl'" d="M56 62 52 22 Q76 31 80 55 M101 55 Q115 27 132 23 L126 68" :fill="fur"/>
      <path v-if="kind === 'cat'" d="m58 44 2-12 12 18m39 0 15-16-4 20" stroke="#e7b2cd" stroke-width="4" fill="none"/>
      <ellipse cx="91" cy="78" rx="37" ry="35" :fill="fur"/>
      <path v-if="kind === 'fox'" d="M55 75 80 86 91 101 103 86 128 75 Q124 111 91 111 58 109 55 75" fill="#fff4e9"/>
      <g v-if="kind === 'owl'"><ellipse cx="75" cy="78" rx="18" ry="22" fill="#e7edff"/><ellipse cx="107" cy="78" rx="18" ry="22" fill="#e7edff"/><path d="m86 89 5 8 5-8" fill="#ffbf80"/></g>
      <path v-if="happy" d="M69 75q6-7 12 0m20 0q6-7 12 0" fill="none" stroke="#20344e" stroke-width="4" stroke-linecap="round"/>
      <g v-else class="pet-eyes"><ellipse cx="75" cy="76" rx="5" ry="7" fill="#182a42"/><ellipse cx="107" cy="76" rx="5" ry="7" fill="#182a42"/><circle cx="77" cy="74" r="1.5" fill="white"/><circle cx="109" cy="74" r="1.5" fill="white"/></g>
      <ellipse cx="65" cy="88" rx="7" ry="3" fill="#ed9dba" opacity=".6"/><ellipse cx="117" cy="88" rx="7" ry="3" fill="#ed9dba" opacity=".6"/>
      <path v-if="kind !== 'owl'" d="m87 87 4 3 4-3m-4 3v5m-7-1q7 8 14 0" stroke="#443d47" stroke-width="2" stroke-linecap="round" fill="none"/>
      <path d="M54 57Q68 28 101 35" fill="none" stroke="white" opacity=".4" stroke-width="4" stroke-linecap="round"/>
      <path d="M44 97Q90 127 137 96" fill="none" stroke="#53c8e7" opacity=".45" stroke-width="3"/>
      <path v-if="stage === '领航'" d="m79 30 4-12 8 7 8-7 5 13Z" fill="#ffce8c"/>
    </g>
    <ellipse cx="90" cy="113" rx="67" ry="17" fill="none" stroke="#6bd9ee" stroke-opacity=".35" stroke-width="1.5" transform="rotate(-18 90 113)"/><circle cx="151" cy="91" r="5" fill="#69dcee"/>
  </svg>
</template>
<script setup lang="ts">
import { computed, useId } from 'vue'
import type { PetKind } from '@/mobile/domain/companion'
const props = withDefaults(defineProps<{ kind?: PetKind; stage?: string; animated?: boolean; happy?: boolean }>(), { kind: 'fox', stage: '初遇', animated: true, happy: false })
const id = useId(), names = { fox: '星航狐', cat: '月影猫', rabbit: '云朵兔', owl: '夜航鸮' }
const fur = computed(() => ({ fox: '#ffc19a', cat: '#d3c8f5', rabbit: '#e9e5ff', owl: '#a7bbdf' }[props.kind]))
</script>
<style scoped>.ai-pet-avatar{display:block;width:100%;height:auto;overflow:visible}.ai-pet-avatar--animated .pet-body{animation:pet-hover 5s ease-in-out infinite;transform-origin:90px 95px}.ai-pet-avatar--happy .pet-body{animation:pet-cheer .55s ease-in-out 2}@keyframes pet-hover{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}@keyframes pet-cheer{50%{transform:translateY(-7px) rotate(-3deg)}}@media(prefers-reduced-motion:reduce){.ai-pet-avatar .pet-body{animation:none}}</style>
