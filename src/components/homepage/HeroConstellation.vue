<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

/* ── Tokens ── */
const T = {
  bg: '#050610',
  surface: '#0a0b1c',
  elevated: '#111228',
  card: 'rgba(14, 18, 40, 0.7)',
  cardHover: 'rgba(20, 26, 56, 0.85)',
  cyan: '#00d4ff',
  purple: '#7c3aed',
  emerald: '#06d6a0',
  amber: '#f59e0b',
  rose: '#f43f5e',
  blue: '#3b82f6',
  violet: '#a78bfa',
  teal: '#14b8a6',
  lime: '#84cc16',
  orange: '#fb923c',
  pink: '#ec4899',
  indigo: '#6366f1',
  text: '#e8edf5',
  textSub: '#8892b0',
  textTri: '#4a5568',
  border: 'rgba(255,255,255,0.06)',
  serif: "'Instrument Serif', 'Noto Serif SC', serif",
  sans: "'Outfit', 'PingFang SC', sans-serif",
  mono: "'JetBrains Mono', monospace",
}

/* ── Agent data ── */
interface AgentActivity {
  verb: string; text: string; detail: string; ts: string
}
interface AgentStat { label: string; value: string }
interface Agent {
  id: string; name: string; en: string; role: string; color: string; glyph: string
  angle: number; orbitRx: number; orbitRy: number; orbitTilt: number; planetSize: number
  activity: AgentActivity; stats: AgentStat[]
}

