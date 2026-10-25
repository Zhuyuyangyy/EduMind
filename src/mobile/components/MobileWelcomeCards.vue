<template>
  <Teleport to="body">
    <div class="welcome-overlay" @keydown="onKeydown">
      <div class="welcome-deck">
        <div class="welcome-deck__rear welcome-deck__rear--far" aria-hidden="true" />
        <div class="welcome-deck__rear" aria-hidden="true" />
        <section ref="dialog" class="welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcome-title" aria-describedby="welcome-description" tabindex="-1">
          <header class="welcome-card__header"><span><MobileIcon name="sparkle" :size="15" /> 让智学星枢更懂你</span><button class="welcome-close" aria-label="关闭学习引导" :disabled="busy" @click="dismiss"><MobileIcon name="close" :size="18" /></button></header>
          <div class="welcome-progress" aria-label="引导进度"><i v-for="n in 7" :key="n" :class="{ active: n <= step + 1 }" /></div>
          <Transition name="welcome-slide" mode="out-in" @after-enter="title?.focus()">
            <div :key="step" class="welcome-card__body">
              <div class="welcome-card__symbol"><MobileIcon :name="current?.icon || 'check'" :size="26" /></div>
              <p class="welcome-card__eyebrow">{{ review ? '一份属于你的学习起点' : `认识你的第 ${step + 1} 步` }}</p>
              <h2 id="welcome-title" ref="title" tabindex="-1">{{ review ? '把这份了解，带进学习里。' : current!.title }}</h2>
              <p id="welcome-description" class="welcome-card__description">{{ review ? '这些选择会带入学习档案，你还可以继续补充和调整。' : current!.description }}</p>
              <template v-if="current">
                <fieldset class="welcome-options"><legend class="welcome-sr">{{ current.field.label }}</legend>
                  <label v-for="option in current.field.options" :key="option.value" class="welcome-option" :class="{ selected: answers[current.field.key] === option.value }">
                    <input v-model="answers[current.field.key]" type="radio" :name="`welcome-${current.field.key}`" :value="option.value" />
                    <span>{{ option.label }}</span><MobileIcon v-if="answers[current.field.key] === option.value" name="check" :size="14" />
                  </label>
                </fieldset>
                <label v-if="current.field.key === 'field' && answers.field === 'other'" class="welcome-detail"><span>你想学习什么？</span><input v-model="answers.customField" class="m-input" maxlength="120" placeholder="例如：生物信息学" /></label>
                <label v-if="current.field.key === 'shortTermGoal'" class="welcome-detail"><span>想再具体一点？（选填）</span><textarea v-model="answers.shortTermDetail" class="m-textarea" rows="2" maxlength="600" placeholder="例如：用 Python 完成第一个小项目" /></label>
              </template>
              <dl v-else class="welcome-summary"><div v-for="card in cards" :key="card.field.key"><dt>{{ card.summary }}</dt><dd>{{ card.field.key === 'field' && answers.field === 'other' ? answers.customField : card.field.options.find(option => option.value === answers[card.field.key])?.label }}</dd></div></dl>
            </div>
          </Transition>
          <p v-if="error" class="welcome-error" role="alert">{{ error }}</p>
          <footer class="welcome-card__footer"><button v-if="step" class="welcome-back" :disabled="busy" @click="back"><MobileIcon name="back" :size="16" /> 上一张</button><button class="m-btn m-btn--primary welcome-next" :disabled="busy" @click="next">{{ busy ? '正在保存…' : review ? '保存并完善档案' : '下一张' }}<MobileIcon v-if="!busy" name="chevronRight" :size="15" /></button></footer>
          <div class="welcome-card__bottom"><span>你可以随时修改这些选择</span><button :disabled="busy" @click="dismiss">稍后再说</button></div>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { apiPost } from '@/lib/api'
