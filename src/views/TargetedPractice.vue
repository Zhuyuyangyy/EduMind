<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getKp } from '../../astripath/src/data/course.ts'
import { exercisesByKp } from '../../astripath/src/data/exercises.ts'
import { scoreAnswer } from '../../astripath/src/logic/scoring.ts'
import { demoSubmitPractice, getDemoState } from '../demo/demoState.ts'
import '../assets/styles/competition.css'

const route = useRoute()
const router = useRouter()

const kpId = computed(() => String(route.params.kpId))
const kp = computed(() => getKp(kpId.value))

const current = ref(0)
const answers = ref<Record<string, number>>({})
const graded = ref<Set<string>>(new Set())
const session = ref<{ correct: number; total: number; before: number; after: number; delta: number; reason: string } | null>(null)

const questions = computed(() => exercisesByKp[kpId.value] ?? [])

const kpState = computed(() => getDemoState().kpStates[kpId.value])
const tested = computed(() => kpState.value.diagnosis !== null || kpState.value.practiceCount > 0)
const question = computed(() => questions.value[current.value])
const answeredAll = computed(() => questions.value.every((q) => q.id in answers.value))

function choose(index: number) {
  const ex = question.value
  if (graded.value.has(ex.id)) return
  answers.value[ex.id] = index
  graded.value.add(ex.id)
}

function isGraded(id: string) {
  return graded.value.has(id)
}

function choiceClass(exId: string, index: number) {
  const ex = questions.value.find((q) => q.id === exId)!
  if (!isGraded(exId)) return answers.value[exId] === index ? 'selected' : ''
  if (index === ex.answer) return 'correct'
  if (answers.value[exId] === index) return 'wrong'
  return ''
}

function next() {
  if (current.value < questions.value.length - 1) current.value += 1
}

function prev() {
  if (current.value > 0) current.value -= 1
}

function submitSession() {
  const res = demoSubmitPractice(kpId.value, answers.value)
  session.value = {
    correct: res.result.summary.correct ?? 0,
    total: res.result.summary.total,
    before: res.result.masteryBefore,
    after: res.result.masteryAfter,
    delta: res.result.delta,
    reason: res.result.reason
  }
}

function retry() {
  answers.value = {}
  graded.value = new Set()
  session.value = null
  current.value = 0
}
</script>

