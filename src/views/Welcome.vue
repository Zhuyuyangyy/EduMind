<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import HeroConstellation from '@/components/homepage/HeroConstellation.vue'
import AgentLiveTicker from '@/components/homepage/AgentLiveTicker.vue'
import SectionTelemetry from '@/components/homepage/SectionTelemetry.vue'
import SectionGalaxyPath from '@/components/homepage/SectionGalaxyPath.vue'
import SectionMissions from '@/components/homepage/SectionMissions.vue'
import AgentHub from '@/components/homepage/AgentHub.vue'
import TrainFlow from '@/views/TrainFlow.vue'
import InkMouseBackground from '@/components/homepage/InkMouseBackground.vue'

const loaded = ref(false)
const activeHubBeatId = ref('profile')
const controlBeatId = ref('profile')
const controlNonce = ref(0)

const hubStages = [
  { id: 'profile', visualId: 'profile', step: '01', role: 'PROFILE MODULE', name: '画像诊断模块', color: '#8FA7FF', signal: '学情画像', output: '薄弱点定位', agents: ['画像采集', '薄弱诊断'], note: '把测验、行为和偏好压成可用画像' },
  { id: 'path', visualId: 'path', step: '02', role: 'PATH MODULE', name: '路径编排模块', color: '#35E0D8', signal: '路径编排', output: '个性化路径', agents: ['路径规划', '动态重规划'], note: '按画像生成路线，并随反馈实时改道' },
  { id: 'resource', visualId: 'resource', step: '03', role: 'RESOURCE MODULE', name: '资源生产模块', color: '#45D483', signal: '资源生产', output: '适配材料', agents: ['资源检索', '个性生成'], note: '检索可信资源，再生成适合当前学生的材料' },
  { id: 'tutor', visualId: 'tutor', step: '04', role: 'TUTOR MODULE', name: '辅导互动模块', color: '#F0B24A', signal: '实时辅导', output: '讲解答疑', agents: ['讲解辅导', '互动答疑'], note: '把学习卡点拆成讲解、追问和即时提示' },
  { id: 'eval', visualId: 'eval', step: '05', role: 'EVAL MODULE', name: '测评分析模块', color: '#F0586E', signal: '测评归因', output: '错因证据', agents: ['评估出题', '错因分析'], note: '自动出题验证掌握度，并追溯错误原因' },
  { id: 'feedback', visualId: 'loop', step: '06', role: 'FEEDBACK MODULE', name: '反馈复盘模块', color: '#7C8CFF', signal: '反馈回写', output: '闭环更新', agents: ['反馈回写', '成长复盘'], note: '把结果写回画像，驱动下一轮学习决策' },
]

const currentHubStage = computed(() => (
  hubStages.find(stage => stage.id === activeHubBeatId.value) ?? hubStages[0]
))

const currentHubStep = computed(() => (
  Math.max(0, hubStages.findIndex(stage => stage.id === currentHubStage.value.id))
))

const hubProgress = computed(() => (
  `${((currentHubStep.value + 1) / hubStages.length) * 100}%`
))

const showAgentHub = ref(false)
onMounted(() => {
  window.setTimeout(() => { showAgentHub.value = true }, 1800)
})

function handleAgentHubBeat(event: MessageEvent) {
  if (event.data?.type !== 'agenthub:beat') return
  const nextStage = hubStages.find(stage => stage.visualId === event.data.id)
  activeHubBeatId.value = nextStage?.id ?? event.data.id
}

function jumpToAgent(id: string) {
  const nextStage = hubStages.find(stage => stage.id === id) ?? hubStages[0]
  activeHubBeatId.value = nextStage.id
  controlBeatId.value = nextStage.visualId
  controlNonce.value += 1
}

onMounted(() => {
  setTimeout(() => { loaded.value = true }, 100)
  window.addEventListener('message', handleAgentHubBeat)
})

onBeforeUnmount(() => {
  window.removeEventListener('message', handleAgentHubBeat)
})
</script>

