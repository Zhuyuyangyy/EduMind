<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLearningStore } from '../stores/learning.ts'
import { diagnosisQuestions } from '../data/diagnosis.ts'
import { demoCourse } from '../data/course.ts'
import type { DiagnosisResult } from '../logic/state.ts'

const router = useRouter()
const store = useLearningStore()

const current = ref(0)
/** 本地作答草稿：questionId -> choiceIndex */
const draft = ref<Record<string, number>>({ ...store.state.diagnosis.answers })
const result = ref<DiagnosisResult | null>(null)
const submitted = computed(() => store.isDiagnosed || result.value !== null)

const question = computed(() => diagnosisQuestions[current.value])
const progressText = computed(() => `第 ${current.value + 1} / ${diagnosisQuestions.length} 题`)
const answeredCount = computed(() => Object.keys(draft.value).length)
const canSubmit = computed(() => answeredCount.value === diagnosisQuestions.length)
const isLast = computed(() => current.value === diagnosisQuestions.length - 1)

function choose(index: number) {
  draft.value[question.value.id] = index
}

function prev() {
  if (current.value > 0) current.value -= 1
}

function next() {
  if (current.value < diagnosisQuestions.length - 1) current.value += 1
}

function submit() {
  const res = store.submitDiagnosisAction(draft.value)
  result.value = res.result
}

function restart() {
  store.resetDemo()
  draft.value = {}
  result.value = null
  current.value = 0
}

const kpAccuracy = computed(() => {
  if (!result.value) return []
  return result.value.perKp.map((entry) => {
    const kp = demoCourse.knowledgePoints.find((k) => k.id === entry.kpId)
    const rate = entry.total === 0 ? 0 : entry.correct / entry.total
    return { kpId: entry.kpId, name: kp?.name ?? entry.kpId, correct: entry.correct, total: entry.total, rate }
  })
})
</script>

