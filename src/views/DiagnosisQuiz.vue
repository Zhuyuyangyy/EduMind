<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { diagnosisQuestions } from '../../astripath/src/data/diagnosis.ts'
import { demoCourse } from '../../astripath/src/data/course.ts'
import {
  demoIsDiagnosed,
  demoKpStates,
  demoOverall,
  demoPlan,
  demoReset,
  demoSubmitDiagnosis
} from '../demo/demoState.ts'
import '../assets/styles/competition.css'

const router = useRouter()

const current = ref(0)
const draft = ref<Record<string, number>>({})
const result = ref<ReturnType<typeof demoSubmitDiagnosis>['result'] | null>(null)

const question = computed(() => diagnosisQuestions[current.value])
const kpName = (kpId: string) => demoCourse.knowledgePoints.find((k) => k.id === kpId)?.name ?? kpId
const answeredCount = computed(() => Object.keys(draft.value).length)
const canSubmit = computed(() => answeredCount.value === diagnosisQuestions.length)
const isLast = computed(() => current.value === diagnosisQuestions.length - 1)

function choose(index: number) {
  draft.value[question.value.id] = index
}

function go(index: number) {
  current.value = index
}

function submit() {
  const res = demoSubmitDiagnosis(draft.value)
  result.value = res.result
}

function restart() {
  demoReset()
  draft.value = {}
  result.value = null
  current.value = 0
}

const kpAccuracy = computed(() => {
  if (!result.value) return []
  return result.value.perKp.map((entry) => {
    const rate = entry.total === 0 ? 0 : entry.correct / entry.total
    return { kpId: entry.kpId, name: kpName(entry.kpId), correct: entry.correct, total: entry.total, rate }
  })
})
</script>

