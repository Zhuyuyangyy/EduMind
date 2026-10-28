<template>
  <div class="mobile-shell" :class="{ 'mobile-shell--compact-footer': !showTabs, 'mobile-shell--signed-in': isSignedIn }" :inert="welcomeOpen || openDialogCount > 0 || undefined" :aria-hidden="welcomeOpen || openDialogCount > 0 ? 'true' : undefined">
    <a class="mobile-skip" href="#mobile-content">跳到内容</a>
    <header class="mobile-header">
      <RouterLink v-if="isDetail" :to="backTarget" class="mobile-back" aria-label="返回上一层">
        <MobileIcon name="back" :size="21" />
      </RouterLink>
      <RouterLink class="mobile-brand" :to="isSignedIn ? '/today' : '/login'" aria-label="智学星枢首页">
        <span class="mobile-brand__mark"><MobileIcon name="sparkle" :size="17" /></span>
        <span class="mobile-brand__name">智学星枢<small>EduMind</small></span>
      </RouterLink>
      <span v-if="isDetail" class="mobile-header__sub">{{ route.meta.title }}</span>
      <RouterLink v-else-if="isSignedIn" to="/profile" class="mobile-account" aria-label="打开个人中心"><MobileIcon name="profile" :size="18" /></RouterLink>
      <span v-else class="mobile-header__sub">为学习而设计</span>
    </header>
    <main id="mobile-content" class="mobile-body" tabindex="-1" :aria-busy="welcomeChecking ? 'true' : 'false'">
      <RouterView v-slot="{ Component }">
        <transition name="m-fade" mode="out-in"><component :is="Component" /></transition>
      </RouterView>
    </main>
    <nav v-if="showTabs" class="mobile-tabs" aria-label="主导航">
      <RouterLink v-for="tab in tabs" :key="tab.to" :to="tab.to" class="tab"
        :class="{ 'tab--active': activeTab === tab.to }" :aria-current="activeTab === tab.to ? 'page' : undefined">
        <span class="tab__icon"><MobileIcon :name="tab.icon" :size="23" :stroke-width="1.7" /></span>
        <span>{{ tab.label }}</span>
      </RouterLink>
    </nav>
    <AgentLauncher v-if="showTabs && !['/agent', '/tutor'].includes(route.path)" />
  </div>
  <MobileWelcomeCards v-if="welcomeOpen" :key="welcomeSessionKey" :initial-answers="welcomeAnswers" @saved="welcomeSaved" @dismiss="welcomeDismissed" />
  <p v-if="welcomeError" class="mobile-welcome-error" role="alert">{{ welcomeError }}</p>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getAuthSession } from '@/lib/auth'
