<template><component :is="icons[name]" class="m-icon" :size="Number(size)" :stroke-width="Number(strokeWidth)" aria-hidden="true" focusable="false" /></template>
<script setup lang="ts">
import { CalendarDays, MessageCircle, TrendingUp, UserRound, ScanFace, Target, Settings2, ArrowLeft, RotateCw, Star, Sparkles, Check, X, ChevronRight, Waypoints, Clock3, ChartNoAxesCombined, BookOpen, TriangleAlert, CloudUpload } from 'lucide-vue-next'
export type IconName = 'today'|'tutor'|'growth'|'profile'|'diagnose'|'practice'|'settings'|'back'|'refresh'|'star'|'sparkle'|'check'|'close'|'chevronRight'|'path'|'clock'|'target'|'chart'|'book'|'alert'|'cloud'
withDefaults(defineProps<{name:IconName;size?:number|string;strokeWidth?:number|string}>(),{size:20,strokeWidth:1.8})
const icons={today:CalendarDays,tutor:MessageCircle,growth:TrendingUp,profile:UserRound,diagnose:ScanFace,practice:Target,settings:Settings2,back:ArrowLeft,refresh:RotateCw,star:Star,sparkle:Sparkles,check:Check,close:X,chevronRight:ChevronRight,path:Waypoints,clock:Clock3,target:Target,chart:ChartNoAxesCombined,book:BookOpen,alert:TriangleAlert,cloud:CloudUpload}
</script>
<style>.m-icon{display:inline-block;vertical-align:middle;flex-shrink:0}</style>