const agents: Agent[] = [
  { id: 'profile-capture', name: '画像采集智能体', en: 'Profile Capture', role: 'PROFILE-1', color: T.purple, glyph: '◉',
    angle: -90, orbitRx: 252, orbitRy: 188, orbitTilt: -6, planetSize: 25,
    activity: { verb: '采集中', text: '汇总答题、停留、偏好和学习节奏', detail: '演示画像 · 六维核心能力 · 可持续更新', ts: '8 秒前' },
    stats: [{ label: '画像维度', value: '6' }, { label: '掌握度', value: '演示' }] },
  { id: 'profile-diagnosis', name: '薄弱诊断智能体', en: 'Weakness Diagnosis', role: 'PROFILE-2', color: T.violet, glyph: '◎',
    angle: -60, orbitRx: 328, orbitRy: 236, orbitTilt: 8, planetSize: 22,
    activity: { verb: '诊断中', text: '锁定 2 个高风险薄弱域', detail: '二级指针传参 41% · BFS visited 38%', ts: '7 秒前' },
    stats: [{ label: '风险域', value: '2' }, { label: '置信度', value: '91%' }] },
  { id: 'path-plan', name: '路径规划智能体', en: 'Path Planner', role: 'PATH-1', color: T.cyan, glyph: '◈',
    angle: -30, orbitRx: 282, orbitRy: 218, orbitTilt: 10, planetSize: 24,
    activity: { verb: '规划中', text: '课后巩固阶段插入补弱路径', detail: '指针训练 → 图结构思维导图 → BFS 专项', ts: '4 秒前' },
    stats: [{ label: '路径阶段', value: '6' }, { label: '当前场景', value: '课后巩固' }] },
  { id: 'path-replan', name: '动态重规划智能体', en: 'Dynamic Replanner', role: 'PATH-2', color: T.teal, glyph: '◇',
    angle: 0, orbitRx: 356, orbitRy: 244, orbitTilt: -3, planetSize: 22,
    activity: { verb: '校准中', text: '根据新测评结果调整明日学习序列', detail: '推迟 1 个进阶节点 · 前置 2 个基础节点', ts: '5 秒前' },
    stats: [{ label: '重排次数', value: '3' }, { label: '命中率', value: '89%' }] },
  { id: 'resource-search', name: '资源检索智能体', en: 'Resource Search', role: 'RESOURCE-1', color: T.emerald, glyph: '◬',
    angle: 30, orbitRx: 292, orbitRy: 220, orbitTilt: -14, planetSize: 23,
    activity: { verb: '检索中', text: '从本地知识索引检索候选材料', detail: '返回来源 · 匹配分数 · Evidence Trace', ts: '6 秒前' },
    stats: [{ label: '检索', value: 'RAG' }, { label: '依据', value: '可追溯' }] },
  { id: 'resource-generate', name: '资源生成智能体', en: 'Resource Generator', role: 'RESOURCE-2', color: T.lime, glyph: '△',
    angle: 60, orbitRx: 338, orbitRy: 238, orbitTilt: 13, planetSize: 22,
    activity: { verb: '生成中', text: '将候选资源改写成个性化练习包', detail: '思维导图 1 · 专项练习 3 · 图解卡片 1', ts: '3 秒前' },
    stats: [{ label: '生成项', value: '5' }, { label: '适配度', value: '92%' }] },
  { id: 'tutor-explain', name: '讲解辅导智能体', en: 'Tutor Explainer', role: 'TUTOR-1', color: T.amber, glyph: '◊',
    angle: 90, orbitRx: 272, orbitRy: 204, orbitTilt: 5, planetSize: 24,
    activity: { verb: '待命', text: '准备把抽象概念讲成可操作步骤', detail: '支持概念讲解 · 代码辅导 · 错题诊断', ts: '刚刚' },
    stats: [{ label: '辅导模式', value: '10' }, { label: '准确率', value: '94%' }] },
  { id: 'tutor-dialogue', name: '互动答疑智能体', en: 'Dialogue Tutor', role: 'TUTOR-2', color: T.orange, glyph: '□',
    angle: 120, orbitRx: 348, orbitRy: 246, orbitTilt: -9, planetSize: 22,
    activity: { verb: '追问中', text: '根据学生回答生成下一轮追问', detail: '已追问 2 次 · 几何直觉已建立', ts: '12 秒前' },
    stats: [{ label: '追问轮次', value: '2' }, { label: '理解度', value: '76%' }] },
  { id: 'eval-quiz', name: '评估出题智能体', en: 'Quiz Evaluator', role: 'EVAL-1', color: T.rose, glyph: '◆',
    angle: 150, orbitRx: 286, orbitRy: 212, orbitTilt: 12, planetSize: 23,
    activity: { verb: '出题中', text: '生成阶段测评题组', detail: '2 道针对性题目 · 覆盖薄弱前置概念', ts: '3 分钟前' },
    stats: [{ label: '平均正确率', value: '82%' }, { label: '知识掌握度', value: '68%' }] },
  { id: 'eval-cause', name: '错因分析智能体', en: 'Mistake Analyzer', role: 'EVAL-2', color: T.pink, glyph: '◍',
    angle: 180, orbitRx: 360, orbitRy: 238, orbitTilt: 2, planetSize: 22,
    activity: { verb: '归因中', text: '把错误拆成概念、步骤和迁移三类原因', detail: '二级指针 · BFS visited · 队列空判', ts: '2 分钟前' },
    stats: [{ label: '错因类', value: '3' }, { label: '盲点', value: '4' }] },
  { id: 'feedback-write', name: '反馈回写智能体', en: 'Feedback Writer', role: 'FEEDBACK-1', color: T.blue, glyph: '◇',
    angle: 210, orbitRx: 302, orbitRy: 226, orbitTilt: -10, planetSize: 23,
    activity: { verb: '回写中', text: '将测评结果反向写入画像', detail: '图结构 68%→42% · 指针 65%→42% · 新增偏好: 思维导图', ts: '1 分钟前' },
    stats: [{ label: '本周更新', value: '5 次' }, { label: '触发路径修正', value: '3 次' }] },
  { id: 'reflection', name: '成长复盘智能体', en: 'Reflection Agent', role: 'FEEDBACK-2', color: T.indigo, glyph: '✦',
    angle: 240, orbitRx: 340, orbitRy: 244, orbitTilt: 8, planetSize: 22,
    activity: { verb: '复盘中', text: '生成今日学习摘要与明日行动建议', detail: '成就 2 项 · 风险 1 项 · 下一步 3 条', ts: '30 秒前' },
    stats: [{ label: '复盘项', value: '6' }, { label: '行动', value: '3' }] },
]

const loopOrder = agents.map(agent => agent.id)

/* ── Geometry ── */
const VIZ_W = 880
const VIZ_H = 880
const CX = VIZ_W / 2
const CY = VIZ_H / 2
const SPHERE_R = 132

function polar(cx: number, cy: number, rx: number, ry: number, deg: number) {
  const rad = deg * Math.PI / 180
  return { x: cx + rx * Math.cos(rad), y: cy + ry * Math.sin(rad) }
}

function hexAlpha(hex: string, a: number) {
  const clamped = Math.max(0, Math.min(1, a))
  return hex + Math.round(clamped * 255).toString(16).padStart(2, '0')
}

/* ── Starfield ── */
interface Star { x: number; y: number; r: number; o: number; tw: boolean; d: number }
const stars: Star[] = (() => {
  const out: Star[] = []
  let s = 73
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
  for (let i = 0; i < 110; i++) {
    out.push({
      x: rand() * VIZ_W, y: rand() * VIZ_H,
      r: 0.3 + rand() * 1.4, o: 0.15 + rand() * 0.55,
      tw: rand() < 0.35, d: rand() * 4,
    })
  }
  return out
})()

