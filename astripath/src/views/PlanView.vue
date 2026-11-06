<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLearningStore } from '../stores/learning.ts'
import { kbByKp } from '../data/knowledgeBase.ts'
import { planChangeSummary } from '../logic/plan.ts'
import type { PlanTask } from '../logic/types.ts'

const router = useRouter()
const store = useLearningStore()

const prevPlan = ref<PlanTask[] | null>(null)
const localNotice = ref<string[] | null>(null)

onMounted(() => {
  prevPlan.value = store.plan.map((t) => ({ ...t }))
})

const KIND_LABEL: Record<PlanTask['kind'], string> = {
  learn: '专项学习',
  practice: '针对性练习',
  review: '复习巩固',
  project: '综合项目',
  assessment: '综合测评'
}

const KIND_BADGE: Record<PlanTask['kind'], string> = {
  learn: 'badge-accent',
  practice: 'badge-warn',
  review: 'badge-idle',
  project: 'badge-accent',
  assessment: 'badge-ok'
}

const totalMinutes = computed(() => store.plan.reduce((sum, t) => sum + t.minutes, 0))
const doneCount = computed(() => store.planProgressInfo.done)

function regenerate() {
  const before = prevPlan.value ?? store.plan
  const changes = planChangeSummary(before, store.plan)
  localNotice.value = changes.length > 0 ? changes : ['学习数据未发生变化，计划维持不变']
  prevPlan.value = store.plan.map((t) => ({ ...t }))
}

function taskAction(task: PlanTask) {
  if (task.kind === 'learn' && task.kpId) {
    const card = kbByKp[task.kpId]
    router.push({ path: '/tutor', query: card ? { q: card.followUps[0] } : {} })
    return
  }
  if (task.kind === 'practice' && task.kpId) {
    router.push(`/practice/${task.kpId}`)
    return
  }
  if (task.kind === 'project') {
    router.push('/practice/pandas-clean')
    return
  }
  router.push('/report')
}
</script>

<template>
  <header>
    <h1 class="page-title">个性化学习计划</h1>
    <p class="page-desc">根据你的知识画像自动生成的 7 天计划（演示数据）· 薄弱知识点优先 · 尊重先修关系</p>
  </header>

  <template v-if="!store.isDiagnosed">
    <section class="card empty-state">
      <span class="icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
          <path d="M8 3v3M16 3v3M3.5 9.5h17" />
        </svg>
      </span>
      <h2 class="card-title">计划尚未生成</h2>
      <p class="small muted">完成学习诊断后，系统会根据你的薄弱知识点和先修关系生成 7 天学习计划。</p>
      <button class="btn btn-primary btn-lg" @click="router.push('/diagnosis')">去完成学习诊断</button>
    </section>
  </template>

  <template v-else>
    <!-- 计划变更提示（练习/诊断导致画像变化时自动出现） -->
    <div v-if="store.planNotice" class="notice notice-info no-print">
      <span>✦</span>
      <div>
        <b>学习计划已根据最新学习数据重新生成</b>（{{ new Date(store.planNotice.at).toLocaleString('zh-CN') }}）：
        <span v-for="change in store.planNotice.changes" :key="change" style="display: block">{{ change }}</span>
        <button class="btn btn-ghost small" style="margin-top: 6px; padding: 2px 8px" @click="store.dismissPlanNotice()">知道了</button>
      </div>
    </div>

    <div v-if="localNotice" class="notice notice-ok no-print">
      <span>✓</span>
      <div>
        <span v-for="line in localNotice" :key="line" style="display: block">{{ line }}</span>
      </div>
    </div>

    <section class="card">
      <div class="section-head" style="margin-bottom: var(--gap-sm)">
        <div>
          <h2 class="card-title">本周计划</h2>
          <p class="small muted">
            共 7 天 · 预计 {{ totalMinutes }} 分钟 · 已完成 {{ doneCount }} / 7 个任务
          </p>
        </div>
        <div class="no-print" style="display: flex; gap: 8px">
          <button class="btn" @click="regenerate">重新生成计划</button>
          <button class="btn btn-ghost" @click="router.push('/report')">查看学习报告</button>
        </div>
      </div>

      <div class="progress-track" style="margin-bottom: var(--gap-sm)">
        <div class="progress-fill" :style="{ width: `${(doneCount / 7) * 100}%` }"></div>
      </div>

      <div v-for="task in store.plan" :key="task.key" class="plan-day">
        <div class="day-badge" :class="{ done: store.state.planCompletion[task.key] }">
          <span class="d">{{ task.day }}</span>
          <span class="t">DAY</span>
        </div>
        <div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
            <span style="font-weight: 650">{{ task.kpName }} · {{ task.title }}</span>
            <span class="badge" :class="KIND_BADGE[task.kind]">{{ KIND_LABEL[task.kind] }}</span>
            <span class="small muted">约 {{ task.minutes }} 分钟</span>
          </div>
          <p class="plan-reason">{{ task.reason }}</p>
        </div>
        <div class="no-print" style="display: flex; flex-direction: column; gap: 8px; align-items: flex-end">
          <button
            class="plan-check"
            :class="{ on: store.state.planCompletion[task.key] }"
            @click="store.toggleTask(task.key, task.kpName)"
          >
            <span>{{ store.state.planCompletion[task.key] ? '✓ 已完成' : '标记完成' }}</span>
          </button>
          <button v-if="task.kpId" class="btn btn-ghost small" @click="taskAction(task)">
            {{ task.kind === 'learn' ? '问 AI 导师' : '开始练习' }}
          </button>
        </div>
      </div>
    </section>

    <section class="card">
      <h2 class="card-title">计划是如何生成的？</h2>
      <ul class="small" style="margin: 0; padding-left: 20px; line-height: 2">
        <li><b>薄弱优先</b>：从掌握度最低的知识点开始选入计划，并连带其先修闭包（先修放不下则跳过，尝试下一个薄弱点）。</li>
        <li><b>先修约束</b>：后续知识点只会排在先修之后；同轮候选优先「能解锁链上后续薄弱点」的知识点，保证薄弱链连续安排。</li>
        <li><b>动态调整</b>：每次练习或诊断改变掌握度后，计划自动重新生成，并提示变化内容。</li>
        <li><b>可解释</b>：每个任务都标注推荐理由（引用当前掌握度、最近测试与先修状态）。</li>
      </ul>
      <p class="small muted" style="margin-top: var(--gap-sm)">
        计划生成为确定性算法：相同学习数据必定产生相同计划，无随机性、无模型参与。
      </p>
    </section>
  </template>
</template>
