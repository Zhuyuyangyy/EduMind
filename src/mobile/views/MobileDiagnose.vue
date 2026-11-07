<template>
  <section class="diagnose" :class="{ 'diagnose--planning': conversational }">
    <div class="diagnose__heading">
      <p class="diagnose__eyebrow">为你而定</p>
      <h1>{{ conversational ? '一起制定学习计划' : compact ? '再补充一点，就出发。' : '先了解，再出发。' }}</h1>
      <p>{{ compact ? '刚才的选择已记下，只需补充剩余信息。也可以先去问导师。' : '从你的目标、基础和日常安排出发，找到适合自己的学习节奏。' }}</p>
    </div>
    <nav v-if="conversational && !initialLoading && !loadError" class="planning-stages" aria-label="制定学习计划进度">
      <span v-for="(label, index) in ['了解需求', '确认自评', '生成路径']" :key="label" :class="{ active: index === planningStage, done: index < planningStage }" :aria-current="index === planningStage ? 'step' : undefined"><b>{{ index < planningStage ? '✓' : index + 1 }}</b>{{ label }}</span>
    </nav>
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
    <form v-else-if="compact" class="diagnose__compact" @submit.prevent="submitCompact">
      <nav class="diagnose__steps" aria-label="补充学习计划步骤">
        <span :class="{ active: compactStep === 0, done: compactStep > 0 }" :aria-current="compactStep === 0 ? 'step' : undefined"><b>1</b>补充信息</span>
        <span :class="{ active: compactStep === 1 }" :aria-current="compactStep === 1 ? 'step' : undefined"><b>2</b>确认自评</span>
      </nav>
      <div v-if="compactStep === 0" class="m-card diagnose__card">
        <h2>只补充还没聊到的</h2>
        <details class="diagnose__recorded">
          <summary>已记下 {{ recordedFields.length }} 项选择，展开修改</summary>
          <div class="diagnose__recorded-fields">
            <label v-for="field in recordedFields" :key="field.key" class="m-field"><span>{{ field.label }}</span><select v-model="answers[field.key]" class="m-input" :aria-label="field.label"><option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label v-if="answers.field === 'other'" class="m-field"><span>具体学习方向</span><input v-model="answers.customField" class="m-input" maxlength="100" required /></label>
          </div>
        </details>
        <label v-for="field in missingFields" :key="field.key" class="m-field"><span>{{ field.label }}</span><select v-model="answers[field.key]" class="m-input" :aria-label="field.label" required><option disabled value="">请选择</option><option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
        <label v-if="!recordedDetail" class="m-field"><span>把你的目标再说具体一点</span><textarea v-model="answers.shortTermDetail" class="m-textarea" rows="2" maxlength="600" required placeholder="例如：完成第一个 Python 小项目" /></label>
        <label v-else class="m-field"><span>你的具体目标（可修改）</span><textarea v-model="answers.shortTermDetail" class="m-textarea" rows="2" maxlength="600" required /></label>
      </div>
      <div v-else class="m-card diagnose__card">
        <h2>由你确认现在的状态</h2>
        <p>0 表示完全不熟悉，100 表示非常有把握。这是自评，不是测验成绩；后续会结合真实练习记录更新。</p>
        <label v-for="dim in dimensions" :key="dim.key" class="diagnose__dimension"><span><span>{{ dim.label }}</span><b>{{ answers[dim.key] }}</b></span><input v-model.number="answers[dim.key]" type="range" min="0" max="100" step="5" :aria-label="dim.label" /></label>
        <label class="diagnose__confirm"><input v-model="selfAssessmentConfirmed" type="checkbox" required /><span>我已确认以上自评分数，用于制定初始计划。</span></label>
      </div>
      <p v-if="validationError" class="m-error" role="alert">{{ validationError }}</p>
      <div class="diagnose__actions"><button v-if="compactStep" type="button" class="m-btn m-btn--ghost" :disabled="saving" @click="compactStep = 0; validationError = ''">上一步</button><button class="m-btn m-btn--primary" type="submit" :disabled="saving">{{ saving ? '正在分析并保存…' : compactStep ? '生成画像与学习路径' : '下一步，确认自评' }}</button></div>
      <RouterLink :to="{ path: '/tutor', query: { welcome: '1' } }" class="diagnose__later">先去问导师，稍后完善 <span aria-hidden="true">→</span></RouterLink>
      <p class="diagnose__privacy">确认提交后才会生成自评画像；模型不可用时会标记规则分析。</p>
    </form>
    <form v-else @submit.prevent="submit">
      <div v-if="conversational && conversationIndex < needsFields.length" class="m-card diagnose__card diagnose__card--conversation">
        <div class="planning-question-meta"><span>已了解的学习需求</span><b>{{ answeredNeeds }}<small> / {{ needsFields.length }}</small></b></div>
        <div class="m-progress" role="progressbar" aria-label="学习需求采集进度" :aria-valuenow="answeredNeeds" :aria-valuemin="0" :aria-valuemax="needsFields.length"><div class="m-progress__fill" :style="{ width: `${answeredNeeds / needsFields.length * 100}%` }" /></div>
        <h2 ref="planningQuestion" tabindex="-1">{{ needsFields[conversationIndex]!.label }}？</h2>
        <div class="diagnose__options">
          <button v-for="option in needsFields[conversationIndex]!.options" :key="option.value" type="button" :aria-pressed="answers[needsFields[conversationIndex]!.key] === option.value" @click="answerConversation(option.value)"><span>{{ option.label }}</span><MobileIcon name="chevronRight" :size="14" /></button>
        </div>
        <p class="planning-question-note">选一个最接近的答案，之后可以随时调整。</p>
        <button v-if="conversationIndex" type="button" class="planning-back" @click="conversationIndex--"><MobileIcon name="back" :size="14" /> 修改上一项</button>
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
    <template v-if="conversational && !initialLoading && !loadError">
      <section v-if="planningSummary.length" class="planning-summary" aria-labelledby="planning-summary-title">
        <div class="planning-section-head"><h2 id="planning-summary-title">{{ report ? '你的目标与节奏' : '已了解的你' }}</h2><span>{{ report ? '来自已保存档案' : '提交前可修改' }}</span></div>
        <div class="m-card planning-summary__body"><button v-for="item in planningSummary" :key="item.key" type="button" :aria-label="`修改${item.label}`" @click="editPlanningField(item.key)"><span>{{ item.label }}</span><strong>{{ item.value }}</strong><MobileIcon name="chevronRight" :size="14" /></button></div>
      </section>
      <section v-if="report && savedPath?.phases?.length" class="planning-path" aria-labelledby="planning-path-title"><div class="planning-section-head"><h2 id="planning-path-title">已生成的学习路径</h2><span>阶段与知识点</span></div><MobileLearningPath :path="savedPath" /></section>
      <section v-else class="planning-explainer" aria-labelledby="planning-explainer-title">
        <div class="planning-section-head"><h2 id="planning-explainer-title">接下来，我们这样学</h2><span>从目标到行动</span></div>
        <ol class="m-card planning-explainer__list">
          <li><span class="planning-explainer__icon"><MobileIcon name="target" :size="19" /></span><div><h3>定好目标与节奏</h3><p>结合你的方向、基础和每周可用时间。</p></div></li>
          <li><span class="planning-explainer__icon"><MobileIcon name="path" :size="19" /></span><div><h3>把知识点连成路径</h3><p>确认自评后，生成分阶段的学习安排。</p></div></li>
          <li><span class="planning-explainer__icon"><MobileIcon name="practice" :size="19" /></span><div><h3>边学边练，看见变化</h3><p>向导师提问，用真实练习反馈调整下一步。</p></div></li>
        </ol>
      </section>
    </template>
    <div v-if="error" class="m-error diagnose__error" role="alert"><b>{{ report ? '画像已保存，学习路径尚未生成' : '暂时无法保存画像' }}</b><span>{{ error }}</span></div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiGet, apiPost } from '@/lib/api'