<template>
  <div class="welcome">
    <InkMouseBackground />
    <div class="welcome-starfield" aria-hidden="true" />
    <div class="home-image-layer" aria-hidden="true">
      <img class="home-art home-art-hero" src="/homepage/agent-constellation-hero.png" alt="">
      <img class="home-art home-art-path" src="/homepage/learning-path-repair.png" alt="">
      <img class="home-art home-art-profile" src="/homepage/profile-evidence-orb.png" alt="">
    </div>

    <HeroConstellation class="home-breathe-surface home-breathe-hero" />

    <section class="hub-workbench home-breathe-surface home-breathe-hub">
      <aside class="hub-context-card" :style="{ '--stage-color': currentHubStage.color }">
        <div class="hub-context-topline">
          <span class="hub-context-kicker">6 MODULES · 7 CORE AGENTS</span>
          <span class="hub-live-pill"><i /> LIVE HANDOFF</span>
        </div>
        <h2>六个模块如何协同</h2>
        <p class="hub-context-summary">
          一次学习卡顿由 7 个核心智能体协同处理：诊断画像、规划路径、生成资源、脚手架辅导、测评归因，最后写回反馈形成闭环。
        </p>

        <div class="hub-current-strip" aria-live="polite">
          <span>当前接力</span>
          <strong>{{ currentHubStage.name }}</strong>
          <small>{{ currentHubStage.signal }} → {{ currentHubStage.output }}</small>
          <div class="hub-progress-track" aria-hidden="true">
            <i :style="{ width: hubProgress }" />
          </div>
        </div>

        <div class="hub-agent-list" aria-label="六个协同模块说明">
          <button
            v-for="(stage, index) in hubStages"
            :key="stage.id"
            type="button"
            class="hub-agent-item"
            :class="{ active: stage.id === activeHubBeatId }"
            :style="{ '--stage-color': stage.color, '--stage-index': index }"
            @click="jumpToAgent(stage.id)"
          >
            <span class="hub-agent-index">{{ stage.step }}</span>
            <span class="hub-agent-copy">
              <span class="hub-agent-role">{{ stage.role }}</span>
              <strong>{{ stage.name }}</strong>
              <small>{{ stage.note }}</small>
              <span class="hub-agent-pair">
                <i v-for="agent in stage.agents" :key="agent">{{ agent }}</i>
              </span>
            </span>
            <span class="hub-agent-status">
              <b>{{ stage.signal }}</b>
              <em>2 AGENTS</em>
            </span>
          </button>
        </div>

        <div class="hub-role-visual" aria-hidden="true">
          <img src="/homepage/agent-role-orbit-panel.png" alt="">
          <div class="hub-role-visual-copy">
            <span>COLLABORATION OUTPUT</span>
            <strong>{{ currentHubStage.output }}</strong>
          </div>
        </div>
      </aside>

      <div class="hub-workbench-main">
        <AgentHub v-if="showAgentHub" class="home-breathe-surface home-breathe-agenthub" :control-beat-id="controlBeatId" :control-nonce="controlNonce" />
        <TrainFlow class="home-breathe-surface home-breathe-trainflow" embedded-stage-only :active-beat-id="currentHubStage.visualId" />
      </div>
    </section>

    <!-- Agent live ticker -->
    <AgentLiveTicker class="home-breathe-surface home-breathe-ticker" />

    <!-- Profile-derived path preview -->
    <SectionGalaxyPath class="home-breathe-surface home-breathe-galaxy" />
    <SectionMissions class="home-breathe-surface home-breathe-missions" />

    <!-- Collaboration telemetry -->
    <SectionTelemetry class="home-breathe-surface home-breathe-telemetry" />

    <footer class="footer" aria-hidden="true" />
  </div>
</template>

<style scoped>
.welcome {
  position: relative;
  min-height: 100vh;
  background:
    radial-gradient(ellipse at 20% 0%, rgba(59, 130, 246, 0.10), transparent 55%),
    radial-gradient(ellipse at 80% 30%, rgba(6, 182, 212, 0.06), transparent 50%),
    radial-gradient(ellipse at 50% 100%, rgba(59, 130, 246, 0.08), transparent 60%);
  isolation: isolate;
  overflow: hidden;
}

.welcome::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-image:
    radial-gradient(circle, rgba(59, 130, 246, 0.12) 0 1px, transparent 1.5px),
    linear-gradient(rgba(59, 130, 246, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(59, 130, 246, 0.015) 1px, transparent 1px);
  background-size: 120px 120px, 56px 56px, 56px 56px;
  opacity: 0.5;
}

