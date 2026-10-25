<template>
  <section class="today">
    <div class="today__greeting">
      <p class="today__date">{{ todayLabel }}</p>
      <h1 class="today__hello">今天，向前一步。</h1>
      <p class="today__greeting-label">{{ greeting }}，{{ displayName }}。按自己的节奏，学一点新的。</p>
    </div>
    <template v-if="loading"><MobileSkeleton variant="hero" :count="1" /><MobileSkeleton variant="card" :count="2" /></template>
    <div v-else-if="loadError" class="m-error" role="alert"><b>学习数据加载失败</b><span class="m-error__detail">{{ loadError }}</span><button class="m-btn m-btn--ghost m-btn--sm" @click="load">重试</button></div>
    <template v-else>
      <MobileEmpty v-if="!profile" title="从了解你开始" desc="说说你的目标、基础与时间，让第一份学习计划更适合你。" action-text="开始学习诊断" action-icon="diagnose" @action="$router.push('/diagnose')" />
      <MobileEmpty v-else-if="!path" title="把目标，连成一条路。" desc="基于你的学习画像，找到当前可以开始的知识点。" :action-text="generating ? '生成中…' : '生成知识路径'" action-icon="path" @action="onGeneratePath"><p v-if="generateError" class="today__generate-error">{{ generateError }}</p></MobileEmpty>
      <article v-else-if="todayTopic" class="today__hero">
        <div class="today__hero-intro">
          <span class="today__eyebrow">今日专注</span>
          <h2 class="today__hero-title">{{ todayTopic.topicName }}</h2>
          <p class="today__hero-desc">{{ todayTopic.phaseName }} · 从这一点开始</p>
          <MobileOrbit class="today__orbit" />
        </div>
        <div class="today__hero-signal">
          <div class="today__ring" :style="{ '--pct': Math.round(todayTopic.masteryEstimate * 100) }">
            <svg viewBox="0 0 72 72" aria-hidden="true"><circle class="today__ring-track" cx="36" cy="36" r="30" /><circle class="today__ring-fill" cx="36" cy="36" r="30" /></svg>
            <div class="today__ring-num"><b>{{ Math.round(todayTopic.masteryEstimate * 100) }}</b><i>%</i></div>
          </div>
          <div><span class="today__signal-title">掌握度估计</span><p>掌握估计 {{ Math.round(todayTopic.masteryEstimate * 100) }}% · 供规划参考</p></div>
          <span class="today__signal-icon"><MobileIcon name="target" :size="19" /></span>
        </div>
        <div class="today__hero-actions">
          <button class="m-btn m-btn--primary m-btn--block" :disabled="startingPractice" @click="onStartPractice">{{ startingPractice ? '创建中…' : '开始练习' }}<MobileIcon name="chevronRight" :size="17" /></button>
          <RouterLink :to="{ path: '/tutor', query: { topic: todayTopic.topicId, name: todayTopic.topicName } }" class="today__tutor-link"><MobileIcon name="tutor" :size="16" /> 先问问 AI 导师</RouterLink>
        </div>
        <p v-if="practiceError" class="today__generate-error" role="alert">{{ practiceError }}</p>
        <details class="today__recommendation"><summary>为什么推荐这个主题？<MobileIcon name="chevronRight" :size="13" /></summary><p>{{ todayTopic.reason }}。重要度 {{ Math.round(todayTopic.importance * 100) }}%。掌握度为路径估计，不代表练习完成率。</p></details>
      </article>
      <div class="today__entries">
        <RouterLink to="/diagnose" class="today__entry"><span class="today__entry-icon"><MobileIcon name="diagnose" :size="21" /></span><strong>学习档案</strong><small>从了解自己开始</small><MobileIcon name="chevronRight" :size="13" class="today__entry-arrow" /></RouterLink>
        <RouterLink to="/tutor" class="today__entry"><span class="today__entry-icon today__entry-icon--tutor"><MobileIcon name="tutor" :size="21" /></span><strong>AI 导师</strong><small>把每个卡点聊清楚</small><MobileIcon name="chevronRight" :size="13" class="today__entry-arrow" /></RouterLink>
      </div>
      <template v-if="path">
        <div class="today__section-head"><h2 class="m-section-title">你的学习路径</h2><RouterLink to="/growth">查看成长 <MobileIcon name="chevronRight" :size="13" /></RouterLink></div>
        <MobileLearningPath :path="path" :initial-phase="todayTopic?.phaseId" />
      </template>
      <template v-if="profile">
        <div class="today__section-head"><h2 class="m-section-title">我的画像</h2><span>{{ profileSourceLabel }}</span></div>
        <div class="m-card today__portrait">
          <div v-if="dimensions.length" class="today__dims"><div v-for="dim in dimensions" :key="dim.label" class="today__dim"><div class="today__dim-head"><span>{{ dim.label }}</span><b>{{ dim.value }}</b></div><div class="m-progress"><div class="m-progress__fill" :style="{ width: `${Math.min(100, Math.max(0, dim.value))}%` }" /></div></div></div>
          <p v-else class="today__empty-inline">画像暂无维度数据</p>
          <p v-if="totalScore !== null" class="today__total">画像参考分 <b>{{ totalScore }}</b><span>用于规划，不代表测验成绩</span></p>
        </div>
      </template>
      <p class="today__footnote">专注眼前这一小步，慢慢走出自己的学习路径。</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getAuthSession } from '@/lib/auth'
