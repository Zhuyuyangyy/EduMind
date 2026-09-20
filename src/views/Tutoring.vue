<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Gauge,
  MessageSquareText,
  RotateCcw,
  Target,
} from 'lucide-vue-next'
import { agentTutoring, submitLearningCycleUpdate } from '../lib/api'

const route = useRoute()
const router = useRouter()

const topic = computed(() => (route.query.topic as string) || '本轮推荐知识点')
const moduleName = computed(() => (route.query.module as string) || '学习模块')
const unitName = computed(() => (route.query.unit as string) || '画像推荐单元')
const mastery = computed(() => {
  const raw = Number(route.query.mastery ?? 0)
  return Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 0
})
const activeStage = ref(0)
const learnerAnswer = ref('')
const hintLevel = ref(1)
const tutorReply = ref('')
const updateSummary = ref('')
const isSubmitting = ref(false)
const errorMessage = ref('')

const masteryTone = computed(() => {
  if (mastery.value < 30) return 'foundation'
  if (mastery.value < 60) return 'repair'
  if (mastery.value < 80) return 'advance'
  return 'solid'
})

const sessionTitle = computed(() => {
  if (mastery.value < 30) return '先补概念，再做短练'
  if (mastery.value < 60) return '锁定薄弱点，做一组变式'
  if (mastery.value < 80) return '进入迁移应用训练'
  return '保持熟练，挑战综合题'
})

const stages = computed(() => [
  {
    title: mastery.value < 45 ? '概念热身' : '知识快检',
    detail: `围绕「${topic.value}」提取 3 个关键概念，先确认理解边界。`,
    duration: '6 min',
    icon: BookOpenCheck,
  },
  {
    title: '专项练习',
    detail: mastery.value < 60 ? '从基础题开始，逐题暴露卡点并给出提示。' : '用变式题检验迁移能力，减少机械记忆。',
    duration: '12 min',
    icon: Target,
  },
  {
    title: '错因复盘',
    detail: '把答题表现写回学习画像，更新下一轮路径推荐。',
    duration: '4 min',
    icon: ClipboardCheck,
  },
])

const sampleQuestions = computed(() => [
  `用自己的话解释「${topic.value}」解决了什么问题。`,
  `给出一个容易混淆的反例，并说明为什么不适用。`,
  `完成一道 ${moduleName.value} 场景下的应用题。`,
])

const demoProfile = computed(() => ({
  totalScore: mastery.value || 52,
  dimensions: [
    { key: 'data-structure', label: '数据结构', value: mastery.value || 52 },
    { key: 'algorithm', label: '算法思维', value: 47 },
  ],
  radarPoints: [
    { dimension: '数据结构', score: mastery.value || 52 },
    { dimension: '算法思维', score: 47 },
  ],
  weaknesses: ['BFS visited 标记时机'],
}))

async function requestScaffold() {
  isSubmitting.value = true
  errorMessage.value = ''
  try {
    const result = await agentTutoring({
      question: learnerAnswer.value || `我在「${topic.value}」这道题卡住了，请先给提示。`,
      mode: 'step-solve',
      profile: demoProfile.value,
      hintLevel: hintLevel.value,
      attempts: Math.max(0, hintLevel.value - 1),
    })
    tutorReply.value = result.answer
    if (hintLevel.value < 5) hintLevel.value += 1
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Tutor Agent 暂时无法响应'
  } finally {
    isSubmitting.value = false
  }
}

