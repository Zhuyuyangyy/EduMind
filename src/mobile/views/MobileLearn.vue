<template>
  <section class="workspace-page learn-page">
    <div class="workspace-heading"><div><p class="workspace-eyebrow">ONE STEP AT A TIME</p><h1>{{ focusOnly ? '留一段时间，给自己。' : '开始这一段学习。' }}</h1><p>{{ focusOnly ? '计时帮助开始，理解要交给练习来验证。' : '沿着路径理解，用一次练习检验，再安排下一步。' }}</p></div></div>
    <div v-if="error" class="m-error" role="alert">{{ error }}<button class="m-btn m-btn--ghost m-btn--sm" @click="load">重新读取</button></div>
    <div v-if="loading" class="m-skeleton m-skeleton--block" />
    <template v-else-if="workspace">
      <template v-if="!focusOnly">
        <div class="workspace-quick-grid"><RouterLink to="/tutor"><MobileIcon name="tutor" :size="23" /><b>AI 伴学</b><small>提示 · 分步 · 讲解</small></RouterLink><RouterLink to="/review"><MobileIcon name="refresh" :size="23" /><b>错题与复习</b><small>从真实作答中查漏</small></RouterLink><RouterLink to="/focus"><MobileIcon name="clock" :size="23" /><b>专注学习</b><small>10–45 分钟，自选节奏</small></RouterLink><RouterLink to="/growth"><MobileIcon name="chart" :size="23" /><b>证据报告</b><small>每个数字都有记录</small></RouterLink></div>
        <article v-if="resumable" class="m-card learn-resume"><span class="workspace-eyebrow">继续上次</span><h2>还有一组练习，等你接着完成。</h2><p>已提交 {{ resumable.answered }} / {{ resumable.exerciseIds.length }} 题，作答记录已保存。</p><RouterLink :to="`/study/session/${resumable.id}`" class="m-btn m-btn--primary m-btn--block">恢复这组练习 <MobileIcon name="chevronRight" :size="16" /></RouterLink></article>
        <div class="workspace-section-head"><h2>{{ goal?.title || '你的学习路径' }}</h2><span>{{ goal ? `${goal.dailyMinutes} 分钟 / 天` : '从一个目标开始' }}</span></div>
        <p v-if="goal" class="workspace-caption">{{ goal.deadline ? `目标日期 ${dateLabel(goal.deadline)}` : '按自己的节奏，不设截止日期' }}</p>
        <MobileLearningPath v-if="path" :path="path" />
        <div v-else class="workspace-empty"><MobileIcon name="path" :size="30" /><h3>先确定一个学习起点</h3><p>可以跳过测验，从自定义背景与自评开始；不会自动生成能力分数。</p><div class="workspace-actions"><RouterLink to="/workspace" class="m-btn m-btn--ghost m-btn--sm">创建目标</RouterLink><RouterLink to="/diagnose" class="m-btn m-btn--primary m-btn--sm">确认学习起点</RouterLink></div></div>
        <RouterLink to="/agent" class="workspace-context-link"><MobileIcon name="sparkle" :size="18" /> 让星枢把目标拆成学习任务 <MobileIcon name="chevronRight" :size="14" /></RouterLink>
      </template>
      <article v-if="focusOnly" class="m-card focus-card">
        <span class="workspace-eyebrow">{{ currentFocus?.status === 'running' ? '正在计时' : currentFocus?.status === 'paused' ? '已暂停，按你的节奏继续' : '一段安静的学习时间' }}</span>
        <div class="focus-clock" role="timer" aria-label="专注剩余时间">{{ remainingLabel }}</div>
        <label v-if="!currentFocus" class="m-field"><span>这次想专注多久？</span><select v-model.number="minutes" class="m-input"><option v-for="value in [10,15,25,45]" :key="value" :value="value">{{ value }} 分钟</option></select></label>
        <p v-if="goal">{{ goal.title }}</p>
        <div class="workspace-actions"><button v-if="!currentFocus" class="m-btn m-btn--primary m-btn--block" :disabled="busy" @click="focusAction('start')">开始专注</button><template v-else><button class="m-btn m-btn--primary" :disabled="busy" @click="focusAction(currentFocus.status === 'paused' ? 'resume' : 'pause')">{{ currentFocus.status === 'paused' ? '继续' : '暂停' }}</button><button class="m-btn m-btn--ghost" :disabled="busy" @click="focusAction('finish')">结束并保存</button></template></div>
        <p class="workspace-caption">可退出后恢复。记录的是计时经过的时间，不会把它当成知识掌握或提分证据。</p>
      </article>
      <template v-if="focusOnly"><div class="workspace-section-head"><h2>已完成的专注</h2><span>{{ completedFocus.length }} 次</span></div><div class="m-card"><p v-if="!completedFocus.length" class="workspace-caption">尚无计时记录。结束一次专注后会保存。</p><div v-for="record in completedFocus.slice(0, 8)" :key="record.id" class="workspace-row focus-record"><span>{{ dateLabel(record.startedAt) }}</span><b>{{ Math.floor(record.accumulatedSeconds / 60) }} 分 {{ record.accumulatedSeconds % 60 }} 秒</b></div></div></template>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import MobileIcon from '@/mobile/components/MobileIcon.vue'