import { apiPost } from '@/lib/api'
import MobileIcon from '../components/MobileIcon.vue'
import MobileOrbit from '../components/MobileOrbit.vue'
import MobileLearningPath from '../components/MobileLearningPath.vue'
import MobileEmpty from '../components/MobileEmpty.vue'
import MobileSkeleton from '../components/MobileSkeleton.vue'
import {
  currentAccount,
  fetchAccountData,
  profileDimensions,
  profileTotalScore,
  selectTodayTopic,
} from '@/mobile/data/learning-data'
import { createStudySession } from '@/mobile/data/study'
import type { KnowledgePath, LearnerProfile } from '@/mobile/data/types'

const router = useRouter()
const session = getAuthSession()
const loading = ref(true)
const loadError = ref('')
const profile = ref<LearnerProfile | null>(null)
const path = ref<KnowledgePath | null>(null)
const generating = ref(false)
const generateError = ref('')
const startingPractice = ref(false)
const practiceError = ref('')

const displayName = computed(() => session?.name || session?.account || '同学')
const hour = new Date().getHours()
const greeting = computed(() => (hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'))
const todayLabel = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })

const dimensions = computed(() => profileDimensions(profile.value))
const totalScore = computed(() => profileTotalScore(profile.value))
const todayTopic = computed(() => selectTodayTopic(path.value))

const profileSourceLabel = computed(() => {
  const source = profile.value?.source
  if (source === 'dialogue' || source === 'mobile-self-assessment') return '自评画像'
  if (source === 'questionnaire') return profile.value?.analysisSource === 'rule' ? '问卷画像 · 规则降级分析' : '问卷画像 · 模型分析'
  if (source === 'profile-save') return '建档画像'
  return source ? `来源：${source}` : '账号记录'
})

/** 当前阶段：今日主题所属阶段（星图高亮用） */
function isCurrentPhase(phase: { id?: string; name?: string; topics?: { id: string }[] }) {
  const topic = todayTopic.value
  if (!topic) return false
  if (phase.id && topic.phaseId) return phase.id === topic.phaseId
  if (phase.name && topic.phaseName) return phase.name === topic.phaseName
  return (phase.topics || []).some(t => t.id === topic.topicId)
}

onMounted(async () => {
  document.title = '今日学习 · 智学星枢 Mobile'
  await load()
})

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const result = await fetchAccountData()
    if (result.stale) return // 过期响应（切号/退出），不渲染旧账号数据
    if (result.error || !result.data) {
      // P3-0：接口失败 ≠ 账号无数据，明确报错 + 重试，不回退演示数据
      loadError.value = result.error || '加载失败'
      return
    }
    // 二次校验：渲染前确认仍是当前账号的数据
    if (result.data.learningCycle?.accountId && result.data.learningCycle.accountId !== currentAccount()) {
      return
    }
    profile.value = result.data.profile
    path.value = result.data.knowledgePath
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : '未知错误'
  } finally {
    loading.value = false
  }
}

async function onGeneratePath() {
  if (generating.value) return
  generating.value = true
  generateError.value = ''
  try {
    const result = await apiPost<KnowledgePath>('/api/knowledge-path/generate', {})
    path.value = result
  } catch (err) {
    generateError.value = err instanceof Error ? err.message : '生成失败，请稍后重试'
  } finally {
    generating.value = false
  }
}

/** 开始练习：服务端创建会话（题目不含答案），进入练习页 */
async function onStartPractice() {
  if (!todayTopic.value || startingPractice.value) return
  startingPractice.value = true
  practiceError.value = ''
  try {
    const result = await createStudySession([todayTopic.value.topicId], 3)
    if ('error' in result) {
      practiceError.value = result.message || '创建练习失败，请重试'
      return
    }
    await router.push(`/study/session/${result.session.id}`)
  } finally {
    startingPractice.value = false
  }
}
</script>

