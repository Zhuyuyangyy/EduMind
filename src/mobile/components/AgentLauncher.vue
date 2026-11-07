<template><RouterLink :to="target" class="global-agent-launcher" aria-label="让星枢帮我"><MobileIcon name="sparkle" :size="20" /><span>让星枢帮我</span></RouterLink></template>
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import MobileIcon from './MobileIcon.vue'
const route=useRoute(),target=computed(()=>({path:'/agent',query:{from:route.path,...(typeof route.query.name==='string'?{topicName:route.query.name.slice(0,160)}:{}),...(typeof route.query.material==='string'?{material:route.query.material}:{})}}))
</script>
<style>.global-agent-launcher{position:fixed;right:20px;bottom:94px;z-index:25;display:flex;align-items:center;gap:8px;padding:12px 15px;border:1px solid var(--m-primary-border);border-radius:18px;background:var(--m-bg-elevated);color:var(--m-primary);box-shadow:0 8px 28px rgba(0,0,0,.18);font-size:13px;text-decoration:none;min-height:44px}.global-agent-launcher span{display:none}@media(min-width:900px){.global-agent-launcher{bottom:24px;right:28px}.global-agent-launcher span{display:inline}}</style>
