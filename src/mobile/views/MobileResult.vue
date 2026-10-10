<template>
  <section class="result">
    <div v-if="loading" class="m-card">
      <div class="m-skeleton m-skeleton--text" style="width: 40%" />
      <div class="m-skeleton m-skeleton--block" />
    </div>

    <div v-else-if="fatal" class="m-error" role="alert">
      <b>{{ fatal }}</b>
      <RouterLink to="/today" class="m-btn m-btn--ghost m-btn--sm" style="align-self: flex-start; margin-top: 8px">返回今日学习</RouterLink>
    </div>

    <template v-else>
      <!-- 权威评分（服务端判分，唯一事实源） -->
      <header class="result__hero">
        <div class="result__score">
          <span class="result__score-num">{{ assessment.correct }} / {{ assessment.total }}</span>
          <span class="result__score-rate">{{ correctRateLabel }}</span>
        </div>
        <p class="result__hero-note">真实正确率 · 由服务端根据你的实际提交计算</p>
      </header>

      <!-- 逐题回顾 -->
      <h2 class="m-section-title">逐题回顾</h2>
      <div class="result__questions">
        <article v-for="row in questionRows" :key="row.exercise.id" class="m-card result__q">
          <div class="result__q-head">
            <span class="m-badge" :class="row.correct ? 'm-badge--success' : 'm-badge--danger'">
              {{ row.correct ? '正确' : '错误' }}
            </span>
            <span class="result__q-point">{{ row.exercise.knowledgePoint }}</span>
          </div>
          <p class="result__q-prompt">{{ row.exercise.prompt }}</p>
          <p class="result__q-choice">
            你的选择：<b>{{ row.studentChoice }}</b>
          </p>
          <p v-if="!row.correct" class="result__q-answer">正确答案：<b>{{ row.correctChoice }}</b></p>
          <p v-if="row.exercise.explanation" class="result__q-explain">解析：{{ row.exercise.explanation }}</p>
        </article>
      </div>

      <!-- AI 反馈（来源如实标注） -->
      <h2 class="m-section-title">AI 反馈</h2>
      <div class="m-card">
        <div class="result__fb-head">
          <span class="m-badge" :class="feedback?.source === 'model' ? 'm-badge--success' : 'm-badge--warn'">
            {{ feedback?.source === 'model' ? '模型生成' : '规则降级' }}
          </span>
          <span v-if="feedback?.degraded" class="result__fb-note">模型暂不可用，反馈由规则模板生成</span>
        </div>
        <p class="result__fb-text">{{ feedback?.text || '反馈生成中或失败，可稍后重试。' }}</p>
        <p class="result__fb-disclaimer">反馈为解释性文字；上面的评分数字以服务端记录为准。</p>
      </div>

      <!-- 画像与路径（未更新也是合法结果） -->
      <h2 class="m-section-title">学习档案变化</h2>
      <div class="m-card">
        <div class="m-row">
          <span>能力画像</span>
          <span class="m-row__value" :class="profileUpdate.applied ? 'ok' : ''">
            {{ profileUpdate.applied ? `已更新（${profileUpdate.changes.length} 维）` : '未更新' }}
          </span>
        </div>
        <p class="result__reason">{{ profileUpdate.reason }}</p>
        <div v-if="profileUpdate.applied" class="result__changes">
          <div v-for="change in profileUpdate.changes" :key="change.dimension" class="result__change">
            <span>{{ change.dimension }}</span>
            <span class="result__change-delta">{{ change.before }} → {{ change.after }}</span>
          </div>
        </div>
        <div class="m-row" style="margin-top: 8px">
          <span>知识路径</span>
          <span class="m-row__value" :class="pathUpdate.applied ? 'ok' : ''">
            {{ pathUpdate.applied ? `已更新（v${pathUpdate.version}）` : '未更新' }}
          </span>
        </div>
        <p class="result__reason">{{ pathUpdate.reason }}</p>
        <p v-if="feedbackResult?.idempotent" class="result__idem">本次为重复请求，返回首次处理结果（未重复修改档案）。</p>
      </div>

      <!-- 操作 -->
      <div class="result__actions">
        <RouterLink to="/today" class="m-btn m-btn--primary m-btn--block">返回今日学习</RouterLink>
        <RouterLink to="/growth" class="m-btn m-btn--ghost m-btn--block">查看学习成长</RouterLink>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { fetchFeedback, fetchSessionQuestions } from '@/mobile/data/study'
import type { FeedbackResult, StudyExercise } from '@/mobile/data/study'

const route = useRoute()
const sessionId = String(route.params.sessionId || '')

