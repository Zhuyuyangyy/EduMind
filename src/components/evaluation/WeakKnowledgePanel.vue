<script setup lang="ts">
import { computed } from 'vue'
import type { EvaluationTreeData, KnowledgeModule } from '@/types/knowledge-tree'

const props = defineProps<{
  data: EvaluationTreeData | null
  selectedModule: KnowledgeModule | null
  reducedMotion?: boolean
}>()

const moduleDetail = computed(() => {
  if (!props.selectedModule) return null
  const weak = props.selectedModule.units
    .flatMap((u) => u.points)
    .filter((p) => p.mastery < 60)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 3)
  return {
    name: props.selectedModule.name,
    avg: props.selectedModule.avgMastery,
    count: props.selectedModule.units.reduce((s, u) => s + u.points.length, 0),
    weak,
  }
})

const trend = computed(() => {
  if (!props.data?.trends.length) return { points: '', min: 0, max: 100, labels: [] as string[] }
  const values = props.data.trends.map((t) => t.mastery)
  const min = Math.min(...values) - 5
  const max = Math.max(...values) + 5
  const w = 260
  const h = 80
  const points = props.data.trends
    .map((t, i) => {
      const x = (i / (props.data!.trends.length - 1)) * w
      const y = h - ((t.mastery - min) / (max - min)) * h
      return `${x},${y}`
    })
    .join(' ')
  return { points, min, max, labels: props.data.trends.map((t) => t.date) }
})

const pathSteps = [
  { label: '补充前置知识', status: 'completed' },
  { label: '完成专项练习', status: 'in-progress' },
  { label: '提交反思记录', status: 'pending' },
  { label: '再次评估', status: 'pending' },
]
</script>

<template>
  <div class="weak-panel">
    <div v-if="moduleDetail" class="panel-card module-detail">
      <div class="card-title">
        <span>{{ moduleDetail.name }}</span>
        <span class="module-avg">平均 {{ moduleDetail.avg.toFixed(1) }}%</span>
      </div>
      <div class="module-meta">{{ moduleDetail.count }} 个知识点 · {{ moduleDetail.weak.length }} 个薄弱点</div>
      <div v-for="p in moduleDetail.weak" :key="p.id" class="weak-item compact">
        <div class="weak-name">{{ p.name }}</div>
        <div class="weak-row">
          <span class="weak-mastery">{{ p.mastery == null ? '暂无' : `${p.mastery.toFixed(0)}%` }}</span>
          <span class="weak-confidence">置信 {{ p.confidence == null ? '暂无' : `${p.confidence.toFixed(0)}%` }}</span>
        </div>
      </div>
    </div>

    <div class="panel-card">
      <div class="card-title">当前薄弱知识点</div>
      <div v-for="(p, idx) in data?.weakPoints" :key="p.id" class="weak-item">
        <div class="weak-header">
          <span class="weak-index">{{ String(idx + 1).padStart(2, '0') }}</span>
          <span class="weak-name">{{ p.name }}</span>
        </div>
        <div class="weak-row">
          <span class="weak-mastery">{{ p.mastery == null ? '暂无' : `${p.mastery.toFixed(0)}%` }}</span>
          <span class="weak-confidence">置信 {{ p.confidence == null ? '暂无' : `${p.confidence.toFixed(0)}%` }}</span>
        </div>
        <div class="weak-issue">{{ p.issue }}</div>
        <div class="weak-action">{{ p.action }}</div>
      </div>
    </div>

    <div class="panel-card">
      <div class="card-title">推荐学习路径</div>
      <div class="path-list">
        <div v-for="(step, i) in pathSteps" :key="i" class="path-step" :class="step.status">
          <span class="path-index">{{ i + 1 }}</span>
          <span class="path-label">{{ step.label }}</span>
          <span class="path-status">{{ step.status === 'completed' ? '已完成' : step.status === 'in-progress' ? '进行中' : '待开始' }}</span>
        </div>
      </div>
    </div>

    <div class="panel-card">
      <div class="card-title">近期掌握趋势</div>
      <div class="trend-chart">
        <svg viewBox="0 0 260 90" class="trend-svg" preserveAspectRatio="none">
          <defs>
            <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--primary, #46b5d1)" stop-opacity="0.15" />
              <stop offset="100%" stop-color="var(--primary, #46b5d1)" stop-opacity="0" />
            </linearGradient>
          </defs>
          <polyline fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1" points="0,0 260,0 260,80 0,80" />
          <polyline
            fill="none"
            stroke="var(--primary, #46b5d1)"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            :points="trend.points"
          />
          <polygon :points="`${trend.points} 260,80 0,80`" fill="url(#trendArea)" />
          <circle
            v-for="(t, i) in data?.trends"
            :key="i"
            :cx="(i / (data!.trends.length - 1)) * 260"
            :cy="80 - ((t.mastery - trend.min) / (trend.max - trend.min)) * 80"
            r="2.5"
            fill="var(--bg-card, #0d1b2a)"
            stroke="var(--primary, #46b5d1)"
            stroke-width="1.5"
          />
        </svg>
        <div class="trend-labels">
          <span v-for="(label, i) in trend.labels" :key="i" :style="{ left: (i / (trend.labels.length - 1)) * 100 + '%' }">{{ label }}</span>
        </div>
      </div>
    </div>

    <div class="panel-card agent-conclusion">
      <div class="card-title">本轮智能体结论</div>
      <p>{{ data?.agentConclusion }}</p>
    </div>
  </div>