async function submitAndUpdate() {
  if (activeStage.value < 2) {
    await requestScaffold()
    return
  }
  isSubmitting.value = true
  errorMessage.value = ''
  try {
    const result = await submitLearningCycleUpdate({
      profile: demoProfile.value,
      currentPath: { phases: [{ title: 'BFS 基础' }, { title: 'DFS 入门' }] },
      learningData: { topic: topic.value, learnerAnswer: learnerAnswer.value },
      exerciseResults: {
        correctRate: learnerAnswer.value.trim().length >= 80 ? 0.75 : 0.4,
        attempted: 3,
        completed: 3,
        dimension: '数据结构',
        knowledgePoint: topic.value,
      },
    })
    const change = result.profileChanges[0]
    updateSummary.value = change
      ? `Reflection 已将${change.dimension}从 ${change.before} 更新为 ${change.after}；Planner 已重规划后续路径。`
      : '本轮证据不足，系统保留原画像并记录学习周期。'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '画像更新暂时失败'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <main class="tutoring-page" :class="masteryTone">
    <header class="session-header">
      <button class="back-btn" type="button" @click="router.push('/evaluation')">
        <ArrowLeft :size="18" />
        <span>返回评估</span>
      </button>

      <div class="header-meta">
        <span>{{ moduleName }}</span>
        <strong>{{ unitName }}</strong>
      </div>
    </header>

    <section class="workspace">
      <aside class="session-rail">
        <div class="topic-card">
          <span class="eyebrow">Practice session</span>
          <h1>{{ topic }}</h1>
          <p>{{ sessionTitle }}</p>
          <div class="mastery-meter">
            <div>
              <Gauge :size="16" />
              <span>当前掌握度</span>
            </div>
            <strong>{{ mastery }}%</strong>
            <i :style="{ width: `${mastery}%` }" />
          </div>
        </div>

        <div class="stage-list">
          <button
            v-for="(stage, index) in stages"
            :key="stage.title"
            class="stage-item"
            :class="{ active: activeStage === index }"
            type="button"
            @click="activeStage = index"
          >
            <component :is="stage.icon" :size="18" />
            <span>
              <strong>{{ stage.title }}</strong>
              <small>{{ stage.duration }}</small>
            </span>
            <ChevronRight :size="16" />
          </button>
        </div>
      </aside>

      <section class="practice-panel">
        <div class="panel-head">
          <div>
            <span class="eyebrow">Current step</span>
            <h2>{{ stages[activeStage].title }}</h2>
          </div>
          <span class="status-pill">
            <CheckCircle2 :size="15" />
            已连接评估画像
          </span>
        </div>

        <p class="step-detail">{{ stages[activeStage].detail }}</p>

        <div class="question-stack">
          <article v-for="(question, index) in sampleQuestions" :key="question" class="question-card">
            <span>0{{ index + 1 }}</span>
            <p>{{ question }}</p>
          </article>
        </div>

        <div class="answer-box">
          <div class="answer-head">
            <MessageSquareText :size="18" />
            <span>练习作答区</span>
          </div>
          <textarea v-model="learnerAnswer" placeholder="在这里输入你的思路，Tutor Agent 会按 Level 1–5 逐级提示，不直接给答案。" />
        </div>

        <div v-if="tutorReply || updateSummary || errorMessage" class="agent-feedback" aria-live="polite">
          <strong v-if="tutorReply">Tutor Agent · 脚手架提示</strong>
          <p v-if="tutorReply">{{ tutorReply }}</p>
          <strong v-if="updateSummary">Reflection · 画像与路径更新</strong>
          <p v-if="updateSummary">{{ updateSummary }}</p>
          <p v-if="errorMessage" class="feedback-error">{{ errorMessage }}</p>
        </div>

        <div class="practice-actions">
          <button class="ghost-btn" type="button" :disabled="isSubmitting" @click="requestScaffold">
            <RotateCcw :size="17" />
            {{ hintLevel === 1 ? '获取一级提示' : `继续提示 · Level ${Math.min(hintLevel, 5)}` }}
          </button>
          <button class="primary-btn" type="button" :disabled="isSubmitting" @click="submitAndUpdate">
            {{ isSubmitting ? 'Agent 处理中…' : activeStage === 2 ? '提交并更新画像' : '提交思路并获取提示' }}
            <ChevronRight :size="18" />
          </button>
        </div>
      </section>
    </section>
  </main>
</template>

<style scoped>
.tutoring-page {
  --accent: #22c55e;
  min-height: 100vh;
  overflow-x: hidden;
  color: #f8fafc;
  background:
    radial-gradient(circle at 18% 10%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 30%),
    radial-gradient(circle at 82% 86%, rgba(0, 212, 255, 0.1), transparent 34%),
    #020617;
}

.tutoring-page.foundation {
  --accent: #fb7185;
}

.tutoring-page.repair {
  --accent: #f59e0b;
}

.tutoring-page.advance {
  --accent: #38bdf8;
}

.session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  min-height: 68px;
  padding: 0 28px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(2, 6, 23, 0.72);
  backdrop-filter: blur(22px);
}

.back-btn,
.stage-item,
.ghost-btn,
.primary-btn {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.back-btn {
  gap: 9px;
  min-height: 42px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: rgba(226, 232, 240, 0.82);
  background: rgba(255, 255, 255, 0.045);
  font-weight: 700;
  transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
}

.back-btn:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
  transform: translateY(-1px);
}

.header-meta {
  min-width: 0;
  text-align: right;
}

.header-meta span,
.eyebrow {
  color: rgba(148, 163, 184, 0.78);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.header-meta strong {
  display: block;
  margin-top: 5px;
  overflow: hidden;
  color: rgba(248, 250, 252, 0.92);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
  gap: 18px;
  width: min(1280px, calc(100vw - 40px));
  min-height: calc(100vh - 104px);
  margin: 0 auto;
  padding: 18px 0;
}

.session-rail,
.practice-panel {
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 18px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.025)),
    rgba(15, 23, 42, 0.66);
  box-shadow:
    0 24px 70px rgba(0, 0, 0, 0.26),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.session-rail {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.topic-card {
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 16px;
  background:
    radial-gradient(circle at 78% 10%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 34%),
    rgba(2, 6, 23, 0.54);
}

.topic-card h1 {
  margin: 10px 0 0;
  color: #ffffff;
  font-family: 'Instrument Serif', Georgia, serif;
  font-size: 38px;
  font-weight: 400;
  line-height: 1.02;
  overflow-wrap: anywhere;
}

.topic-card p {
  margin: 12px 0 0;
  color: rgba(203, 213, 225, 0.78);
  font-size: 14px;
  line-height: 1.7;
}

.mastery-meter {
  position: relative;
  margin-top: 18px;
  padding: 13px;
  overflow: hidden;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.055);
}

.mastery-meter div {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(226, 232, 240, 0.78);
  font-size: 12px;
  font-weight: 800;
}

.mastery-meter strong {
  display: block;
  margin: 12px 0 11px;
  color: var(--accent);
  font-family: 'JetBrains Mono', 'Cascadia Code', monospace;
  font-size: 34px;
  line-height: 1;
}

.mastery-meter i {
  display: block;
  height: 8px;
  min-width: 4px;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 22px color-mix(in srgb, var(--accent) 46%, transparent);
}

.stage-list {
  display: grid;
  gap: 10px;
}

.stage-item {
  width: 100%;
  gap: 12px;
  min-height: 62px;
  padding: 11px 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  color: rgba(226, 232, 240, 0.78);
  background: rgba(255, 255, 255, 0.035);
  text-align: left;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
}

.stage-item:hover,
.stage-item.active {
  color: #ffffff;
  border-color: color-mix(in srgb, var(--accent) 42%, transparent);
  background: color-mix(in srgb, var(--accent) 12%, rgba(255, 255, 255, 0.04));
  transform: translateY(-1px);
}

.stage-item span {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 5px;
}

.stage-item strong {
  font-size: 14px;
}

.stage-item small {
  color: rgba(148, 163, 184, 0.74);
  font-size: 12px;
}

.practice-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.panel-head h2 {
  margin: 8px 0 0;
  color: #ffffff;
  font-size: 28px;
  line-height: 1.15;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid rgba(34, 197, 94, 0.22);
  border-radius: 999px;
  color: #bbf7d0;
  background: rgba(34, 197, 94, 0.09);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.step-detail {
  max-width: 760px;
  margin: 0;
  color: rgba(203, 213, 225, 0.78);
  font-size: 15px;
  line-height: 1.8;
}

.question-stack {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.question-card {
  min-height: 142px;
  padding: 15px;
  border: 1px solid rgba(255, 255, 255, 0.085);
  border-radius: 16px;
  background: rgba(2, 6, 23, 0.46);
}

.question-card span {
  color: var(--accent);
  font-family: 'JetBrains Mono', 'Cascadia Code', monospace;
  font-size: 12px;
  font-weight: 900;
}

.question-card p {
  margin: 18px 0 0;
  color: rgba(248, 250, 252, 0.88);
  font-size: 14px;
  line-height: 1.75;
}

.answer-box {
  display: flex;
  min-height: 230px;
  flex: 1;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 18px;
  background: rgba(2, 6, 23, 0.52);
  overflow: hidden;
}

.answer-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.075);
  color: rgba(226, 232, 240, 0.86);
  font-size: 13px;
  font-weight: 800;
}

.answer-box textarea {
  min-height: 180px;
  flex: 1;
  resize: none;
  border: none;
  outline: none;
  padding: 16px;
  color: #f8fafc;
  background: transparent;
  font: inherit;
  line-height: 1.7;
}

.answer-box textarea::placeholder {
  color: rgba(148, 163, 184, 0.68);
}

.practice-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.agent-feedback {
  padding: 15px 16px;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--accent) 8%, rgba(2, 6, 23, 0.72));
}