const loading = ref(true)
const fatal = ref('')
const exercises = ref<StudyExercise[]>([])
const answered = ref<Array<{ exerciseId: string; correct: boolean; submitted: unknown }>>([])
const feedbackResult = ref<FeedbackResult | null>(null)

const assessment = computed(() => feedbackResult.value?.assessment || { total: 0, correct: 0, correctRate: null })
const feedback = computed(() => feedbackResult.value?.feedback || null)
const profileUpdate = computed(() => feedbackResult.value?.profileUpdate || { applied: false, reason: '加载中', changes: [] })
const pathUpdate = computed(() => feedbackResult.value?.pathUpdate || { applied: false, reason: '加载中' })

const correctRateLabel = computed(() => {
  const rate = assessment.value.correctRate
  return rate == null ? '—' : `${(rate * 100).toFixed(1)}%`
})

const questionRows = computed(() => {
  const answeredMap = new Map(answered.value.map(item => [item.exerciseId, item]))
  return exercises.value.map(exercise => {
    const attempt = answeredMap.get(exercise.id)
    const submittedIndex = Number(attempt?.submitted)
    return {
      exercise,
      correct: Boolean(attempt?.correct),
      studentChoice: Number.isInteger(submittedIndex) && exercise.choices
        ? exercise.choices[submittedIndex] ?? '未作答'
        : '未作答',
      correctChoice: exercise.choices && typeof exercise.answer === 'number'
        ? (exercise.choices[exercise.answer] ?? '—')
        : '—',
    }
  })
})

onMounted(async () => {
  document.title = '练习结果 · 智学星枢 Mobile'
  const [state, feedbackData] = await Promise.all([
    fetchSessionQuestions(sessionId),
    fetchFeedback(sessionId),
  ])
  if (!state) {
    fatal.value = '练习会话不存在或不属于当前账号'
    loading.value = false
    return
  }
  exercises.value = state.exercises
  answered.value = state.answered
  if ('error' in feedbackData) {
    // 反馈失败不影响评分展示（评分来自题目快照的作答记录）
    feedbackResult.value = null
  } else {
    feedbackResult.value = feedbackData
  }
  loading.value = false
})
</script>

<style scoped>
.result__hero {
  text-align: center;
  padding: var(--m-space-6) 0 var(--m-space-4);
}

.result__score {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: var(--m-space-3);
}

.result__score-num {
  font-size: var(--m-text-2xl);
  font-weight: 800;
  color: var(--m-primary);
}

.result__score-rate {
  font-size: var(--m-text-xl);
  font-weight: 700;
  color: var(--m-text-dim);
}

.result__hero-note {
  font-size: var(--m-text-sm);
  color: var(--m-text-faint);
  margin: var(--m-space-2) 0 0;
}

.result__questions {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-3);
}

.result__q {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-2);
}

.result__q-head {
  display: flex;
  align-items: center;
  gap: var(--m-space-2);
}

.result__q-point {
  font-size: var(--m-text-xs);
  color: var(--m-text-faint);
}

.result__q-prompt {
  font-size: var(--m-text-base);
  font-weight: 600;
  line-height: 1.6;
  margin: 0;
}

.result__q-choice,
.result__q-answer,
.result__q-explain {
  font-size: var(--m-text-sm);
  color: var(--m-text-dim);
  line-height: 1.7;
  margin: 0;
}

.result__q-answer {
  color: var(--m-success);
}

.result__fb-head {
  display: flex;
  align-items: center;
  gap: var(--m-space-2);
  margin-bottom: var(--m-space-3);
}

.result__fb-note {
  font-size: var(--m-text-xs);
  color: var(--m-text-faint);
}

.result__fb-text {
  font-size: var(--m-text-base);
  line-height: 1.8;
  margin: 0 0 var(--m-space-3);
  white-space: pre-wrap;
}

.result__fb-disclaimer {
  font-size: var(--m-text-xs);
  color: var(--m-text-faint);
  margin: 0;
}

.result__reason {
  font-size: var(--m-text-sm);
  color: var(--m-text-faint);
  line-height: 1.7;
  margin: var(--m-space-2) 0 0;
}

.result__changes {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-2);
  margin-top: var(--m-space-3);
}

.result__change {
  display: flex;
  justify-content: space-between;
  font-size: var(--m-text-sm);
  color: var(--m-text-dim);
  border-bottom: 1px dashed var(--m-border);
  padding-bottom: var(--m-space-2);
}

.result__change-delta {
  color: var(--m-primary);
  font-weight: 600;
}

.result__idem {
  font-size: var(--m-text-xs);
  color: var(--m-text-faint);
  margin: var(--m-space-2) 0 0;
}

.result__actions {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-3);
  margin-top: var(--m-space-6);
}
</style>