import { currentEpoch } from '@/mobile/data/learning-data'
import { needsFields, newAnswers } from '@/mobile/data/onboarding'
import type { SurveyAnswers } from '@/composables/useProfileSurvey'
import type { WelcomeRecord } from '@/mobile/data/welcome'
import MobileIcon, { type IconName } from './MobileIcon.vue'
const props = defineProps<{ initialAnswers: Partial<SurveyAnswers> }>()
const emit = defineEmits<{ saved: [record: WelcomeRecord]; dismiss: [answers: Partial<SurveyAnswers>] }>()
const definitions: Array<{ key: string; title: string; description: string; summary: string; icon: IconName }> = [
  { key: 'role', title: '现在的你，更像哪一种？', description: '从你的日常出发，找到舒服的学习方式。', summary: '当前身份', icon: 'profile' },
  { key: 'field', title: '最近，想探索哪个方向？', description: '选一个最感兴趣的方向，之后也可以改变。', summary: '学习方向', icon: 'path' },
  { key: 'level', title: '你现在站在哪个起点？', description: '没有标准答案。按你对自己的真实了解来选。', summary: '当前基础', icon: 'chart' },
  { key: 'shortTermGoal', title: '下一步，想完成什么？', description: '一个具体的小目标，会让前进更有方向。', summary: '近期目标', icon: 'target' },
  { key: 'weeklyHours', title: '每周，留多少时间给学习？', description: '从可以持续的小步开始，让计划适应生活。', summary: '每周投入', icon: 'clock' },
  { key: 'resourcePreference', title: '哪一种方式，更适合你？', description: '先从你喜欢的方式开始，慢慢找到自己的节奏。', summary: '学习偏好', icon: 'book' },
]
const cards = definitions.map(card => ({ ...card, field: needsFields.find(field => field.key === card.key)! }))
const answers = reactive({ ...newAnswers(), ...props.initialAnswers })
const step = ref(0)
const current = computed(() => cards[step.value])
const review = computed(() => step.value === cards.length)
const busy = ref(false)
const error = ref('')
const dialog = ref<HTMLElement | null>(null)
const title = ref<HTMLElement | null>(null)
const previousFocus = document.activeElement as HTMLElement | null
const previousOverflow = document.body.style.overflow
let active = true
onMounted(() => { document.body.style.overflow = 'hidden'; dialog.value?.focus() })
onBeforeUnmount(() => { active = false; document.body.style.overflow = previousOverflow; setTimeout(() => { if (previousFocus?.isConnected && previousFocus !== document.body) previousFocus.focus(); else document.querySelector<HTMLElement>('#mobile-content')?.focus() }, 0) })
function payload(): Partial<SurveyAnswers> {
  return Object.fromEntries([...cards.map(card => card.field.key), 'customField', 'shortTermDetail'].filter(key => answers[key as keyof SurveyAnswers] !== '').map(key => [key, answers[key as keyof SurveyAnswers]]))
}
function dismiss() { if (!busy.value) emit('dismiss', payload()) }
function back() { step.value--; error.value = ''; nextTick(() => title.value?.focus()) }
async function next() {
  error.value = ''
  if (!review.value) {
    const field = current.value!.field
    if (!field.options.some(option => option.value === answers[field.key]) || field.key === 'field' && answers.field === 'other' && !answers.customField.trim()) { error.value = '选一个适合你的答案，再继续。'; return }
    step.value++; await nextTick(); title.value?.focus(); return
  }
  const epoch = currentEpoch()
  busy.value = true
  try {
    const result = await apiPost<{ result: WelcomeRecord }>('/api/account/onboarding', { status: 'completed', answers: payload() })
    if (!active || epoch !== currentEpoch()) return
    emit('saved', result.result)
  } catch { if (active && epoch === currentEpoch()) error.value = '暂时没能保存，你的选择还在这里。请重试。' }
  finally { busy.value = false }
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); dismiss(); return }
  if (event.key !== 'Tab') return
  const elements = Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, [tabindex="0"]') || []).filter(el => el.getClientRects().length)
  const first = elements[0], last = elements[elements.length - 1]
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.value)) { event.preventDefault(); first?.focus() }
}
</script>