<style scoped>
.today__greeting { padding: 10px 0 24px; }
.today__date { font-size: 11px; font-weight: 500; letter-spacing: .5px; color: var(--m-text-faint); margin: 0 0 10px; }
.today__hello { font-size: 30px; letter-spacing: -1.25px; margin: 0 0 10px; }
.today__greeting-label { font-size: 12px; color: var(--m-text-dim); margin: 0; line-height: 1.7; }
.today__hero { position: relative; border: 1px solid #e2e7f2; background: radial-gradient(ellipse at 95% 0%, #f0f4ff, transparent 65%), var(--m-surface); padding: 22px; border-radius: 27px; box-shadow: var(--m-shadow-float); }
.today__hero-intro { position: relative; min-height: 116px; padding-right: 104px; }
.today__eyebrow { color: var(--m-primary); font-size: 11px; letter-spacing: 1px; font-weight: 600; }
.today__hero-title { font-size: 23px; letter-spacing: -.7px; line-height: 1.4; margin: 12px 0 6px; position: relative; z-index: 1; }
.today__hero-desc { font-size: 11px; color: var(--m-text-faint); margin: 0; line-height: 1.7; }
.today__orbit { position: absolute; right: -20px; top: -26px; width: 140px; height: 140px; }
.today__hero-signal { display: flex; gap: 12px; align-items: center; padding: 15px 0 18px; }
.today__ring { position: relative; width: 44px; height: 44px; flex: none; }
.today__ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.today__ring-track, .today__ring-fill { fill: none; stroke-width: 5; }
.today__ring-track { stroke: var(--m-primary-border); }
.today__ring-fill { stroke: var(--m-primary); stroke-linecap: round; stroke-dasharray: 188.5; stroke-dashoffset: calc(188.5 - 188.5 * var(--pct) / 100); transition: stroke-dashoffset 500ms var(--m-ease); }
.today__ring-num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; color: var(--m-primary); }
.today__ring-num i { font-size: 11px; font-style: normal; }
.today__signal-title { font-size: 13px; font-weight: 550; }
.today__hero-signal p { font-size: 11px; color: var(--m-text-faint); margin: 3px 0 0; }
.today__signal-icon { margin-left: auto; color: var(--m-primary); display: grid; place-items: center; width: 34px; height: 34px; border-radius: 12px; background: var(--m-primary-soft); }
.today__hero-actions { display: grid; gap: 4px; }
.today__hero-actions .m-btn { justify-content: space-between; padding-inline: 18px; min-height: 50px; font-size: 14px; }
.today__tutor-link { display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 44px; color: var(--m-text-dim); text-decoration: none; font-size: 12px; }
.today__recommendation { border-top: 1px solid var(--m-border); }
.today__recommendation summary { display: flex; align-items: center; justify-content: space-between; min-height: 40px; font-size: 11px; color: var(--m-text-faint); cursor: pointer; list-style: none; }
.today__recommendation[open] summary .m-icon { transform: rotate(90deg); }
.today__recommendation p { font-size: 11px; color: var(--m-text-dim); line-height: 1.7; margin: 0 0 4px; }
.today__entries { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
.today__entry { position: relative; display: grid; justify-items: start; gap: 5px; padding: 17px; background: var(--m-surface); border: 1px solid var(--m-border); border-radius: 21px; text-decoration: none; color: var(--m-text); transition: transform var(--m-duration), box-shadow var(--m-duration); }
.today__entry:active { transform: scale(.98); }
.today__entry-icon { color: var(--m-primary); width: 36px; height: 36px; display: grid; place-items: center; background: var(--m-primary-soft); border-radius: 12px; margin-bottom: 5px; }
.today__entry-icon--tutor { color: var(--m-violet); background: var(--m-violet-soft); }
.today__entry strong { font-size: 14px; font-weight: 600; }
.today__entry small { font-size: 11px; color: var(--m-text-faint); }
.today__entry-arrow { position: absolute; right: 14px; top: 23px; color: var(--m-text-faint); }
.today__section-head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; margin: 28px 0 13px; }
.today__section-head h2 { margin: 0; }
.today__section-head > a, .today__section-head > span { display: inline-flex; gap: 2px; align-items: center; color: var(--m-text-faint); font-size: 11px; text-decoration: none; }
.today__dims { display: grid; grid-template-columns: 1fr 1fr; gap: 22px 20px; }
.today__dim-head { display: flex; justify-content: space-between; font-size: 11px; color: var(--m-text-dim); margin-bottom: 9px; }
.today__dim-head b { color: var(--m-text); font-weight: 600; }
.today__total { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; border-top: 1px solid var(--m-border); margin: 22px 0 0; padding-top: 14px; color: var(--m-text-dim); font-size: 11px; }
.today__total b { font-size: 20px; color: var(--m-primary); }
.today__total span { margin-left: auto; font-size: 11px; color: var(--m-text-faint); }
.today__generate-error { font-size: 12px; color: var(--m-danger); }
.today__footnote { margin: 28px 0 4px; text-align: center; font-size: 11px; color: var(--m-text-faint); }
@media (max-width: 359px) { .today__hero { padding: 18px; } .today__hero-intro { padding-right: 88px; } .today__orbit { width: 120px; right: -20px; } .today__hero-title { font-size: 21px; } }
</style>
