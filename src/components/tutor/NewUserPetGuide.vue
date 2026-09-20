<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BarChart3, Library, MessageCircle, Route, Sparkles } from 'lucide-vue-next'
import AiriLive2DRenderer from './live2d/AiriLive2DRenderer.vue'
import type { CompanionState } from '@/store'

const GUIDE_STORAGE_KEY = 'edumind-new-user-pet-guide-dismissed'
const BUBBLE_WIDTH = 380
const PET_WIDTH = 142
const VIEWPORT_GAP = 18

interface GuideStep {
  target: string
  label: string
  title: string
  detail: string
  icon: typeof MessageCircle
  accent: string
}

const route = useRoute()
const router = useRouter()
const visible = ref(false)
const activeIndex = ref(0)
const targetRect = ref<DOMRect | null>(null)
const petState = ref<CompanionState>('idle')

const steps: GuideStep[] = [
  {
    target: 'dialogue',
    label: '智能对话',
    title: '从「智能对话」开始',
    detail: '先点这里。在「对话」页告诉系统你的学习目标、薄弱点或一道错题；系统会据此建立学习画像。画像报告页可以随时查看分析结果。',
    icon: MessageCircle,
    accent: '#00d4ff',
  },
  {
    target: 'learning-path',
    label: '学习路径',
    title: '查看「学习路径」',
    detail: '对话分析后，来这里看「知识星座」和「学习路径」。点击星座里的知识点，系统会推荐最短学习路线和配套资源。',
    icon: Route,
    accent: '#35e0d8',
  },
  {
    target: 'edu-mind',
    label: '辅导资源',
    title: '使用「辅导资源」',
    detail: '需要资料、课程或练习时，来这里查找与知识点匹配的内容，辅助你完成路径中的任务。',
    icon: Library,
    accent: '#a78bfa',
  },
  {
    target: 'evaluation',
    label: '学习评估',
    title: '来做一次「评估」',
    detail: '学完一段后回来测试。系统会分析错因、更新画像，并推荐下一步任务，形成「诊断 → 学习 → 评估 → 再诊断」的闭环。',
    icon: BarChart3,
    accent: '#f0b24a',
  },
]

const currentStep = computed(() => steps[activeIndex.value])
const isLastStep = computed(() => activeIndex.value === steps.length - 1)

const spotlightStyle = computed(() => {
  const rect = targetRect.value
  if (!rect) {
    return {
      left: '50%',
      top: '84px',
      width: '280px',
      height: '56px',
      transform: 'translateX(-50%)',
      '--guide-accent': currentStep.value.accent,
    }
  }

  return {
    left: `${Math.max(8, rect.left - 8)}px`,
    top: `${Math.max(8, rect.top - 8)}px`,
    width: `${rect.width + 16}px`,
    height: `${rect.height + 16}px`,
    transform: 'none',
    '--guide-accent': currentStep.value.accent,
  }
})

const guideGroupStyle = computed(() => {
  const rect = targetRect.value
  const viewportWidth = window.innerWidth || 1200
  const viewportHeight = window.innerHeight || 800
  const groupWidth = Math.min(BUBBLE_WIDTH + PET_WIDTH + 18, viewportWidth - VIEWPORT_GAP * 2)

  if (!rect) {
    return {
      left: `${Math.max(VIEWPORT_GAP, (viewportWidth - groupWidth) / 2)}px`,
      top: '168px',
      '--guide-accent': currentStep.value.accent,
    }
  }

  const preferredTop = rect.bottom + 22
  const fallbackTop = rect.top - 238
  const top = preferredTop + 230 < viewportHeight
    ? preferredTop
    : Math.max(VIEWPORT_GAP, fallbackTop)
  const centerLeft = rect.left + rect.width / 2 - groupWidth / 2
  const left = Math.min(
    Math.max(VIEWPORT_GAP, centerLeft),
    Math.max(VIEWPORT_GAP, viewportWidth - groupWidth - VIEWPORT_GAP),
  )

  return {
    left: `${left}px`,
    top: `${top}px`,
    '--guide-accent': currentStep.value.accent,
  }
})