/* ── Positions (reactive) ── */
interface Pos { x: number; y: number }
const positions = computed<Pos[]>(() =>
  agents.map(a => {
    const p = polar(CX, CY, a.orbitRx, a.orbitRy, a.angle)
    const rad = a.orbitTilt * Math.PI / 180
    const dx = p.x - CX
    const dy = p.y - CY
    return {
      x: CX + dx * Math.cos(rad) - dy * Math.sin(rad),
      y: CY + dx * Math.sin(rad) + dy * Math.cos(rad),
    }
  })
)

const loopPositions = computed<Pos[]>(() =>
  loopOrder.map(id => positions.value[agents.findIndex(a => a.id === id)])
)

/* ── Spotlight ── */
const hoverIdx = ref<number | null>(null)
const spotIdx = ref(0)
let spotTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  spotTimer = setInterval(() => { spotIdx.value = (spotIdx.value + 1) % agents.length }, 3200)
  nextTick(initStarfield)
})
onUnmounted(() => {
  if (spotTimer) clearInterval(spotTimer)
  if (starfieldRAF) cancelAnimationFrame(starfieldRAF)
})

const activeIdx = computed(() => hoverIdx.value ?? spotIdx.value)
const hotAgentId = computed(() => agents[activeIdx.value]?.id)
const hotLoopIdx = computed(() => loopOrder.indexOf(hotAgentId.value))

/* ── Chip side helper ── */
function chipSide(x: number, y: number): 'left' | 'right' | 'top' | 'bottom' {
  return 'right'
}

/* ── Wireframe latitude/longitude data ── */
const latitudes = [0.95, 0.78, 0.55, 0.25, 0, -0.3, -0.6, -0.82, -0.95]
const longitudes = [0, 30, 60, 90, 120, 150]

/* ── Stats ── */

/* ── Chip positioning style ── */
function chipStyle(x: number, y: number, isHot: boolean, side: string): string {
  const offset = isHot ? 60 : 52
  const dx = offset
  const px = x + dx
  const py = y
  const transform = 'translate(0, -50%)'
  return `left:${px}px;top:${py}px;transform:${transform};z-index:${isHot ? 20 : 10};min-width:${isHot ? '240px' : 'auto'}`
}

/* ── Full-screen starfield canvas ── */
const starfieldCanvas = ref<HTMLCanvasElement | null>(null)
let starfieldRAF = 0

interface StarDot { x: number; y: number; r: number; o: number; speed: number; phase: number }

function initStarfield() {
  const canvas = starfieldCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const context = ctx
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const resize = () => {
    const rect = canvas.parentElement?.getBoundingClientRect()
    if (!rect) return
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    context.scale(dpr, dpr)
  }
  resize()
  window.addEventListener('resize', resize)

  const w = () => canvas.width / (window.devicePixelRatio || 1)
  const h = () => canvas.height / (window.devicePixelRatio || 1)

  const dots: StarDot[] = Array.from({ length: 180 }, () => ({
    x: Math.random() * 2000,
    y: Math.random() * 1200,
    r: Math.random() * 1.2 + 0.3,
    o: Math.random() * 0.5 + 0.15,
    speed: Math.random() * 0.008 + 0.003,
    phase: Math.random() * Math.PI * 2,
  }))

  let t = 0
  function draw() {
    const cw = w(), ch = h()
    context.clearRect(0, 0, cw, ch)
    t += 0.016
    for (const d of dots) {
      const flicker = 0.5 + 0.5 * Math.sin(t * d.speed * 60 + d.phase)
      context.beginPath()
      context.arc(d.x % cw, d.y % ch, d.r, 0, Math.PI * 2)
      context.fillStyle = `rgba(180, 210, 255, ${d.o * flicker})`
      context.fill()
    }
    starfieldRAF = requestAnimationFrame(draw)
  }
  draw()
}
</script>