import MobileLearningPath from '@/mobile/components/MobileLearningPath.vue'
import { activeGoal, changeWorkspace, dateLabel, loadPath, loadWorkspace, type Workspace } from '@/mobile/data/workspace'
import type { KnowledgePath } from '@/mobile/data/types'
const route = useRoute(), focusOnly = computed(() => route.path === '/focus')
const workspace = ref<Workspace | null>(null), path = ref<KnowledgePath | null>(null), loading = ref(true), error = ref(''), busy = ref(false), minutes = ref(25), tick = ref(Date.now())
const goal = computed(() => activeGoal(workspace.value)), resumable = computed(() => workspace.value?.sessions.find(s => s.status === 'active'))
const currentFocus = computed(() => workspace.value?.focus.find(f => ['running','paused'].includes(f.status)))
const completedFocus = computed(() => workspace.value?.focus.filter(f => f.status === 'completed') || [])
const remainingLabel = computed(() => { const focus = currentFocus.value; const elapsed = focus ? focus.accumulatedSeconds + (focus.status === 'running' ? Math.max(0, Math.floor((tick.value - Date.parse(focus.resumedAt)) / 1000)) : 0) : 0; const seconds = Math.max(0, (focus?.minutes || minutes.value) * 60 - elapsed); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` })
let timer: ReturnType<typeof setInterval> | undefined
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
async function load() { error.value = ''; try { [workspace.value, path.value] = await Promise.all([loadWorkspace(), loadPath()]) } catch (e) { error.value = e instanceof Error ? e.message : '读取失败' } finally { loading.value = false } }
onMounted(async () => { await load(); timer = setInterval(() => { tick.value = Date.now() }, 1000) })
async function focusAction(action: string) { busy.value = true; try { await changeWorkspace('focus', { action, id: currentFocus.value?.id, minutes: minutes.value, goalId: goal.value?.id }); await load() } catch (e) { error.value = e instanceof Error ? e.message : '计时保存失败，可重试' } finally { busy.value = false } }
</script>
<style scoped>
.learn-resume { margin-top: 20px; border-color: var(--m-primary-border); }.learn-resume h2 { font-size: 19px; line-height: 1.6; }.learn-resume p { color: var(--m-text-dim); font-size: 14px; }.focus-card { display: grid; gap: 24px; text-align: center; padding: 32px 24px; background: var(--m-surface); }.focus-clock { display: grid; place-items: center; width: 230px; height: 230px; max-width: 100%; border: 2px solid var(--m-primary-border); border-top-color: var(--m-primary); border-right-color: var(--m-violet); border-radius: 50%; margin: 8px auto; font-size: 52px; font-weight: 550; letter-spacing: -2px; box-shadow: 0 0 36px rgba(77,216,240,.07), inset 0 0 30px rgba(141,123,255,.07); }.focus-card p { margin: 0; }.focus-card .workspace-actions > button { flex: 1; }.focus-record { padding: 14px 0; border-bottom: 1px solid var(--m-border); font-size: 14px; }.focus-record:last-child { border: 0; }
</style>
