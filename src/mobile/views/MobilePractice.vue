<template>
  <section class="practice">
    <!-- 加载 / 恢复中 -->
    <div v-if="loading" class="m-card">
      <div class="m-skeleton m-skeleton--text" style="width: 50%" />
      <div class="m-skeleton m-skeleton--text" style="width: 90%" />
      <div class="m-skeleton m-skeleton--block" />
    </div>

    <!-- 会话不存在 / 加载失败 -->
    <div v-else-if="fatal" class="m-error" role="alert">
      <b>{{ fatal }}</b>
      <RouterLink to="/today" class="m-btn m-btn--ghost m-btn--sm" style="align-self: flex-start; margin-top: 8px">返回今日学习</RouterLink>
    </div>

    <template v-else>
      <!-- 进度 -->
      <header class="practice__head">
        <div class="practice__meta">
          <span class="m-badge m-badge--info">{{ current?.domain || '练习' }}</span>
          <span class="practice__count">{{ answeredCount }} / {{ exercises.length }} 已作答</span>
        </div>
        <div class="m-progress"><div class="m-progress__fill" :style="{ width: progressPercent + '%' }" /></div>
      </header>

      <!-- 当前题目 -->
      <article v-if="current" class="m-card practice__card">
        <div class="practice__qmeta">
          <span>{{ current.knowledgePoint }}</span>
          <span class="practice__diff">{{ difficultyLabel(current.difficulty) }}</span>
        </div>
        <h2 class="practice__prompt">{{ current.prompt }}</h2>
        <div class="practice__choices">
          <button
            v-for="(choice, index) in current.choices || []"
            :key="index"
            class="practice__choice"
            :class="choiceClass(index)"
            :disabled="isAnswered(current.id) || submitting"
            @click="onChoose(index)"
          >
            <span class="practice__choice-key">{{ String.fromCharCode(65 + index) }}</span>
            <span>{{ choice }}</span>
          </button>
        </div>

        <!-- 单题反馈（提交后即时显示对错；标准答案在结果页公开） -->
        <div v-if="isAnswered(current.id)" class="practice__verdict" :class="answeredMap[current.id].correct ? 'practice__verdict--ok' : 'practice__verdict--bad'">
          <b>{{ answeredMap[current.id].correct ? '回答正确' : '回答错误' }}</b>
          <span v-if="answeredMap[current.id].duplicate" class="practice__dup">（重复提交已按首次结果处理，未重复计分）</span>
        </div>
        <p v-else-if="submitError" class="practice__error">{{ submitError }}</p>
      </article>

      <!-- 导航 -->
      <nav class="practice__nav">
        <button class="m-btn m-btn--ghost m-btn--sm" :disabled="currentIndex === 0" @click="currentIndex -= 1">上一题</button>
        <span class="practice__position">{{ currentIndex + 1 }} / {{ exercises.length }}</span>
        <button
          class="m-btn m-btn--ghost m-btn--sm"
          :disabled="currentIndex >= exercises.length - 1"
          @click="currentIndex += 1"
        >
          下一题
        </button>
      </nav>

      <!-- 完成 -->
      <div class="practice__finish">
        <button
          class="m-btn m-btn--primary m-btn--block"
          :disabled="answeredCount < exercises.length || completing"
          @click="onComplete"
        >
          {{ completing ? '提交中…' : answeredCount < exercises.length ? `还有 ${exercises.length - answeredCount} 题未作答` : '完成练习并查看结果' }}
        </button>
        <p v-if="completeError" class="practice__error">{{ completeError }}</p>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  completeStudySession,
  fetchSessionQuestions,
  submitAnswer,
} from '@/mobile/data/study'
import type { StudyExercise } from '@/mobile/data/study'

const route = useRoute()
const router = useRouter()
const sessionId = String(route.params.sessionId || '')

const loading = ref(true)
const fatal = ref('')
const exercises = ref<StudyExercise[]>([])
const answeredMap = ref<Record<string, { correct: boolean; duplicate: boolean }>>({})
const currentIndex = ref(0)
const submitting = ref(false)
const submitError = ref('')
const completing = ref(false)
const completeError = ref('')

const current = computed(() => exercises.value[currentIndex.value] || null)
const answeredCount = computed(() => Object.keys(answeredMap.value).length)
const progressPercent = computed(() => (exercises.value.length ? Math.round((answeredCount.value / exercises.value.length) * 100) : 0))

function isAnswered(exerciseId: string): boolean {
  return Boolean(answeredMap.value[exerciseId])
}

function difficultyLabel(difficulty: string): string {
  if (difficulty === 'easy') return '基础'
  if (difficulty === 'medium') return '进阶'
  return difficulty || '练习'
}