<template>
  <section class="hero-constellation">
    <!-- Background grid -->
    <div class="hero-grid" aria-hidden="true" />

    <!-- Full-screen starfield -->
    <canvas ref="starfieldCanvas" class="hero-starfield" aria-hidden="true" />

    <!-- Layout -->
    <div class="hero-layout">
      <!-- LEFT: copy -->
      <div class="hero-copy">
        <h1 class="hero-main-title">智学星枢</h1>
        <p class="hero-subtitle">多智能体协同的个性化学习平台</p>

        <p class="hero-desc">
          围绕学习画像、路径规划、学习资源生成、智能评估与反向更新，平台通过多智能体协同，为学生提供动态、个性化、可持续优化的学习支持。
        </p>

        <div class="hero-capabilities">
          <span class="cap-tag">画像生成</span>
          <span class="cap-tag">学习路径</span>
          <span class="cap-tag">学习资源</span>
          <span class="cap-tag">智能评估</span>
          <span class="cap-tag">反向更新</span>
        </div>

        <div class="hero-metrics">
          <div class="metric-item">
            <span class="metric-num">7</span>
            <span class="metric-label">个核心智能体</span>
          </div>
          <div class="metric-sep" />
          <div class="metric-item">
            <span class="metric-num">6</span>
            <span class="metric-label">个核心模块</span>
          </div>
          <div class="metric-sep" />
          <div class="metric-item">
            <span class="metric-num">5</span>
            <span class="metric-label">类学习数据</span>
          </div>
          <div class="metric-sep" />
          <div class="metric-item">
            <span class="metric-num">1</span>
            <span class="metric-label">条反馈闭环</span>
          </div>
        </div>
      </div>

      <!-- RIGHT: constellation viz -->
      <div class="hero-viz-wrapper">
        <svg :viewBox="`0 0 ${VIZ_W} ${VIZ_H}`" class="hero-svg">
          <defs>
            <radialGradient id="hp-sphere-outer" cx="50%" cy="50%" r="50%">
              <stop offset="0%" :stop-color="T.cyan" stop-opacity="0.4" />
              <stop offset="45%" :stop-color="T.purple" stop-opacity="0.18" />
              <stop offset="100%" :stop-color="T.purple" stop-opacity="0" />
            </radialGradient>
            <radialGradient id="hp-sphere-body" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stop-color="#3a8fff" stop-opacity="0.4" />
              <stop offset="40%" stop-color="#1e3a8a" stop-opacity="0.65" />
              <stop offset="100%" stop-color="#0a1230" stop-opacity="0.95" />
            </radialGradient>
            <radialGradient id="hp-sphere-hi" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#fff" stop-opacity="0.3" />
              <stop offset="60%" stop-color="#fff" stop-opacity="0.05" />
              <stop offset="100%" stop-color="#fff" stop-opacity="0" />
            </radialGradient>
            <radialGradient v-for="a in agents" :key="`pg-${a.id}`"
              :id="`hp-planet-${a.id}`" cx="35%" cy="35%" r="65%">
              <stop offset="0%" :stop-color="a.color" stop-opacity="1" />
              <stop offset="60%" :stop-color="a.color" stop-opacity="0.65" />
              <stop offset="100%" stop-color="#000010" stop-opacity="0.9" />
            </radialGradient>
            <filter id="hp-planet-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="10" />
            </filter>
          </defs>

          <!-- Starfield -->
          <circle v-for="(s, i) in stars" :key="`s-${i}`"
            :cx="s.x" :cy="s.y" :r="s.r" fill="#fff" :opacity="s.o"
            :class="{ 'star-twinkle': s.tw }"
            :style="s.tw ? `animation-duration: ${3 + (i % 4)}s; animation-delay: ${s.d}s` : undefined" />

          <!-- Shooting stars -->
          <line x1="50" y1="120" x2="140" y2="170" stroke="#fff" stroke-opacity="0.4"
            stroke-width="1" stroke-linecap="round" stroke-dasharray="2 60"
            class="shooting-star" />
          <line x1="700" y1="780" x2="820" y2="720" stroke="#fff" stroke-opacity="0.3"
            stroke-width="1" stroke-linecap="round" stroke-dasharray="2 80"
            class="shooting-star-r" />

          <!-- Orbit ellipses -->
          <g v-for="(a, i) in agents" :key="`orbit-${a.id}`"
            :style="`transform-origin: ${CX}px ${CY}px; transform: rotate(${a.orbitTilt}deg); opacity: ${hoverIdx != null && hoverIdx !== i ? 0.18 : 0.42}`"
            class="orbit-ellipse">
            <ellipse :cx="CX" :cy="CY" :rx="a.orbitRx" :ry="a.orbitRy"
              fill="none" :stroke="a.color" stroke-opacity="0.6" stroke-width="0.8"
              stroke-dasharray="1 3" />
          </g>

          <!-- Central sphere -->
          <circle :cx="CX" :cy="CY" :r="SPHERE_R + 50" fill="url(#hp-sphere-outer)" opacity="0.7" />

          <!-- Atmospheric rings -->
          <g class="atmo-ring-1" :style="`transform-origin: ${CX}px ${CY}px`">
            <ellipse :cx="CX" :cy="CY" :rx="SPHERE_R + 18" :ry="SPHERE_R + 4"
              fill="none" :stroke="T.cyan" stroke-opacity="0.35" stroke-width="1.5"
              stroke-dasharray="1 12" />
          </g>
          <g class="atmo-ring-2" :style="`transform-origin: ${CX}px ${CY}px`">
            <ellipse :cx="CX" :cy="CY" :rx="SPHERE_R + 28" :ry="SPHERE_R + 10"
              fill="none" :stroke="T.purple" stroke-opacity="0.25" stroke-width="1"
              stroke-dasharray="2 18" />
          </g>

          <!-- Sphere body -->
          <circle :cx="CX" :cy="CY" :r="SPHERE_R" fill="url(#hp-sphere-body)" />

          <!-- Latitude lines -->
          <ellipse v-for="(y, i) in latitudes" :key="`lat-${i}`"
            :cx="CX" :cy="CY + y * SPHERE_R * 0.5"
            :rx="SPHERE_R * Math.sqrt(1 - y * y)"
            :ry="SPHERE_R * Math.sqrt(1 - y * y) * 0.18"
            fill="none" :stroke="T.cyan" stroke-opacity="0.32" stroke-width="0.7" />

          <!-- Longitude lines -->
          <g v-for="deg in longitudes" :key="`lon-${deg}`"
            :style="`transform-origin: ${CX}px ${CY}px; transform: rotate(${deg}deg)`">
            <ellipse :cx="CX" :cy="CY" :rx="SPHERE_R * 0.22" :ry="SPHERE_R"
              fill="none" :stroke="T.cyan" stroke-opacity="0.18" stroke-width="0.6" />
          </g>

          <!-- Inner highlight -->
          <circle :cx="CX - SPHERE_R * 0.3" :cy="CY - SPHERE_R * 0.3" :r="SPHERE_R * 0.55"
            fill="url(#hp-sphere-hi)" opacity="0.9" />

          <!-- Center bright point -->
          <circle :cx="CX" :cy="CY" r="6" fill="#fff" class="center-pulse" />

          <!-- Pulse rings -->
          <circle :cx="CX" :cy="CY" :r="SPHERE_R"
            fill="none" :stroke="T.cyan" stroke-width="1.5" stroke-opacity="0.5"
            class="pulse-ring-1" :style="`transform-origin: ${CX}px ${CY}px`" />
          <circle :cx="CX" :cy="CY" :r="SPHERE_R"
            fill="none" :stroke="T.purple" stroke-width="1" stroke-opacity="0.4"
            class="pulse-ring-2" :style="`transform-origin: ${CX}px ${CY}px`" />

          <!-- Loop connection lines -->
          <g v-for="(p, i) in loopPositions" :key="`edge-${i}`">
            <line :x1="p.x" :y1="p.y"
              :x2="loopPositions[(i + 1) % loopPositions.length].x"
              :y2="loopPositions[(i + 1) % loopPositions.length].y"
              :stroke="hotLoopIdx === i || hotLoopIdx === (i + 1) % loopPositions.length ? T.cyan : '#5b6584'"
              :stroke-opacity="hotLoopIdx === i || hotLoopIdx === (i + 1) % loopPositions.length ? 0.7 : 0.22"
              :stroke-width="hotLoopIdx === i || hotLoopIdx === (i + 1) % loopPositions.length ? 1.5 : 1"
              class="loop-edge" />
            <line :x1="p.x" :y1="p.y"
              :x2="loopPositions[(i + 1) % loopPositions.length].x"
              :y2="loopPositions[(i + 1) % loopPositions.length].y"
              :stroke="T.cyan" stroke-opacity="0.85" stroke-width="1.5"
              stroke-dasharray="3 18"
              class="loop-flow"
              :style="`animation-duration: ${4 + i * 0.4}s; animation-delay: ${i * 0.3}s`" />
          </g>

          <!-- Direction arrows at midpoints -->
          <g v-for="(p, i) in loopPositions" :key="`arr-${i}`">
            <g :transform="`translate(${(p.x + loopPositions[(i + 1) % loopPositions.length].x) / 2}, ${(p.y + loopPositions[(i + 1) % loopPositions.length].y) / 2}) rotate(${Math.atan2(loopPositions[(i + 1) % loopPositions.length].y - p.y, loopPositions[(i + 1) % loopPositions.length].x - p.x) * 180 / Math.PI})`">
              <path d="M -5 -4 L 4 0 L -5 4 Z" :fill="T.cyan" opacity="0.6"
                class="loop-arrow-head"
                :style="`animation-delay: ${i * 0.4}s`" />
            </g>
          </g>

          <!-- Planets -->
          <g v-for="(a, i) in agents" :key="a.id"
            :transform="`translate(${positions[i].x}, ${positions[i].y})${activeIdx === i ? ' scale(1.1)' : ''}`"
            class="planet-group"
            @mouseenter="hoverIdx = i"
            @mouseleave="hoverIdx = null"
            style="cursor: pointer">
            <!-- Outer glow -->
            <circle cx="0" cy="0" :r="a.planetSize * 2.2" :fill="a.color"
              :opacity="activeIdx === i ? 0.18 : 0.1" filter="url(#hp-planet-glow)" />
            <!-- Hot pulse rings -->
            <circle v-if="activeIdx === i" cx="0" cy="0" :r="a.planetSize + 4"
              fill="none" :stroke="a.color" stroke-width="1.5" class="planet-pulse" />
            <circle v-if="activeIdx === i" cx="0" cy="0" :r="a.planetSize + 4"
              fill="none" :stroke="a.color" stroke-width="1.5" class="planet-pulse-delay" />
            <!-- Planet body -->
            <circle cx="0" cy="0" :r="a.planetSize" :fill="`url(#hp-planet-${a.id})`" />
            <!-- Highlight -->
            <circle :cx="-a.planetSize * 0.3" :cy="-a.planetSize * 0.3" :r="a.planetSize * 0.45"
              fill="#ffffff" opacity="0.5" style="filter: blur(6px)" />
            <!-- Outline -->
            <circle cx="0" cy="0" :r="a.planetSize" fill="none" :stroke="a.color"
              stroke-opacity="0.6" stroke-width="1" />
            <!-- Decorative ring -->
            <ellipse cx="0" cy="0" :rx="a.planetSize * 1.5" :ry="a.planetSize * 0.4"
              fill="none" :stroke="a.color" :stroke-opacity="activeIdx === i ? 0.5 : 0.25"
              stroke-width="1" :transform="`rotate(${a.orbitTilt - 18})`" />
          </g>
        </svg>

        <!-- Center sphere label (HTML overlay) -->
        <div class="sphere-label">
          <div class="sphere-eyebrow">STUDENT PROFILE</div>
          <div class="sphere-title">知识宇宙</div>
          <div class="sphere-sub">学习者 · 7 核心智能体 · 6 模块协同</div>
          <div class="sphere-stats">
            <div v-for="s in [{ l: '核心智能体', v: '7' }, { l: '协同模块', v: '6' }, { l: '画像维度', v: '6' }]" :key="s.l" class="sphere-stat">
              <div class="sphere-stat-val">{{ s.v }}</div>
              <div class="sphere-stat-label">{{ s.l }}</div>
            </div>
          </div>
        </div>

        <!-- Activity chips (HTML overlay) -->
        <div v-for="(a, i) in agents" :key="`chip-${a.id}`"
          v-show="activeIdx === i"
          class="activity-chip"
          :class="{ 'chip-hot': activeIdx === i }"
          :style="chipStyle(positions[i].x, positions[i].y, activeIdx === i, 'right')">
          <div class="chip-connector chip-connector-right" :style="`background: linear-gradient(90deg, ${hexAlpha(a.color, 0.6)}, transparent)`" />
          <div class="chip-card" :class="{ 'chip-card-hot': activeIdx === i }" :style="`border-color: ${hexAlpha(a.color, activeIdx === i ? 0.5 : 0.25)}`">
            <div class="chip-header">
              <span class="chip-dot" :style="`background: ${a.color}; box-shadow: 0 0 6px ${a.color}`" />
              <span class="chip-role" :style="`color: ${a.color}`">{{ a.role }}</span>
              <span class="chip-ts">{{ a.activity.ts }}</span>
            </div>
            <div class="chip-name">{{ a.name }}</div>
            <div class="chip-activity">
              <span class="chip-verb" :style="`color: ${a.color}`">· {{ a.activity.verb }}</span>
              {{ a.activity.text }}
            </div>
            <template v-if="activeIdx === i">
              <div class="chip-detail">{{ a.activity.detail }}</div>
              <div class="chip-stats">
                <div v-for="st in a.stats" :key="st.label" class="chip-stat">
                  <div class="chip-stat-label">{{ st.label }}</div>
                  <div class="chip-stat-val" :style="`color: ${a.color}`">{{ st.value }}</div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Scroll hint -->
    <div class="scroll-cue">
      <span>SCROLL</span>
      <div class="scroll-line" />
    </div>
  </section>
