<template><div class="weekly-summary"><div><b>{{ Math.floor(seconds / 60) }}</b><span>计时分钟</span></div><div><b>{{ practiceCount }}</b><span>完成练习</span></div><div><b>{{ doneTasks }}</b><span>任务自报完成</span></div></div><StudyTimeChart :buckets="buckets" /><p v-if="goalId" class="workspace-caption">练习事件没有目标归属，完成练习显示为 —；计时按所选目标统计。</p><p v-if="limited" class="workspace-caption">练习统计来自最近 50 条事件，可能不是完整周记录；不提供同比增长。</p><p v-else class="workspace-caption">{{ rangeLabel }} · 来源为已结束计时、已完成练习与手动任务记录，活动不等于学习效果。</p></template>
<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useLearningWorkspace } from '@/mobile/stores/learning-workspace'
import { shanghaiDay, timeBuckets } from '@/mobile/domain/companion'
const props=withDefaults(defineProps<{days?:number;goalId?:string|null}>(),{days:7,goalId:null}),store=useLearningWorkspace()
const StudyTimeChart=defineAsyncComponent(()=>import('./StudyTimeChart.vue'))
const records=computed(()=>store.timeRecords.filter(r=>!props.goalId||r.goalId===props.goalId)),buckets=computed(()=>timeBuckets(records.value,props.days===7?((new Date(`${shanghaiDay()}T12:00:00+08:00`).getUTCDay()+6)%7)+1:props.days)),seconds=computed(()=>buckets.value.reduce((n,b)=>n+b.seconds,0)),start=computed(()=>buckets.value[0]?.day||shanghaiDay()),rangeLabel=computed(()=>`${start.value} 至 ${shanghaiDay()}`),limited=computed(()=>store.events.length>=50)
const practiceCount=computed(()=>props.goalId?'—':store.events.filter(e=>e.type==='session-complete'&&e.at&&shanghaiDay(Date.parse(e.at))>=start.value).length)
const doneTasks=computed(()=>store.taskItems.filter(t=>t.done&&(!props.goalId||t.goalId===props.goalId)&&t.updatedAt&&shanghaiDay(Date.parse(t.updatedAt))>=start.value).length)
</script>
<style scoped>.weekly-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:20px}.weekly-summary>div{display:grid;gap:8px}.weekly-summary b{font-size:27px;font-weight:550;letter-spacing:-.7px}.weekly-summary span{font-size:12px;color:var(--m-text-faint)}</style>
