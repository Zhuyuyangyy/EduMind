<template>
  <section class="diagnose">
    <div class="diagnose__heading">
      <p class="diagnose__eyebrow">为你而定</p>
      <h1>{{ conversational ? '一起制定学习计划' : '先了解，再出发。' }}</h1>
      <p>从你的目标、基础和日常安排出发，找到适合自己的学习节奏。</p>
    </div>
    <div v-if="initialLoading" class="m-skeleton m-skeleton--block" aria-label="读取学习档案" />
    <div v-else-if="loadError" class="m-error" role="alert">
      <b>暂时无法读取学习档案</b><span>{{ loadError }}</span><button class="m-btn m-btn--ghost" @click="loadExisting">重新读取</button>
    </div>
    <article v-else-if="report" class="m-card diagnose__card" aria-live="polite">
      <span class="m-badge m-badge--info">{{ report.analysisSource === 'rule' ? '问卷画像 · 规则降级分析' : report.analysisSource === 'model' ? '问卷画像 · 模型分析' : '已保存的学习画像' }}</span>
      <h2>你的学习起点，已记录。</h2>
      <p>以下来自学习需求与自评分析，供规划参考，不代表测验成绩。</p>
      <div v-for="dim in profileDimensions(report)" :key="dim.label" class="diagnose__dimension">
        <div><span>{{ dim.label }}</span><b>{{ dim.value }}</b></div>
        <div class="m-progress"><div class="m-progress__fill" :style="{ width: `${Math.min(100, Math.max(0, dim.value))}%` }" /></div>
      </div>
      <p v-for="suggestion in report.suggestions || report.recommendations || []" :key="suggestion">{{ suggestion }}</p>
      <button class="m-btn m-btn--primary m-btn--block" :disabled="saving" @click="generatePath">{{ saving ? '正在生成学习路径…' : '生成学习路径' }}</button>
      <RouterLink to="/growth" class="m-btn m-btn--ghost m-btn--block">查看已保存的成长记录</RouterLink>
      <button class="diagnose__text-button" :disabled="saving" @click="report = null; step = 0; conversationIndex = 0">调整学习需求</button>
    </article>
    <form v-else @submit.prevent="submit">
      <div v-if="conversational && conversationIndex < needsFields.length" class="m-card diagnose__card">
        <span class="m-badge m-badge--info">学习计划助手 · 引导采集</span>
        <p>回答几个小问题，再确认自评与需求。所有选择均可在提交前调整。</p>
        <div v-for="field in needsFields.slice(0, conversationIndex)" :key="field.key" class="diagnose__exchange">
          <span>{{ field.label }}？</span>
          <button type="button" @click="conversationIndex = needsFields.indexOf(field)">{{ field.options.find(option => option.value === answers[field.key])?.label }} <small>修改</small></button>
        </div>
        <h2>{{ needsFields[conversationIndex]!.label }}？</h2>
        <div class="diagnose__options">
          <button v-for="option in needsFields[conversationIndex]!.options" :key="option.value" type="button" :aria-pressed="answers[needsFields[conversationIndex]!.key] === option.value" @click="answerConversation(option.value)">{{ option.label }}</button>
        </div>
        <p>{{ conversationIndex + 1 }} / {{ needsFields.length }} · 不会自动提交画像</p>
      </div>
      <template v-else>
        <nav class="diagnose__steps" aria-label="学习需求步骤">
          <span v-for="(label, index) in steps" :key="label" :class="{ active: index === step, done: index < step }" :aria-current="index === step ? 'step' : undefined"><b>{{ index + 1 }}</b>{{ label }}</span>
        </nav>
        <div class="m-card diagnose__card">
          <p>第 {{ step + 1 }} 步，共 4 步</p><h2>{{ stepTitles[step] }}</h2>
          <label v-for="field in needsFields.filter(field => field.step === step)" :key="field.key" class="m-field">
            <span>{{ field.label }}</span>
            <select v-model="answers[field.key]" class="m-input" :aria-label="field.label" required><option disabled value="">请选择</option><option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</option></select>
          </label>
          <label v-if="step === 0 && answers.field === 'other'" class="m-field"><span>具体学习方向</span><input v-model="answers.customField" class="m-input" maxlength="100" required placeholder="例如：生物信息学" /></label>
          <label v-if="step === 1" class="m-field"><span>把你的目标再说具体一点</span><textarea v-model="answers.shortTermDetail" class="m-textarea" rows="3" maxlength="600" required placeholder="例如：一个月内学会 Python，完成一个数据分析项目。" /></label>
          <template v-if="step === 2">
            <p>请按实际感受评分。0 表示完全不熟悉，100 表示非常有把握；这是自评，不是测验。</p>
            <label v-for="dim in dimensions" :key="dim.key" class="diagnose__dimension">
              <span><span>{{ dim.label }}</span><b>{{ answers[dim.key] }}</b></span>
              <input v-model.number="answers[dim.key]" type="range" min="0" max="100" step="5" :aria-label="dim.label" />
            </label>
          </template>
        </div>
        <p v-if="validationError" class="m-error" role="alert">{{ validationError }}</p>
        <div class="diagnose__actions">
          <button v-if="step > 0" type="button" class="m-btn m-btn--ghost" :disabled="saving" @click="step--; validationError = ''">上一步</button>
          <button class="m-btn m-btn--primary" type="submit" :disabled="saving">{{ saving ? '正在分析并保存…' : step === 3 ? '生成画像与学习路径' : '下一步' }}</button>
        </div>
        <p class="diagnose__privacy">提交后保存到当前账号；模型不可用时会明确标记规则分析。提交前的填写内容仅保留在此页面。</p>
      </template>
    </form>
    <div v-if="error" class="m-error diagnose__error" role="alert"><b>{{ report ? '画像已保存，学习路径尚未生成' : '暂时无法保存画像' }}</b><span>{{ error }}</span></div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiGet, apiPost } from '@/lib/api'