</template>

<style scoped>
.hero-constellation {
  position: relative;
  min-height: 100vh;
  padding: 32px 56px 60px;
  overflow: hidden;
  background: transparent;
  z-index: 1;
}

.hero-grid {
  position: absolute;
  inset: 0;
  opacity: 0.15;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(0,212,255,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,212,255,0.04) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
}

.hero-starfield {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.4;
}

.hero-layout {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: minmax(360px, 1fr) minmax(0, 980px);
  gap: 32px;
  align-items: center;
  min-height: calc(100vh - 92px);
  max-width: 1760px;
  margin: 0 auto;
}

/* ── Left copy ── */
.hero-copy {
  padding: 20px 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.hero-main-title {
  margin: 0 0 12px;
  font-family: var(--font-display, Georgia, 'Noto Serif SC', serif);
  font-weight: 700;
  font-size: clamp(48px, 5vw, 72px);
  line-height: 1.08;
  letter-spacing: 0.04em;
  color: transparent;
  background: linear-gradient(
    160deg,
    rgba(230, 245, 255, 0.96) 0%,
    rgba(170, 215, 255, 0.90) 30%,
    rgba(110, 190, 255, 0.84) 55%,
    rgba(160, 215, 255, 0.90) 80%,
    rgba(230, 245, 255, 0.96) 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  position: relative;
  text-shadow: none;
  filter:
    drop-shadow(0 0 24px rgba(80, 170, 255, 0.3))
    drop-shadow(0 1px 3px rgba(0, 0, 0, 0.25));
}

.hero-main-title::after {
  display: none;
}

.hero-subtitle {
  margin: 0 0 20px;
  font-size: clamp(15px, 1.2vw, 18px);
  font-weight: 400;
  line-height: 1.5;
  letter-spacing: 0.08em;
  color: rgba(160, 200, 245, 0.75);
}

.hero-desc {
  margin: 0 0 24px;
  font-size: 14px;
  line-height: 1.85;
  color: rgba(180, 200, 230, 0.62);
  max-width: 460px;
  font-weight: 400;
}

.hero-capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 32px;
}

.cap-tag {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.05em;
  color: rgba(175, 210, 245, 0.78);
  background: rgba(60, 140, 255, 0.08);
  border: none;
  transition: all 0.2s ease;
}

.cap-tag:hover {
  background: rgba(60, 140, 255, 0.14);
  color: rgba(200, 225, 255, 0.92);
}

.hero-metrics {
  display: flex;
  align-items: center;
  gap: 0;
  padding-top: 20px;
  border-top: none;
}

.metric-item {
  display: flex;
  align-items: baseline;
  gap: 5px;
  padding: 0 18px;
  white-space: nowrap;
}

.metric-item:first-child {
  padding-left: 0;
}

.metric-item:last-child {
  padding-right: 0;
}

.metric-num {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
  color: rgba(120, 200, 255, 0.88);
  font-variant-numeric: tabular-nums;
}

.metric-label {
  font-size: 11px;
  color: rgba(140, 170, 210, 0.5);
  font-weight: 400;
  letter-spacing: 0.02em;
}

.metric-sep {
  width: 1px;
  height: 16px;
  background: rgba(120, 180, 255, 0.1);
  flex-shrink: 0;
}

/* ── Right viz ── */
.hero-viz-wrapper {
  position: relative;
  width: 880px;
  height: 880px;
  max-width: 100%;
  margin: 0 auto;
}

.hero-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

/* ── Sphere label overlay ── */
.sphere-label {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  text-align: center;
  z-index: 4;
  border: none;
  background: transparent;
}

.sphere-eyebrow {
  font-size: 9.5px;
  color: #00d4ff;
  letter-spacing: 0.28em;
  font-family: 'JetBrains Mono', monospace;
  margin-bottom: 6px;
  text-shadow: 0 0 12px #00d4ff;
}

.sphere-title {
  font-family: 'Instrument Serif', serif;
  font-size: 34px;
  line-height: 1.05;
  color: #fff;
  letter-spacing: -0.01em;
  font-weight: 500;
  text-shadow: 0 0 24px rgba(0, 212, 255, 0.7);
  margin-bottom: 6px;
}

.sphere-sub {
  font-size: 11px;
  color: #8892b0;
  letter-spacing: 0.12em;
  font-weight: 500;
}

.sphere-stats {
  display: flex;
  gap: 18px;
  margin-top: 16px;
  justify-content: center;
}

.sphere-stat {
  text-align: center;
}

.sphere-stat-val {
  font-family: 'Instrument Serif', serif;
  font-size: 18px;
  color: #fff;
  line-height: 1;
}

.sphere-stat-label {
  font-size: 8.5px;
  color: #4a5568;
  letter-spacing: 0.16em;
  font-family: 'JetBrains Mono', monospace;
  margin-top: 3px;
}

/* ── Loop label ── */
/* ── Activity chips ── */
.activity-chip {
  position: absolute;
  pointer-events: none;
  transition: left 0.4s cubic-bezier(0.4, 0, 0.2, 1), top 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
  max-width: 280px;
}

.chip-connector {
  position: absolute;
  top: 50%;
  height: 1px;
}

.chip-connector-right {
  left: -48px;
  width: 48px;
}

.chip-connector-left {
  right: -48px;
  width: 48px;
}

.chip-card {
  background: rgba(14, 18, 40, 0.7);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid;
  border-radius: 12px;
  padding: 8px 12px;
  box-shadow: 0 6px 18px rgba(0,0,0,0.3);
  transition: background 0.3s ease, box-shadow 0.3s ease, padding 0.3s ease;
}

.chip-card-hot {
  background: rgba(14, 18, 40, 0.92);
  padding: 12px 16px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.5);
}