function choiceClass(index: number): string[] {
  const classes: string[] = []
  if (current.value && isAnswered(current.value.id)) {
    // 已作答题：只标记对错，不提前公开标准答案（结果页才展示）
    classes.push('practice__choice--locked')
  }
  return classes
}

onMounted(async () => {
  document.title = '练习 · 智学星枢 Mobile'
  const state = await fetchSessionQuestions(sessionId)
  if (!state) {
    fatal.value = '练习会话不存在、已失效或不属于当前账号'
    loading.value = false
    return
  }
  exercises.value = state.exercises
  answeredMap.value = Object.fromEntries(
    state.answered.map(item => [item.exerciseId, { correct: item.correct, duplicate: false }]),
  )
  // 恢复时跳到第一个未作答题
  const firstUnanswered = state.exercises.findIndex(exercise => !answeredMap.value[exercise.id])
  if (firstUnanswered >= 0) currentIndex.value = firstUnanswered
  if (state.session.status === 'completed') {
    // 已关闭会话：直接去结果页
    router.replace(`/study/session/${sessionId}/result`)
    return
  }
  loading.value = false
})

async function onChoose(index: number) {
  const exercise = current.value
  if (!exercise || isAnswered(exercise.id) || submitting.value) return
  submitting.value = true
  submitError.value = ''
  try {
    const result = await submitAnswer(sessionId, exercise.id, index)
    if (result.ok && typeof result.correct === 'boolean') {
      answeredMap.value = {
        ...answeredMap.value,
        [exercise.id]: { correct: result.correct, duplicate: Boolean(result.duplicate) },
      }
    } else if (result.code === 'session-closed') {
      // 服务端判定会话已关闭：转结果页
      router.replace(`/study/session/${sessionId}/result`)
      return
    } else {
      submitError.value = result.message || '提交失败，请重试'
    }
  } finally {
    submitting.value = false
  }
}

async function onComplete() {
  if (completing.value) return
  completing.value = true
  completeError.value = ''
  try {
    const result = await completeStudySession(sessionId)
    if (result.ok) {
      await router.push(`/study/session/${sessionId}/result`)
    } else if (result.code === 'session-closed') {
      await router.push(`/study/session/${sessionId}/result`)
    } else {
      completeError.value = result.message || '完成失败，请重试'
    }
  } finally {
    completing.value = false
  }
}
</script>

<style scoped>
.practice__head {
  margin-bottom: var(--m-space-4);
}

.practice__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--m-space-2);
}

.practice__count {
  font-size: var(--m-text-sm);
  color: var(--m-text-faint);
}

.practice__card {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-4);
}

.practice__qmeta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--m-text-sm);
  color: var(--m-text-faint);
}

.practice__diff {
  border: 1px solid var(--m-border-strong);
  border-radius: var(--m-radius-full);
  padding: 1px 10px;
}

.practice__prompt {
  font-size: var(--m-text-lg);
  line-height: 1.6;
  margin: 0;
}

.practice__choices {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-2);
}

.practice__choice {
  display: flex;
  align-items: center;
  gap: var(--m-space-3);
  text-align: left;
  background: var(--m-bg);
  border: 1px solid var(--m-border-strong);
  border-radius: var(--m-radius-md);
  padding: var(--m-space-3) var(--m-space-4);
  font-size: var(--m-text-base);
  color: var(--m-text);
  cursor: pointer;
  transition: border-color var(--m-duration) var(--m-ease), transform var(--m-duration) var(--m-ease);
}
.practice__choice:active {
  transform: scale(0.98);
}
.practice__choice:disabled {
  cursor: default;
}
.practice__choice--locked {
  opacity: 0.75;
}

.practice__choice-key {
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: var(--m-radius-full);
  background: var(--m-surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--m-text-sm);
  font-weight: 700;
  color: var(--m-text-dim);
}

.practice__verdict {
  border-radius: var(--m-radius-md);
  padding: var(--m-space-3) var(--m-space-4);
  font-size: var(--m-text-md);
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--m-space-2);
}
.practice__verdict--ok {
  background: var(--m-success-soft);
  color: var(--m-success);
}
.practice__verdict--bad {
  background: var(--m-danger-soft);
  color: var(--m-danger);
}
.practice__dup {
  font-size: var(--m-text-xs);
  opacity: 0.85;
}

.practice__error {
  font-size: var(--m-text-sm);
  color: var(--m-danger);
  margin: 0;
}

.practice__nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--m-space-4);
}

.practice__position {
  font-size: var(--m-text-sm);
  color: var(--m-text-faint);
}

.practice__finish {
  margin-top: var(--m-space-5);
}
</style>