.welcome-starfield {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  background-image:
    radial-gradient(1px 1px at 10% 15%, rgba(147, 197, 253, 0.85) 50%, transparent 50%),
    radial-gradient(1px 1px at 25% 8%, rgba(96, 165, 250, 0.75) 50%, transparent 50%),
    radial-gradient(1.5px 1.5px at 42% 22%, rgba(191, 219, 254, 0.9) 50%, transparent 50%),
    radial-gradient(1px 1px at 58% 12%, rgba(56, 189, 248, 0.8) 50%, transparent 50%),
    radial-gradient(1px 1px at 75% 18%, rgba(147, 197, 253, 0.7) 50%, transparent 50%),
    radial-gradient(1.5px 1.5px at 88% 25%, rgba(96, 165, 250, 0.85) 50%, transparent 50%),
    radial-gradient(1px 1px at 15% 35%, rgba(147, 197, 253, 0.75) 50%, transparent 50%),
    radial-gradient(1px 1px at 35% 42%, rgba(56, 189, 248, 0.8) 50%, transparent 50%),
    radial-gradient(1.5px 1.5px at 55% 38%, rgba(191, 219, 254, 0.85) 50%, transparent 50%),
    radial-gradient(1px 1px at 72% 32%, rgba(96, 165, 250, 0.75) 50%, transparent 50%),
    radial-gradient(1px 1px at 92% 45%, rgba(147, 197, 253, 0.85) 50%, transparent 50%),
    radial-gradient(1.5px 1.5px at 8% 55%, rgba(56, 189, 248, 0.85) 50%, transparent 50%),
    radial-gradient(1px 1px at 22% 62%, rgba(147, 197, 253, 0.75) 50%, transparent 50%),
    radial-gradient(1px 1px at 45% 52%, rgba(96, 165, 250, 0.8) 50%, transparent 50%),
    radial-gradient(1.5px 1.5px at 65% 58%, rgba(191, 219, 254, 0.9) 50%, transparent 50%),
    radial-gradient(1px 1px at 82% 65%, rgba(56, 189, 248, 0.75) 50%, transparent 50%),
    radial-gradient(1px 1px at 5% 75%, rgba(147, 197, 253, 0.8) 50%, transparent 50%),
    radial-gradient(1.5px 1.5px at 30% 72%, rgba(96, 165, 250, 0.85) 50%, transparent 50%),
    radial-gradient(1px 1px at 50% 78%, rgba(147, 197, 253, 0.7) 50%, transparent 50%),
    radial-gradient(1px 1px at 68% 82%, rgba(56, 189, 248, 0.8) 50%, transparent 50%),
    radial-gradient(1.5px 1.5px at 85% 88%, rgba(191, 219, 254, 0.85) 50%, transparent 50%),
    radial-gradient(1px 1px at 18% 92%, rgba(96, 165, 250, 0.75) 50%, transparent 50%),
    radial-gradient(1px 1px at 40% 95%, rgba(147, 197, 253, 0.8) 50%, transparent 50%),
    radial-gradient(1.5px 1.5px at 62% 90%, rgba(56, 189, 248, 0.9) 50%, transparent 50%);
  animation: starfield-twinkle 6s ease-in-out infinite alternate;
}

@keyframes starfield-twinkle {
  0% { opacity: 0.35; }
  50% { opacity: 0.5; }
  100% { opacity: 0.4; }
}

.home-image-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.home-art {
  position: absolute;
  display: block;
  object-fit: cover;
  user-select: none;
  mix-blend-mode: screen;
  filter: brightness(2.0) saturate(0.5) contrast(1.1);
}

.home-art-hero {
  top: 72px;
  right: -12vw;
  width: min(1120px, 64vw);
  opacity: 0.45;
  transform: rotate(-1.5deg);
  mask-image: radial-gradient(ellipse at 62% 48%, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.4) 40%, transparent 75%);
  -webkit-mask-image: radial-gradient(ellipse at 62% 48%, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.4) 40%, transparent 75%);
}

