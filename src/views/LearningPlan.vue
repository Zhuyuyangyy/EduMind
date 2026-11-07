<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { kbByKp } from '../../astripath/src/data/knowledgeBase.ts'
import { demoIsDiagnosed, demoPlan, demoTogglePlanTask, getDemoState } from '../demo/demoState.ts'
import '../assets/styles/competition.css'

const router = useRouter()
const notice = ref<string[] | null>(null)

const plan = computed(() => demoPlan())
const doneCount = computed(() => plan.value.filter((t) => getDemoState().planCompletion[t.key]).length)
const totalMinutes = computed(() => plan.value.reduce((s, t) => s + t.minutes, 0))

const KIND_LABEL: Record<string, string> = {
  learn: '专项学习',
  practice: '针对性练习',
  review: '复习巩固',
  project: '综合项目',
  assessment: '综合测评'
}

const KIND_BADGE: Record<string, string> = {
  learn: 'comp-badge comp-badge-purple',
  practice: 'comp-badge comp-badge-warn',
  review: 'comp-badge',
  project: 'comp-badge comp-badge-cyan',
  assessment: 'comp-badge comp-badge-ok'
}

function toggle(task: { key: string; kpName: string }) {
  demoTogglePlanTask(task.key, task.kpName)
}

function regenerate() {
  notice.value = ['计划已根据最新学习数据重新生成（确定性算法：相同数据必定产生相同计划）']
}

function taskAction(task: { kpId: string | null; kind: string }) {
  if (task.kind === 'learn' && task.kpId) {
    const card = kbByKp[task.kpId]
    router.push({ path: '/dialogue', query: card ? { q: card.followUps[0] } : {} })
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
  router.push('/evaluation')
}
</script>

<template>
  <div class="comp-page">
    <header class="comp-head">
      <span class="comp-kicker">Step 3 · 动态学习计划</span>
      <h1 class="comp-title">个性化 7 天学习计划</h1>
      <p class="comp-subtitle">
        根据知识画像自动生成：薄弱知识点优先、尊重先修关系、每个任务附带可解释的推荐理由；
        练习或诊断改变掌握度后自动重新生成。
      </p>
    </header>

    <template v-if="!demoIsDiagnosed()">
      <section class="comp-card comp-empty">
        <span class="comp-empty-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" /><path d="M8 3v3M16 3v3M3.5 9.5h17" />
          </svg>
        </span>
        <h2 class="comp-card-title" style="margin: 0">计划尚未生成</h2>
        <p class="comp-subtitle">完成学习诊断后，系统会根据薄弱知识点和先修关系生成 7 天学习计划。</p>
        <button class="comp-btn comp-btn-primary comp-btn-lg" @click="router.push('/diagnosis')">去完成学习诊断</button>
      </section>
    </template>

    <template v-else>
      <div v-if="notice" class="comp-notice comp-notice-ok">
        <span>✓</span>
        <div>{{ notice[0] }}</div>
      </div>

      <section class="comp-card">
        <div style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px; margin-bottom: 14px">
          <div>
            <div class="comp-card-title" style="margin: 0"><span class="dot"></span>本周计划</div>
            <p class="comp-stat-extra" style="margin-top: 4px">
              共 7 天 · 预计 {{ totalMinutes }} 分钟 · 已完成 {{ doneCount }} / 7 个任务
            </p>
          </div>
          <div style="display: flex; gap: 10px">
            <button class="comp-btn" @click="regenerate">重新生成计划</button>
            <button class="comp-btn comp-btn-ghost" @click="router.push('/report')">查看学习报告</button>
          </div>
        </div>

        <div class="comp-progress" style="margin-bottom: 10px">
          <div class="comp-progress-fill" :style="{ width: `${(doneCount / 7) * 100}%` }"></div>
        </div>

        <div v-for="task in plan" :key="task.key" class="comp-plan-day">
          <div class="comp-day-badge" :class="{ done: getDemoState().planCompletion[task.key] }">
            <span class="d">{{ task.day }}</span>
            <span class="t">DAY</span>
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
              <span style="font-weight: 650; color: var(--color-text-primary)">{{ task.kpName }} · {{ task.title }}</span>
              <span :class="KIND_BADGE[task.kind]">{{ KIND_LABEL[task.kind] }}</span>
              <span class="comp-stat-extra">约 {{ task.minutes }} 分钟</span>
            </div>
            <p class="comp-plan-reason">{{ task.reason }}</p>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-end">
            <button class="comp-plan-check" :class="{ on: getDemoState().planCompletion[task.key] }" @click="toggle(task)">
              {{ getDemoState().planCompletion[task.key] ? '✓ 已完成' : '标记完成' }}
            </button>
            <button v-if="task.kpId" class="comp-btn comp-btn-ghost" style="padding: 6px 12px; font-size: 12.5px" @click="taskAction(task)">
              {{ task.kind === 'learn' ? '问 AI 导师' : '开始练习' }}
            </button>
          </div>
        </div>
      </section>

      <section class="comp-card">
        <div class="comp-card-title"><span class="dot"></span>计划是如何生成的？</div>
        <ul class="comp-subtitle" style="margin: 0; padding-left: 20px; line-height: 2.1">
          <li><b style="color: var(--color-text-primary)">薄弱优先</b>：从掌握度最低的知识点开始选入计划，并连带其先修闭包（先修放不下则跳过，尝试下一个薄弱点）。</li>
          <li><b style="color: var(--color-text-primary)">先修约束</b>：后续知识点只会排在先修之后；同轮候选优先「能解锁链上后续薄弱点」的知识点。</li>
          <li><b style="color: var(--color-text-primary)">动态调整</b>：每次练习或诊断改变掌握度后，计划自动重新生成。</li>
          <li><b style="color: var(--color-text-primary)">可解释</b>：每个任务都标注推荐理由（引用当前掌握度、最近测试与先修状态）。</li>
        </ul>
        <p class="comp-stat-extra" style="margin-top: 10px">计划生成为确定性算法，无随机性、无模型参与。</p>
      </section>
    </template>
  </div>
</template>