<template>
  <div class="comp-page">
    <header class="comp-head">
      <button class="comp-btn comp-btn-ghost" style="align-self: flex-start; padding: 6px 12px; font-size: 12.5px" @click="router.back()">← 返回</button>
      <span class="comp-kicker">Step 5 · 针对性练习</span>
      <h1 class="comp-title">针对性练习 · {{ kp.name }}</h1>
      <p class="comp-subtitle">
        当前掌握度：
        <span class="comp-badge" :class="tested ? (kpState.mastery >= 60 ? 'comp-badge-ok' : kpState.mastery < 40 ? 'comp-badge-bad' : 'comp-badge-warn') : 'comp-badge'">
          {{ tested ? `${Math.round(kpState.mastery)}%` : '未测试' }}
        </span>
        · {{ questions.length }} 道练习题 · 提交后按证据规则更新掌握度
        <span class="comp-demo-flag">示例数据</span>
      </p>
    </header>

    <!-- 会话结果 -->
    <template v-if="session">
      <section class="comp-card">
        <div class="comp-card-title"><span class="dot"></span>练习完成</div>
        <div class="comp-grid comp-grid-3" style="margin-bottom: 16px">
          <div class="comp-stat">
            <span class="comp-stat-label">本次正确率</span>
            <span class="comp-stat-value">{{ session.correct }} / {{ session.total }}</span>
            <span class="comp-stat-extra">提交后即时判分</span>
          </div>
          <div class="comp-stat">
            <span class="comp-stat-label">掌握度变化</span>
            <span class="comp-stat-value" :style="{ color: session.delta > 0 ? 'var(--color-accent-emerald)' : session.delta < 0 ? 'var(--color-accent-rose)' : undefined }">
              {{ session.before }} → {{ session.after }}
            </span>
            <span class="comp-stat-extra">{{ session.delta === 0 ? '本次未调整' : `${session.delta > 0 ? '+' : ''}${session.delta} 分` }}</span>
          </div>
          <div class="comp-stat">
            <span class="comp-stat-label">累计练习</span>
            <span class="comp-stat-value">{{ kpState.practiceCount }} 题</span>
            <span class="comp-stat-extra">答对 {{ kpState.practiceCorrect }} 题</span>
          </div>
        </div>
        <div class="comp-notice" :class="session.delta > 0 ? 'comp-notice-ok' : session.delta < 0 ? 'comp-notice-warn' : 'comp-notice-info'">
          <span>{{ session.delta > 0 ? '↑' : session.delta < 0 ? '↓' : '=' }}</span>
          <div>{{ session.reason }}</div>
        </div>
        <div style="display: flex; gap: 12px; margin-top: 16px; flex-wrap: wrap">
          <button class="comp-btn comp-btn-primary" @click="router.push('/plan')">查看更新后的学习计划</button>
          <button class="comp-btn" @click="router.push('/knowledge-profile')">查看知识画像</button>
          <button class="comp-btn comp-btn-ghost" @click="retry">重新练习</button>
        </div>
      </section>
    </template>

    <!-- 答题 -->
    <template v-else>
      <section class="comp-card">
        <div class="comp-quiz-progress">
          <span class="comp-stat-extra" style="white-space: nowrap">第 {{ current + 1 }} / {{ questions.length }} 题</span>
          <div class="comp-progress">
            <div class="comp-progress-fill" :style="{ width: `${((current + 1) / questions.length) * 100}%` }"></div>
          </div>
          <span class="comp-stat-extra" style="white-space: nowrap">已答对 {{ questions.filter((q) => answers[q.id] !== undefined && scoreAnswer(q, answers[q.id]).correct).length }} 题</span>
        </div>

        <span class="comp-badge" :class="question.difficulty === 'easy' ? 'comp-badge-ok' : question.difficulty === 'medium' ? 'comp-badge-warn' : 'comp-badge-bad'">
          {{ question.difficulty === 'easy' ? '简单' : question.difficulty === 'medium' ? '中等' : '较难' }}
        </span>
        <p class="comp-question" style="margin-top: 12px">{{ question.prompt }}</p>

        <div class="comp-choice-list" role="radiogroup" :aria-label="question.prompt">
          <button
            v-for="(choice, index) in question.choices"
            :key="index"
            class="comp-choice"
            :class="choiceClass(question.id, index)"
            role="radio"
            :aria-checked="answers[question.id] === index"
            :disabled="isGraded(question.id)"
            @click="choose(index)"
          >
            <span class="comp-choice-key">{{ String.fromCharCode(65 + index) }}</span>
            <span>{{ choice }}</span>
          </button>
        </div>

        <div v-if="isGraded(question.id)" class="comp-explain" :class="scoreAnswer(question, answers[question.id]).correct ? 'ok' : 'bad'">
          <b>{{ scoreAnswer(question, answers[question.id]).correct ? '回答正确' : '回答错误' }}</b>
          ：正确答案是 {{ String.fromCharCode(65 + question.answer) }}. {{ question.choices[question.answer] }}
          <br />{{ question.explanation }}
        </div>

        <div class="comp-quiz-actions">
          <button class="comp-btn" :disabled="current === 0" @click="prev">上一题</button>
          <button v-if="current < questions.length - 1" class="comp-btn comp-btn-primary" :disabled="!isGraded(question.id)" @click="next">下一题</button>
          <button v-else class="comp-btn comp-btn-primary" :disabled="!answeredAll" @click="submitSession">提交并更新掌握度</button>
        </div>
      </section>

      <section class="comp-card">
        <div class="comp-card-title"><span class="dot"></span>练习规则</div>
        <ul class="comp-subtitle" style="margin: 0; padding-left: 20px; line-height: 2.1">
          <li>每题选择后<b style="color: var(--color-text-primary)">立即判分</b>并显示正确答案与解析，不可改答。</li>
          <li>提交后按证据驱动规则更新该知识点掌握度：作答题数 ≥ 2 才生效；正确率处于 [40%, 80%) 稳定区间时不调整；单次变化上限 ±8 分。</li>
          <li>无论掌握度是否调整，练习计数与最近测试都会记录（证据必留痕）。</li>
          <li>掌握度变化后，7 天学习计划会自动重新生成。</li>
        </ul>
      </section>
    </template>
  </div>
</template>
