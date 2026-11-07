<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import ThreeKnowledgeTree from '../components/knowledge-tree/ThreeKnowledgeTree.vue'
import { demoCourse } from '../../astripath/src/data/course.ts'
import { kbByKp } from '../../astripath/src/data/knowledgeBase.ts'
import { demoIsDiagnosed, demoKpStates, demoOverall, demoPlan, demoReset, demoWeakKps } from '../demo/demoState.ts'
import { STATUS_LABEL, kpMastery, kpTested, masteryRange, toTreePoints } from '../demo/treeData.ts'
import '../assets/styles/competition.css'

const router = useRouter()

const treePoints = computed(() => toTreePoints())
const statusCounts = computed(() => {
  const counts = { mastered: 0, learning: 0, weak: 0, untested: 0 }
  for (const { kp } of demoKpStates()) {
    const tested = kpTested(kp.id)
    const range = masteryRange(kpMastery(kp.id), tested)
    if (range === 'mastered' || range === 'proficient') counts.mastered++
    else if (range === 'none') counts.untested++
    else if (range === 'weak' || range === 'beginner') counts.weak++
    else counts.learning++
  }
  return counts
})

const rangeBadge = (kpId: string) => {
  const range = masteryRange(kpMastery(kpId), kpTested(kpId))
  if (range === 'none') return 'comp-badge'
  if (range === 'mastered' || range === 'proficient') return 'comp-badge comp-badge-ok'
  if (range === 'weak' || range === 'beginner') return 'comp-badge comp-badge-bad'
  return 'comp-badge comp-badge-warn'
}
</script>

