<template><div class="question-tools"><button class="m-btn m-btn--ghost m-btn--sm" :aria-pressed="!!store.local.uncertain[exerciseId]" @click="toggle">{{ store.local.uncertain[exerciseId]?'已标记不确定':'标记不确定' }}</button><button class="m-btn m-btn--ghost m-btn--sm" @click="open=true">反馈题目问题</button></div><AppDialog v-model="open" title="反馈这道题"><form class="workspace-form" @submit.prevent="send"><p class="workspace-caption">{{ title }} · 反馈保存在当前账号，可在数据控制中查看。不改变服务器判题结果。</p><label class="m-field"><span>问题与修正依据</span><textarea v-model="content" class="m-textarea" rows="4" required maxlength="1500" placeholder="请说明题意、答案或解析的问题，以及可核对的依据。"/></label><button class="m-btn m-btn--primary" :disabled="busy">{{ busy?'保存中…':'保存题目反馈' }}</button><p v-if="message" role="status">{{ message }}</p></form></AppDialog></template>
<script setup lang="ts">
import {ref}from 'vue'
import AppDialog from './AppDialog.vue'
import {useLearningWorkspace}from '@/mobile/stores/learning-workspace'
import {changeWorkspace}from '@/mobile/data/workspace'
const props=defineProps<{exerciseId:string;sessionId:string;title:string}>(),store=useLearningWorkspace(),open=ref(false),content=ref(''),busy=ref(false),message=ref('')
function toggle(){store.local.uncertain[props.exerciseId]=!store.local.uncertain[props.exerciseId];store.persist()}
async function send(){if(busy.value)return;busy.value=true;message.value='';try{await changeWorkspace('feedback',{content:`题目 ${props.exerciseId} / 会话 ${props.sessionId}\n${props.title}\n${content.value}`});message.value='题目反馈已保存。';content.value=''}catch{message.value='保存失败，请检查连接后重试。'}finally{busy.value=false}}
</script>
<style scoped>.question-tools{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}</style>