</template>

<style scoped>
.weak-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  overflow-y: auto;
  padding-left: 4px;
}

.panel-card {
  background: var(--bg-card, #0d1b2a);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px;
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main, #f2f6fa);
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.module-avg {
  font-size: 12px;
  color: var(--text-sub, #a9b8c7);
  font-weight: 500;
}

.module-meta {
  font-size: 12px;
  color: var(--text-weak, #6f8294);
  margin-bottom: 10px;
}

.weak-item {
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.weak-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.weak-item.compact {
  padding: 8px 0;
}

.weak-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.weak-index {
  font-size: 11px;
  color: var(--text-weak, #6f8294);
  font-weight: 600;
}

.weak-name {
  flex: 1;
  font-size: 13px;
  color: var(--text-main, #f2f6fa);
  font-weight: 500;
}

.weak-row {
  display: flex;
  gap: 12px;
  margin-bottom: 4px;
}

.weak-mastery {
  font-size: 12px;
  color: var(--danger, #e66a6a);
  font-weight: 600;
}

.weak-confidence {
  font-size: 12px;
  color: var(--text-weak, #6f8294);
}

.weak-issue {
  font-size: 12px;
  color: var(--text-sub, #a9b8c7);
  line-height: 1.5;
}

.weak-action {
  font-size: 12px;
  color: var(--text-weak, #6f8294);
  margin-top: 4px;
}

.path-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.path-step {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}

.path-index {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-weak, #6f8294);
}

.path-step.completed .path-index {
  background: var(--success, #45c486);
  color: var(--bg-card, #0d1b2a);
}

.path-step.in-progress .path-index {
  background: var(--primary, #46b5d1);
  color: var(--bg-card, #0d1b2a);
}

.path-label {
  flex: 1;
  color: var(--text-main, #f2f6fa);
}

.path-status {
  font-size: 11px;
  color: var(--text-weak, #6f8294);
}

.path-step.completed .path-status {
  color: var(--success, #45c486);
}

.path-step.in-progress .path-status {
  color: var(--primary, #46b5d1);
}

.trend-chart {
  position: relative;
}

.trend-svg {
  width: 100%;
  height: 90px;
  overflow: visible;
}

.trend-labels {
  position: relative;
  height: 16px;
  margin-top: 4px;
}

.trend-labels span {
  position: absolute;
  transform: translateX(-50%);
  font-size: 10px;
  color: var(--text-weak, #6f8294);
}

.agent-conclusion p {
  font-size: 12px;
  color: var(--text-sub, #a9b8c7);
  line-height: 1.7;
  margin: 0;
}
</style>
