<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useLearningStore } from '../stores/learning.ts'
import { demoCourse } from '../data/course.ts'
import { statusOf, STATUS_LABEL } from '../logic/mastery.ts'
import type { MasteryStatus } from '../logic/types.ts'

const router = useRouter()
const store = useLearningStore()

/** 按先修层级布局知识图谱（拓扑分层，层内按课程顺序） */
const layers = computed(() => {
  const placed = new Set<string>()
  const result: Array<Array<(typeof demoCourse.knowledgePoints)[number]>> = []
  let remaining = [...demoCourse.knowledgePoints]
  while (remaining.length > 0) {
    const layer = remaining.filter((kp) => kp.prerequisites.every((p) => placed.has(p)))
    if (layer.length === 0) break
    for (const kp of layer) placed.add(kp.id)
    result.push(layer)
    remaining = remaining.filter((kp) => !placed.has(kp.id))
  }
  return result
})

function statusOfKp(kpId: string): MasteryStatus {
  const state = store.state.kpStates[kpId]
  const tested = state.diagnosis !== null || state.practiceCount > 0
  return statusOf(state.mastery, tested)
}

function masteryOf(kpId: string): number | null {
  const state = store.state.kpStates[kpId]
  const tested = state.diagnosis !== null || state.practiceCount > 0
  return tested ? Math.round(state.mastery) : null
}

const STATUS_STYLE: Record<MasteryStatus, { fill: string; stroke: string; badge: string }> = {
  untested: { fill: 'var(--idle-soft)', stroke: 'var(--idle)', badge: 'badge-idle' },
  weak: { fill: 'var(--bad-soft)', stroke: 'var(--bad)', badge: 'badge-bad' },
  learning: { fill: 'var(--warn-soft)', stroke: 'var(--warn)', badge: 'badge-warn' },
  mastered: { fill: 'var(--ok-soft)', stroke: 'var(--ok)', badge: 'badge-ok' }
}

// 图谱节点坐标（固定布局，保证可读性与稳定性）
const LAYER_Y = [70, 170, 225, 275]
function nodeX(count: number, index: number): number {
  if (count === 1) return 130
  return 100 + (560 / (count - 1)) * index
}
function nodeY(layerIndex: number): number {
  return LAYER_Y[layerIndex] ?? 70
}
function shortName(name: string): string {
  return name.length > 9 ? `${name.slice(0, 8)}…` : name
}
function prereqNames(kp: { prerequisites: string[] }): string {
  if (kp.prerequisites.length === 0) return '无'
  return kp.prerequisites
    .map((p) => demoCourse.knowledgePoints.find((k) => k.id === p)?.name ?? p)
    .join('、')
}
</script>

<template>
  <header>
    <h1 class="page-title">我的课程</h1>
    <p class="page-desc">演示课程（示例数据）· 知识结构与先修关系一览</p>
  </header>

  <section class="card">
    <div class="section-head">
      <div>
        <h2 class="card-title">{{ demoCourse.name }}</h2>
        <p class="small muted">{{ demoCourse.subtitle }} · 难度：{{ demoCourse.level }}</p>
      </div>
      <span class="badge badge-accent">{{ demoCourse.knowledgePoints.length }} 个知识点</span>
    </div>
    <p class="small" style="margin: var(--gap-sm) 0">{{ demoCourse.description }}</p>
    <h3 class="small" style="font-weight: 650; margin-bottom: 6px">课程目标</h3>
    <ul class="small muted" style="margin: 0; padding-left: 18px">
      <li v-for="goal in demoCourse.goals" :key="goal">{{ goal }}</li>
    </ul>
  </section>

  <section class="card">
    <h2 class="card-title">知识图谱（先修关系）</h2>
    <p class="small muted" style="margin-bottom: var(--gap-sm)">
      节点颜色反映你当前的掌握度状态（演示评估值）；箭头表示先修关系——建议按层级自底向上学习。
    </p>
    <div class="kg-wrap">
      <svg class="kg-svg" viewBox="0 0 760 300" role="img" aria-label="知识点先修关系图">
        <defs>
          <marker id="kgArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="#b7bed2" />
          </marker>
        </defs>
        <!-- 先修连线（与课程数据的先修关系一一对应） -->
        <g stroke="#b7bed2" stroke-width="1.5" marker-end="url(#kgArrow)">
          <line x1="130" y1="91" x2="130" y2="149" />
          <line x1="100" y1="191" x2="100" y2="204" />
          <line x1="190" y1="191" x2="190" y2="204" />
          <line x1="280" y1="191" x2="280" y2="204" />
          <line x1="150" y1="246" x2="150" y2="254" />
          <line x1="330" y1="246" x2="330" y2="254" />
        </g>
        <!-- 节点 -->
        <g v-for="(layer, li) in layers" :key="li">
          <g v-for="(kp, ki) in layer" :key="kp.id" :transform="`translate(${nodeX(layer.length, ki)}, ${nodeY(li)})`">
            <rect
              x="-62"
              y="-21"
              width="124"
              height="42"
              rx="10"
              :fill="STATUS_STYLE[statusOfKp(kp.id)].fill"
              :stroke="STATUS_STYLE[statusOfKp(kp.id)].stroke"
              stroke-width="1.5"
            />
            <text text-anchor="middle" y="-2" font-size="10.5" font-weight="650" fill="#182034">{{ shortName(kp.name) }}</text>
            <text text-anchor="middle" y="11" font-size="8.5" fill="#5d6680">
              {{ masteryOf(kp.id) === null ? '未测试' : `${masteryOf(kp.id)}%` }}
            </text>
          </g>
        </g>
      </svg>
    </div>
    <div class="chip-row" style="margin-top: var(--gap-sm)">
      <span class="badge badge-ok">已掌握 ≥80%</span>
      <span class="badge badge-warn">学习中 40-79%</span>
      <span class="badge badge-bad">需加强 &lt;40%</span>
      <span class="badge badge-idle">未测试</span>
    </div>
  </section>

  <section class="card">
    <h2 class="card-title">知识点清单</h2>
    <table class="table">
      <thead>
        <tr>
          <th style="min-width: 220px">知识点</th>
          <th>先修</th>
          <th>状态</th>
          <th>掌握度</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="kp in demoCourse.knowledgePoints" :key="kp.id">
          <td>
            <div style="font-weight: 600">{{ kp.name }}</div>
            <div class="small muted">{{ kp.description }}</div>
          </td>
          <td class="small">{{ prereqNames(kp) }}</td>
          <td>
            <span class="badge" :class="STATUS_STYLE[statusOfKp(kp.id)].badge">{{ STATUS_LABEL[statusOfKp(kp.id)] }}</span>
          </td>
          <td>{{ masteryOf(kp.id) === null ? '—' : `${masteryOf(kp.id)}%` }}</td>
          <td>
            <button class="btn btn-ghost" @click="router.push(`/practice/${kp.id}`)">练习</button>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