import { getApiBase } from '@/lib/api-config'
import { apiGet, apiPost } from '@/lib/api'
import { currentEpoch } from '@/mobile/data/learning-data'
import { workspaceUpdated } from '@/mobile/data/workspace'
import { openDialogCount } from '@/mobile/data/presentation'
import { useLearningWorkspace } from '@/mobile/stores/learning-workspace'
import AgentLauncher from './components/AgentLauncher.vue'
import { welcomeRequest, welcomeUpdated, type WelcomeRecord } from '@/mobile/data/welcome'
import type { LearnerProfile } from '@/mobile/data/types'
import type { SurveyAnswers } from '@/composables/useProfileSurvey'
import MobileWelcomeCards from './components/MobileWelcomeCards.vue'
import MobileIcon from './components/MobileIcon.vue'
import type { IconName } from './components/MobileIcon.vue'
const route = useRoute()
const router = useRouter()
const learningStore = useLearningWorkspace()
watch(() => route.path, () => { learningStore.bindAccount(); if (route.path !== '/login' && !learningStore.loaded) learningStore.refresh() }, { immediate: true })
watch(workspaceUpdated, () => learningStore.refresh())
watch(() => learningStore.local.theme, theme => { document.documentElement.dataset.mobileTheme = theme }, { immediate: true })
const welcomeOpen = ref(false)
const welcomeError = ref('')
const welcomeChecking = ref(false)
const welcomeAnswers = ref<Partial<SurveyAnswers>>({})
const welcomeSessionKey = ref('')
let lastWelcomeKey = ''
let lastRequest = 0
let welcomeGeneration = 0
watch(() => [route.path, welcomeRequest.value], async () => {
  const session = getAuthSession()
  const key = route.path !== '/login' && session?.role === 'student' ? `${getApiBase()}|${session.account}|${session.loginAt}` : ''
  const manual = welcomeRequest.value !== lastRequest
  lastRequest = welcomeRequest.value
  if (!key) { lastWelcomeKey = ''; welcomeOpen.value = false; welcomeChecking.value = false; welcomeGeneration++; return }
  if (!manual && route.path.startsWith('/study/')) return
  if (key === lastWelcomeKey && !manual) return
  lastWelcomeKey = key
  welcomeSessionKey.value = key
  const generation = ++welcomeGeneration
  const epoch = currentEpoch()
  welcomeChecking.value = true
  welcomeError.value = ''
  try {
    const [record, profile] = await Promise.all([
      apiGet<{ result: WelcomeRecord | null }>('/api/account/onboarding'),
      apiGet<{ result: LearnerProfile | null }>('/api/profile/latest'),
    ])
    if (generation !== welcomeGeneration || epoch !== currentEpoch()) return
    if (!manual && route.path.startsWith('/study/')) { lastWelcomeKey = ''; return }
    const existing = profile.result?.learnerNeeds || {}
    welcomeAnswers.value = { ...existing, ...record.result?.answers }
    const hasNeeds = ['role', 'field', 'level', 'shortTermGoal', 'weeklyHours', 'resourcePreference'].every(field => Boolean(existing[field as keyof SurveyAnswers]))
    welcomeOpen.value = manual || (!record.result && !hasNeeds)
  } catch { if (manual && generation === welcomeGeneration) welcomeError.value = '暂时无法打开学习引导，请检查连接后重试。' }
  finally { if (generation === welcomeGeneration) welcomeChecking.value = false }
}, { immediate: true })
function welcomeSaved() { welcomeOpen.value = false; welcomeUpdated.value++; router.push('/today') }
function welcomeDismissed(answers: Partial<SurveyAnswers>) {
  welcomeOpen.value = false
  apiPost('/api/account/onboarding', { status: 'skipped', answers }).catch(() => {})
}
const tabs: { to: string; label: string; icon: IconName }[] = [
  { to: '/today', label: '首页', icon: 'today' },
  { to: '/learn', label: '学习', icon: 'book' },
  { to: '/atlas', label: '星图', icon: 'path' },
  { to: '/profile', label: '我的', icon: 'profile' },
]
const isSignedIn = computed(() => route.path !== '/login' && Boolean(getAuthSession()))
const showTabs = computed(() => isSignedIn.value && !route.path.startsWith('/study/') && route.path !== '/focus')
const isDetail = computed(() => isSignedIn.value && !tabs.some(tab => tab.to === route.path))
const activeTab = computed(() => ['/tutor','/planning','/review','/focus','/self-test'].includes(route.path) || route.path.startsWith('/study/') || route.path.startsWith('/learn/') ? '/learn'
  : ['/diagnose','/workspace','/growth','/pet'].includes(route.path) ? '/profile' : route.path === '/library' || route.path.startsWith('/atlas/') ? '/atlas' : route.path === '/agent' ? '/learn' : route.path.startsWith('/today/')?'/today':route.path)
const backTarget = computed(() => ['/planning','/tutor','/focus','/review','/self-test'].includes(route.path) || route.path.startsWith('/study/') ? '/learn' : ['/workspace','/growth','/pet'].includes(route.path) ? '/profile' : route.path==='/library'?'/atlas':'/today')
</script>