const progressText = computed(() => `${activeIndex.value + 1}/${steps.length}`)

function lockPageScroll(lock: boolean) {
  document.documentElement.classList.toggle('new-user-guide-open', lock)
}

function getTargetElement() {
  return document.querySelector<HTMLElement>(`[data-guide-target="${currentStep.value.target}"]`)
}

function measureTarget(shouldScroll = false) {
  const target = getTargetElement()
  if (!target) {
    targetRect.value = null
    return
  }

  if (shouldScroll) {
    target.scrollIntoView({ block: 'nearest', inline: 'center' })
  }

  requestAnimationFrame(() => {
    targetRect.value = target.getBoundingClientRect()
  })
}

function showGuide() {
  visible.value = true
  activeIndex.value = 0
  lockPageScroll(true)
  nextTick(() => measureTarget(true))
}

function persistGuideDismissed() {
  try {
    window.localStorage.setItem(GUIDE_STORAGE_KEY, '1')
  } catch {
    // Storage can be unavailable in restricted browser modes; still let the user enter.
  }
}

function completeGuide() {
  persistGuideDismissed()
  animatePetReaction('cheer', 1200)
  visible.value = false
  lockPageScroll(false)

  if (route.path === '/') {
    router.push({ name: 'dialogue', query: { source: 'onboarding' } })
  }
}

function skipGuide() {
  persistGuideDismissed()
  animatePetReaction('idle', 600)
  visible.value = false
  lockPageScroll(false)
}

function goNext() {
  if (isLastStep.value) {
    completeGuide()
    return
  }

  activeIndex.value += 1
  nextTick(() => measureTarget(true))
}

function goBack() {
  if (activeIndex.value === 0) return
  activeIndex.value -= 1
  nextTick(() => measureTarget(true))
}

function handleKeydown(event: KeyboardEvent) {
  if (!visible.value) return

  if (event.key === 'Escape') {
    skipGuide()
    return
  }

  if (event.key === 'ArrowRight' || event.key === 'Enter') {
    event.preventDefault()
    goNext()
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    goBack()
  }
}

function handleViewportChange() {
  if (!visible.value) return
  measureTarget()
}

function animatePetReaction(state: CompanionState, duration = 900) {
  petState.value = state
  window.setTimeout(() => {
    petState.value = 'idle'
  }, duration)
}

watch(
  activeIndex,
  () => {
    animatePetReaction('thinking', 700)
  },
)

watch(
  () => route.fullPath,
  () => {
    if (!visible.value) return
    nextTick(() => measureTarget(true))
  },
)

onMounted(() => {
  let shouldShow = true
  try {
    shouldShow = window.localStorage.getItem(GUIDE_STORAGE_KEY) !== '1'
  } catch {
    shouldShow = true
  }

  if (shouldShow) showGuide()

  window.addEventListener('resize', handleViewportChange)
  window.addEventListener('scroll', handleViewportChange, true)
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  lockPageScroll(false)
  window.removeEventListener('resize', handleViewportChange)
  window.removeEventListener('scroll', handleViewportChange, true)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <transition name="guide-fade">
    <section
      v-if="visible"
      class="new-user-guide"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-user-guide-title"
    >
      <div class="guide-dim" aria-hidden="true" />
      <div class="guide-spotlight" :style="spotlightStyle" aria-hidden="true">
        <span class="spotlight-pulse" />
        <span class="spotlight-label">{{ currentStep.label }}</span>
      </div>

      <div class="guide-group" :style="guideGroupStyle">
        <div class="guide-pet-stage" aria-hidden="true">
          <span class="pet-shadow" />
          <div class="guide-pet">
            <AiriLive2DRenderer
              :state="petState"
              :width="140"
              :height="160"
              :focus-at="{ x: 0, y: 0 }"
              :disable-focus="true"
              :facing="1"
            />
          </div>
        </div>

        <article class="guide-bubble">
          <div class="guide-bubble-head">
            <span class="guide-kicker">
              <Sparkles :size="14" stroke-width="1.8" />
              学习助手引导
            </span>
            <span class="guide-progress">{{ progressText }}</span>
          </div>

          <div class="guide-title-row">
            <span class="guide-icon">
              <component :is="currentStep.icon" :size="20" stroke-width="1.9" aria-hidden="true" />
            </span>
            <h1 id="new-user-guide-title">{{ currentStep.title }}</h1>
          </div>

          <p>{{ currentStep.detail }}</p>

          <div class="guide-actions">
            <button class="guide-skip" type="button" @click="skipGuide">
              跳过引导
            </button>
            <button class="guide-secondary" type="button" :disabled="activeIndex === 0" @click="goBack">
              上一步
            </button>
            <button class="guide-primary" type="button" @click="goNext">
              {{ isLastStep ? '知道了，进入系统' : '下一步' }}
            </button>
          </div>
        </article>
      </div>
    </section>
  </transition>
</template>

<style scoped>
.new-user-guide {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-toast) + 20);
  color: #f7fbff;
  pointer-events: auto;
}

