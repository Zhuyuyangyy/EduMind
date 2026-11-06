<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLearningStore } from '../stores/learning.ts'
import { getKp } from '../data/course.ts'
import { scoreAnswer } from '../logic/scoring.ts'
import { statusOf, STATUS_LABEL } from '../logic/mastery.ts'

const route = useRoute()
const router = useRouter()
const store = useLearningStore()

const kpId = computed(() => String(route.params.kpId))
const kp = computed(() => getKp(kpId.value))
const bank = computed(() => store.exercisesFor(kpId.value))

const current = ref(0)
/** questionId -> 选择下标 */
const answers = ref<Record<string, number>>({})
/** 已判分的题目（选择后立即判分） */
const graded = ref<Set<string>>(new Set())
const sessionResult = ref<{ correct: number; total: number; before: number; after: number; delta: number; reason: string } | null>(null)

const kpState = computed(() => store.state.kpStates[kpId.value])
const tested = computed(() => kpState.value.diagnosis !== null || kpState.value.practiceCount > 0)
const status = computed(() => STATUS_LABEL[statusOf(kpState.value.mastery, tested.value)])

const exercise = computed(() => bank.value[current.value])
const answeredAll = computed(() => bank.value.every((ex) => ex.id in answers.value))
const correctSoFar = computed(() =>
  bank.value.filter((ex) => answers.value[ex.id] !== undefined && scoreAnswer(ex, answers.value[ex.id]).correct).length
)

function choose(index: number) {
  const ex = exercise.value
  if (graded.value.has(ex.id)) return // 已判分，不可改答
  answers.value[ex.id] = index
  graded.value.add(ex.id)
}

function isGraded(exId: string) {
  return graded.value.has(exId)
}

function choiceClass(exId: string, index: number) {
  if (!isGraded(exId)) {
    return answers.value[exId] === index ? 'selected' : ''
  }
  const ex = bank.value.find((e) => e.id === exId)!
  if (index === ex.answer) return 'correct'
  if (answers.value[exId] === index) return 'wrong'
  return ''
}

function next() {
  if (current.value < bank.value.length - 1) current.value += 1
}

function prev() {
  if (current.value > 0) current.value -= 1
}

function submitSession() {
  const result = store.submitPracticeAction(kpId.value, answers.value)
  sessionResult.value = {
    correct: result.result.summary.correct ?? 0,
    total: result.result.summary.total,
    before: result.result.masteryBefore,
    after: result.result.masteryAfter,
    delta: result.result.delta,
    reason: result.result.reason
  }
}

function retry() {
  answers.value = {}
  graded.value = new Set()
  sessionResult.value = null
  current.value = 0
}
</script>