.home-art-path {
  top: 1320px;
  left: -10vw;
  width: min(760px, 50vw);
  opacity: 0.52;
  transform: rotate(3deg);
  mask-image: radial-gradient(ellipse at 48% 50%, #000 0%, rgba(0, 0, 0, 0.84) 58%, transparent 90%);
}

.home-art-profile {
  top: 2320px;
  right: -8vw;
  width: min(680px, 46vw);
  opacity: 0.48;
  transform: rotate(-4deg);
  mask-image: radial-gradient(ellipse at 50% 50%, #000 0%, rgba(0, 0, 0, 0.82) 58%, transparent 88%);
}

.home-breathe-surface {
  --home-breathe-duration: 8.6s;
  --home-breathe-delay: 0s;
  animation: home-component-breathe var(--home-breathe-duration) ease-in-out var(--home-breathe-delay) infinite;
  transform-origin: center;
  will-change: filter;
}

.home-breathe-hero { --home-breathe-delay: 0.2s; }
.home-breathe-hub { --home-breathe-delay: 0.9s; --home-breathe-duration: 9.2s; }
.home-breathe-agenthub { --home-breathe-delay: 1.4s; --home-breathe-duration: 8.8s; }
.home-breathe-trainflow { --home-breathe-delay: 2.0s; --home-breathe-duration: 9.6s; }
.home-breathe-ticker { --home-breathe-delay: 2.8s; --home-breathe-duration: 8.4s; }
.home-breathe-galaxy { --home-breathe-delay: 1.2s; --home-breathe-duration: 9.8s; }
.home-breathe-missions { --home-breathe-delay: 2.2s; --home-breathe-duration: 8.9s; }
.home-breathe-telemetry { --home-breathe-delay: 3.0s; --home-breathe-duration: 10.2s; }

@keyframes home-component-breathe {
  0%,
  100% {
    filter: brightness(1) saturate(1);
  }

  50% {
    filter: brightness(1.01) saturate(1.012);
  }
}

@keyframes home-card-breathe {
  0%,
  100% {
    border-color: color-mix(in srgb, var(--home-breathe-color, #67e8f9) 18%, rgba(125, 171, 236, 0.12));
    outline-color: color-mix(in srgb, var(--home-breathe-color, #67e8f9) 0%, transparent);
    filter: brightness(1);
  }

  50% {
    border-color: color-mix(in srgb, var(--home-breathe-color, #67e8f9) 42%, rgba(125, 211, 252, 0.18));
    outline-color: color-mix(in srgb, var(--home-breathe-color, #67e8f9) 20%, transparent);
    filter: brightness(1.018) drop-shadow(0 0 8px rgba(103, 232, 249, 0.12));
  }
}

@keyframes home-active-breathe {
  0%,
  100% {
    border-color: color-mix(in srgb, var(--home-breathe-color, #67e8f9) 24%, rgba(125, 171, 236, 0.12));
    outline-color: color-mix(in srgb, var(--home-breathe-color, #67e8f9) 0%, transparent);
    filter: brightness(1);
  }

  50% {
    border-color: color-mix(in srgb, var(--home-breathe-color, #67e8f9) 58%, rgba(125, 211, 252, 0.18));
    outline-color: color-mix(in srgb, var(--home-breathe-color, #67e8f9) 24%, transparent);
    filter: brightness(1.026) drop-shadow(0 0 9px rgba(103, 232, 249, 0.14));
  }
}

/* Home section transparency */
:deep(.hero-constellation),
:deep(.agent-hub-section),
:deep(.trainflow-page),
:deep(.section-telemetry),
:deep(.section-skyline),
:deep(.section-missions),
:deep(.section-loop),
:deep(.section-schematic),
:deep(.section-agent-chain),
:deep(.agent-writing-section) {
  background: transparent !important;
}

:deep(.hero-constellation) {
  overflow: visible;
}

:deep(.agent-hub-section) {
  position: relative;
  z-index: 1;
  padding: 58px 36px 42px;
}

:deep(.agent-hub-frame) {
  display: block;
  width: 100%;
  height: clamp(460px, 37vw, 540px);
  min-height: 0;
  border: 0;
  border-radius: 18px;
  background: transparent;
}

:deep(.hero-grid),
:deep(.hero-starfield) {
  opacity: 0.92;
}

:deep(.sky-canvas),
:deep(.mission-rail),
:deep(.mission-rail-shell),
:deep(.tele-chart),
:deep(.loop-stage),
:deep(.schematic-stage),
:deep(.chain-board),
:deep(.tf-shell),
:deep(.log-container),
:deep(.agent-stage),
:deep(.hub-frame-shell),
:deep(.hero-visual-shell),
:deep(.hero-dashboard),
:deep(.hero-card),
:deep(.hero-side-panel) {
  background:
    radial-gradient(ellipse at 62% 20%, rgba(59, 130, 246, 0.18), transparent 58%),
    linear-gradient(145deg, rgba(16, 30, 58, 0.55), rgba(8, 16, 34, 0.35)) !important;
  backdrop-filter: blur(10px) saturate(1.24);
  border: 1px solid rgba(100, 140, 220, 0.14) !important;
}

:deep(.sky-callout),
:deep(.activity-chip .chip-card),
:deep(.tele-detail-card),
:deep(.tele-stats),
:deep(.sky-stats),
:deep(.mis-quota),
:deep(.stage-work-order),
:deep(.course-chip),
:deep(.handoff-strip),
:deep(.loop-leap),
:deep(.writeback-strip),
:deep(.mission-card),
:deep(.mission-detail),
:deep(.mission-agent-row),
:deep(.metric-card),
:deep(.domain-card),
:deep(.activity-chip),
:deep(.chip-card) {
  background: rgba(16, 30, 58, 0.42) !important;
  backdrop-filter: blur(12px) saturate(1.28);
  border: 1px solid rgba(100, 140, 220, 0.12) !important;
}

:deep(.agent-stage) {
  border-color: rgba(120, 160, 220, 0.18) !important;
}

:deep(.stage-watermark) {
  opacity: 0.045 !important;
}

:deep(.cap-tag),
:deep(.chip-card),
:deep(.hub-frame-shell),
:deep(.agent-stage),
:deep(.stage-work-order),
:deep(.course-chip),
:deep(.handoff-strip),
:deep(.log-container),
:deep(.sky-score),
:deep(.graph-panel),
:deep(.node-detail),
:deep(.map-action-panel),
:deep(.distribution-card),
:deep(.radar-card),
:deep(.weak-card),
:deep(.section-missions .glass-card),
:deep(.quick-questions),
:deep(.date-card),
:deep(.section-telemetry .glass-card),
:deep(.detail-popup),
:deep(.module-chip) {
  --home-breathe-color: #67e8f9;
  outline: 1px solid transparent;
  outline-offset: -1px;
  border-style: solid;
  animation:
    home-card-breathe var(--home-inner-breathe-duration, 7.6s) ease-in-out var(--home-inner-breathe-delay, 0s) infinite !important;
  will-change: filter, outline-color;
}

:deep(.hub-agent-item),
:deep(.action-card),
:deep(.question-chips button),
:deep(.view-chip),
:deep(.map-primary-action),
:deep(.map-action-link),
:deep(.agent-row),
:deep(.clickable-card),
:deep(.latest-item),
:deep(.latest-route) {
  --home-breathe-color: var(--stage-color, var(--tone, var(--agent-color, var(--module-color, #67e8f9))));
  outline: 1px solid transparent;
  outline-offset: -1px;
  border-style: solid;
  animation:
    home-active-breathe var(--home-active-breathe-duration, 6.8s) ease-in-out var(--home-active-breathe-delay, 0s) infinite !important;
  will-change: filter, outline-color;
}

:deep(.hub-agent-item:nth-child(2n)),
:deep(.action-card:nth-child(2n)),
:deep(.date-card:nth-child(2n)),
:deep(.section-telemetry .glass-card:nth-child(2n)),
:deep(.section-missions .glass-card:nth-child(2n)) {
  --home-inner-breathe-delay: 1.1s;
  --home-active-breathe-delay: 0.9s;
}

:deep(.hub-agent-item:nth-child(3n)),
:deep(.action-card:nth-child(3n)),
:deep(.date-card:nth-child(3n)),
:deep(.module-chip:nth-child(3n)),
:deep(.section-telemetry .glass-card:nth-child(3n)) {
  --home-inner-breathe-delay: 2.0s;
  --home-active-breathe-delay: 1.7s;
}

:deep(.hero-metrics),
:deep(.log-container),
:deep(.graph-panel),
:deep(.timeline-card) {
  --home-inner-breathe-duration: 8.8s;
}

.hub-workbench {
  position: relative;
  z-index: 1;
  scroll-margin-top: 92px;
  display: grid;
  grid-template-columns: minmax(390px, 430px) minmax(0, 1fr);
  gap: 22px;
  align-items: stretch;
  max-width: 1880px;
  margin: 0 auto;
  padding: 32px 32px 18px;
}

.hub-context-card {
  --stage-color: #00d4ff;
  position: relative;
  min-height: 700px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 22px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--stage-color) 34%, rgba(116, 154, 210, 0.18));
  border-radius: 16px;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--stage-color) 42%, transparent), transparent 1px) 0 0 / 100% 64px,
    radial-gradient(circle at 8% 2%, color-mix(in srgb, var(--stage-color) 18%, transparent), transparent 36%),
    radial-gradient(circle at 94% 12%, rgba(116, 154, 210, 0.1), transparent 34%),
    linear-gradient(155deg, rgba(7, 13, 28, 0.86), rgba(4, 8, 18, 0.72));
  backdrop-filter: blur(18px) saturate(1.18);
  box-shadow:
    0 26px 80px rgba(0, 0, 0, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  animation:
    welcome-border-breathe 4.8s ease-in-out infinite,
    home-card-breathe 8.6s ease-in-out 0.6s infinite !important;
}

.hub-context-card::before,
.hub-context-card::after {
  content: '';
  position: absolute;
  pointer-events: none;
}

.hub-context-card::before {
  inset: 0;
  opacity: 0.34;
  background:
    linear-gradient(rgba(116, 154, 210, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(116, 154, 210, 0.06) 1px, transparent 1px);
  background-size: 38px 38px;
  mask-image: linear-gradient(180deg, #000 0%, transparent 76%);
}

.hub-context-card::after {
  left: 24px;
  right: 24px;
  top: 64px;
  height: 1px;
  background: linear-gradient(90deg, var(--stage-color), transparent);
  opacity: 0.58;
}

.hub-context-topline {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.hub-context-kicker {
  color: var(--stage-color);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.16em;
}

.hub-live-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #dbeafe;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.12em;
  padding: 6px 8px;
  border: 1px solid rgba(180, 203, 236, 0.14);
  border-radius: 7px;
  background: rgba(9, 18, 34, 0.58);
}

.hub-live-pill i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--stage-color);
  box-shadow: 0 0 14px var(--stage-color);
  animation: welcome-status-pulse 1.5s ease-in-out infinite;
}

.hub-context-card h2 {
  position: relative;
  z-index: 1;
  margin: 0;
  color: #fff;
  font-family: var(--font-display);
  font-size: clamp(26px, 2.15vw, 34px);
  font-weight: 600;
  line-height: 1.12;
}

.hub-context-summary {
  position: relative;
  z-index: 1;
  max-width: 36em;
  margin: -4px 0 0;
  color: rgba(207, 221, 244, 0.76);
  font-size: 13px;
  line-height: 1.75;
}

.hub-current-strip {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 5px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--stage-color) 30%, rgba(116, 154, 210, 0.13));
  border-radius: 12px;
  background:
    radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--stage-color) 13%, transparent), transparent 48%),
    rgba(8, 16, 32, 0.62);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.055);
}

.hub-current-strip span {
  color: rgba(169, 187, 216, 0.74);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
}

.hub-current-strip strong {
  color: #f7fbff;
  font-size: 18px;
  line-height: 1.25;
}

.hub-current-strip small {
  color: var(--stage-color);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.03em;
}

.hub-progress-track {
  height: 4px;
  margin-top: 6px;
  overflow: hidden;
  border-radius: 99px;
  background: rgba(116, 154, 210, 0.12);
}

.hub-progress-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--stage-color), rgba(219, 234, 254, 0.8));
  box-shadow: 0 0 18px color-mix(in srgb, var(--stage-color) 60%, transparent);
  transition: width 0.32s ease;
}

.hub-agent-list {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 8px;
  margin-top: 0;
}

.hub-agent-item {
  --stage-color: #00d4ff;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  width: 100%;
  appearance: none;
  text-align: left;
  cursor: pointer;
  padding: 10px 11px;
  border: 1px solid color-mix(in srgb, var(--stage-color) 20%, rgba(116, 154, 210, 0.14));
  border-radius: 12px;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--stage-color) 18%, transparent), transparent 3px),
    rgba(7, 14, 28, 0.56);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.045);
  transition:
    transform 0.24s cubic-bezier(0.16, 1, 0.3, 1),
    border-color 0.28s ease,
    background 0.28s ease,
    box-shadow 0.28s ease;
  animation:
    welcome-soft-border-breathe 5.4s ease-in-out infinite,
    home-active-breathe 7.2s ease-in-out calc(var(--stage-index) * 0.18s) infinite !important;
}

.hub-agent-item:hover {
  transform: translateX(4px);
  border-color: color-mix(in srgb, var(--stage-color) 50%, rgba(116, 154, 210, 0.16));
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--stage-color) 30%, transparent), transparent 4px),
    color-mix(in srgb, var(--stage-color) 8%, rgba(7, 14, 28, 0.68));
}

.hub-agent-item:active {
  transform: translateX(4px) scale(0.985);
}

.hub-agent-item:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--stage-color) 70%, white);
  outline-offset: 3px;
}

