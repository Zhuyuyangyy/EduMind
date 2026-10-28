<template><header class="product-page-header"><div><p v-if="eyebrow" class="product-eyebrow">{{ eyebrow }}</p><h1>{{ title }}</h1><p v-if="description" class="product-description">{{ description }}</p></div><div v-if="$slots.actions" class="product-page-actions"><slot name="actions" /></div></header></template>
<script setup lang="ts">
defineProps<{ title: string; description?: string; eyebrow?: string }>()
</script>
<style>.product-page-header{display:flex;align-items:center;justify-content:space-between;gap:24px;margin:6px 0 28px}.product-page-header h1{font-size:clamp(27px,3vw,36px);letter-spacing:-.8px;line-height:1.35;margin:6px 0 10px}.product-eyebrow{font-size:12px;color:var(--m-primary);letter-spacing:.8px;margin:0}.product-description{font-size:15px;line-height:1.8;color:var(--m-text-dim);margin:0;max-width:42em}.product-page-actions{display:flex;gap:8px;flex:none}@media(max-width:479px){.product-page-header{gap:12px}.product-page-actions{align-self:flex-start}}</style>