<template>
  <header>
    <button class="btn btn-ghost small no-print" style="margin-bottom: 8px" @click="router.back()">← 返回</button>
    <h1 class="page-title">针对性练习 · {{ kp.name }}</h1>
    <p class="page-desc">
      当前掌握度：
      <span class="badge" :class="tested ? (kpState.mastery >= 80 ? 'badge-ok' : kpState.mastery < 40 ? 'badge-bad' : 'badge-warn') : 'badge-idle'">
        {{ tested ? `${Math.round(kpState.mastery)}% · ${status}` : '未测试' }}
      </span>
      · {{ bank.length }} 道练习题（示例数据）
    </p>
  </header>

  <!-- 会话结果 -->
  <template v-if="sessionResult">
    <section class="card">
      <h2 class="card-title">练习完成</h2>
      <div class="grid-3" style="margin: var(--gap-sm) 0">
        <div class="stat-card">
          <span class="stat-label">本次正确率</span>
          <span class="stat-value">{{ sessionResult.correct }} / {{ sessionResult.total }}</span>
          <span class="stat-extra">提交后即时判分</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">掌握度变化</span>
          <span class="stat-value" :style="{ color: sessionResult.delta > 0 ? 'var(--ok)' : sessionResult.delta < 0 ? 'var(--bad)' : 'var(--idle)' }">
            {{ sessionResult.before }} → {{ sessionResult.after }}
          </span>
          <span class="stat-extra">{{ sessionResult.delta === 0 ? '本次未调整' : `${sessionResult.delta > 0 ? '+' : ''}${sessionResult.delta} 分` }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">累计练习</span>
          <span class="stat-value">{{ kpState.practiceCount }} 题</span>
          <span class="stat-extra">答对 {{ kpState.practiceCorrect }} 题</span>
        </div>
      </div>
      <div class="notice" :class="sessionResult.delta > 0 ? 'notice-ok' : sessionResult.delta < 0 ? 'notice-bad' : 'notice-info'">
        <span>{{ sessionResult.delta > 0 ? '↑' : sessionResult.delta < 0 ? '↓' : '=' }}</span>
        <div>{{ sessionResult.reason }}</div>
      </div>
      <div class="hero-actions no-print">
        <button class="btn btn-primary" @click="router.push('/plan')">查看更新后的学习计划</button>
        <button class="btn" @click="router.push('/profile')">查看知识画像</button>
        <button class="btn btn-ghost" @click="retry">重新练习</button>
      </div>
    </section>
  </template>

  <!-- 答题 -->
  <template v-else>
    <section class="card">
      <div class="quiz-progress">
        <span class="small muted" style="white-space: nowrap">第 {{ current + 1 }} / {{ bank.length }} 题</span>
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${((current + 1) / bank.length) * 100}%` }"></div>
        </div>
        <span class="small muted" style="white-space: nowrap">已答对 {{ correctSoFar }} 题</span>
      </div>

      <div class="section-head" style="margin-top: var(--gap-sm)">
        <span class="badge" :class="exercise.difficulty === 'easy' ? 'badge-ok' : exercise.difficulty === 'medium' ? 'badge-warn' : 'badge-bad'">
          {{ exercise.difficulty === 'easy' ? '简单' : exercise.difficulty === 'medium' ? '中等' : '较难' }}
        </span>
      </div>
      <h2 style="font-size: var(--h2-size); margin: var(--gap-sm) 0">{{ exercise.prompt }}</h2>

      <div class="choice-list" role="radiogroup" :aria-label="exercise.prompt">
        <button
          v-for="(choice, index) in exercise.choices"
          :key="index"
          class="choice-item"
          :class="choiceClass(exercise.id, index)"
          role="radio"
          :aria-checked="answers[exercise.id] === index"
          :disabled="isGraded(exercise.id)"
          @click="choose(index)"
        >
          <span class="choice-key">{{ String.fromCharCode(65 + index) }}</span>
          <span>{{ choice }}</span>
        </button>
      </div>

      <div v-if="isGraded(exercise.id)" class="explain-box" :class="scoreAnswer(exercise, answers[exercise.id]).correct ? 'ok' : 'bad'">
        <b>{{ scoreAnswer(exercise, answers[exercise.id]).correct ? '回答正确' : '回答错误' }}</b>
        ：正确答案是 {{ String.fromCharCode(65 + exercise.answer) }}. {{ exercise.choices[exercise.answer] }}
        <br />{{ exercise.explanation }}
      </div>

      <div class="quiz-actions">
        <button class="btn" :disabled="current === 0" @click="prev">上一题</button>
        <button v-if="current < bank.length - 1" class="btn btn-primary" :disabled="!isGraded(exercise.id)" @click="next">下一题</button>
        <button v-else class="btn btn-primary" :disabled="!answeredAll" @click="submitSession">提交并更新掌握度</button>
      </div>
    </section>

    <section class="card">
      <h2 class="card-title">练习规则</h2>
      <ul class="small" style="margin: 0; padding-left: 20px; line-height: 2">
        <li>每题选择后<b>立即判分</b>并显示正确答案与解析，不可改答。</li>
        <li>提交后按证据驱动规则更新该知识点掌握度：作答题数 ≥ 2 才生效；正确率处于 [40%, 80%) 稳定区间时不调整；单次变化上限 ±8 分。</li>
        <li>掌握度变化后，7 天学习计划会自动重新生成（见「学习计划」页的变更提示）。</li>
      </ul>
    </section>
  </template>
</template>
