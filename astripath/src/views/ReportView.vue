<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useLearningStore } from '../stores/learning.ts'
import { demoCourse } from '../data/course.ts'

const router = useRouter()
const store = useLearningStore()

const nameOf = (kpId: string) => demoCourse.knowledgePoints.find((k) => k.id === kpId)?.name ?? kpId

const hasData = computed(() => store.isDiagnosed || store.practiceTotalCount > 0 || store.state.events.length > 0)

/** 学习前后对比：诊断前全部未测试（0），当前为最新掌握度 */
const comparison = computed(() =>
  demoCourse.knowledgePoints.map((kp) => {
    const state = store.state.kpStates[kp.id]
    const tested = state.diagnosis !== null || state.practiceCount > 0
    return {
      kpId: kp.id,
      name: kp.name,
      before: 0,
      after: tested ? Math.round(state.mastery) : null,
      practiceCount: state.practiceCount
    }
  })
)

const improvedCount = computed(() => comparison.value.filter((c) => c.after !== null && c.after > c.before).length)

const EVENT_LABEL: Record<string, string> = {
  'diagnosis-submitted': '完成诊断',
  'practice-submitted': '完成练习',
  'plan-task-completed': '完成任务',
  'demo-reset': '重置演示'
}

const events = computed(() => [...store.state.events].reverse())

function printReport() {
  window.print()
}
</script>

<template>
  <header class="no-print">
    <h1 class="page-title">学习报告</h1>
    <p class="page-desc">学习前后变化、掌握度更新流水与下一步推荐（演示数据）</p>
  </header>

  <template v-if="!hasData">
    <section class="card empty-state">
      <span class="icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M4 20V4M4 20h16M8 16v-4M12.5 16V8M17 16v-6" />
        </svg>
      </span>
      <h2 class="card-title">还没有学习数据</h2>
      <p class="small muted">完成诊断或练习后，这里会展示你的学习前后对比与掌握度变化流水。</p>
      <button class="btn btn-primary btn-lg" @click="router.push('/diagnosis')">去完成学习诊断</button>
    </section>
  </template>

  <template v-else>
    <!-- 总览 -->
    <section class="card">
      <div class="section-head">
        <div>
          <h2 class="card-title">学习前后对比</h2>
          <p class="small muted">
            诊断前全部知识点未建立画像（0 分）；当前总体掌握度
            <b>{{ store.overall === null ? '—' : `${store.overall}%` }}</b>
            · {{ improvedCount }} / {{ demoCourse.knowledgePoints.length }} 个知识点已建立并提升掌握度
          </p>
        </div>
        <button class="btn no-print" @click="printReport">打印 / 导出报告</button>
      </div>

      <table class="table">
        <thead>
          <tr><th>知识点</th><th>学习前</th><th>当前掌握度</th><th>变化</th><th>练习题数</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in comparison" :key="row.kpId">
            <td style="font-weight: 600">{{ row.name }}</td>
            <td class="muted">未测试</td>
            <td>
              <span v-if="row.after === null" class="muted">未测试</span>
              <span v-else style="font-weight: 650">{{ row.after }}%</span>
            </td>
            <td>
              <span v-if="row.after === null" class="badge badge-idle">—</span>
              <span v-else-if="row.after > 0" class="badge badge-ok">+{{ row.after }}</span>
              <span v-else class="badge badge-bad">0</span>
            </td>
            <td>{{ row.practiceCount }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 下一步推荐 -->
    <section class="card no-print">
      <h2 class="card-title">下一步推荐</h2>
      <template v-if="store.weakKps.length > 0">
        <p class="small muted" style="margin-bottom: var(--gap-sm)">
          以下薄弱知识点（掌握度 &lt; 40%）已优先排入学习计划，建议按顺序完成：
        </p>
        <div class="chip-row">
          <button v-for="kp in store.weakKps.slice(0, 4)" :key="kp.kpId" class="chip" @click="router.push(`/practice/${kp.kpId}`)">
            {{ nameOf(kp.kpId) }}（{{ Math.round(kp.mastery) }}%）→ 去练习
          </button>
        </div>
      </template>
      <template v-else-if="store.todayTask">
        <p class="small muted" style="margin-bottom: var(--gap-sm)">
          当前无薄弱知识点。下一个计划任务：<b>Day {{ store.todayTask.day }} · {{ store.todayTask.kpName }} · {{ store.todayTask.title }}</b>
        </p>
        <button class="btn btn-primary" @click="router.push('/plan')">查看学习计划</button>
      </template>
      <template v-else>
        <p class="small muted" style="margin-bottom: var(--gap-sm)">本周计划已全部完成。可以进入综合测评，或重置演示重新体验完整闭环。</p>
        <div class="chip-row">
          <button class="btn btn-primary" @click="router.push('/tutor')">向 AI 导师提问</button>
          <button class="btn" @click="router.push('/')">回到首页</button>
        </div>
      </template>
    </section>

    <!-- 学习流水 -->
    <section class="card">
      <h2 class="card-title">学习流水</h2>
      <table class="table">
        <thead>
          <tr><th style="width: 180px">时间</th><th style="width: 110px">类型</th><th>内容</th></tr>
        </thead>
        <tbody>
          <tr v-for="event in events" :key="event.id">
            <td class="small muted" style="white-space: nowrap">{{ new Date(event.at).toLocaleString('zh-CN') }}</td>
            <td><span class="badge badge-accent">{{ EVENT_LABEL[event.kind] ?? event.kind }}</span></td>
            <td class="small">{{ event.summary }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="events.length === 0" class="small muted">暂无学习记录。</p>
    </section>

    <!-- 闭环说明 -->
    <section class="card">
      <h2 class="card-title">闭环是如何形成的</h2>
      <ol class="small" style="margin: 0; padding-left: 20px; line-height: 2">
        <li><b>诊断 → 画像</b>：诊断正确率建立各知识点基线掌握度。</li>
        <li><b>画像 → 计划</b>：薄弱知识点优先，先修关系约束，生成 7 天计划。</li>
        <li><b>计划 → 行动</b>：专项学习（AI 导师讲解）与针对性练习。</li>
        <li><b>行动 → 反馈</b>：练习判分后按证据规则更新掌握度（含稳定区间与变化上限）。</li>
        <li><b>反馈 → 调整</b>：掌握度变化触发计划重新生成，薄弱点优先级随之改变。</li>
      </ol>
    </section>
  </template>
</template>
