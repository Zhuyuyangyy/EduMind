<template><div v-if="hasData" class="study-time-chart"><div ref="host" class="study-chart-canvas" role="img" :aria-label="chartDescription" /><details class="chart-data-table"><summary>查看每日计时数据</summary><table><thead><tr><th scope="col">日期</th><th scope="col">已结束计时</th></tr></thead><tbody><tr v-for="item in buckets" :key="item.day"><td>{{ item.day }}</td><td>{{ Math.floor(item.seconds / 60) }} 分 {{ item.seconds % 60 }} 秒</td></tr></tbody></table></details></div><div v-else class="chart-empty"><MobileIcon name="chart" :size="28" /><p>还没有这段时间的计时记录</p><RouterLink to="/focus">开始一次专注学习 →</RouterLink></div></template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { init, use, type ECharts } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, AriaComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import MobileIcon from './MobileIcon.vue'
use([BarChart,GridComponent,TooltipComponent,AriaComponent,SVGRenderer])
const props=defineProps<{buckets:Array<{day:string;seconds:number}>}>()
const host=ref<HTMLElement|null>(null),hasData=computed(()=>props.buckets.some(b=>b.seconds>0))
const useSeconds=computed(()=>Math.max(0,...props.buckets.map(b=>b.seconds))<60)
const chartDescription=computed(()=>props.buckets.map(b=>`${b.day}，${Math.floor(b.seconds/60)}分${b.seconds%60}秒`).join('；'))
let chart:ECharts|null=null, observer:ResizeObserver|undefined, themeObserver:MutationObserver|undefined
async function render(){
  await nextTick()
  if(!host.value){chart?.dispose();chart=null;return}
  chart ||= init(host.value,undefined,{renderer:'svg'})
  const tokens=getComputedStyle(document.documentElement),color=(key:string)=>tokens.getPropertyValue(key).trim(),unit=useSeconds.value?'秒':'分钟'
  chart.setOption({
    animation:!matchMedia('(prefers-reduced-motion: reduce)').matches,
    grid:{top:25,left:38,right:12,bottom:32},
    tooltip:{trigger:'axis',valueFormatter:(value:unknown)=>`${value} ${unit}`},
    xAxis:{type:'category',data:props.buckets.map(b=>b.day.slice(5).replace('-','/')),axisLine:{lineStyle:{color:color('--m-border-strong')}},axisTick:{show:false},axisLabel:{color:color('--m-text-faint'),fontSize:11,interval:props.buckets.length>14?5:0}},
    yAxis:{type:'value',name:unit,minInterval:1,nameTextStyle:{color:color('--m-text-faint')},axisLabel:{color:color('--m-text-faint'),fontSize:11},splitLine:{lineStyle:{color:color('--m-border')}}},
    series:[{type:'bar',data:props.buckets.map(b=>useSeconds.value?b.seconds:Number((b.seconds/60).toFixed(2))),barMaxWidth:26,itemStyle:{color:color('--m-primary'),borderRadius:[5,5,0,0]}}],aria:{enabled:true}
  })
  chart.resize()
}
onMounted(()=>{render();observer=new ResizeObserver(()=>chart?.resize());if(host.value)observer.observe(host.value);themeObserver=new MutationObserver(()=>{void render()});themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-mobile-theme']})})
watch(()=>props.buckets,async()=>{await render();observer?.disconnect();if(host.value)observer?.observe(host.value)},{deep:true})
onBeforeUnmount(()=>{observer?.disconnect();themeObserver?.disconnect();chart?.dispose()})
</script>
<style scoped>.study-chart-canvas{height:180px;width:100%;min-width:0}.chart-data-table{font-size:12px;color:var(--m-text-faint);margin-top:8px}.chart-data-table summary{cursor:pointer;min-height:40px;display:flex;align-items:center}.chart-data-table table{width:100%;border-collapse:collapse;font-size:12px}.chart-data-table th,.chart-data-table td{text-align:left;padding:8px;border-bottom:1px solid var(--m-border)}.chart-empty{padding:28px 8px;text-align:center;color:var(--m-text-faint);font-size:14px}.chart-empty .m-icon{color:var(--m-primary)}.chart-empty a{display:inline-flex;align-items:center;min-height:44px;color:var(--m-primary);text-decoration:none;font-size:14px}</style>