<style scoped>
.mobile-welcome-error { position: fixed; z-index: 50; bottom: 100px; left: 50%; transform: translateX(-50%); max-width: calc(100% - 40px); width: 340px; border-radius: 16px; padding: 14px 18px; background: var(--m-danger-soft); color: var(--m-danger); font-size: 12px; box-shadow: var(--m-shadow-card); }
.mobile-shell { min-height: 100dvh; width: 100%; max-width: 600px; margin: 0 auto; background: var(--m-bg); color: var(--m-text); }
.mobile-header { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 10px; min-height: 68px; padding: calc(var(--m-safe-top) + 10px) 24px 10px; background: rgba(7,21,47,.9); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
.mobile-brand { display: inline-flex; align-items: center; gap: 9px; color: var(--m-text); text-decoration: none; font-size: 15px; font-weight: 650; letter-spacing: -.3px; }
.mobile-brand__mark { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 11px; background: var(--m-primary); color: var(--m-on-primary); }
.mobile-brand__name { display: grid; font-size: 14px; line-height: 1.2; }
.mobile-brand__name small { color: var(--m-text-faint); font-size: 9px; font-weight: 450; letter-spacing: .5px; margin-top: 3px; }
.mobile-account { margin-left: auto; width: 42px; height: 42px; display: grid; place-items: center; border-radius: 50%; color: var(--m-text-dim); background: var(--m-surface); border: 1px solid var(--m-border); }
.mobile-header__sub { margin-left: auto; font-size: 12px; color: var(--m-text-faint); }
.mobile-back { display: grid; place-items: center; width: 44px; height: 44px; margin-left: -12px; color: var(--m-primary); }
.mobile-body { padding: 12px 24px calc(var(--mobile-bottom-inset) + 32px); outline: none; }
.mobile-shell--compact-footer .mobile-body { padding-bottom: 32px; }
.mobile-tabs { position: fixed; z-index: 20; bottom: max(12px, var(--m-safe-bottom)); left: 50%; transform: translateX(-50%); display: flex; width: calc(100% - 32px); max-width: 552px; padding: 8px; border-radius: 25px; box-shadow: 0 8px 32px rgba(30, 45, 90, .10); background: rgba(12,29,57,.95); border: 1px solid rgba(143,179,226,.18); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
.tab { flex: 1; min-height: 52px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font-size: 12px; font-weight: 500; color: var(--m-text-faint); text-decoration: none; transition: color var(--m-duration); }
.tab--active { color: var(--m-primary); background: var(--m-primary-soft); border-radius: 18px; }
.tab__icon { height: 24px; }
.mobile-skip { position: fixed; top: -100px; z-index: 30; padding: 12px; background: var(--m-surface); color: var(--m-text); }
.mobile-skip:focus { top: 8px; }
.m-fade-enter-active, .m-fade-leave-active { transition: opacity var(--m-duration) var(--m-ease), transform var(--m-duration) var(--m-ease); }
.m-fade-enter-from { opacity: 0; transform: translateY(4px); }
.m-fade-leave-to { opacity: 0; }
@media (min-width: 600px) { .mobile-shell { border-inline: 1px solid var(--m-border); } }
@media (max-width: 359px) { .mobile-body { padding-inline: 16px; } .mobile-header { padding-inline: 16px; } }
 :global(html.mobile-keyboard-open .mobile-shell .mobile-tabs) { opacity: 0; pointer-events: none; transform: translateX(-50%) translateY(12px); }
@media(min-width:900px){.mobile-shell--signed-in{max-width:1600px;display:grid;grid-template-columns:200px minmax(0,1fr);grid-template-rows:76px 1fr;min-height:100dvh;border:0}.mobile-shell--signed-in .mobile-header{grid-column:1/-1;grid-row:1;min-height:76px;padding-inline:28px;border-bottom:1px solid var(--m-border)}.mobile-shell--signed-in .mobile-body{grid-column:2;grid-row:2;padding:32px 36px 60px;min-width:0}.mobile-shell--signed-in .mobile-tabs{position:sticky;grid-column:1;grid-row:2;top:100px;left:auto;bottom:auto;transform:none;display:flex;flex-direction:column;align-self:start;width:auto;max-width:none;margin:24px 16px;padding:8px;border:0;border-radius:0;background:none;box-shadow:none;backdrop-filter:none;gap:8px}.mobile-shell--signed-in .tab{flex-direction:row;justify-content:flex-start;gap:12px;padding:0 18px;font-size:15px;min-height:54px;border-radius:14px}.mobile-shell--signed-in .tab--active{border:1px solid var(--m-primary-border)}.mobile-shell--compact-footer .mobile-body{grid-column:1/-1;max-width:1100px;width:100%;justify-self:center}.mobile-shell:not(.mobile-shell--signed-in){max-width:700px}.mobile-header__sub{font-size:13px}}
@media(min-width:900px){ :global(html.mobile-keyboard-open .mobile-shell--signed-in .mobile-tabs) { transform: translateY(12px); } }
</style>
