<template>
  <section class="growth">
    <!-- 加载中 -->
    <template v-if="loading">
      <div class="m-card">
        <div class="m-skeleton m-skeleton--text" style="width: 45%" />
        <div class="m-skeleton m-skeleton--text" style="width: 85%" />
        <div class="m-skeleton m-skeleton--block" />
      </div>
      <div class="m-card" style="margin-top: 12px">
        <div class="m-skeleton m-skeleton--text" style="width: 60%" />
        <div class="m-skeleton m-skeleton--block" />
      </div>
    </template>

    <!-- 加载失败 -->
    <div v-else-if="loadError" class="m-error" role="alert">
      <b>学习数据加载失败</b>
      <span class="m-error__detail">{{ loadError }}</span>
      <button class="m-btn m-btn--ghost m-btn--sm" style="align-self: flex-start; margin-top: 8px" @click="load">重试</button>
    </div>

    <template v-else>
      <!-- 能力画像（真实账号数据） -->
      <h2 class="m-section-title">能力画像 <span class="m-section-title__sub">{{ profileSourceLabel }}</span></h2>
      <div class="m-card">
        <div v-if="dimensions.length" class="growth__dims">
          <div v-for="dim in dimensions" :key="dim.label" class="growth__dim">
            <div class="growth__dim-head">
              <span>{{ dim.label }}</span>
              <span class="growth__dim-num">{{ dim.value }}</span>
            </div>
            <div class="m-progress"><div class="m-progress__fill" :style="{ width: dim.value + '%' }" /></div>
          </div>
        </div>
        <div v-else class="m-empty">
          <span class="m-empty__icon">◌</span>
          <p class="m-empty__text">暂无画像<br />完成一次学习自评后展示</p>
        </div>
      </div>

      <!-- 学习路径（真实账号数据，掌握度为模型估计） -->
      <h2 class="m-section-title">学习路径 <span class="m-section-title__sub">掌握度为模型估计</span></h2>
      <div class="m-card">
        <template v-if="path">
          <div v-for="phase in path.phases" :key="phase.id" class="growth__phase">
            <div class="growth__phase-head">
              <span class="growth__phase-dot" :style="{ background: phase.color || '#54d6ff' }" />
              <span class="growth__phase-name">{{ phase.name }}</span>
            </div>
            <div v-for="topic in phase.topics || []" :key="topic.id" class="growth__topic">
              <div class="growth__topic-head">
                <span class="growth__topic-name">{{ topic.name }}</span>
                <span class="m-badge" :class="masteryBadge(topic.mastery)">{{ masteryLabel(topic.mastery) }}</span>
              </div>
              <div class="m-progress"><div class="m-progress__fill" :style="{ width: Math.round(topic.mastery * 100) + '%' }" /></div>
            </div>
          </div>
        </template>
        <div v-else class="m-empty">
          <span class="m-empty__icon">⌂</span>
          <p class="m-empty__text">暂无学习路径<br />在「今日学习」生成知识路径后展示</p>
        </div>
      </div>

      <!-- 评估与画像变化（仅存在结构化学习闭环证据时展示） -->
      <h2 class="m-section-title">评估记录 <span class="m-section-title__sub">{{ cycleSourceLabel }}</span></h2>
      <div class="m-card">
        <template v-if="cycle">
          <p class="growth__cycle-time">最近闭环：{{ cycleTime }}</p>

          <div v-if="masteryItems.length" class="growth__mastery">
            <div v-for="item in masteryItems" :key="item.name" class="growth__mastery-row">
              <span>{{ item.name }}</span>
              <div class="m-progress growth__mastery-bar"><div class="m-progress__fill" :style="{ width: item.level + '%' }" /></div>
              <span class="growth__mastery-num">{{ item.level }}</span>
            </div>
          </div>

          <div v-if="profileChanges.length" class="growth__changes">
            <p class="growth__changes-title">画像变化（有依据的更新痕迹）</p>
            <div v-for="(change, i) in profileChanges" :key="i" class="growth__change">
              <span class="growth__change-dim">{{ change.dimension || '维度' }}</span>
              <span class="growth__change-delta">{{ change.before ?? '—' }} → {{ change.after ?? '—' }}</span>
              <span class="growth__change-reason">{{ change.reason || '' }}</span>
            </div>
          </div>

          <p v-if="!masteryItems.length && !profileChanges.length" class="growth__empty-inline">闭环记录存在，但暂无结构化评估字段</p>
        </template>
        <div v-else class="m-empty">
          <span class="m-empty__icon">✧</span>
          <p class="m-empty__text">暂无评估记录<br />完成一次学习测评后，这里会展示有依据的画像变化</p>
        </div>
      </div>

      <!-- 无可靠数据源的指标：明确暂无记录，不伪造 -->
      <h2 class="m-section-title">学习记录</h2>
      <div class="m-card">
        <div class="m-row"><span>连续学习天数</span><span class="m-row__value">暂无记录</span></div>
        <div class="m-row"><span>累计答题</span><span class="m-row__value">暂无记录</span></div>
        <div class="m-row"><span>掌握度提升</span><span class="m-row__value">暂无记录</span></div>
        <p class="growth__note">这些指标需要真实学习事件记录（P3 闭环建成后启用），当前不使用演示数值。</p>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  currentAccount,
  fetchAccountData,
  masteryLabel,
  profileDimensions,
} from '@/mobile/data/learning-data'
import type { KnowledgePath, LearnerProfile, LearningCycle } from '@/mobile/data/types'