import type { WelcomeRecord } from '@/mobile/data/welcome'
import { currentAccount, currentEpoch, bumpDataEpoch, fetchAccountData, profileDimensions } from '@/mobile/data/learning-data'
import { dimensions, needsFields, newAnswers, stepIsValid } from '@/mobile/data/onboarding'
import type { KnowledgePath, LearnerProfile } from '@/mobile/data/types'
const router = useRouter()
const route = useRoute()
const conversational = computed(() => route.path === '/planning')
const conversationIndex = ref(0)
const answers = reactive(newAnswers())
const steps = ['背景', '目标', '自评', '偏好']
const stepTitles = ['从你的学习背景开始', '这次，你想走到哪里？', '了解你当前的状态', '找到舒服的学习节奏']
const step = ref(0)
const saving = ref(false)
const initialLoading = ref(true)
const loadError = ref('')
const validationError = ref('')
const error = ref('')
const report = ref<LearnerProfile | null>(null)
let active = true
onBeforeUnmount(() => { active = false })
onMounted(loadExisting)
async function loadExisting() {
  initialLoading.value = true; loadError.value = ''
  try {
    const epoch = currentEpoch()
    const [result, welcome] = await Promise.all([fetchAccountData(), apiGet<{ result: WelcomeRecord | null }>('/api/account/onboarding')])
    if (result.stale || !active || epoch !== currentEpoch()) return
    if (result.error) throw new Error(result.error)
    report.value = result.data?.profile || null
    const savedNeeds = { ...report.value?.learnerNeeds, ...welcome.result?.answers }
    if (savedNeeds) {
      for (const field of needsFields) {
        const value = savedNeeds[field.key]
        if (typeof value === 'string' && field.options.some(option => option.value === value)) answers[field.key] = value
      }
      for (const key of ['customField', 'shortTermDetail'] as const) if (typeof savedNeeds[key] === 'string') answers[key] = savedNeeds[key]!
      for (const dim of dimensions) if (typeof savedNeeds[dim.key] === 'number') answers[dim.key] = savedNeeds[dim.key]!
    }
    if (route.query.welcome === '1') report.value = null
  } catch (err) { loadError.value = err instanceof Error ? err.message : '读取失败，请重试。' }
  finally { initialLoading.value = false }
}
function answerConversation(value: string) {
  const field = needsFields[conversationIndex.value]
  if (field) { answers[field.key] = value; conversationIndex.value++ }
}
async function submit() {
  validationError.value = ''
  if (!stepIsValid(answers, step.value)) { validationError.value = '请补全本步骤的学习需求，再继续。'; return }
  if (step.value < 3) { step.value++; return }
  const invalidStep = steps.findIndex((_, index) => !stepIsValid(answers, index))
  if (invalidStep >= 0) { step.value = invalidStep; validationError.value = '请确认本步骤的信息。'; return }
  const epoch = currentEpoch()
  saving.value = true; error.value = ''
  let saved = false
  try {
    const result = await apiPost<{ profile: LearnerProfile }>('/api/agents/profile', { ...answers })
    if (epoch !== currentEpoch() || !active) return
    if (!profileDimensions(result.profile).length) throw new Error('服务未返回有效画像，请重试。')
    report.value = result.profile; bumpDataEpoch(); saved = true
  } catch (err) { if (epoch === currentEpoch()) error.value = err instanceof Error ? err.message : '保存失败，请重试。' }
  finally { saving.value = false }
  if (saved) await generatePath()
}
async function generatePath() {
  const epoch = currentEpoch(); const account = currentAccount()
  saving.value = true; error.value = ''
  try {
    const path = await apiPost<KnowledgePath>('/api/knowledge-path/generate', {})
    if (epoch !== currentEpoch() || account !== currentAccount() || !active) return
    if (!path?.phases?.length) throw new Error('路径为空，请重新生成。')
    bumpDataEpoch(); await router.replace('/today')
  } catch (err) { if (epoch === currentEpoch()) error.value = err instanceof Error ? err.message : '路径生成失败，请重试。' }
  finally { saving.value = false }
}
</script>