<template>
  <header>
    <h1 class="page-title">学习诊断</h1>
    <p class="page-desc">
      《{{ demoCourse.name }}》演示诊断 · {{ diagnosisQuestions.length }} 题覆盖
      Python 基础 / NumPy / Pandas / 分组聚合 / 数据可视化（示例数据）
    </p>
  </header>

  <!-- ============ 答题中 ============ -->
  <template v-if="!submitted">
    <section class="card">
      <div class="quiz-progress">
        <span class="small muted" style="white-space: nowrap">{{ progressText }}</span>
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${((current + 1) / diagnosisQuestions.length) * 100}%` }"></div>
        </div>
        <span class="small muted" style="white-space: nowrap">已作答 {{ answeredCount }} / {{ diagnosisQuestions.length }}</span>
      </div>

      <div class="chip-row" style="margin-top: var(--gap-sm)">
        <span
          v-for="(q, i) in diagnosisQuestions"
          :key="q.id"
          class="chip"
          :style="{
            borderColor: i === current ? 'var(--site-accent)' : undefined,
            background: i === current ? 'var(--accent-soft)' : draft[q.id] !== undefined ? 'var(--ok-soft)' : undefined,
            color: draft[q.id] !== undefined && i !== current ? 'var(--ok)' : undefined
          }"
          @click="current = i"
        >
          {{ i + 1 }}
        </span>
      </div>
    </section>

    <section class="card">
      <div class="section-head" style="margin-bottom: 4px">
        <span class="badge badge-accent">{{ demoCourse.knowledgePoints.find((k) => k.id === question.kpId)?.name }}</span>
      </div>
      <h2 style="font-size: var(--h2-size); margin: var(--gap-sm) 0">{{ question.prompt }}</h2>

      <div class="choice-list" role="radiogroup" :aria-label="question.prompt">
        <button
          v-for="(choice, index) in question.choices"
          :key="index"
          class="choice-item"
          :class="{ selected: draft[question.id] === index }"
          role="radio"
          :aria-checked="draft[question.id] === index"
          @click="choose(index)"
        >
          <span class="choice-key">{{ String.fromCharCode(65 + index) }}</span>
          <span>{{ choice }}</span>
        </button>
      </div>

      <div class="quiz-actions">
        <button class="btn" :disabled="current === 0" @click="prev">上一题</button>
        <button v-if="!isLast" class="btn btn-primary" @click="next">下一题</button>
        <button v-else class="btn btn-primary" :disabled="!canSubmit" @click="submit">
          提交答卷并生成知识画像
        </button>
      </div>
      <p v-if="isLast && !canSubmit" class="small muted" style="margin-top: 8px; text-align: right">
        还有 {{ diagnosisQuestions.length - answeredCount }} 题未作答（未作答将按错误计分）
      </p>
    </section>
  </template>

  <!-- ============ 本次会话的诊断结果（优先展示） ============ -->
  <template v-else-if="result">
    <section class="card">
      <div class="section-head">
        <div>
          <h2 class="card-title">诊断完成</h2>
          <p class="small muted">
            得分 {{ result.summary.correct }} / {{ result.summary.total }}（{{
              result.summary.correctRate === null ? '—' : `${Math.round(result.summary.correctRate * 100)}%`
            }}）· 已按知识点统计正确率并生成初始知识画像
          </p>
        </div>
        <span class="badge badge-ok">已提交</span>
      </div>
      <div class="hero-actions">
        <button class="btn btn-primary btn-lg" @click="router.push('/profile')">查看知识画像</button>
        <button class="btn btn-lg" @click="router.push('/plan')">查看 7 天学习计划</button>
      </div>
    </section>

    <section class="card">
      <h2 class="card-title">各知识点正确率</h2>
      <table class="table">
        <thead>
          <tr><th>知识点</th><th>正确率</th><th>结果</th><th>初始掌握度（演示评估值）</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in kpAccuracy" :key="row.kpId">
            <td style="font-weight: 600">{{ row.name }}</td>
            <td>{{ row.correct }} / {{ row.total }}</td>
            <td>
              <span class="badge" :class="row.rate >= 0.8 ? 'badge-ok' : row.rate >= 0.4 ? 'badge-warn' : 'badge-bad'">
                {{ row.rate >= 0.8 ? '优秀' : row.rate >= 0.4 ? '一般' : '薄弱' }}
              </span>
            </td>
            <td>{{ Math.round(row.rate * 75) }} / 100（诊断最高记 75 分，避免一题定生死）</td>
          </tr>
        </tbody>
      </table>
      <p class="small muted" style="margin-top: var(--gap-sm)">
        掌握度计算规则：诊断正确率 × 75 作为基线；后续练习按证据量门槛（≥2 题）、稳定区间 [40%, 80%) 与单次变化上限（±8）动态调整。
        全部为演示评估值，不是经过真实用户实验验证的学习能力测量。
      </p>
    </section>

    <section class="card">
      <h2 class="card-title">答题解析</h2>
      <div v-for="(q, i) in diagnosisQuestions" :key="q.id" class="result-row">
        <span class="badge" :class="result.perQuestion[i].correct ? 'badge-ok' : 'badge-bad'">
          {{ result.perQuestion[i].correct ? '对' : '错' }}
        </span>
        <div>
          <div style="font-weight: 600">{{ i + 1 }}. {{ q.prompt }}</div>
          <div class="explain-box" :class="result.perQuestion[i].correct ? 'ok' : 'bad'" style="margin-top: 8px">
            正确答案：{{ String.fromCharCode(65 + q.answer) }}. {{ q.choices[q.answer] }}
            <template v-if="!result.perQuestion[i].correct && result.perQuestion[i].chosen !== null">
              （你的选择：{{ String.fromCharCode(65 + result.perQuestion[i].chosen!) }}）
            </template>
            <br />{{ q.explanation }}
          </div>
        </div>
        <span class="small muted" style="white-space: nowrap">{{ demoCourse.knowledgePoints.find((k) => k.id === q.kpId)?.name }}</span>
      </div>
    </section>

    <section class="card no-print">
      <h2 class="card-title">重新诊断</h2>
      <p class="small muted" style="margin-bottom: var(--gap-sm)">重新诊断将清空当前诊断与练习记录，恢复初始演示状态。</p>
      <button class="btn btn-danger" @click="restart">重新开始诊断</button>
    </section>
  </template>

  <!-- ============ 历史诊断结果（刷新页面后展示） ============ -->
  <template v-else-if="store.isDiagnosed">
    <section class="card">
      <div class="section-head">
        <div>
          <h2 class="card-title">诊断已完成</h2>
          <p class="small muted">
            你已于 {{ store.state.diagnosis.submittedAt ? new Date(store.state.diagnosis.submittedAt).toLocaleString('zh-CN') : '此前' }}
            完成诊断，知识画像与学习计划已生成。可查看画像详情，或重新诊断。
          </p>
        </div>
        <span class="badge badge-ok">已提交</span>
      </div>
      <table class="table">
        <thead>
          <tr><th>知识点</th><th>诊断正确率</th><th>当前掌握度（含练习更新）</th></tr>
        </thead>
        <tbody>
          <tr v-for="kp in store.kpList" :key="kp.kpId">
            <td style="font-weight: 600">{{ demoCourse.knowledgePoints.find((k) => k.id === kp.kpId)?.name }}</td>
            <td>{{ kp.diagnosis ? `${kp.diagnosis.correct} / ${kp.diagnosis.total}` : '—' }}</td>
            <td>{{ kp.diagnosis || kp.practiceCount > 0 ? `${Math.round(kp.mastery)}%` : '—' }}</td>
          </tr>
        </tbody>
      </table>
      <div class="hero-actions">
        <button class="btn btn-primary btn-lg" @click="router.push('/profile')">查看知识画像</button>
        <button class="btn btn-lg" @click="router.push('/plan')">查看 7 天学习计划</button>
      </div>
    </section>

    <section class="card no-print">
      <h2 class="card-title">重新诊断</h2>
      <p class="small muted" style="margin-bottom: var(--gap-sm)">重新诊断将清空当前诊断与练习记录，恢复初始演示状态。</p>
      <button class="btn btn-danger" @click="restart">重新开始诊断</button>
    </section>
  </template>
</template>
