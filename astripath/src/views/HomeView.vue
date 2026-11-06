<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useLearningStore } from '../stores/learning.ts'
import { demoCourse } from '../data/course.ts'
import MasteryRing from '../components/MasteryRing.vue'
import FlowSteps from '../components/FlowSteps.vue'

const router = useRouter()
const store = useLearningStore()

const weakCount = computed(() => store.weakKps.length)
const masteredCount = computed(() => store.statusGroups.mastered.length)
const todayTask = computed(() => store.todayTask)
const currentStep = computed(() => {
  if (!store.isDiagnosed) return 'diagnosis'
  if (store.practiceTotalCount === 0) return 'practice'
  return 'feedback'
})

function startExperience() {
  router.push(store.isDiagnosed ? '/plan' : '/diagnosis')
}
</script>

<template>
  <!-- Hero -->
  <section class="hero">
    <div>
      <span class="badge badge-demo">2026 Qoder 高校创造力大赛 · StudyHack 赛道</span>
      <h1 class="hero-title" style="margin-top: 12px">
        让每个大学生都有一个<br />
        <em>真正懂自己的 AI 导师</em>
      </h1>
      <p class="hero-slogan">
        智学星枢持续记录你的知识点掌握情况，建立个人学习画像，动态调整学习计划——
        AI 不只是回答问题，更知道你在哪里不会、为什么不会、下一步该学什么。
      </p>
      <div class="hero-actions">
        <button class="btn btn-primary btn-lg" @click="startExperience">
          {{ store.isDiagnosed ? '继续学习' : '立即体验' }}
          <span aria-hidden="true">→</span>
        </button>
        <button class="btn btn-lg" @click="router.push('/course')">查看演示课程</button>
      </div>
      <p class="small muted" style="margin-top: 12px">无需注册登录 · 5 分钟完整体验 · 数据仅保存在本机浏览器</p>
    </div>
    <div class="hero-ring">
      <MasteryRing
        :value="store.overall"
        :caption="store.isDiagnosed ? '基于诊断与练习的演示评估' : '完成诊断后生成'"
      />
    </div>
  </section>

  <!-- 闭环流程 -->
  <section class="card">
    <div class="section-head" style="margin-bottom: var(--gap-sm)">
      <div>
        <h2 class="card-title">学习闭环</h2>
        <p class="small muted">诊断 → 画像 → 计划 → 辅导 → 练习 → 反馈，每一步都可验证</p>
      </div>
      <FlowSteps :current="currentStep" />
    </div>
    <div class="grid-4">
      <div class="stat-card">
        <span class="stat-label">当前课程</span>
        <span class="stat-value">{{ demoCourse.name }}</span>
        <span class="stat-extra">{{ demoCourse.knowledgePoints.length }} 个知识点 · {{ demoCourse.level }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">总体掌握度</span>
        <span class="stat-value" :style="{ color: store.overall === null ? 'var(--idle)' : undefined }">
          {{ store.overall === null ? '未诊断' : `${store.overall}%` }}
        </span>
        <span class="stat-extra">已掌握 {{ masteredCount }} / {{ demoCourse.knowledgePoints.length }} 个知识点</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">今日任务</span>
        <span class="stat-value" style="font-size: 17px; line-height: 1.4">
          {{ store.isDiagnosed && todayTask ? `Day ${todayTask.day} · ${todayTask.kpName}` : '完成诊断后生成' }}
        </span>
        <span class="stat-extra">
          {{ store.isDiagnosed && todayTask ? `${todayTask.title} · 约 ${todayTask.minutes} 分钟` : 'AI 将根据薄弱点规划' }}
        </span>
      </div>
      <div class="stat-card">
        <span class="stat-label">学习进度</span>
        <span class="stat-value">{{ store.planProgressInfo.done }} / {{ store.planProgressInfo.total }}</span>
        <span class="stat-extra">计划任务完成 · 已练习 {{ store.practiceTotalCount }} 题</span>
      </div>
    </div>
  </section>

  <!-- 未诊断引导 / 已诊断摘要 -->
  <section v-if="!store.isDiagnosed" class="card">
    <h2 class="card-title">开始你的第一次学习诊断</h2>
    <p class="small muted" style="margin-bottom: var(--gap-sm)">
      用 8 道演示题定位你的薄弱知识点，系统会自动生成个人知识画像与 7 天学习计划。所有演示数据均为虚构样本。
    </p>
    <button class="btn btn-primary btn-lg" @click="router.push('/diagnosis')">开始诊断（约 3 分钟）</button>
  </section>

  <section v-else class="grid-2">
    <div class="card">
      <h2 class="card-title">你的薄弱知识点</h2>
      <template v-if="weakCount > 0">
        <p class="small muted" style="margin-bottom: var(--gap-sm)">
          以下知识点掌握度低于 40%（演示评估值），已优先排入学习计划：
        </p>
        <table class="table">
          <thead>
            <tr><th>知识点</th><th>掌握度</th><th>最近测试</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="kp in store.weakKps.slice(0, 4)" :key="kp.kpId">
              <td>{{ demoCourse.knowledgePoints.find((k) => k.id === kp.kpId)?.name }}</td>
              <td><span class="badge badge-bad">{{ Math.round(kp.mastery) }}%</span></td>
              <td>{{ kp.lastResult ? `${kp.lastResult.correct}/${kp.lastResult.total}` : '—' }}</td>
              <td><button class="btn btn-ghost" @click="router.push(`/practice/${kp.kpId}`)">练习</button></td>
            </tr>
          </tbody>
        </table>
      </template>
      <p v-else class="small muted">暂未发现薄弱知识点（掌握度均 ≥ 40%）。继续保持练习，或进入综合测评检验迁移能力。</p>
    </div>

    <div class="card">
      <h2 class="card-title">AI 导师入口</h2>
      <p class="small muted" style="margin-bottom: var(--gap-sm)">
        针对薄弱知识点提问，获取讲解、示例、常见错误与练习推荐。回答附课程资料引用依据（演示模式）。
      </p>
      <div class="chip-row" style="margin-bottom: var(--gap-sm)">
        <button v-for="q in store.tutorSuggestions.slice(0, 3)" :key="q" class="chip" @click="router.push('/tutor')">
          {{ q }}
        </button>
      </div>
      <button class="btn btn-primary" @click="router.push('/tutor')">进入 AI 导师</button>
    </div>
  </section>
</template>
