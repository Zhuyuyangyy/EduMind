<template>
  <section class="today">
    <!-- 加载中 -->
    <template v-if="loading">
      <div class="m-card today__hero">
        <div class="m-skeleton m-skeleton--text" style="width: 40%" />
        <div class="m-skeleton m-skeleton--text" style="width: 80%" />
        <div class="m-skeleton m-skeleton--block" />
      </div>
      <h2 class="m-section-title">学习路径</h2>
      <div class="m-card">
        <div class="m-skeleton m-skeleton--text" style="width: 90%" />
        <div class="m-skeleton m-skeleton--text" style="width: 70%" />
        <div class="m-skeleton m-skeleton--block" />
      </div>
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

      <!-- 没有画像：诊断入口（自评画像，来源明确标注） -->
      <div v-if="!profile" class="m-card m-card--accent today__hero">
        <span class="m-badge m-badge--info">开始学习</span>
        <h2 class="today__hero-title">先做一次 6 维学习自评</h2>
        <p class="today__hero-desc">用 1 分钟给六个维度打分，系统会生成你的第一份知识路径。自评结果会标注为「自评画像」。</p>
        <RouterLink to="/diagnose" class="m-btn m-btn--primary m-btn--block">开始学习诊断</RouterLink>
      </div>

      <!-- 有画像没路径：生成入口 -->
      <div v-else-if="!path" class="m-card m-card--accent today__hero">
        <span class="m-badge m-badge--info">生成学习路径</span>
        <h2 class="today__hero-title">基于你的画像生成知识路径</h2>
        <p class="today__hero-desc">路径由智能体按画像生成，知识点掌握度为模型估计，会持续标注来源。</p>
        <button class="m-btn m-btn--primary m-btn--block" :disabled="generating" @click="onGeneratePath">
          {{ generating ? '生成中…' : '生成知识路径' }}
        </button>
        <p v-if="generateError" class="today__generate-error">{{ generateError }}</p>
      </div>

      <!-- 有路径：今日唯一任务（真实、可追溯） -->
      <div v-else-if="todayTopic" class="m-card m-card--accent today__hero">
        <div class="today__hero-tag">
          <span class="m-badge m-badge--info">今天先学这一件事</span>
          <span class="m-badge m-badge--warn" title="来自知识路径的模型估计，不是完成率">掌握度估计</span>
        </div>
        <h2 class="today__hero-title">{{ todayTopic.topicName }}</h2>
        <p class="today__hero-desc">
          来自「{{ todayTopic.phaseName }}」· 选取规则：{{ todayTopic.reason }}
        </p>
        <div class="today__hero-meta">
          <span>重要度 {{ Math.round(todayTopic.importance * 100) }}%</span>
          <span>掌握估计 {{ Math.round(todayTopic.masteryEstimate * 100) }}%</span>
          <span>知识点 #{{ todayTopic.topicId }}</span>
        </div>
        <RouterLink :to="`/tutor?topic=${encodeURIComponent(todayTopic.topicId)}&name=${encodeURIComponent(todayTopic.topicName)}`" class="m-btn m-btn--primary m-btn--block">
          开始学习
        </RouterLink>
      </div>

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
          <p v-if="totalScore !== null" class="today__total">综合分 {{ totalScore }}</p>
        </div>
      </template>

      <!-- 学习路径总览（真实路径） -->
      <template v-if="path">
        <h2 class="m-section-title">知识路径 <span class="m-section-title__sub">掌握度为模型估计</span></h2>
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
import { getAuthSession } from '@/lib/auth'
import { apiGet, apiPost } from '@/lib/api'
import {
  currentAccount,
  fetchAccountData,
  profileDimensions,
  profileTotalScore,
  selectTodayTopic,
} from '@/mobile/data/learning-data'
import type { KnowledgePath, LearnerProfile } from '@/mobile/data/types'

const session = getAuthSession()
const loading = ref(true)
const loadError = ref('')
const profile = ref<LearnerProfile | null>(null)
const path = ref<KnowledgePath | null>(null)
const generating = ref(false)
const generateError = ref('')

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

.today__hero {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-3);
}

.today__hero-tag {
  display: flex;
  flex-wrap: wrap;
  gap: var(--m-space-2);
}

.today__hero-title {
  font-size: var(--m-text-lg);
  line-height: 1.5;
  margin: 0;
}

.today__hero-desc {
  font-size: var(--m-text-md);
  color: var(--m-text-dim);
  line-height: 1.7;
  margin: 0;
}

.today__hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--m-space-3);
  font-size: var(--m-text-sm);
  color: var(--m-text-faint);
}

.today__generate-error {
  font-size: var(--m-text-sm);
  color: var(--m-danger);
  margin: 0;
}

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
