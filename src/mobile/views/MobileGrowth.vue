<template>
  <section class="growth">
    <div class="growth__heading"><p>每一份变化，都能找到依据</p><h1>学习报告</h1></div>
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
      <article class="growth__next m-card" aria-labelledby="growth-next-title">
        <span class="growth__next-label">接下来，走这一小步</span>
        <template v-if="nextTopic">
          <h2 id="growth-next-title">{{ nextTopic.topicName }}</h2>
          <p>{{ nextTopic.phaseName }} · 按当前学习路径推荐</p>
          <button class="m-btn m-btn--primary m-btn--block" :disabled="startingPractice" @click="startPractice">{{ startingPractice ? '正在创建练习…' : '练一组，看看掌握了多少' }}<MobileIcon name="chevronRight" :size="16" /></button>
          <RouterLink :to="{ path: '/tutor', query: { topic: nextTopic.topicId, name: nextTopic.topicName } }" class="growth__next-link">先让导师讲一讲 <MobileIcon name="chevronRight" :size="14" /></RouterLink>
        </template>
        <template v-else>
          <h2 id="growth-next-title">{{ profile ? '把目标，连成学习路径' : '先选一个想学的方向' }}</h2>
          <p>{{ profile ? '画像已保存，生成路径后就可以开始练习。' : '从目标或一个问题开始，完整学习档案可以稍后完善。' }}</p>
          <RouterLink to="/today" class="m-btn m-btn--primary m-btn--block">{{ profile ? '去生成学习路径' : '回到我的学习起点' }}<MobileIcon name="chevronRight" :size="16" /></RouterLink>
        </template>
        <p v-if="practiceError" class="m-error" role="alert">{{ practiceError }}</p>
        <p v-if="stats && stats.completedSessions > 0" class="growth__next-evidence">已完成 {{ stats.completedSessions }} 次练习，累计答对 {{ stats.correctAnswers }} / {{ stats.totalAnswers }} 题。每次完成，都会留下一份记录。</p>
        <p v-else-if="stats" class="growth__next-evidence">完成第一组练习后，再来看看自己的学习记录。</p>
      </article>
      <div v-if="workspace" class="m-card growth__workspace-evidence"><h2>学习活动，真实留痕</h2><div class="growth__activity-grid"><div><b>{{ Math.floor(focusSeconds / 60) }}</b><span>已结束计时 / 分钟</span></div><div><b>{{ confirmedTaskCount }}</b><span>已标记完成的任务项</span></div><div><b>{{ workspace.materials.length }}</b><span>私有学习资料</span></div></div><p>计时和任务勾选表示学习活动，不等于学习效果。能力变化需要可比测验与延迟复测证据。</p><p>目前不提供未经验证的周增长或提分预测。</p></div>
      <!-- 学习记录（P3-3B：真实完成事件统计 + 修订历史） -->
      <h2 class="m-section-title">学习记录 <span class="m-section-title__sub">每次完成，都会记录</span></h2>
      <div class="m-card">
        <div v-if="stats" class="growth__stats">
          <div class="growth__stat">
            <span class="growth__stat-num">{{ stats.completedSessions }}</span>
            <span class="growth__stat-label">完成练习</span>
          </div>
          <div class="growth__stat">
            <span class="growth__stat-num">{{ stats.totalAnswers }}</span>
            <span class="growth__stat-label">累计答题</span>
          </div>
          <div class="growth__stat">
            <span class="growth__stat-num">{{ stats.correctAnswers }}</span>
            <span class="growth__stat-label">答对</span>
          </div>
          <div class="growth__stat">
            <span class="growth__stat-num">{{ stats.studyDays }}</span>
            <span class="growth__stat-label">学习天数</span>
          </div>
          <div class="growth__stat">
            <span class="growth__stat-num">{{ stats.streakDays }}</span>
            <span class="growth__stat-label">连续学习</span>
          </div>
        </div>
        <div v-else class="m-empty">
          <MobileIcon class="m-empty__icon" name="chart" :size="28" />
          <p class="m-empty__text">练习统计暂时不可用<br />请重新读取，不会把请求失败显示为零记录</p>
        </div>
        <p class="growth__note">
          只统计已完成的练习；浏览页面不会计入学习天数。
        </p>
      </div>

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
          <MobileIcon class="m-empty__icon" name="chart" :size="28" />
          <p class="m-empty__text">暂无画像<br />完成一次学习自评后展示</p>
        </div>
      </div>

      <h2 class="m-section-title">学习路径 <span class="m-section-title__sub">掌握度为路径估计</span></h2>
      <MobileLearningPath v-if="path" :path="path" />
      <MobileEmpty v-else title="暂无学习路径" desc="在「今日学习」生成知识路径后展示" action-text="去生成路径" action-icon="path" @action="$router.push('/today')" />

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
          <MobileIcon class="m-empty__icon" name="sparkle" :size="28" />
          <p class="m-empty__text">暂无评估记录<br />完成一次学习测评后，这里会展示有依据的画像变化</p>
        </div>
      </div>

      <!-- 画像修订历史（证据可追溯） -->
      <h2 class="m-section-title">画像修订历史</h2>
      <div class="m-card">
        <div v-if="revisions.length" class="growth__revisions">
          <article v-for="revision in revisions" :key="revision.id" class="growth__revision">
            <div class="growth__revision-head">
              <span class="m-badge" :class="revision.source === 'model' ? 'm-badge--info' : 'm-badge--success'">
                {{ revision.source === 'model' ? '模型修订' : '规则修订' }}
              </span>
              <span class="growth__revision-time">{{ formatTime(revision.createdAt) }}</span>
            </div>
            <p class="growth__revision-reason">{{ revision.reason }}</p>
          </article>
        </div>
        <div v-else class="m-empty">
          <MobileIcon class="m-empty__icon" name="sparkle" :size="28" />
          <p class="m-empty__text">暂无画像修订<br />练习证据满足更新条件后，每次变化都会记录在这里</p>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import MobileIcon from '../components/MobileIcon.vue'