.agent-feedback strong {
  display: block;
  color: var(--accent);
  font-size: 13px;
}

.agent-feedback p {
  margin: 8px 0 12px;
  color: rgba(226, 232, 240, 0.88);
  line-height: 1.7;
  white-space: pre-wrap;
}

.agent-feedback p:last-child {
  margin-bottom: 0;
}

.agent-feedback .feedback-error {
  color: #fda4af;
}

.ghost-btn,
.primary-btn {
  justify-content: center;
  gap: 8px;
  min-height: 46px;
  padding: 0 16px;
  border-radius: 14px;
  font-weight: 900;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
}

.ghost-btn:hover,
.primary-btn:hover {
  transform: translateY(-1px);
}

.ghost-btn {
  border: 1px solid rgba(255, 255, 255, 0.11);
  color: rgba(226, 232, 240, 0.76);
  background: rgba(255, 255, 255, 0.045);
}

.ghost-btn:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
}

.primary-btn {
  border: 1px solid color-mix(in srgb, var(--accent) 78%, transparent);
  color: #03130a;
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 32%, #ffffff), var(--accent));
  box-shadow: 0 14px 30px color-mix(in srgb, var(--accent) 24%, transparent);
}

@media (max-width: 980px) {
  .workspace {
    grid-template-columns: 1fr;
    width: min(100vw - 24px, 720px);
  }

  .question-stack {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .session-header,
  .panel-head,
  .practice-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .session-header {
    padding: 12px;
  }

  .header-meta {
    text-align: left;
  }

  .practice-panel {
    padding: 16px;
  }
}
</style>