.guide-dim {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 12% 18%, rgba(0, 212, 255, 0.14), transparent 32%),
    radial-gradient(circle at 78% 72%, rgba(240, 178, 74, 0.1), transparent 34%);
  z-index: 1;
}

.guide-spotlight {
  position: fixed;
  z-index: 2;
  border: 2px solid var(--guide-accent);
  border-radius: 14px;
  box-shadow:
    0 0 0 9999px rgba(2, 5, 16, 0.72),
    0 0 26px color-mix(in srgb, var(--guide-accent) 62%, transparent),
    inset 0 0 18px color-mix(in srgb, var(--guide-accent) 22%, transparent);
  transition:
    left 0.24s var(--ease-out),
    top 0.24s var(--ease-out),
    width 0.24s var(--ease-out),
    height 0.24s var(--ease-out);
  pointer-events: none;
}

.spotlight-pulse {
  position: absolute;
  inset: -8px;
  border: 1px solid color-mix(in srgb, var(--guide-accent) 72%, white);
  border-radius: 18px;
  animation: spotlight-pulse 1.55s ease-in-out infinite;
}

.spotlight-label {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 14px;
  border-radius: 8px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--guide-accent) 72%, #04111c), color-mix(in srgb, var(--guide-accent) 48%, #081838));
  border: 1px solid color-mix(in srgb, var(--guide-accent) 56%, rgba(255, 255, 255, 0.18));
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  white-space: nowrap;
  box-shadow: 0 4px 16px color-mix(in srgb, var(--guide-accent) 28%, transparent);
}

.guide-group {
  position: fixed;
  z-index: 3;
  display: flex;
  align-items: flex-end;
  gap: 16px;
  max-width: calc(100vw - 36px);
  transition:
    left 0.24s var(--ease-out),
    top 0.24s var(--ease-out);
}

.guide-pet-stage {
  position: relative;
  flex: 0 0 142px;
  height: 164px;
  display: grid;
  place-items: end center;
}

.pet-shadow {
  position: absolute;
  bottom: 10px;
  width: 94px;
  height: 26px;
  border-radius: 999px;
  background: radial-gradient(circle, color-mix(in srgb, var(--guide-accent) 26%, transparent), transparent 72%);
  filter: blur(3px);
}

.guide-pet {
  position: relative;
  width: 142px;
  height: 160px;
  transform-origin: center bottom;
  filter:
    drop-shadow(0 18px 28px rgba(0, 0, 0, 0.38))
    drop-shadow(0 0 20px color-mix(in srgb, var(--guide-accent) 20%, transparent));
}

