<template>
  <svg
    class="brand-mark"
    :class="`brand-mark--${variant}`"
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    fill="none"
    :role="title ? 'img' : undefined"
    :aria-label="title"
    :aria-hidden="title ? undefined : 'true'"
    focusable="false"
  >
    <title v-if="title">{{ title }}</title>
    <path class="brand-mark__hex brand-mark__hex--outer" d="M24 3.5 41 13.25v21.5L24 44.5 7 34.75v-21.5L24 3.5Z" />
    <path class="brand-mark__hex brand-mark__hex--inner" d="m24 10.5 10.9 6.25v14.5L24 37.5l-10.9-6.25v-14.5L24 10.5Z" />
    <path class="brand-mark__orbit brand-mark__orbit--one" d="M6.5 24c2.9-8.45 9.3-12.8 17.5-12.8S38.6 15.55 41.5 24c-2.9 8.45-9.3 12.8-17.5 12.8S9.4 32.45 6.5 24Z" />
    <path class="brand-mark__orbit brand-mark__orbit--two" d="M10.2 9.3c7.55 1.3 15.55 7.25 20.7 14.7 2.25 3.25 4.35 6.8 6.85 9.8" />
    <path class="brand-mark__star" d="m24 16.8 1.7 5.5 5.5 1.7-5.5 1.7-1.7 5.5-1.7-5.5-5.5-1.7 5.5-1.7 1.7-5.5Z" />
    <circle class="brand-mark__core" cx="24" cy="24" r="2.35" />
    <circle class="brand-mark__node brand-mark__node--gold" cx="9.2" cy="17.2" r="1.7" />
    <circle class="brand-mark__node brand-mark__node--blue" cx="38.5" cy="29.7" r="1.55" />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  size?: number | string
  variant?: 'light' | 'dark'
  title?: string
}>(), {
  size: 40,
  variant: 'light',
})
</script>

<style scoped>
.brand-mark { display: block; overflow: visible; flex: none; }
.brand-mark--light { --brand-blue: #3769d5; --brand-blue-soft: rgba(55,105,213,.42); --brand-gold: #bd8a42; --brand-fill: rgba(55,105,213,.06); --brand-glow: rgba(55,105,213,.12); }
.brand-mark--dark { --brand-blue: #00d4ff; --brand-blue-soft: rgba(0,212,255,.5); --brand-gold: #f2c56f; --brand-fill: rgba(0,180,255,.08); --brand-glow: rgba(0,212,255,.4); }
.brand-mark__hex { stroke: var(--brand-blue); stroke-linejoin: round; }
.brand-mark__hex--outer { stroke-width: 1.45; fill: var(--brand-fill); opacity: .92; }
.brand-mark__hex--inner { stroke-width: 1; opacity: .68; }
.brand-mark__orbit { stroke: var(--brand-blue-soft); stroke-linecap: round; }
.brand-mark__orbit--one { stroke-width: 1.05; opacity: .9; }
.brand-mark__orbit--two { stroke-width: .9; opacity: .72; }
.brand-mark__star { fill: var(--brand-gold); stroke: var(--brand-gold); stroke-linejoin: round; filter: drop-shadow(0 0 3px var(--brand-glow)); }
.brand-mark__core { fill: var(--brand-blue); }
.brand-mark__node { stroke: var(--brand-fill); stroke-width: 1; }
.brand-mark__node--gold { fill: var(--brand-gold); }
.brand-mark__node--blue { fill: var(--brand-blue); }
</style>
