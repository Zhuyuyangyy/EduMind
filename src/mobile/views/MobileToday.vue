<template>
  <section class="today">
    <!-- 加载中：骨架屏（A6） -->
    <MobileSkeleton v-if="loading" variant="hero" :count="1" />
    <template v-if="loading">
      <MobileSkeleton variant="card" :count="2" />
    </template>

    <!-- 加载失败：错误 + 重试，不回退未标记演示数据 -->
    <div v-else-if="loadError" class="m-error" role="alert">
      <b>学习数据加载失败</b>
      <span class="m-error__detail">{{ loadError }}</span>
      <button class="m-btn m-btn--ghost m-btn--sm" style="align-self: flex-start; margin-top: 8px" @click="load">重试</button>
    </div>

    <template v-else>
      <!-- 问候 -->
      <div class="today__greeting">
        <h1 class="today__hello">{{ greeting }}，{{ displayName }}</h1>
        <p class="today__date">{{ todayLabel }}</p>
      </div>

      <!-- 新用户：无画像 → 空状态（星球插画 + 单一行动） -->
      <MobileEmpty
        v-if="!profile"
        title="先做一次 6 维学习自评"
        desc="用 1 分钟给六个维度打分，系统会生成你的第一份知识路径。自评结果会标注为「自评画像」。"
        action-text="开始学习诊断"
        :action-icon="'diagnose'"
        @action="$router.push('/diagnose')"
      />

      <!-- 有画像没路径：生成入口 -->
      <MobileEmpty
        v-else-if="!path"
        title="基于你的画像生成知识路径"
        desc="路径由智能体按画像生成，知识点掌握度为模型估计，会持续标注来源。"
        :action-text="generating ? '生成中…' : '生成知识路径'"
        :action-icon="'path'"
        @action="onGeneratePath"
      >
        <p v-if="generateError" class="today__generate-error">{{ generateError }}</p>
      </MobileEmpty>

      <!-- 有路径：今日唯一任务（真实、可追溯）——核心视觉区 -->
      <article v-else-if="todayTopic" class="today__hero">
        <div class="today__hero-tag">
          <span class="m-badge m-badge--info">
            <MobileIcon name="target" :size="12" /> 今天先学这一件事
          </span>
          <span class="m-badge m-badge--warn" title="来自知识路径的模型估计，不是完成率">掌握度估计</span>
        </div>

        <div class="today__hero-body">
          <!-- 掌握度进度环（核心数字 34px） -->
          <div class="today__ring" :style="{ '--pct': Math.round(todayTopic.masteryEstimate * 100) }">
            <svg viewBox="0 0 72 72" aria-hidden="true">
              <circle class="today__ring-track" cx="36" cy="36" r="30" />
              <circle class="today__ring-fill" cx="36" cy="36" r="30" />
            </svg>
            <div class="today__ring-num">
              <b>{{ Math.round(todayTopic.masteryEstimate * 100) }}</b><i>%</i>
            </div>
          </div>
          <div class="today__hero-main">
            <h2 class="today__hero-title">{{ todayTopic.topicName }}</h2>
            <p class="today__hero-desc">来自「{{ todayTopic.phaseName }}」· 选取规则：{{ todayTopic.reason }}</p>
          </div>
        </div>

        <div class="today__hero-meta">
          <span class="today__meta-item">
            <MobileIcon name="star" :size="13" /> 重要度 {{ Math.round(todayTopic.importance * 100) }}%
          </span>
          <span class="today__meta-item">
            <MobileIcon name="chart" :size="13" /> 掌握估计 {{ Math.round(todayTopic.masteryEstimate * 100) }}%
          </span>
          <span class="today__meta-item">
            <MobileIcon name="book" :size="13" /> 知识点 #{{ todayTopic.topicId }}
          </span>
        </div>

        <div class="today__hero-actions">
          <button class="m-btn m-btn--primary m-btn--block" :disabled="startingPractice" @click="onStartPractice">
            <MobileIcon name="practice" :size="16" />
            {{ startingPractice ? '创建中…' : '开始练习' }}
          </button>
          <RouterLink :to="`/tutor?topic=${encodeURIComponent(todayTopic.topicId)}&name=${encodeURIComponent(todayTopic.topicName)}`" class="m-btn m-btn--ghost m-btn--block">
            <MobileIcon name="sparkle" :size="15" />
            问 AI 导师
          </RouterLink>
        </div>
        <p v-if="practiceError" class="today__generate-error">{{ practiceError }}</p>
      </article>

      <!-- 迷你知识星图（移动端母题：阶段轨道 + 当前节点高亮） -->
      <template v-if="path">
        <h2 class="m-section-title">知识星图 <span class="m-section-title__sub">当前所处阶段已点亮</span></h2>
        <div class="today__starmap">
          <div class="today__starmap-track" aria-hidden="true" />
          <RouterLink
            v-for="(phase, index) in path.phases"
            :key="phase.id"
            class="today__starmap-node"
            :class="{ 'today__starmap-node--active': isCurrentPhase(phase) }"
            :style="{ '--node-color': phase.color || '#54d6ff', '--node-index': index }"
            to="/growth"
          >
            <span class="today__starmap-dot" />
            <span class="today__starmap-name">{{ phase.name }}</span>
            <span class="today__starmap-count">{{ phase.topics?.length || 0 }} 个知识点</span>
          </RouterLink>
        </div>
      </template>

      <!-- 画像总览（真实画像，区分自评/分析来源） -->
      <template v-if="profile">
        <h2 class="m-section-title">我的画像 <span class="m-section-title__sub">{{ profileSourceLabel }}</span></h2>
        <div class="m-card">
          <div v-if="dimensions.length" class="today__dims">
            <div v-for="dim in dimensions" :key="dim.label" class="today__dim">
              <div class="today__dim-head">
                <span>{{ dim.label }}</span>
                <span class="today__dim-num">{{ dim.value }}</span>
              </div>
              <div class="m-progress"><div class="m-progress__fill" :style="{ width: dim.value + '%' }" /></div>
            </div>
          </div>
          <p v-else class="today__empty-inline">画像暂无维度数据</p>
          <p v-if="totalScore !== null" class="today__total">综合分 <b class="today__total-num">{{ totalScore }}</b></p>
        </div>
      </template>

      <!-- 路径明细（真实路径，标签级） -->
      <template v-if="path">
        <h2 class="m-section-title">路径明细 <span class="m-section-title__sub">掌握度为模型估计</span></h2>
        <div class="m-card">
          <div v-for="phase in path.phases" :key="phase.id" class="today__phase">
            <div class="today__phase-head">
              <span class="today__phase-dot" :style="{ background: phase.color || '#54d6ff' }" />
              <span class="today__phase-name">{{ phase.name }}</span>
              <span class="today__phase-count">{{ phase.topics?.length || 0 }} 个知识点</span>
            </div>
            <div class="today__topics">
              <span v-for="topic in phase.topics || []" :key="topic.id" class="today__topic" :class="{ 'today__topic--rec': topic.recommended }">
                {{ topic.name }}
                <i v-if="topic.recommended" class="today__topic-rec">推荐</i>
              </span>
            </div>
          </div>
        </div>
      </template>

      <p class="today__footnote">
        页面内容全部来自当前账号的服务端记录（画像 / 知识路径 / 学习闭环），按账号隔离；
        没有数据时显示空状态，不使用演示数据伪装进度。
      </p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getAuthSession } from '@/lib/auth'