.hub-agent-index {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  color: var(--stage-color);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  background: color-mix(in srgb, var(--stage-color) 12%, rgba(7, 14, 28, 0.74));
  border: 1px solid color-mix(in srgb, var(--stage-color) 28%, transparent);
}

.hub-agent-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.hub-agent-role {
  color: var(--stage-color);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.1em;
  line-height: 1.4;
}

.hub-agent-item strong {
  color: #f7fbff;
  font-size: 15px;
  line-height: 1.3;
}

.hub-agent-item small {
  color: #a0b4d6;
  font-size: 12px;
  line-height: 1.45;
}

.hub-agent-pair {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 5px;
}

.hub-agent-pair i {
  color: rgba(226, 236, 252, 0.72);
  font-style: normal;
  font-size: 11px;
  line-height: 1;
  padding: 5px 7px;
  border: 1px solid rgba(180, 203, 236, 0.12);
  border-radius: 6px;
  background: rgba(180, 203, 236, 0.055);
}

.hub-agent-status {
  display: grid;
  justify-items: end;
  gap: 5px;
  min-width: 74px;
}

.hub-agent-status b,
.hub-agent-status em {
  font-family: var(--font-mono);
  font-style: normal;
  line-height: 1;
}

.hub-agent-status b {
  color: rgba(238, 246, 255, 0.86);
  font-size: 11px;
  font-weight: 700;
}