<template>
  <div class="comp-page">
    <header class="comp-head">
      <span class="comp-kicker">Step 2 · 知识画像</span>
      <h1 class="comp-title">你的知识点掌握画像</h1>
      <p class="comp-subtitle">
        基于诊断与练习记录生成的个人知识画像（演示评估值，非真实学习能力测量）。3D 知识树按先修关系组织，
        节点状态反映各知识点掌握度。
      </p>
    </header>

    <template v-if="!demoIsDiagnosed()">
      <section class="comp-card comp-empty">
        <span class="comp-empty-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="11" cy="11" r="6.5" /><path d="M15.8 15.8 21 21" />
          </svg>
        </span>
        <h2 class="comp-card-title" style="margin: 0">还没有诊断数据</h2>
        <p class="comp-subtitle">完成 8 道诊断题后，这里会生成你的知识点掌握画像与薄弱点分析。</p>
        <button class="comp-btn comp-btn-primary comp-btn-lg" @click="router.push('/diagnosis')">去完成学习诊断</button>
      </section>
    </template>

    <template v-else>
      <!-- 总览 -->
      <section class="comp-card">
        <div class="comp-grid comp-grid-4">
          <div class="comp-stat">
            <span class="comp-stat-label">总体掌握度</span>
            <span class="comp-stat-value">{{ demoOverall() ?? 0 }}%</span>
            <span class="comp-stat-extra">仅统计有证据的知识点</span>
          </div>
          <div class="comp-stat">
            <span class="comp-stat-label">已掌握 / 熟练</span>
            <span class="comp-stat-value" style="color: var(--color-accent-emerald)">{{ statusCounts.mastered }}</span>
            <span class="comp-stat-extra">掌握度 ≥ 60%</span>
          </div>
          <div class="comp-stat">
            <span class="comp-stat-label">需加强</span>
            <span class="comp-stat-value" style="color: var(--color-accent-rose)">{{ statusCounts.weak }}</span>
            <span class="comp-stat-extra">掌握度 &lt; 40%</span>
          </div>
          <div class="comp-stat">
            <span class="comp-stat-label">累计练习</span>
            <span class="comp-stat-value">{{ demoKpStates().reduce((s, { state }) => s + state.practiceCount, 0) }} 题</span>
            <span class="comp-stat-extra">证据驱动更新</span>
          </div>
        </div>
      </section>

      <!-- 3D 知识树 -->
      <section class="comp-card">
        <div class="comp-card-title"><span class="dot"></span>知识图谱 · 先修关系与掌握度</div>
        <p class="comp-stat-extra" style="margin-bottom: 12px">
          节点大小与颜色反映掌握度；拖动旋转，点击节点查看详情。先修关系自底向上。
        </p>
        <ThreeKnowledgeTree :knowledge-points="treePoints" :height="460" :fill="true" />
      </section>

      <!-- 薄弱知识点 -->
      <section v-if="demoWeakKps().length > 0" class="comp-card">
        <div class="comp-card-title"><span class="dot"></span>薄弱知识点（优先突破）</div>
        <div v-for="{ kp, state } in demoWeakKps()" :key="kp.id" class="comp-kp-row">
          <div class="comp-kp-info">
            <div class="comp-kp-name">{{ kp.name }}</div>
            <div class="comp-kp-meta">
              {{ kp.category }} · 预计 {{ kp.estMinutes }} 分钟 · 最近测试：
              {{ state.lastResult ? `${state.lastResult.correct}/${state.lastResult.total}` : '—' }} · 推荐学习：{{ kbByKp[kp.id]?.title }}
            </div>
          </div>
          <div class="comp-kp-bar">
            <div class="comp-progress"><div class="comp-progress-fill bad" :style="{ width: `${Math.round(state.mastery)}%` }"></div></div>
          </div>
          <span class="comp-badge comp-badge-bad" style="width: 52px; justify-content: center">{{ Math.round(state.mastery) }}%</span>
          <button class="comp-btn" style="padding: 7px 14px; font-size: 13px" @click="router.push(`/practice/${kp.id}`)">去练习</button>
        </div>
      </section>

      <!-- 全部知识点 -->
      <section class="comp-card">
        <div class="comp-card-title"><span class="dot"></span>全部知识点</div>
        <div v-for="{ kp, state } in demoKpStates()" :key="kp.id" class="comp-kp-row">
          <div class="comp-kp-info">
            <div class="comp-kp-name">{{ kp.name }}</div>
            <div class="comp-kp-meta">
              先修：{{ kp.prerequisites.length ? kp.prerequisites.map((p) => demoCourse.knowledgePoints.find((k) => k.id === p)?.name).join('、') : '无' }}
              · 练习 {{ state.practiceCount }} 题（对 {{ state.practiceCorrect }}）
            </div>
          </div>
          <div class="comp-kp-bar">
            <div class="comp-progress">
              <div
                class="comp-progress-fill"
                :class="!kpTested(kp.id) ? '' : kpMastery(kp.id) >= 60 ? 'ok' : kpMastery(kp.id) < 40 ? 'bad' : 'warn'"
                :style="{ width: `${kpTested(kp.id) ? kpMastery(kp.id) : 0}%` }"
              ></div>
            </div>
          </div>
          <span :class="rangeBadge(kp.id)" style="width: 76px; justify-content: center">
            {{ kpTested(kp.id) ? `${kpMastery(kp.id)}%` : STATUS_LABEL.none }}
          </span>
          <button class="comp-btn comp-btn-ghost" style="padding: 7px 14px; font-size: 13px" @click="router.push('/tutor')">问导师</button>
        </div>
      </section>

      <!-- 变化记录 -->
      <section class="comp-card">
        <div class="comp-card-title"><span class="dot"></span>掌握度变化记录</div>
        <table class="comp-table">
          <thead>
            <tr><th style="width: 170px">时间</th><th>知识点</th><th>变化</th><th>原因</th></tr>
          </thead>
          <tbody>
            <template v-for="{ kp, state } in demoKpStates()" :key="kp.id">
              <tr v-for="(change, i) in state.history" :key="`${kp.id}-${i}`">
                <td style="white-space: nowrap">{{ new Date(change.at).toLocaleString('zh-CN') }}</td>
                <td style="white-space: nowrap; color: var(--color-text-primary)">{{ kp.name }}</td>
                <td style="white-space: nowrap">
                  <span class="comp-badge" :class="change.after > change.before ? 'comp-badge-ok' : change.after < change.before ? 'comp-badge-bad' : 'comp-badge'">
                    {{ change.before }} → {{ change.after }}
                  </span>
                </td>
                <td>{{ change.reason }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </section>

      <!-- 规则说明 -->
      <section class="comp-card">
        <div class="comp-card-title"><span class="dot"></span>掌握度是怎么算出来的？</div>
        <ol class="comp-subtitle" style="margin: 0; padding-left: 20px; line-height: 2.1">
          <li><b style="color: var(--color-text-primary)">诊断建立基线</b>：诊断正确率 × 75（满分诊断也只记 75 分，避免一题定生死）。</li>
          <li><b style="color: var(--color-text-primary)">证据量门槛</b>：单次练习某知识点作答题数少于 2 题时不调整，避免偶然性。</li>
          <li><b style="color: var(--color-text-primary)">稳定区间</b>：练习正确率处于 [40%, 80%) 时掌握度不变，过滤噪声波动。</li>
          <li><b style="color: var(--color-text-primary)">变化上限</b>：单次练习单知识点掌握度变化不超过 ±8 分，最终钳制在 0-100。</li>
        </ol>
        <p class="comp-stat-extra" style="margin-top: 10px">
          规则移植自智学星枢正式工程的证据驱动画像更新逻辑（server/study/profile-updater.js），全部确定性计算，无模型参与。
          下一步任务已排入计划：{{ demoPlan()[0]?.kpName }} · {{ demoPlan()[0]?.title }}。
        </p>
        <div style="display: flex; gap: 12px; margin-top: 14px; flex-wrap: wrap">
          <button class="comp-btn comp-btn-primary" @click="router.push('/plan')">查看 7 天学习计划 →</button>
          <button class="comp-btn comp-btn-ghost" @click="demoReset(); router.push('/diagnosis')">重置演示</button>
        </div>
      </section>
    </template>
  </div>
</template>
