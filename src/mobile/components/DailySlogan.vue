<template><div class="daily-slogan"><p class="product-eyebrow">{{ date }}</p><h1 class="today__hello">{{ greeting }}，{{ name }}</h1><p class="daily-greeting" data-daily-slogan>{{ slogan }}</p><div class="slogan-actions"><button type="button" aria-label="换一句每日标语" @click="refresh"><MobileIcon name="refresh" :size="13" />换一句</button><button type="button" :aria-pressed="favorite" @click="toggle"><MobileIcon name="star" :size="13" />{{ favorite ? '已收藏' : '收藏' }}</button></div></div></template>
<script setup lang="ts">
import { computed } from 'vue'
import { getAuthSession } from '@/lib/auth'
import { dailySlogan, shanghaiDay } from '@/mobile/domain/companion'
import { useLearningWorkspace } from '@/mobile/stores/learning-workspace'
import MobileIcon from './MobileIcon.vue'
const store = useLearningWorkspace(), day = shanghaiDay(), date = new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',weekday:'long'}).format(new Date())
const hour = Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hour12:false}).format(new Date())), greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'
const name = getAuthSession()?.name || '学习者', slogan = computed(() => dailySlogan(day,store.local.sloganOffsets[day] || 0)), favorite = computed(() => store.local.favorites.includes(slogan.value))
function refresh(){store.local.sloganOffsets[day]=(store.local.sloganOffsets[day]||0)+1;store.persist()}
function toggle(){store.local.favorites=favorite.value?store.local.favorites.filter(s=>s!==slogan.value):[...store.local.favorites,slogan.value];store.persist()}
</script>
<style scoped>.daily-slogan h1{font-size:clamp(25px,3vw,37px);line-height:1.4;letter-spacing:-.9px;max-width:15em;margin:12px 0 10px}.daily-greeting{font-size:14px;line-height:1.8;color:var(--m-text-dim);margin:0}.slogan-actions{display:flex;gap:18px;margin-top:6px}.slogan-actions button{display:flex;gap:6px;align-items:center;border:0;background:none;color:var(--m-text-faint);font:inherit;font-size:12px;min-height:40px;padding:0;cursor:pointer}.slogan-actions button[aria-pressed=true]{color:var(--m-gold)}</style>