import MobileLearningPath from '../components/MobileLearningPath.vue'
import MobileEmpty from '../components/MobileEmpty.vue'
import {
  currentAccount,
  currentEpoch,
  fetchAccountData,
  selectTodayTopic,
  profileDimensions,
} from '@/mobile/data/learning-data'
import { createStudySession, fetchStudyStats, fetchStudyRevisions } from '@/mobile/data/study'
import type { KnowledgePath, LearnerProfile, LearningCycle } from '@/mobile/data/types'
import type { StudyStats } from '@/mobile/data/study'
import { loadWorkspace, type Workspace } from '@/mobile/data/workspace'

const loading = ref(true)
const loadError = ref('')
const profile = ref<LearnerProfile | null>(null)
const path = ref<KnowledgePath | null>(null)
const cycle = ref<LearningCycle | null>(null)
const stats = ref<StudyStats | null>(null)
const workspace = ref<Workspace | null>(null)
const focusSeconds = computed(() => workspace.value?.focus.filter(f => f.status === 'completed').reduce((sum,f) => sum + f.accumulatedSeconds,0) || 0)
const confirmedTaskCount = computed(() => workspace.value?.tasks.flatMap(t => t.checklist || []).filter(item => item.done).length || 0)
const nextTopic = computed(() => selectTodayTopic(path.value))
const startingPractice = ref(false)
const practiceError = ref('')
const router = useRouter()
let active = true
onBeforeUnmount(() => { active = false })
async function startPractice() {
  if (!nextTopic.value || startingPractice.value) return
  const epoch = currentEpoch()
  startingPractice.value = true
  practiceError.value = ''
  try {
    const result = await createStudySession([nextTopic.value.topicId], 3)
    if (!active || epoch !== currentEpoch()) return
    if ('error' in result) { practiceError.value = result.message; return }
    await router.push(`/study/session/${result.session.id}`)
  } finally { startingPractice.value = false }
}
const revisions = ref<Array<{ id: string; reason: string; source: string; version: number; createdAt: string; eventIds: string[] }>>([])

function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '时间未记录' : date.toLocaleString('zh-CN')
}

const dimensions = computed(() => profileDimensions(profile.value))