.hub-agent-status em {
  color: var(--stage-color);
  font-size: 9px;
  letter-spacing: 0.08em;
}

.hub-agent-item.active {
  border-color: color-mix(in srgb, var(--stage-color) 58%, transparent);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--stage-color) 48%, transparent), transparent 5px),
    radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--stage-color) 17%, transparent), transparent 58%),
    rgba(9, 18, 35, 0.72);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.08),
    0 12px 34px color-mix(in srgb, var(--stage-color) 18%, transparent);
}

.hub-agent-item.active .hub-agent-index {
  color: #05111c;
  background: var(--stage-color);
  box-shadow: 0 0 22px color-mix(in srgb, var(--stage-color) 40%, transparent);
}

.hub-role-visual {
  position: relative;
  z-index: 1;
  min-height: 112px;
  margin-top: auto;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--stage-color) 22%, rgba(116, 154, 210, 0.12));
  border-radius: 14px;
  background:
    radial-gradient(circle at 18% 18%, color-mix(in srgb, var(--stage-color) 14%, transparent), transparent 48%),
    rgba(7, 14, 28, 0.52);
  animation:
    welcome-soft-border-breathe 5s ease-in-out infinite,
    home-card-breathe 8s ease-in-out 1.4s infinite !important;
}

.hub-role-visual img {
  position: absolute;
  inset: -18% -18% -18% -12%;
  width: 130%;
  height: 136%;
  object-fit: cover;
  opacity: 0.4;
  mix-blend-mode: screen;
  filter: saturate(0.96) contrast(1.04);
  mask-image: radial-gradient(ellipse at 58% 52%, #000 0%, rgba(0, 0, 0, 0.82) 52%, transparent 90%);
}

.hub-role-visual::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, transparent 0%, rgba(4, 7, 18, 0.34) 100%);
}

