<template>
  <section class="personal-agent-card" :class="{ 'personal-agent-card--expanded': expanded }" aria-label="个人 Agent 学习建议">
    <header class="personal-agent-card__header">
      <div>
        <p class="personal-agent-card__eyebrow">PERSONAL AGENT</p>
        <h2>{{ expanded ? '今天的学习简报' : '星枢提醒' }}</h2>
      </div>
      <span class="personal-agent-card__mark" aria-hidden="true"><MobileIcon name="sparkle" :size="18" /></span>
    </header>

    <div class="personal-agent-card__insight">
      <span class="m-badge m-badge--info">{{ insight.eyebrow }}</span>
      <h3>{{ insight.title }}</h3>
      <p>{{ insight.detail }}</p>
      <small v-if="insight.evidence">依据：{{ insight.evidence }}</small>
      <RouterLink :to="insight.to" class="m-btn m-btn--primary m-btn--sm">{{ insight.action }}</RouterLink>
    </div>

    <div class="personal-agent-card__questions">
      <span>你现在更想：</span>
      <RouterLink v-for="item in questions" :key="item.label" :to="item.to">{{ item.label }}<MobileIcon name="chevronRight" :size="14" /></RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useLearningWorkspace } from '@/mobile/stores/learning-workspace'
import { activeGoal, dueReviewCount } from '@/mobile/data/workspace'
import MobileIcon from './MobileIcon.vue'

defineProps<{ expanded?: boolean }>()
const store = useLearningWorkspace()
const goal = computed(() => activeGoal(store.workspace))
const pendingTasks = computed(() => store.taskItems.filter(task => !task.done && task.localState !== 'deferred'))
const dueReviews = computed(() => dueReviewCount(store.workspace))

const insight = computed(() => {
  if (!store.loaded) return { eyebrow: '正在读取', title: '我先看看今天适合从哪里开始。', detail: '学习建议只会使用当前账号已经保存的目标、任务和记录。', evidence: '', to: '/today', action: '回到首页' }
  if (dueReviews.value > 0) return { eyebrow: '优先处理', title: `有 ${dueReviews.value} 条复习已经到期。`, detail: '先回忆，再展开答案和解释；复习后再决定是否开始新内容。', evidence: '已完成练习中的错题与已保存复习安排', to: '/review', action: '去看错题' }
  const task = pendingTasks.value[0]
  if (task) return { eyebrow: '今天先做', title: task.title, detail: '完成后会留下真实任务记录，我再帮你安排下一步。', evidence: '当前账号已确认的任务清单', to: { path: '/focus', query: { task: task.id, ...(task.goalId ? { goal: task.goalId } : {}) } }, action: '开始这一步' }
  if (goal.value) return { eyebrow: '下一步建议', title: `为「${goal.value.title}」拆出一小步。`, detail: '你已经有一个进行中的目标，可以让星枢先生成可预览的任务清单。', evidence: '当前账号的进行中目标', to: { path: '/agent', query: { goal: goal.value.id } }, action: '生成任务预览' }
  const materialCount = store.workspace?.materials.length || 0
  if (materialCount > 0) return { eyebrow: '从原文开始', title: '打开一份资料，先找到一个可理解的段落。', detail: '我可以根据你主动导入的资料定位原文，再带你继续提问。', evidence: `当前账号已有 ${materialCount} 份私有资料`, to: '/library', action: '打开知识库' }
  return { eyebrow: '先认识你的方向', title: '告诉我你现在最想学什么。', detail: '设置一个目标后，首页、学习页和 Agent 才能围绕同一件事给出建议。', evidence: '当前还没有进行中的学习目标', to: '/workspace', action: '设置学习目标' }
})

const questions = computed(() => {
  const task = pendingTasks.value[0]
  if (dueReviews.value > 0) return [{ label: '换个节奏', to: '/agent?kind=review' }, { label: '问导师', to: '/tutor' }]
  if (task) return [{ label: '先专注 25 分钟', to: { path: '/focus', query: { task: task.id } } }, { label: '先问清楚', to: '/tutor' }]
  if (goal.value) return [{ label: '直接开始专注', to: { path: '/focus', query: { goal: goal.value.id } } }, { label: '调整目标', to: '/workspace' }]
  return [{ label: '先设一个目标', to: '/workspace' }, { label: '看看学习路径', to: '/planning' }]
})

onMounted(() => { if (!store.loaded) store.refresh() })
</script>

<style scoped>
.personal-agent-card { padding:18px; border:1px solid var(--m-primary-border); border-radius:20px; background:var(--m-focus-surface,var(--m-primary-soft)); }
.personal-agent-card--expanded { padding:22px; }
.personal-agent-card__header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px; }
.personal-agent-card__eyebrow { margin:0 0 5px; color:var(--m-primary); font-size:10px; font-weight:650; letter-spacing:1.1px; }
.personal-agent-card h2 { margin:0; font-size:18px; letter-spacing:-.3px; }
.personal-agent-card__mark { display:grid; place-items:center; width:34px; height:34px; border-radius:12px; color:var(--m-primary); background:var(--m-surface); }
.personal-agent-card__insight { padding:15px; border-radius:15px; background:color-mix(in srgb,var(--m-surface) 78%,transparent); }
.personal-agent-card__insight h3 { margin:9px 0 5px; font-size:16px; line-height:1.5; overflow-wrap:anywhere; }
.personal-agent-card__insight p { margin:0; color:var(--m-text-dim); font-size:13px; line-height:1.75; }
.personal-agent-card__insight small { display:block; margin-top:8px; color:var(--m-text-faint); font-size:11px; line-height:1.6; }
.personal-agent-card__insight .m-btn { margin-top:13px; }
.personal-agent-card__questions { display:flex; align-items:center; flex-wrap:wrap; gap:6px 12px; margin-top:13px; color:var(--m-text-faint); font-size:11px; }
.personal-agent-card__questions a { display:inline-flex; align-items:center; gap:2px; min-height:36px; color:var(--m-primary); text-decoration:none; font-size:12px; }
@media(min-width:900px){.personal-agent-card{max-width:760px}.personal-agent-card--expanded{max-width:none}.personal-agent-card__insight{padding:18px}}
</style>