const loading = ref(true)
const loadError = ref('')
const profile = ref<LearnerProfile | null>(null)
const path = ref<KnowledgePath | null>(null)
const cycle = ref<LearningCycle | null>(null)

const dimensions = computed(() => profileDimensions(profile.value))

const profileSourceLabel = computed(() => {
  const source = profile.value?.source
  if (source === 'dialogue' || source === 'mobile-self-assessment') return '自评画像'
  if (source === 'profile-save') return '建档画像'
  return source ? `来源：${source}` : '账号记录'
})

const cycleSourceLabel = computed(() => {
  if (!cycle.value) return '暂无记录'
  // P3-0：旧演示闭环带未核验标记，必须与真实评估区分
  if (cycle.value.evidence === 'unverified-client-input') return '演示闭环（未核验，未写入真实画像）'
  const trace = cycle.value.trace as { fallbackUsed?: boolean } | null
  return trace?.fallbackUsed ? '智能体评估（规则降级）' : '智能体评估'
})

const cycleTime = computed(() => {
  const createdAt = cycle.value?.createdAt
  if (!createdAt) return '时间未记录'
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? '时间未记录' : date.toLocaleString('zh-CN')
})

interface MasteryItem { name: string; level: number }

const masteryItems = computed<MasteryItem[]>(() => {
  const evaluation = cycle.value?.evaluation as { mastery?: unknown } | null
  if (!evaluation || !Array.isArray(evaluation.mastery)) return []
  return evaluation.mastery
    .filter((item): item is MasteryItem =>
      Boolean(item) && typeof item === 'object' && typeof (item as MasteryItem).name === 'string' && typeof (item as MasteryItem).level === 'number')
    .map(item => ({ name: item.name, level: Math.max(0, Math.min(100, item.level)) }))
})

const profileChanges = computed(() => {
  // P3-0：未核验的演示闭环，其「画像变化」不得作为真实进步展示
  if (cycle.value?.evidence === 'unverified-client-input') return []
  return cycle.value?.profileChanges ?? []
})

function masteryBadge(mastery: number): string {
  const { level } = masteryLabel(mastery)
  return level === 'high' ? 'm-badge--success' : level === 'mid' ? 'm-badge--info' : 'm-badge--warn'
}

onMounted(async () => {
  document.title = '学习成长 · 智学星枢 Mobile'
  await load()
})

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const result = await fetchAccountData()
    if (result.stale) return // 过期响应（切号/退出），丢弃
    if (result.error || !result.data) {
      // P3-0：接口失败明确报错，不把异常解释成「无数据」
      loadError.value = result.error || '加载失败'
      return
    }
    if (result.data.learningCycle?.accountId && result.data.learningCycle.accountId !== currentAccount()) return
    profile.value = result.data.profile
    path.value = result.data.knowledgePath
    cycle.value = result.data.learningCycle
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : '未知错误'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.growth__dims {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-3);
}

.growth__dim-head {
  display: flex;
  justify-content: space-between;
  font-size: var(--m-text-md);
  color: var(--m-text-dim);
  margin-bottom: var(--m-space-2);
}

.growth__dim-num {
  color: var(--m-text);
  font-weight: 600;
}

.growth__phase {
  padding: var(--m-space-3) 0;
  border-bottom: 1px solid var(--m-border);
}
.growth__phase:first-child {
  padding-top: 0;
}
.growth__phase:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.growth__phase-head {
  display: flex;
  align-items: center;
  gap: var(--m-space-2);
  margin-bottom: var(--m-space-3);
}

.growth__phase-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--m-radius-full);
}

.growth__phase-name {
  font-size: var(--m-text-base);
  font-weight: 700;
}

.growth__topic {
  margin-bottom: var(--m-space-3);
}
.growth__topic:last-child {
  margin-bottom: 0;
}

.growth__topic-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--m-space-2);
  margin-bottom: var(--m-space-2);
}

.growth__topic-name {
  font-size: var(--m-text-md);
  color: var(--m-text-dim);
}

.growth__cycle-time {
  font-size: var(--m-text-sm);
  color: var(--m-text-faint);
  margin: 0 0 var(--m-space-3);
}

.growth__mastery {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-3);
  margin-bottom: var(--m-space-4);
}

.growth__mastery-row {
  display: grid;
  grid-template-columns: 72px 1fr 32px;
  align-items: center;
  gap: var(--m-space-2);
  font-size: var(--m-text-sm);
  color: var(--m-text-dim);
}

.growth__mastery-num {
  text-align: right;
  color: var(--m-text);
  font-weight: 600;
}

.growth__changes-title {
  font-size: var(--m-text-md);
  font-weight: 600;
  color: var(--m-text-dim);
  margin: 0 0 var(--m-space-2);
}

.growth__change {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--m-space-2);
  padding: var(--m-space-2) 0;
  border-bottom: 1px dashed var(--m-border);
  font-size: var(--m-text-sm);
}
.growth__change:last-child {
  border-bottom: none;
}

.growth__change-dim {
  color: var(--m-text);
  font-weight: 600;
}

.growth__change-delta {
  color: var(--m-primary);
}

.growth__change-reason {
  color: var(--m-text-faint);
  flex-basis: 100%;
}

.growth__empty-inline {
  font-size: var(--m-text-md);
  color: var(--m-text-faint);
  margin: 0;
}

.growth__note {
  font-size: var(--m-text-xs);
  color: var(--m-text-faint);
  line-height: 1.8;
  margin: var(--m-space-3) 0 0;
}
</style>