.hub-role-visual-copy {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 14px;
  z-index: 1;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
}

.hub-role-visual-copy span {
  color: #7f93ba;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.16em;
}

.hub-role-visual-copy strong {
  color: var(--stage-color);
  font-family: var(--font-mono);
  font-size: 14px;
  letter-spacing: 0.06em;
}

.hub-workbench-main {
  min-width: 0;
  display: grid;
  gap: 14px;
  align-items: start;
  align-content: start;
  justify-items: stretch;
  position: relative;
}

.hub-workbench-main::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 16px;
  pointer-events: none;
  z-index: 0;
  background:
    radial-gradient(ellipse 800px 500px at 40% 30%, rgba(14, 42, 78, 0.18), transparent 60%),
    radial-gradient(ellipse 600px 400px at 70% 70%, rgba(42, 24, 82, 0.12), transparent 55%),
    radial-gradient(ellipse 400px 300px at 20% 80%, rgba(0, 60, 100, 0.1), transparent 50%);
  animation: hub-nebula-drift 18s ease-in-out infinite alternate;
}

.hub-workbench-main > * {
  position: relative;
  z-index: 1;
}

@keyframes hub-nebula-drift {
  0% { opacity: 0.6; transform: translateY(0); }
  100% { opacity: 1; transform: translateY(-8px); }
}

.hub-workbench-main :deep(.agent-hub-section) {
  width: 100%;
  min-width: 0;
  justify-self: stretch;
  max-width: none;
  padding: 0;
  height: auto;
}

.hub-workbench-main :deep(.hub-body),
.hub-workbench-main :deep(.hub-frame-shell) {
  width: 100%;
  min-width: 0;
  height: auto;
}