<template>
  <div class="comp-page">
    <header class="comp-head">
      <span class="comp-kicker">Step 1 · 学习诊断</span>
      <h1 class="comp-title">知识点学情诊断</h1>
      <p class="comp-subtitle">
        《{{ demoCourse.name }}》演示诊断 · {{ diagnosisQuestions.length }} 道题覆盖 Python 基础 / NumPy / Pandas /
        分组聚合 / 数据可视化。提交后逐题自动判分，按知识点统计正确率，生成你的知识画像。
        <span class="comp-demo-flag">示例数据</span>
      </p>
    </header>

    <!-- 答题中 -->
    <template v-if="!demoIsDiagnosed() && !result">
      <section class="comp-card">
        <div class="comp-quiz-progress">
          <span class="comp-stat-extra" style="white-space: nowrap">第 {{ current + 1 }} / {{ diagnosisQuestions.length }} 题</span>
          <div class="comp-progress">
            <div class="comp-progress-fill" :style="{ width: `${((current + 1) / diagnosisQuestions.length) * 100}%` }"></div>
          </div>
          <span class="comp-stat-extra" style="white-space: nowrap">已作答 {{ answeredCount }} / {{ diagnosisQuestions.length }}</span>
        </div>

        <div class="comp-quiz-dots">
          <button
            v-for="(q, i) in diagnosisQuestions"
            :key="q.id"
            class="comp-quiz-dot"
            :class="{ current: i === current, answered: draft[q.id] !== undefined }"
            @click="go(i)"
          >
            {{ i + 1 }}
          </button>
        </div>

        <span class="comp-badge comp-badge-cyan">{{ kpName(question.kpId) }}</span>
        <p class="comp-question" style="margin-top: 12px">{{ question.prompt }}</p>

        <div class="comp-choice-list" role="radiogroup" :aria-label="question.prompt">
          <button
            v-for="(choice, index) in question.choices"
            :key="index"
            class="comp-choice"
            :class="{ selected: draft[question.id] === index }"
            role="radio"
            :aria-checked="draft[question.id] === index"
            @click="choose(index)"
          >
            <span class="comp-choice-key">{{ String.fromCharCode(65 + index) }}</span>
            <span>{{ choice }}</span>
          </button>
        </div>

        <div class="comp-quiz-actions">
          <button class="comp-btn" :disabled="current === 0" @click="current > 0 && go(current - 1)">上一题</button>
          <button v-if="!isLast" class="comp-btn comp-btn-primary" @click="go(current + 1)">下一题</button>
          <button v-else class="comp-btn comp-btn-primary" :disabled="!canSubmit" @click="submit">
            提交答卷并生成知识画像
          </button>
        </div>
        <p v-if="isLast && !canSubmit" class="comp-stat-extra" style="text-align: right; margin-top: 8px">
          还有 {{ diagnosisQuestions.length - answeredCount }} 题未作答（未作答按错误计分）
        </p>
      </section>
    </template>

    <!-- 本次诊断结果 -->
    <template v-else-if="result">
      <section class="comp-card">
        <div class="comp-card-title"><span class="dot"></span>诊断完成</div>
        <div class="comp-grid comp-grid-4" style="margin-bottom: 16px">
          <div class="comp-stat">
            <span class="comp-stat-label">诊断得分</span>
            <span class="comp-stat-value">{{ result.summary.correct }} / {{ result.summary.total }}</span>
            <span class="comp-stat-extra">正确率 {{ result.summary.correctRate === null ? '—' : `${Math.round(result.summary.correctRate * 100)}%` }}</span>
          </div>
          <div class="comp-stat">
            <span class="comp-stat-label">总体掌握度</span>
            <span class="comp-stat-value">{{ demoOverall() ?? 0 }}%</span>
            <span class="comp-stat-extra">演示评估值</span>
          </div>
          <div class="comp-stat">
            <span class="comp-stat-label">需加强知识点</span>
            <span class="comp-stat-value">{{ kpAccuracy.filter((r) => r.rate < 0.4).length }}</span>
            <span class="comp-stat-extra">正确率 &lt; 40%</span>
          </div>
          <div class="comp-stat">
            <span class="comp-stat-label">已排入计划</span>
            <span class="comp-stat-value">7 天</span>
            <span class="comp-stat-extra">薄弱优先 · 先修约束</span>
          </div>
        </div>
        <div style="display: flex; gap: 12px; flex-wrap: wrap">
          <button class="comp-btn comp-btn-primary comp-btn-lg" @click="router.push('/knowledge-profile')">查看知识画像 →</button>
          <button class="comp-btn comp-btn-lg" @click="router.push('/plan')">查看 7 天学习计划</button>
        </div>
      </section>

      <section class="comp-card">
        <div class="comp-card-title"><span class="dot"></span>各知识点正确率</div>
        <table class="comp-table">
          <thead>
            <tr><th>知识点</th><th>正确率</th><th>评价</th><th>初始掌握度</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in kpAccuracy" :key="row.kpId">
              <td style="color: var(--color-text-primary); font-weight: 600">{{ row.name }}</td>
              <td>{{ row.correct }} / {{ row.total }}</td>
              <td>
                <span class="comp-badge" :class="row.rate >= 0.8 ? 'comp-badge-ok' : row.rate >= 0.4 ? 'comp-badge-warn' : 'comp-badge-bad'">
                  {{ row.rate >= 0.8 ? '优秀' : row.rate >= 0.4 ? '一般' : '薄弱' }}
                </span>
              </td>
              <td>{{ Math.round(row.rate * 75) }} / 100</td>
            </tr>
          </tbody>
        </table>
        <p class="comp-stat-extra" style="margin-top: 12px">
          掌握度规则：诊断正确率 × 75 作为基线（满分诊断也只记 75 分，避免一题定生死）；后续练习按证据量门槛（≥2 题）、
          稳定区间 [40%, 80%) 与单次变化上限（±8 分）动态调整。全部为演示评估值。
        </p>
      </section>

      <section class="comp-card">
        <div class="comp-card-title"><span class="dot"></span>答题解析</div>
        <div v-for="(q, i) in diagnosisQuestions" :key="q.id" style="padding: 12px 0; border-bottom: 1px solid var(--color-border)">
          <div style="display: flex; gap: 10px; align-items: flex-start">
            <span class="comp-badge" :class="result.perQuestion[i].correct ? 'comp-badge-ok' : 'comp-badge-bad'">
              {{ result.perQuestion[i].correct ? '正确' : '错误' }}
            </span>
            <div style="flex: 1">
              <div style="color: var(--color-text-primary); font-weight: 600; font-size: 14px">{{ i + 1 }}. {{ q.prompt }}</div>
              <div class="comp-explain" :class="result.perQuestion[i].correct ? 'ok' : 'bad'" style="margin-top: 8px">
                正确答案：{{ String.fromCharCode(65 + q.answer) }}. {{ q.choices[q.answer] }}
                <template v-if="!result.perQuestion[i].correct && result.perQuestion[i].chosen !== null">
                  （你的选择：{{ String.fromCharCode(65 + result.perQuestion[i].chosen!) }}）
                </template>
                <br />{{ q.explanation }}
              </div>
            </div>
            <span class="comp-stat-extra" style="white-space: nowrap">{{ kpName(q.kpId) }}</span>
          </div>
        </div>
      </section>

      <section class="comp-card">
        <div class="comp-card-title"><span class="dot"></span>重新诊断</div>
        <p class="comp-stat-extra" style="margin-bottom: 12px">重新诊断将清空当前诊断、练习与计划记录，恢复初始演示状态。</p>
        <button class="comp-btn" @click="restart">重新开始诊断</button>
      </section>
    </template>

    <!-- 历史已诊断 -->
    <template v-else>
      <section class="comp-card">
        <div class="comp-card-title"><span class="dot"></span>诊断已完成</div>
        <p class="comp-subtitle" style="margin-bottom: 16px">
          你已完成诊断，当前总体掌握度 {{ demoOverall() ?? 0 }}%（演示评估值）。可查看知识画像与学习计划，或重新诊断。
        </p>
        <table class="comp-table">
          <thead>
            <tr><th>知识点</th><th>诊断正确率</th><th>当前掌握度</th></tr>
          </thead>
          <tbody>
            <tr v-for="{ kp, state } in demoKpStates()" :key="kp.id">
              <td style="color: var(--color-text-primary); font-weight: 600">{{ kp.name }}</td>
              <td>{{ state.diagnosis ? `${state.diagnosis.correct} / ${state.diagnosis.total}` : '—' }}</td>
              <td>{{ state.diagnosis || state.practiceCount > 0 ? `${Math.round(state.mastery)}%` : '—' }}</td>
            </tr>
          </tbody>
        </table>
        <div style="display: flex; gap: 12px; margin-top: 16px; flex-wrap: wrap">
          <button class="comp-btn comp-btn-primary" @click="router.push('/knowledge-profile')">查看知识画像</button>
          <button class="comp-btn" @click="router.push('/plan')">查看学习计划</button>
          <button class="comp-btn comp-btn-ghost" @click="restart">重新诊断</button>
        </div>
        <p class="comp-stat-extra" style="margin-top: 12px">当前计划首日任务：{{ demoPlan()[0]?.kpName }} · {{ demoPlan()[0]?.title }}</p>
      </section>
    </template>
  </div>
</template>