.guide-bubble {
  position: relative;
  width: min(380px, calc(100vw - 36px));
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--guide-accent) 34%, rgba(142, 169, 224, 0.24));
  border-radius: 18px;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--guide-accent) 16%, transparent), transparent 44%),
    linear-gradient(145deg, rgba(9, 13, 35, 0.95), rgba(4, 7, 18, 0.93));
  box-shadow:
    0 22px 58px rgba(0, 0, 0, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.guide-bubble::before {
  content: '';
  position: absolute;
  left: -11px;
  bottom: 42px;
  width: 20px;
  height: 20px;
  border-left: 1px solid color-mix(in srgb, var(--guide-accent) 34%, rgba(142, 169, 224, 0.24));
  border-bottom: 1px solid color-mix(in srgb, var(--guide-accent) 34%, rgba(142, 169, 224, 0.24));
  background: rgba(7, 11, 29, 0.96);
  transform: rotate(45deg);
}

.guide-bubble-head,
.guide-title-row,
.guide-actions {
  display: flex;
  align-items: center;
}

.guide-bubble-head {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.guide-kicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: color-mix(in srgb, var(--guide-accent) 78%, white);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
}

.guide-progress {
  color: #97a8ce;
  font-family: var(--font-mono);
  font-size: 12px;
}

.guide-title-row {
  align-items: flex-start;
  gap: 12px;
}

.guide-icon {
  display: grid;
  place-items: center;
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  color: color-mix(in srgb, var(--guide-accent) 78%, white);
  background: color-mix(in srgb, var(--guide-accent) 14%, rgba(255, 255, 255, 0.04));
}

.guide-bubble h1 {
  margin: 0;
  color: #fff;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 500;
  line-height: 1.08;
  letter-spacing: 0;
}

.guide-bubble p {
  margin: 12px 0 0;
  color: rgba(237, 240, 247, 0.78);
  font-size: 14px;
  line-height: 1.75;
}

.guide-actions {
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.guide-primary,
.guide-secondary,
.guide-skip {
  min-height: 38px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.16s ease, border-color 0.16s ease, opacity 0.16s ease;
}

.guide-primary {
  padding: 0 18px;
  border: 0;
  color: #04111c;
  background: linear-gradient(135deg, #8feaff, var(--guide-accent));
  box-shadow: 0 12px 28px color-mix(in srgb, var(--guide-accent) 24%, transparent);
}

.guide-secondary {
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #d7e6ff;
  background: rgba(255, 255, 255, 0.06);
}

.guide-skip {
  margin-right: auto;
  padding: 0 10px;
  border: 0;
  color: rgba(215, 230, 255, 0.72);
  background: transparent;
}

.guide-primary:hover,
.guide-secondary:hover:not(:disabled),
.guide-skip:hover {
  transform: translateY(-1px);
}

.guide-skip:hover {
  color: #fff;
}

.guide-secondary:disabled {
  opacity: 0.36;
  cursor: not-allowed;
}

.guide-primary:focus-visible,
.guide-secondary:focus-visible,
.guide-skip:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 3px;
}

.guide-fade-enter-active,
.guide-fade-leave-active {
  transition: opacity 0.22s ease;
}

.guide-fade-enter-from,
.guide-fade-leave-to {
  opacity: 0;
}

@keyframes spotlight-pulse {
  0%, 100% {
    opacity: 0.7;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.035);
  }
}

@media (prefers-reduced-motion: reduce) {
  .guide-pet,
  .spotlight-pulse {
    animation: none !important;
  }

  .guide-group,
  .guide-spotlight,
  .guide-fade-enter-active,
  .guide-fade-leave-active {
    transition: none !important;
  }
}

@media (max-width: 760px) {
  .guide-group {
    left: 16px !important;
    right: 16px;
    top: 116px !important;
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    gap: 10px;
  }

  .guide-pet-stage {
    flex-basis: auto;
    width: 92px;
    height: 124px;
  }

  .guide-pet {
    width: 100px;
    height: 112px;
  }

  .pet-shadow {
    width: 72px;
  }

  .guide-bubble {
    width: auto;
    padding: 15px;
    border-radius: 16px;
  }

  .guide-bubble h1 {
    font-size: 22px;
  }

  .guide-bubble p {
    font-size: 13px;
  }

  .guide-bubble::before {
    bottom: 38px;
  }

  .guide-actions {
    justify-content: stretch;
    flex-wrap: wrap;
  }

  .guide-primary,
  .guide-secondary,
  .guide-skip {
    flex: 1;
  }

  .guide-skip {
    margin-right: 0;
  }
}
</style>
