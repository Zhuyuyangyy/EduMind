<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { demoCourse } from '../../astripath/src/data/course.ts'
import {
  demoEvents,
  demoIsDiagnosed,
  demoKpStates,
  demoOverall,
  demoPlan,
  demoReset,
  demoWeakKps,
  getDemoState
} from '../demo/demoState.ts'
import { kpMastery, kpTested } from '../demo/treeData.ts'
import '../assets/styles/competition.css'

const router = useRouter()

const hasData = computed(() => demoIsDiagnosed() || demoKpStates().some(({ state }) => state.practiceCount > 0) || demoEvents().length > 0)

const comparison = computed(() =>
  demoCourse.knowledgePoints.map((kp) => {
    const tested = kpTested(kp.id)
    return {
      kpId: kp.id,
      name: kp.name,
      after: tested ? kpMastery(kp.id) : null,
      practiceCount: getDemoState().kpStates[kp.id].practiceCount
    }
  })
)

const improvedCount = computed(() => comparison.value.filter((c) => c.after !== null && c.after > 0).length)
const plan = computed(() => demoPlan())
const doneCount = computed(() => plan.value.filter((t) => getDemoState().planCompletion[t.key]).length)

const EVENT_LABEL: Record<string, string> = {
  'diagnosis-submitted': '完成诊断',
  'practice-submitted': '完成练习',
  'plan-task-completed': '完成任务',
  'demo-reset': '重置演示'
}
</script>

<template>
  <div class="comp-page">
    <header class="comp-head">
      <span class="comp-kicker">Step 6 · 效果反馈</span>
      <h1 class="comp-title">学习报告</h1>
      <p class="comp-subtitle">学习前后变化、掌握度更新流水与下一步推荐——闭环的最后一环，也是下一轮计划的输入。</p>
    </header>

    <template v-if="!hasData">
      <section class="comp-card comp-empty">
        <span class="comp-empty-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M4 20V4M4 20h16M8 16v-4M12.5 16V8M17 16v-6" />
          </svg>
        </span>
        <h2 class="comp-card-title" style="margin: 0">还没有学习数据</h2>
        <p class="comp-subtitle">完成诊断或练习后，这里会展示你的学习前后对比与掌握度变化流水。</p>
        <button class="comp-btn comp-btn-primary comp-btn-lg" @click="router.push('/diagnosis')">去完成学习诊断</button>
      </section>
    </template>

    <template v-else>
      <section class="comp-card">
        <div class="comp-card-title"><span class="dot"></span>学习前后对比</div>
        <p class="comp-stat-extra" style="margin-bottom: 14px">
          诊断前全部知识点未建立画像（0 分）；当前总体掌握度 <b style="color: var(--color-accent-cyan)">{{ demoOverall() ?? 0 }}%</b>，
          {{ improvedCount }} / {{ demoCourse.knowledgePoints.length }} 个知识点已建立并提升掌握度。
        </p>
        <table class="comp-table">
          <thead>
            <tr><th>知识点</th><th>学习前</th><th>当前掌握度</th><th>变化</th><th>练习题数</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in comparison" :key="row.kpId">
              <td style="color: var(--color-text-primary); font-weight: 600">{{ row.name }}</td>
              <td style="color: var(--color-text-tertiary)">未测试</td>
              <td>
                <span v-if="row.after === null" style="color: var(--color-text-tertiary)">未测试</span>
                <span v-else style="font-weight: 650; color: var(--color-text-primary)">{{ row.after }}%</span>
              </td>
              <td>
                <span v-if="row.after === null" class="comp-badge">—</span>
                <span v-else-if="row.after > 0" class="comp-badge comp-badge-ok">+{{ row.after }}</span>
                <span v-else class="comp-badge comp-badge-bad">0</span>
              </td>
              <td>{{ row.practiceCount }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="comp-card">
        <div class="comp-card-title"><span class="dot"></span>下一步推荐</div>
        <template v-if="demoWeakKps().length > 0">
          <p class="comp-stat-extra" style="margin-bottom: 12px">以下薄弱知识点（掌握度 &lt; 40%）已优先排入学习计划，建议按顺序完成：</p>
          <div style="display: flex; gap: 10px; flex-wrap: wrap">
            <button v-for="{ kp, state } in demoWeakKps().slice(0, 4)" :key="kp.id" class="comp-btn" @click="router.push(`/practice/${kp.id}`)">
              {{ kp.name }}（{{ Math.round(state.mastery) }}%）→ 去练习
            </button>
          </div>
        </template>
        <template v-else-if="plan[0]">
          <p class="comp-stat-extra" style="margin-bottom: 12px">
            当前无薄弱知识点。下一个计划任务：<b style="color: var(--color-text-primary)">Day {{ plan[0].day }} · {{ plan[0].kpName }} · {{ plan[0].title }}</b>
            （已完成 {{ doneCount }} / 7 个任务）
          </p>
          <button class="comp-btn comp-btn-primary" @click="router.push('/plan')">查看学习计划</button>
        </template>
        <template v-else>
          <p class="comp-stat-extra">本周计划已全部完成。可进入综合测评，或重置演示重新体验完整闭环。</p>
          <div style="display: flex; gap: 10px; margin-top: 10px">
            <button class="comp-btn comp-btn-primary" @click="router.push('/dialogue')">向 AI 导师提问</button>
            <button class="comp-btn" @click="router.push('/')">回到首页</button>
          </div>
        </template>
      </section>

      <section class="comp-card">
        <div class="comp-card-title"><span class="dot"></span>学习流水</div>
        <table class="comp-table">
          <thead>
            <tr><th style="width: 180px">时间</th><th style="width: 110px">类型</th><th>内容</th></tr>
          </thead>
          <tbody>
            <tr v-for="event in demoEvents()" :key="event.id">
              <td style="white-space: nowrap">{{ new Date(event.at).toLocaleString('zh-CN') }}</td>
              <td><span class="comp-badge comp-badge-cyan">{{ EVENT_LABEL[event.kind] ?? event.kind }}</span></td>
              <td>{{ event.summary }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="demoEvents().length === 0" class="comp-stat-extra">暂无学习记录。</p>
      </section>

      <section class="comp-card">
        <div class="comp-card-title"><span class="dot"></span>闭环是如何形成的</div>
        <ol class="comp-subtitle" style="margin: 0; padding-left: 20px; line-height: 2.1">
          <li><b style="color: var(--color-text-primary)">诊断 → 画像</b>：诊断正确率建立各知识点基线掌握度。</li>
          <li><b style="color: var(--color-text-primary)">画像 → 计划</b>：薄弱知识点优先，先修关系约束，生成 7 天计划。</li>
          <li><b style="color: var(--color-text-primary)">计划 → 行动</b>：专项学习（AI 导师讲解）与针对性练习。</li>
          <li><b style="color: var(--color-text-primary)">行动 → 反馈</b>：练习判分后按证据规则更新掌握度（含稳定区间与变化上限）。</li>
          <li><b style="color: var(--color-text-primary)">反馈 → 调整</b>：掌握度变化触发计划重新生成，薄弱点优先级随之改变。</li>
        </ol>
        <div style="display: flex; gap: 12px; margin-top: 14px">
          <button class="comp-btn comp-btn-ghost" @click="demoReset(); router.push('/')">重置演示，重新体验</button>
        </div>
      </section>
    </template>
  </div>
</template>
