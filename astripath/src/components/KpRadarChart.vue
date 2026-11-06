<script setup lang="ts">
/** 知识画像雷达图（ECharts） */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { RadarChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { KpMasteryState } from '../logic/types.ts'
import { demoCourse } from '../data/course.ts'

echarts.use([RadarChart, TooltipComponent, CanvasRenderer])

const props = defineProps<{ states: KpMasteryState[] }>()
const el = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null

function render() {
  if (!el.value) return
  if (!chart) chart = echarts.init(el.value)
  const indicator = demoCourse.knowledgePoints.map((kp) => ({ name: kp.name, max: 100 }))
  chart.setOption({
    tooltip: { trigger: 'item' },
    radar: {
      indicator,
      radius: '68%',
      axisName: { color: '#5d6680', fontSize: 11 },
      splitLine: { lineStyle: { color: '#e2e6f0' } },
      splitArea: { areaStyle: { color: ['#fbfcfe', '#f4f6fb'] } },
      axisLine: { lineStyle: { color: '#e2e6f0' } }
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            value: demoCourse.knowledgePoints.map((kp) => {
              const state = props.states.find((s) => s.kpId === kp.id)
              return state?.mastery ?? 0
            }),
            name: '掌握度（演示评估值）',
            areaStyle: { color: 'rgba(76, 91, 212, 0.22)' },
            lineStyle: { color: '#4c5bd4', width: 2 },
            itemStyle: { color: '#4c5bd4' }
          }
        ]
      }
    ]
  })
}

onMounted(() => {
  render()
  window.addEventListener('resize', handleResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chart = null
})

function handleResize() {
  chart?.resize()
}

watch(
  () => props.states,
  () => render(),
  { deep: true }
)
</script>

<template>
  <div ref="el" style="width: 100%; height: 340px"></div>
</template>