.hub-workbench-main :deep(.hub-frame-shell) {
  border-radius: 18px;
  border-color: rgba(116, 198, 236, 0.2);
  background:
    radial-gradient(ellipse at 52% 40%, rgba(52, 211, 235, 0.12), transparent 52%),
    radial-gradient(circle at 78% 20%, rgba(139, 167, 255, 0.08), transparent 32%),
    linear-gradient(150deg, rgba(5, 10, 22, 0.88), rgba(2, 5, 14, 0.68));
  box-shadow:
    0 30px 90px rgba(0, 0, 0, 0.44),
    0 0 44px rgba(52, 211, 235, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.hub-workbench-main :deep(.agent-hub-frame) {
  width: 100%;
  height: clamp(500px, 60vh, 620px);
}

.hub-workbench-main :deep(.hub-head) {
  display: none;
}

.hub-workbench-main :deep(.trainflow-page) {
  padding: 0;
  margin-top: 18px;
}

.hub-workbench-main :deep(.agent-stage) {
  min-height: clamp(500px, 34vw, 560px);
}

.hub-workbench-main :deep(.stage-grid-2) {
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 18px;
  padding: 24px;
  height: 100%;
}

.hub-workbench-main :deep(.stage-agent-name) {
  font-size: 25px;
}

.hub-workbench-main :deep(.mastery-section) {
  margin-top: 12px;
}

.hub-workbench-main :deep(.stage-watermark) {
  font-size: 190px;
  right: -28px;
}

.hub-workbench-main :deep(.course-chip) {
  max-width: 100%;
}

.hub-workbench-main :deep(.course-name) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hub-workbench-main :deep(.thinking-thread) {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.hub-workbench-main :deep(.think-step) {
  align-items: flex-start;
}

.hub-workbench-main :deep(.think-connector) {
  display: none;
}

.hub-workbench-main :deep(.courses-section) {
  margin-top: 14px;
}

.hub-workbench-main :deep(.handoff-strip) {
  margin-top: 14px;
}

:deep(.hub-frame-shell),
:deep(.agent-stage),
:deep(.course-chip),
:deep(.handoff-strip),
:deep(.log-container) {
  animation:
    welcome-border-breathe 4.8s ease-in-out infinite,
    home-card-breathe 8.2s ease-in-out 0.9s infinite !important;
}

@keyframes welcome-border-breathe {
  0%,
  100% {
    border-color: rgba(120, 160, 220, 0.18);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.06),
      0 0 0 rgba(0, 212, 255, 0);
  }

  50% {
    border-color: rgba(0, 212, 255, 0.28);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 0 8px rgba(0, 212, 255, 0.08);
  }
}

@keyframes welcome-soft-border-breathe {
  0%,
  100% {
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 0 0 color-mix(in srgb, var(--stage-color) 0%, transparent);
  }

  50% {
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.06),
      0 0 8px color-mix(in srgb, var(--stage-color) 10%, transparent);
  }
}

@keyframes welcome-status-pulse {
  0%,
  100% {
    opacity: 0.62;
    transform: scale(0.86);
  }

  50% {
    opacity: 1;
    transform: scale(1);
  }
}

/* ── Section headers ── */
.section-header {
  text-align: center;
  margin-bottom: 56px;
}

.section-title {
  font-family: var(--font-display);
  font-size: clamp(28px, 3.5vw, 36px);
  letter-spacing: -0.02em;
  color: #fff;
  margin-bottom: 12px;
  font-weight: 400;
  text-wrap: balance;
}

.section-desc {
  color: var(--color-text-secondary);
  font-size: 15px;
  margin: 0;
}

.section-kicker {
  color: var(--color-accent-cyan);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 500;
  margin-bottom: 8px;
  text-align: center;
}

/* ── Footer ── */
.footer {
  padding: 48px 60px;
  text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  position: relative;
  z-index: 1;
}

.footer p {
  color: var(--color-text-tertiary);
  font-size: 12px;
  font-family: var(--font-mono);
  letter-spacing: 1px;
}

/* ── Responsive ── */
@media (prefers-reduced-motion: reduce) {
  .home-breathe-surface,
  .hub-context-card,
  .hub-agent-item,
  .hub-role-visual,
  :deep(.cap-tag),
  :deep(.chip-card),
  :deep(.hub-frame-shell),
  :deep(.agent-stage),
  :deep(.stage-work-order),
  :deep(.course-chip),
  :deep(.handoff-strip),
  :deep(.log-container),
  :deep(.sky-score),
  :deep(.graph-panel),
  :deep(.node-detail),
  :deep(.map-action-panel),
  :deep(.distribution-card),
  :deep(.radar-card),
  :deep(.weak-card),
  :deep(.section-missions .glass-card),
  :deep(.quick-questions),
  :deep(.date-card),
  :deep(.section-telemetry .glass-card),
  :deep(.detail-popup),
  :deep(.module-chip),
  :deep(.question-chips button),
  :deep(.view-chip),
  :deep(.map-primary-action),
  :deep(.map-action-link),
  :deep(.agent-row),
  :deep(.clickable-card),
  :deep(.latest-item),
  :deep(.latest-route) {
    animation: none !important;
    transition: none !important;
    filter: none !important;
    scale: 1 !important;
  }
}

@media (max-width: 900px) {
  .home-art-hero {
    top: 96px;
    right: -44vw;
    width: 118vw;
    opacity: 0.36;
  }

  .home-art-path,
  .home-art-profile {
    width: 92vw;
    opacity: 0.22;
  }

  .hub-workbench {
    grid-template-columns: 1fr;
    padding: 28px 14px 18px;
    max-width: 100%;
  }

  .hub-workbench :deep(.agent-hub-frame) {
    height: min(64dvh, 560px);
    min-height: 460px;
  }

  .hub-context-card,
  .hub-workbench-main :deep(.agent-stage) {
    min-height: auto;
  }

  .hub-context-card {
    padding: 18px;
  }

  .hub-context-topline {
    align-items: flex-start;
    flex-direction: column;
  }

  .hub-agent-item {
    grid-template-columns: 34px minmax(0, 1fr);
  }

  .hub-agent-status {
    grid-column: 2;
    justify-items: start;
    grid-auto-flow: column;
    justify-content: start;
    align-items: center;
  }

  .hub-role-visual {
    min-height: 132px;
  }

  .agent-collab-section {
    padding: 40px 24px 60px;
  }
  :deep(.agent-hub-section) {
    padding: 48px 16px 36px;
  }
  :deep(.agent-hub-frame) {
    height: 460px;
    min-height: 0;
  }
  .hub-workbench-main :deep(.agent-hub-frame) {
    height: min(68vh, 520px);
  }
  .footer {
    padding: 32px 24px;
  }
}

@media (min-width: 901px) and (max-width: 1320px) {
  .hub-workbench {
    grid-template-columns: 1fr;
    padding-top: 36px;
    max-width: calc(100vw - 32px);
  }

  .hub-workbench :deep(.agent-hub-frame) {
    height: min(820px, calc(100dvh - 112px));
    min-height: 660px;
  }

  .hub-context-card {
    min-height: auto;
  }

  .hub-workbench-main :deep(.agent-hub-frame) {
    height: 600px;
  }

  .hub-workbench-main :deep(.stage-grid-2) {
    grid-template-columns: 300px minmax(0, 1fr);
  }
}

</style>