<style scoped>
.diagnose__heading { margin: 12px 0 28px; }
.diagnose__eyebrow { color: var(--m-primary); font-size: 13px; font-weight: 600; margin: 0 0 8px; }
.diagnose__heading h1 { font-size: var(--m-text-2xl); letter-spacing: -1px; margin: 0 0 12px; line-height: 1.2; }
.diagnose__heading > p:last-child { color: var(--m-text-dim); font-size: 14px; max-width: 32em; }
.diagnose__steps { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 20px; }
.diagnose__steps > span { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--m-text-faint); }
.diagnose__steps b { display: grid; place-items: center; width: 25px; height: 25px; border-radius: 50%; background: var(--m-border); font-weight: 500; }
.diagnose__steps .active { color: var(--m-primary); }
.diagnose__steps .active b, .diagnose__steps .done b { background: var(--m-primary); color: var(--m-on-primary); }
.diagnose__card { display: flex; flex-direction: column; gap: 22px; padding: 24px; }
.diagnose__card > p { margin: 0; color: var(--m-text-dim); font-size: 13px; line-height: 1.7; }
.diagnose h2 { font-size: 21px; letter-spacing: -.5px; margin: 0; }
.diagnose__dimension { display: flex; flex-direction: column; gap: 10px; }
.diagnose__dimension > span, .diagnose__dimension > div:first-child { display: flex; justify-content: space-between; font-size: 14px; }
.diagnose__dimension b { color: var(--m-primary); }
.diagnose__dimension input { width: 100%; height: 44px; accent-color: var(--m-primary); margin: 0; }
.diagnose__actions { display: flex; gap: 12px; margin-top: 24px; }
.diagnose__actions > .m-btn--primary { flex: 1; }
.diagnose__privacy { font-size: 12px; color: var(--m-text-faint); margin: 20px 4px; line-height: 1.7; }
.diagnose__error { margin-top: 16px; }
.diagnose__text-button { border: 0; min-height: 44px; color: var(--m-primary); background: transparent; font: inherit; cursor: pointer; }
.diagnose__options { display: flex; flex-wrap: wrap; gap: 10px; }
.diagnose__options button { min-height: 44px; border: 1px solid var(--m-border); border-radius: 14px; padding: 10px 14px; background: var(--m-surface); color: var(--m-primary); font: inherit; cursor: pointer; }
.diagnose__exchange { width: 100%; display: flex; flex-direction: column; gap: 8px; color: var(--m-text-dim); font-size: 13px; }
.diagnose__exchange button { align-self: flex-end; border: 0; border-radius: 14px; min-height: 44px; padding: 10px 16px; background: var(--m-primary-soft); color: var(--m-primary); font: inherit; cursor: pointer; }
.diagnose__exchange small { margin-left: 12px; }
</style>