import { apiPost } from '@/lib/api'
import MobileIcon from '../components/MobileIcon.vue'
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
.today__greeting {
  margin: var(--m-space-2) 0 var(--m-space-4);
}

.today__hello {
  font-size: var(--m-text-xl);
  margin: 0 0 var(--m-space-1);
}

.today__date {
  font-size: var(--m-text-sm);
  color: var(--m-text-faint);
  margin: 0;
}

/* ============ 核心学习卡（A1 主视觉） ============ */
.today__hero {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--m-space-4);
  background:
    radial-gradient(120% 90% at 85% 0%, rgba(139, 124, 255, 0.16), transparent 55%),
    linear-gradient(160deg, rgba(31, 111, 235, 0.18), var(--m-surface) 60%);
  border: 1px solid rgba(84, 214, 255, 0.28);
  border-radius: var(--m-radius-xl);
  padding: var(--m-space-5) var(--m-space-4);
  box-shadow: var(--m-shadow-float), var(--m-glow-primary);
  overflow: hidden;
}

.today__hero-tag {
  display: flex;
  flex-wrap: wrap;
  gap: var(--m-space-2);
}

.today__hero-body {
  display: flex;
  align-items: center;
  gap: var(--m-space-4);
}

/* 掌握度进度环 */
.today__ring {
  position: relative;
  width: 76px;
  height: 76px;
  flex: none;
}
.today__ring svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.today__ring-track {
  fill: none;
  stroke: var(--m-surface-2);
  stroke-width: 6;
}
.today__ring-fill {
  fill: none;
  stroke: var(--m-primary);
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 188.5; /* 2πr, r=30 */
  stroke-dashoffset: calc(188.5 - 188.5 * var(--pct) / 100);
  filter: drop-shadow(0 0 4px rgba(84, 214, 255, 0.6));
  transition: stroke-dashoffset 600ms var(--m-ease);
}
@media (prefers-reduced-motion: reduce) {
  .today__ring-fill {
    transition: none;
  }
}
.today__ring-num {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--m-primary);
  font-size: var(--m-text-xl);
  font-weight: var(--m-weight-num);
}
.today__ring-num i {
  font-style: normal;
  font-size: var(--m-text-sm);
  margin-left: 1px;
}

