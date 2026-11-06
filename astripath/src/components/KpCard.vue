<script setup lang="ts">
/** 知识点卡片：掌握度、最近测试、练习数量、推荐内容与操作入口 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { KpMasteryState } from '../logic/types.ts'
import { STATUS_LABEL } from '../logic/mastery.ts'
import { getKp } from '../data/course.ts'
import { kbByKp } from '../data/knowledgeBase.ts'

const props = defineProps<{ kp: KpMasteryState }>()
const router = useRouter()

const point = computed(() => getKp(props.kp.kpId))
const tested = computed(() => props.kp.diagnosis !== null || props.kp.practiceCount > 0)
const status = computed(() =>
  STATUS_LABEL[
    tested.value ? (props.kp.mastery >= 80 ? 'mastered' : props.kp.mastery < 40 ? 'weak' : 'learning') : 'untested'
  ]
)
const badgeClass = computed(() => {
  if (!tested.value) return 'badge-idle'
  if (props.kp.mastery >= 80) return 'badge-ok'
  if (props.kp.mastery < 40) return 'badge-bad'
  return 'badge-warn'
})
const fillClass = computed(() => {
  if (!tested.value) return ''
  if (props.kp.mastery >= 80) return 'ok'
  if (props.kp.mastery < 40) return 'bad'
  return 'warn'
})
const lastResultText = computed(() => {
  if (!props.kp.lastResult) return '暂无测试记录'
  const { correct, total, kind } = props.kp.lastResult
  return `${kind === 'diagnosis' ? '诊断' : '练习'} ${correct}/${total}`
})
const recommended = computed(() => kbByKp[props.kp.kpId]?.title ?? '课程讲义')
</script>

<template>
  <article class="kp-card">
    <div class="kp-card-head">
      <div>
        <div class="kp-name">{{ point.name }}</div>
        <div class="kp-cat">{{ point.category }} · 预计 {{ point.estMinutes }} 分钟</div>
      </div>
      <span class="badge" :class="badgeClass">{{ status }}</span>
    </div>

    <div class="kp-mastery-row">
      <span class="kp-mastery-value" :style="{ color: tested ? undefined : 'var(--idle)' }">
        {{ tested ? Math.round(kp.mastery) : '—' }}
      </span>
      <span class="small muted">{{ tested ? '掌握度（演示评估值）' : '未测试' }}</span>
    </div>
    <div class="progress-track">
      <div class="progress-fill" :class="fillClass" :style="{ width: `${tested ? Math.round(kp.mastery) : 0}%` }"></div>
    </div>

    <div class="kp-meta">
      <span>最近测试：{{ lastResultText }}</span>
      <span>练习：{{ kp.practiceCount }} 题（对 {{ kp.practiceCorrect }}）</span>
      <span style="grid-column: 1 / -1">推荐学习：{{ recommended }}</span>
    </div>

    <div class="kp-actions">
      <button class="btn" @click="router.push(`/practice/${point.id}`)">去练习</button>
      <button class="btn btn-ghost" @click="router.push('/tutor')">问 AI 导师</button>
    </div>
  </article>
</template>