const profileSourceLabel = computed(() => {
  const source = profile.value?.source
  if (source === 'dialogue' || source === 'mobile-self-assessment') return '自评画像'
  if (source === 'questionnaire') return profile.value?.analysisSource === 'rule' ? '问卷画像 · 规则降级分析' : '问卷画像 · 模型分析'
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

onMounted(async () => {
  document.title = '学习成长 · 智学星枢 Mobile'
  await load()
})

async function load() {
  const epoch = currentEpoch()
  loading.value = true
  loadError.value = ''
  try {
    const result = await fetchAccountData()
    if (result.stale || !active) return
    if (result.error || !result.data) {
      // P3-0：接口失败明确报错，不把异常解释成「无数据」
      loadError.value = result.error || '加载失败'
      return
    }
    if (result.data.learningCycle?.accountId && result.data.learningCycle.accountId !== currentAccount()) return
    profile.value = result.data.profile
    path.value = result.data.knowledgePath
    cycle.value = result.data.learningCycle
    // P3-3B：真实学习统计与修订历史（失败不阻塞主数据渲染）
    const [statsData, revisionsData, workspaceData] = await Promise.all([fetchStudyStats(), fetchStudyRevisions(), loadWorkspace()])
    if (!active || epoch !== currentEpoch()) return
    stats.value = statsData
    workspace.value = workspaceData
    revisions.value = revisionsData || []
  } catch (err) {
    if (active && epoch === currentEpoch()) loadError.value = err instanceof Error ? err.message : '未知错误'
  } finally {
    if (active && epoch === currentEpoch()) loading.value = false
  }
}
</script>

<style scoped>
.growth__workspace-evidence { margin: 22px 0; }.growth__workspace-evidence h2 { font-size: 18px; margin: 0 0 20px; }.growth__activity-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; }.growth__activity-grid > div { display: grid; gap: 8px; }.growth__activity-grid b { font-size: 26px; font-weight: 550; color: var(--m-primary); }.growth__activity-grid span { font-size: 12px; color: var(--m-text-faint); }.growth__workspace-evidence p { font-size: 13px; color: var(--m-text-faint); line-height: 1.8; margin: 18px 0 0; }
.growth__next { border: 1px solid var(--m-primary-border); padding: 24px; margin-bottom: 28px; }
.growth__next-label { color: var(--m-primary); font-size: 13px; font-weight: 500; }
.growth__next h2 { margin: 12px 0 8px; font-size: 24px; line-height: 1.4; letter-spacing: -.5px; }
.growth__next > p { color: var(--m-text-dim); font-size: 14px; line-height: 1.8; margin: 0 0 20px; }
.growth__next .m-btn { justify-content: space-between; gap: 8px; font-size: 14px; }
.growth__next .m-btn .m-icon { flex: none; }
.growth__next-link { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 48px; color: var(--m-primary); font-size: 14px; text-decoration: none; }
.growth__next > .growth__next-evidence { margin: 16px 0 0; padding-top: 16px; border-top: 1px solid var(--m-border); font-size: 13px; color: var(--m-text-faint); }
.growth__heading { margin: 8px 0 24px; }
.growth__heading p { margin: 0 0 6px; font-size: 13px; color: var(--m-text-faint); }
.growth__heading h1 { margin: 0; font-size: var(--m-text-2xl); letter-spacing: -1px; }
.growth__dims {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px 20px;
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

<style scoped>
.growth__stats {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 20px 12px;
}

.growth__stat {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-1);
  min-width: 0;
  grid-column: span 2;
}

.growth__stat:nth-child(n + 4) { grid-column: span 3; padding-top: 16px; border-top: 1px solid var(--m-border); }
.growth__stat-num {
  font-size: 27px;
  font-weight: 600;
  letter-spacing: -1px;
  color: var(--m-text);
}

.growth__stat-label {
  font-size: var(--m-text-xs);
  color: var(--m-text-faint);
}

.growth__revisions {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-3);
}

.growth__revision-head {
  display: flex;
  align-items: center;
  gap: var(--m-space-2);
  margin-bottom: var(--m-space-1);
}

.growth__revision-time {
  margin-left: auto;
  font-size: var(--m-text-xs);
  color: var(--m-text-faint);
}

.growth__revision-reason {
  font-size: var(--m-text-sm);
  color: var(--m-text-dim);
  line-height: 1.7;
  margin: 0;
}
</style>