.today__hero-main {
  min-width: 0;
}

.today__hero-title {
  font-size: var(--m-text-lg);
  line-height: 1.45;
  margin: 0 0 var(--m-space-1);
}

.today__hero-desc {
  font-size: var(--m-text-sm);
  color: var(--m-text-dim);
  line-height: 1.7;
  margin: 0;
}

.today__hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--m-space-2) var(--m-space-4);
  font-size: var(--m-text-sm);
  color: var(--m-text-faint);
}

.today__meta-item {
  display: inline-flex;
  align-items: center;
  gap: var(--m-space-1);
}

.today__generate-error {
  font-size: var(--m-text-sm);
  color: var(--m-danger);
  margin: 0;
}

.today__hero-actions {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-2);
}

/* ============ 迷你知识星图（A1） ============ */
.today__starmap {
  position: relative;
  display: flex;
  gap: var(--m-space-3);
  overflow-x: auto;
  padding: var(--m-space-4) var(--m-space-1) var(--m-space-2);
  scrollbar-width: none;
}
.today__starmap::-webkit-scrollbar {
  display: none;
}
.today__starmap-track {
  position: absolute;
  left: var(--m-space-4);
  right: var(--m-space-4);
  top: calc(var(--m-space-4) + 11px);
  height: 2px;
  background: linear-gradient(90deg, rgba(84, 214, 255, 0.45), rgba(139, 124, 255, 0.45));
  border-radius: var(--m-radius-full);
}
.today__starmap-node {
  position: relative;
  flex: none;
  width: 92px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--m-space-1);
  text-decoration: none;
  color: var(--m-text-dim);
}
.today__starmap-dot {
  width: 22px;
  height: 22px;
  border-radius: var(--m-radius-full);
  background: var(--m-surface-2);
  border: 2px solid var(--node-color);
  transition: box-shadow var(--m-duration) var(--m-ease), transform var(--m-duration) var(--m-ease);
}
.today__starmap-node--active .today__starmap-dot {
  background: var(--node-color);
  box-shadow: 0 0 12px var(--node-color);
  transform: scale(1.15);
}
.today__starmap-name {
  font-size: var(--m-text-sm);
  font-weight: 600;
  color: var(--m-text);
}
.today__starmap-node--active .today__starmap-name {
  color: var(--node-color);
}
.today__starmap-count {
  font-size: var(--m-text-xs);
  color: var(--m-text-faint);
}

/* ============ 画像 / 路径明细 ============ */
.today__dims {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-3);
}

.today__dim-head {
  display: flex;
  justify-content: space-between;
  font-size: var(--m-text-md);
  color: var(--m-text-dim);
  margin-bottom: var(--m-space-2);
}

.today__dim-num {
  color: var(--m-text);
  font-weight: 600;
}

.today__total {
  font-size: var(--m-text-sm);
  color: var(--m-text-faint);
  margin: var(--m-space-3) 0 0;
}

.today__total-num {
  font-size: var(--m-text-3xl);
  font-weight: var(--m-weight-num);
  color: var(--m-primary);
  margin: 0 var(--m-space-1);
}

.today__empty-inline {
  font-size: var(--m-text-md);
  color: var(--m-text-faint);
  margin: 0;
}

.today__phase {
  padding: var(--m-space-3) 0;
  border-bottom: 1px solid var(--m-border);
}
.today__phase:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.today__phase:first-child {
  padding-top: 0;
}

.today__phase-head {
  display: flex;
  align-items: center;
  gap: var(--m-space-2);
  margin-bottom: var(--m-space-2);
}

.today__phase-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--m-radius-full);
}

.today__phase-name {
  font-size: var(--m-text-base);
  font-weight: 600;
}

.today__phase-count {
  margin-left: auto;
  font-size: var(--m-text-xs);
  color: var(--m-text-faint);
}

.today__topics {
  display: flex;
  flex-wrap: wrap;
  gap: var(--m-space-2);
}

.today__topic {
  position: relative;
  background: var(--m-surface-2);
  border-radius: var(--m-radius-full);
  padding: 4px 12px;
  font-size: var(--m-text-sm);
  color: var(--m-text-dim);
}

.today__topic--rec {
  border: 1px solid rgba(84, 214, 255, 0.4);
  color: var(--m-primary);
}

.today__topic-rec {
  font-style: normal;
  font-size: var(--m-text-xs);
  margin-left: 4px;
  color: var(--m-primary);
}

.today__footnote {
  margin-top: var(--m-space-6);
  font-size: var(--m-text-xs);
  color: var(--m-text-faint);
  line-height: 1.8;
}
</style>