<style scoped>
.welcome-overlay { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom)); background: rgba(226, 232, 247, .56); backdrop-filter: blur(14px) saturate(.9); -webkit-backdrop-filter: blur(14px) saturate(.9); }
.welcome-deck { position: relative; width: 100%; max-width: 374px; }
.welcome-deck__rear { position: absolute; inset: 12px -6px 0; border-radius: 30px; border: 1px solid rgba(255,255,255,.8); background: rgba(255,255,255,.3); transform: rotate(3deg); box-shadow: 0 12px 30px rgba(60, 80, 135, .07); }
.welcome-deck__rear--far { inset: 8px -7px 0; transform: rotate(-3deg); background: rgba(243,247,255,.3); }
.welcome-card { position: relative; display: flex; flex-direction: column; width: 100%; max-height: calc(100dvh - 64px); padding: 22px; border: 1px solid rgba(255,255,255,.95); border-radius: 29px; background: linear-gradient(140deg, rgba(255,255,255,.87), rgba(247,250,255,.66)); backdrop-filter: blur(36px) saturate(1.35); -webkit-backdrop-filter: blur(36px) saturate(1.35); box-shadow: 0 24px 80px rgba(51,75,130,.15), inset 0 1px 0 white, inset 0 -1px 0 rgba(255,255,255,.5); overflow-y: auto; outline: none; font-family: var(--m-font); color: var(--m-text); }
.welcome-card__header { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex: none; }
.welcome-card__header > span { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--m-text-dim); }
.welcome-close { width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 50%; color: var(--m-text-faint); background: rgba(255,255,255,.5); cursor: pointer; }
.welcome-progress { display: flex; gap: 5px; margin: 14px 0 26px; }
.welcome-progress i { flex: 1; height: 3px; border-radius: 4px; background: rgba(130,148,185,.15); }
.welcome-progress i.active { background: var(--m-primary); }
.welcome-card__symbol { display: grid; place-items: center; width: 55px; height: 55px; border-radius: 18px; background: rgba(230,237,255,.7); color: var(--m-primary); border: 1px solid rgba(255,255,255,.7); box-shadow: inset 0 1px 0 rgba(255,255,255,.8); margin-bottom: 20px; }
.welcome-card__eyebrow { font-size: 11px; letter-spacing: .4px; color: var(--m-primary); margin: 0 0 9px; }
.welcome-card h2 { font-size: 25px; line-height: 1.4; letter-spacing: -.7px; font-weight: 600; margin: 0 0 10px; outline: none; }
.welcome-card__description { font-size: 12px; line-height: 1.8; color: var(--m-text-dim); margin: 0 0 22px; }
.welcome-options { border: 0; padding: 0; margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.welcome-option { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 5px; min-height: 64px; padding: 12px; border: 1px solid rgba(211,220,238,.8); border-radius: 16px; background: rgba(255,255,255,.5); color: var(--m-text-dim); font-size: 12px; line-height: 1.6; cursor: pointer; transition: background var(--m-duration), border-color var(--m-duration); }
.welcome-option.selected { background: rgba(232,240,255,.85); border-color: rgba(70,112,222,.6); color: var(--m-primary); box-shadow: inset 0 0 0 1px rgba(255,255,255,.7); }
.welcome-option input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.welcome-option:focus-within { outline: 3px solid var(--m-primary); outline-offset: 2px; }
.welcome-option .m-icon { flex: none; }
.welcome-detail { display: grid; gap: 8px; margin-top: 16px; font-size: 11px; color: var(--m-text-dim); }
.welcome-detail .m-input, .welcome-detail .m-textarea { background: rgba(255,255,255,.55); font-size: 16px; }
.welcome-card__footer { display: flex; align-items: center; gap: 12px; margin-top: 28px; }
.welcome-next { flex: 1; justify-content: space-between; min-height: 48px; font-size: 13px; }
.welcome-back { display: inline-flex; align-items: center; gap: 4px; border: 0; background: none; color: var(--m-text-dim); min-height: 44px; padding: 0; font: inherit; font-size: 11px; cursor: pointer; }
.welcome-card__bottom { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; }
.welcome-card__bottom > span { font-size: 10px; color: var(--m-text-faint); }
.welcome-card__bottom button { border: 0; background: transparent; color: var(--m-text-dim); min-height: 44px; font: inherit; font-size: 11px; cursor: pointer; padding: 0; }
.welcome-summary { margin: 0; display: grid; gap: 13px; }
.welcome-summary > div { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-size: 12px; }
.welcome-summary dt { color: var(--m-text-faint); }
.welcome-summary dd { margin: 0; text-align: right; color: var(--m-text); }
.welcome-error { font-size: 12px; line-height: 1.7; color: var(--m-danger); margin: 14px 0 0; }
.welcome-slide-enter-active, .welcome-slide-leave-active { transition: opacity 150ms, transform 150ms; }
.welcome-slide-enter-from { opacity: 0; transform: translateX(10px); }
.welcome-slide-leave-to { opacity: 0; transform: translateX(-8px); }
.welcome-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
@supports not (backdrop-filter: blur(1px)) { .welcome-card { background: #f8faff; } }
@media (max-height: 700px) { .welcome-progress { margin-bottom: 16px; } .welcome-card__symbol { width: 42px; height: 42px; margin-bottom: 12px; } .welcome-option { min-height: 54px; } .welcome-card__footer { margin-top: 20px; } }
</style>