import type { WelcomeRecord } from '@/mobile/data/welcome'
import { currentAccount, currentEpoch, bumpDataEpoch, fetchAccountData, profileDimensions } from '@/mobile/data/learning-data'
import { dimensions, needsFields, newAnswers, stepIsValid } from '@/mobile/data/onboarding'
import type { KnowledgePath, LearnerProfile } from '@/mobile/data/types'
import MobileIcon from '@/mobile/components/MobileIcon.vue'
import MobileLearningPath from '@/mobile/components/MobileLearningPath.vue'
const router = useRouter()
const route = useRoute()
const conversational = computed(() => route.path === '/planning')
const conversationIndex = ref(0)
const compact = ref(false)
const compactStep = ref(0)
const recordedFields = ref<typeof needsFields>([])
const recordedDetail = ref(false)
const missingFields = computed(() => needsFields.filter(field => !recordedFields.value.some(saved => saved.key === field.key)))
const selfAssessmentConfirmed = ref(false)
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
const savedPath = ref<KnowledgePath | null>(null)
const planningQuestion = ref<HTMLElement | null>(null)
const answeredNeeds = computed(() => needsFields.filter(field => field.options.some(option => option.value === answers[field.key])).length)
const planningStage = computed(() => report.value ? 2 : conversationIndex.value < needsFields.length ? 0 : 1)
const planningSummary = computed(() => {
  const fields = report.value ? needsFields : needsFields.filter((field, index) => index < conversationIndex.value || recordedFields.value.some(saved => saved.key === field.key))
  return fields.map(field => ({ key: field.key, label: field.label, value: field.key === 'field' && answers.field === 'other' ? answers.customField : field.options.find(option => option.value === answers[field.key])?.label })).filter(item => item.value)
})
function editPlanningField(key: typeof needsFields[number]['key']) { report.value = null; conversationIndex.value = needsFields.findIndex(field => field.key === key); step.value = 0; nextTick(() => planningQuestion.value?.focus()) }
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
    savedPath.value = result.data?.knowledgePath || null
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
    compact.value = !conversational.value && !report.value && welcome.result?.status === 'completed'
    recordedFields.value = needsFields.filter(field => field.options.some(option => option.value === savedNeeds[field.key]))
    if (conversational.value && !report.value) {
      const firstMissing = needsFields.findIndex(field => !field.options.some(option => option.value === answers[field.key]))
      conversationIndex.value = firstMissing < 0 ? needsFields.length : firstMissing
    }
    if (compact.value) {
      recordedDetail.value = Boolean(answers.shortTermDetail.trim())
    }
  } catch (err) { loadError.value = err instanceof Error ? err.message : '读取失败，请重试。' }
  finally { initialLoading.value = false }
}
function answerConversation(value: string) {
  const field = needsFields[conversationIndex.value]
  if (field) {
    answers[field.key] = value
    const isMissing = (item: typeof needsFields[number]) => !item.options.some(option => option.value === answers[item.key])
    const nextMissing = needsFields.findIndex((item, index) => index > conversationIndex.value && isMissing(item))
    const remaining = nextMissing >= 0 ? nextMissing : needsFields.findIndex(isMissing)
    conversationIndex.value = remaining < 0 ? needsFields.length : remaining
  }
}
async function submit() {
  validationError.value = ''
  if (!stepIsValid(answers, step.value)) { validationError.value = '请补全本步骤的学习需求，再继续。'; return }
  if (step.value < 3) { step.value++; return }
  const invalidStep = steps.findIndex((_, index) => !stepIsValid(answers, index))
  if (invalidStep >= 0) { step.value = invalidStep; validationError.value = '请确认本步骤的信息。'; return }
  await saveProfile()
}
async function submitCompact() {
  validationError.value = ''
  if (![0, 1, 3].every(index => stepIsValid(answers, index))) { compactStep.value = 0; validationError.value = '请补全剩余信息，并确认已保存的选择。'; return }
  if (!compactStep.value) { compactStep.value = 1; return }
  if (!selfAssessmentConfirmed.value || !stepIsValid(answers, 2)) { validationError.value = '请确认你的自评分数后再生成学习计划。'; return }
  await saveProfile()
}
async function saveProfile() {
  if (saving.value) return
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
.diagnose__recorded { border-bottom: 1px solid var(--m-border); padding-bottom: 16px; }
.diagnose__recorded summary { color: var(--m-primary); font-size: 14px; min-height: 44px; display: flex; align-items: center; cursor: pointer; }
.diagnose__recorded-fields { display: grid; gap: 20px; padding-top: 12px; }
.diagnose__confirm { display: flex; align-items: flex-start; gap: 10px; color: var(--m-text-dim); font-size: 14px; line-height: 1.7; cursor: pointer; }
.diagnose__confirm input { width: 20px; height: 20px; flex: none; margin: 2px 0 0; accent-color: var(--m-primary); }
.diagnose__later { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; margin-top: 12px; color: var(--m-primary); text-decoration: none; font-size: 14px; }
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
.diagnose__card > p { margin: 0; color: var(--m-text-dim); font-size: 14px; line-height: 1.7; }
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
.diagnose--planning .diagnose__heading { margin: 6px 0 18px; }
.diagnose--planning .diagnose__heading h1 { font-size: 28px; margin-bottom: 10px; }
.diagnose--planning .diagnose__heading > p:last-child { margin-bottom: 0; line-height: 1.75; }
.planning-stages { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 12px 0 18px; }
.planning-stages > span { display: flex; align-items: center; gap: 6px; color: var(--m-text-faint); font-size: 12px; }
.planning-stages b { display: grid; place-items: center; width: 23px; height: 23px; flex: none; background: var(--m-surface-2); border: 1px solid var(--m-border); border-radius: 50%; font-size: 12px; font-weight: 500; }
.planning-stages .active { color: var(--m-primary); }
.planning-stages .active b { border-color: var(--m-primary); background: var(--m-primary); color: var(--m-on-primary); }
.planning-stages .done b { background: var(--m-primary-soft); border-color: var(--m-primary-border); color: var(--m-primary); }
.diagnose__card--conversation { padding: 20px; gap: 16px; }
.planning-question-meta { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--m-text-dim); }
.planning-question-meta > b { font-size: 17px; color: var(--m-primary); font-weight: 600; white-space: nowrap; }
.planning-question-meta small { font-size: 12px; color: var(--m-text-faint); font-weight: 400; }
.diagnose__card--conversation h2 { font-size: 20px; line-height: 1.5; outline: none; }
.diagnose--planning .diagnose__options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.diagnose--planning .diagnose__options button { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 49px; padding: 10px 12px; text-align: left; font-size: 14px; line-height: 1.5; color: var(--m-text); border-color: var(--m-border); border-radius: 13px; background: var(--m-bg); transition: background var(--m-duration), border-color var(--m-duration); }
.diagnose--planning .diagnose__options button .m-icon { flex: none; color: var(--m-text-faint); }
.diagnose--planning .diagnose__options button:hover, .diagnose--planning .diagnose__options button[aria-pressed="true"] { background: var(--m-primary-soft); border-color: var(--m-primary-border); color: var(--m-primary); }
.diagnose--planning .diagnose__options button:active { transform: scale(.98); }
.diagnose--planning .diagnose__options button:last-child:nth-child(odd) { grid-column: 1 / -1; }
.diagnose__card > .planning-question-note { font-size: 12px; color: var(--m-text-faint); line-height: 1.7; }
.planning-back { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; border: 0; background: none; color: var(--m-primary); padding: 0; min-height: 36px; font: inherit; font-size: 13px; cursor: pointer; }
.planning-section-head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 6px 12px; margin: 22px 0 10px; }
.planning-section-head h2 { font-size: 16px; margin: 0; letter-spacing: -.3px; }
.planning-section-head > span { font-size: 12px; color: var(--m-text-faint); }
.planning-explainer__list { padding: 4px 18px; margin: 0; list-style: none; }
.planning-explainer__list li { display: flex; align-items: center; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--m-border); }
.planning-explainer__list li:last-child { border-bottom: 0; }
.planning-explainer__icon { display: grid; place-items: center; width: 35px; height: 35px; flex: none; border-radius: 11px; background: var(--m-primary-soft); color: var(--m-primary); }
.planning-explainer__list h3 { font-size: 14px; margin: 0 0 4px; }
.planning-explainer__list p { font-size: 12px; line-height: 1.7; color: var(--m-text-faint); margin: 0; }
.planning-summary__body { padding: 4px 18px; }
.planning-summary__body button { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1fr) 14px; align-items: center; gap: 12px; width: 100%; min-height: 48px; padding: 12px 0; border: 0; border-bottom: 1px solid var(--m-border); background: none; text-align: left; font: inherit; cursor: pointer; }
.planning-summary__body button:last-child { border-bottom: 0; }
.planning-summary__body button > span { font-size: 12px; color: var(--m-text-faint); }
.planning-summary__body button strong { font-size: 14px; font-weight: 500; color: var(--m-text); text-align: right; }
.planning-summary__body button .m-icon { color: var(--m-text-faint); }
@media (max-width: 359px) { .planning-stages { gap: 4px; } .planning-stages > span { font-size: 12px; gap: 4px; } .diagnose__card--conversation { padding: 18px; } }
</style>