.chip-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.chip-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  animation: pulse-soft 1.6s ease-in-out infinite;
}

.chip-role {
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.15em;
  font-weight: 500;
}

.chip-ts {
  font-size: 10px;
  color: #4a5568;
  margin-left: auto;
  font-family: 'JetBrains Mono', monospace;
}

.chip-name {
  font-size: 12px;
  font-weight: 600;
  color: #e8edf5;
  line-height: 1.4;
}

.chip-activity {
  font-size: 11px;
  color: #e8edf5;
  line-height: 1.5;
  margin-top: 4px;
}

.chip-verb {
  margin-right: 4px;
}

.chip-detail {
  font-size: 10.5px;
  color: #8892b0;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(255,255,255,0.06);
  line-height: 1.4;
}

.chip-stats {
  display: flex;
  gap: 14px;
  margin-top: 8px;
}

.chip-stat-label {
  font-size: 9px;
  color: #4a5568;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 2px;
}

.chip-stat-val {
  font-size: 13px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
}

/* ── Scroll cue ── */
.scroll-cue {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #8892b0;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.2em;
  opacity: 0.7;
  z-index: 5;
  pointer-events: none;
}

.scroll-line {
  width: 1px;
  height: 32px;
  background: linear-gradient(180deg, #00d4ff, transparent);
  animation: pulse-soft 1.6s ease-in-out infinite;
}

/* ── SVG animations ── */
.star-twinkle {
  animation: twinkle 3s ease-in-out infinite;
}

.shooting-star {
  animation: dash-flow 8s linear infinite;
}

.shooting-star-r {
  animation: dash-flow 12s linear infinite reverse;
}

.orbit-ellipse {
  transition: opacity 0.3s ease;
}

.atmo-ring-1 {
  animation: spin 60s linear infinite;
}

.atmo-ring-2 {
  animation: spin-rev 90s linear infinite;
}

.center-pulse {
  animation: pulse-soft 2.4s ease-in-out infinite;
}

.pulse-ring-1 {
  animation: pulse-ring 4s ease-out infinite;
}

.pulse-ring-2 {
  animation: pulse-ring 4s ease-out 2s infinite;
}

.loop-edge {
  transition: stroke-opacity 0.3s ease, stroke-width 0.3s ease;
}

.loop-flow {
  animation: dash-flow 4s linear infinite;
}

.loop-arrow-head {
  animation: pulse-soft 2s ease-in-out infinite;
}

.planet-group {
  transition: transform 0.3s ease;
}

.planet-pulse {
  animation: pulse-ring 2s ease-out infinite;
}

.planet-pulse-delay {
  animation: pulse-ring 2s ease-out 1s infinite;
}

/* ── Keyframes ── */
@keyframes pulse-soft {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

@keyframes pulse-ring {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(2.2); opacity: 0; }
}

@keyframes twinkle {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

@keyframes dash-flow {
  to { stroke-dashoffset: -30; }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes spin-rev {
  to { transform: rotate(-360deg); }
}

/* ── Reduced motion ── */
@media (prefers-reduced-motion: reduce) {
  .star-twinkle,
  .shooting-star,
  .shooting-star-r,
  .center-pulse,
  .pulse-ring-1,
  .pulse-ring-2,
  .loop-flow,
  .loop-arrow-head,
  .planet-pulse,
  .planet-pulse-delay,
  .atmo-ring-1,
  .atmo-ring-2,
  .scroll-line,
  .chip-dot {
    animation: none !important;
  }

  .orbit-ellipse,
  .planet-group,
  .loop-edge {
    transition: none !important;
  }
}

/* ── Responsive ── */
@media (max-width: 1200px) {
  .hero-layout {
    grid-template-columns: 1fr;
    gap: 40px;
  }
  .hero-viz-wrapper {
    width: 100%;
    max-width: 600px;
    height: auto;
    aspect-ratio: 1;
  }
  .hero-constellation {
    padding: 60px 24px 40px;
    min-height: auto;
  }

}

@media (max-width: 600px) {
  .hero-metrics {
    flex-wrap: wrap;
    gap: 8px;
  }
  .metric-sep { display: none; }
  .metric-item { padding: 0; }
  .hero-main-title {
    font-size: 36px;
  }
  .hero-capabilities {
    gap: 6px;
  }
  .cap-tag {
    font-size: 11px;
    padding: 4px 10px;
  }
}
</style>
