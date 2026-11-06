<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useLearningStore } from '../stores/learning.ts'
import { demoCourse } from '../data/course.ts'
import KpCard from '../components/KpCard.vue'
import KpRadarChart from '../components/KpRadarChart.vue'
import MasteryRing from '../components/MasteryRing.vue'
import { MASTERY_RULES } from '../logic/mastery.ts'

const router = useRouter()
const store = useLearningStore()

const nameOf = (kpId: string) => demoCourse.knowledgePoints.find((k) => k.id === kpId)?.name ?? kpId
const counts = computed(() => ({
  mastered: store.statusGroups.mastered.length,
  learning: store.statusGroups.learning.length,
  weak: store.statusGroups.weak.length,
  untested: store.statusGroups.untested.length
}))
</script>

<template>
  <header>
    <h1 class="page-title">知识画像</h1>
    <p class="page-desc">基于诊断与练习记录的知识点掌握度画像（演示评估值，非真实学习能力测量）</p>
  </header>

  <template v-if="!store.isDiagnosed">
    <section class="card empty-state">
      <span class="icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M15.8 15.8 21 21" />
        </svg>
      </span>
      <h2 class="card-title">还没有诊断数据</h2>
      <p class="small muted">完成 8 道诊断题后，这里会生成你的知识点掌握度画像、薄弱点分析与推荐学习内容。</p>
      <button class="btn btn-primary btn-lg" @click="router.push('/diagnosis')">去完成学习诊断</button>
    </section>
  </template>

  <template v-else>
    <!-- 总览 -->
    <section class="card">
      <div style="display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--gap); align-items: center" class="overview-grid">
        <MasteryRing :value="store.overall" caption="仅统计有证据的知识点" />
        <div>
          <h2 class="card-title">总体掌握度</h2>
          <p class="small muted" style="margin-bottom: var(--gap-sm)">
            {{ demoCourse.name }} · 共 {{ demoCourse.knowledgePoints.length }} 个知识点
          </p>
          <div class="grid-4">
            <div class="stat-card">
              <span class="stat-label">已掌握</span>
              <span class="stat-value" style="color: var(--ok)">{{ counts.mastered }}</span>
              <span class="stat-extra">掌握度 ≥ 80%</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">学习中</span>
              <span class="stat-value" style="color: var(--warn)">{{ counts.learning }}</span>
              <span class="stat-extra">掌握度 40-79%</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">需加强</span>
              <span class="stat-value" style="color: var(--bad)">{{ counts.weak }}</span>
              <span class="stat-extra">掌握度 &lt; 40%</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">累计练习</span>
              <span class="stat-value">{{ store.practiceTotalCount }}</span>
              <span class="stat-extra">题（全部知识点）</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 雷达图 -->
    <section class="card">
      <h2 class="card-title">知识点掌握度雷达</h2>
      <p class="small muted" style="margin-bottom: var(--gap-sm)">各维度为该知识点的掌握度（0-100，演示评估值）</p>
      <KpRadarChart :states="store.kpList" />
    </section>

    <!-- 分组卡片 -->
    <section v-if="store.statusGroups.weak.length > 0">
      <h2 class="card-title" style="margin-bottom: var(--gap-sm)">
        需加强 <span class="badge badge-bad">{{ store.statusGroups.weak.length }}</span>
      </h2>
      <div class="grid-3">
        <KpCard v-for="kp in store.statusGroups.weak" :key="kp.kpId" :kp="kp" />
      </div>
    </section>

    <section v-if="store.statusGroups.learning.length > 0">
      <h2 class="card-title" style="margin-bottom: var(--gap-sm)">
        正在学习 <span class="badge badge-warn">{{ store.statusGroups.learning.length }}</span>
      </h2>
      <div class="grid-3">
        <KpCard v-for="kp in store.statusGroups.learning" :key="kp.kpId" :kp="kp" />
      </div>
    </section>

    <section v-if="store.statusGroups.mastered.length > 0">
      <h2 class="card-title" style="margin-bottom: var(--gap-sm)">
        已掌握 <span class="badge badge-ok">{{ store.statusGroups.mastered.length }}</span>
      </h2>
      <div class="grid-3">
        <KpCard v-for="kp in store.statusGroups.mastered" :key="kp.kpId" :kp="kp" />
      </div>
    </section>

    <!-- 掌握度变化流水 -->
    <section class="card">
      <h2 class="card-title">掌握度变化记录</h2>
      <p class="small muted" style="margin-bottom: var(--gap-sm)">每一次变化都附带原因，保证评估过程可解释、可复现。</p>
      <table class="table">
        <thead>
          <tr><th>时间</th><th>知识点</th><th>变化</th><th>原因</th></tr>
        </thead>
        <tbody>
          <template v-for="kp in store.kpList" :key="kp.kpId">
            <tr v-for="(change, i) in kp.history" :key="`${kp.kpId}-${i}`">
              <td class="small muted" style="white-space: nowrap">{{ new Date(change.at).toLocaleString('zh-CN') }}</td>
              <td style="white-space: nowrap">{{ nameOf(kp.kpId) }}</td>
              <td style="white-space: nowrap">
                <span class="badge" :class="change.after > change.before ? 'badge-ok' : change.after < change.before ? 'badge-bad' : 'badge-idle'">
                  {{ change.before }} → {{ change.after }}
                </span>
              </td>
              <td class="small">{{ change.reason }}</td>
            </tr>
          </template>
        </tbody>
      </table>
      <p v-if="store.kpList.every((kp) => kp.history.length === 0)" class="small muted">暂无变化记录。</p>
    </section>

    <!-- 计算规则说明 -->
    <section class="card">
      <h2 class="card-title">掌握度是怎么算出来的？</h2>
      <ol class="small" style="margin: 0; padding-left: 20px; line-height: 2">
        <li>
          <b>诊断建立基线</b>：诊断正确率 × {{ MASTERY_RULES.DIAGNOSIS_MAX }}（满分诊断也只记
          {{ MASTERY_RULES.DIAGNOSIS_MAX }} 分，避免「一题定生死」）。
        </li>
        <li>
          <b>证据量门槛</b>：单次练习某知识点作答题数少于 {{ MASTERY_RULES.MIN_SESSION_QUESTIONS }} 题时不调整，避免偶然性。
        </li>
        <li>
          <b>稳定区间</b>：练习正确率处于 [40%, 80%) 时掌握度不变，过滤噪声波动。
        </li>
        <li>
          <b>变化上限</b>：单次练习单知识点掌握度变化不超过 ±{{ MASTERY_RULES.MAX_DELTA }} 分，最终钳制在 0-100。
        </li>
      </ol>
      <p class="small muted" style="margin-top: var(--gap-sm)">
        以上规则移植自智学星枢正式工程的证据驱动画像更新逻辑（server/study/profile-updater.js），全部为确定性计算，无任何模型参与。
        掌握度是<b>演示评估值</b>，不是经过真实用户实验验证的学习能力测量。
      </p>
    </section>
  </template>
</template>

<style scoped>
@media (max-width: 860px) {
  .overview-grid {
    grid-template-columns: minmax(0, 1fr) !important;
    justify-items: center;
    text-align: center;
  }
}
</style>
