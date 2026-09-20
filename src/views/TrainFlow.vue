<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const TF = {
  bg: '#050610', ink: '#070b18', deep: '#060a16',
  panel: 'rgba(13,18,42,0.74)', panelSolid: '#0a1022',
  cyan: '#00d4ff', blue: '#3b82f6', purple: '#7c3aed', violet: '#a78bfa',
  emerald: '#06d6a0', amber: '#f59e0b', gold: '#facc15', rose: '#f43f5e', pink: '#ec4899',
  text: '#eaf2ff', textSub: '#8da3c8', textTri: '#51648c',
  line: 'rgba(120,160,220,0.12)',
  serif: "'Instrument Serif','Noto Serif SC',serif",
  sans: "'Outfit','PingFang SC',sans-serif",
  mono: "'JetBrains Mono',monospace",
}

function tfHexA(hex: string, a: number) {
  return hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')
}

interface ThinkStep { icon: string; text: string; detail: string }
interface CourseRef { code: string; name: string; tag: string }
interface CtxBundle { from?: string; label: string; items: string[] }
interface Station {
  id: string; name: string; role: string; color: string; glyph: string; station: string
  inputCtx: CtxBundle; think: ThinkStep[]; courses: CourseRef[]
  result: string; mastery: number; outputCtx: CtxBundle
}
interface Beat { id: string; station: number; title: string; desc?: string; mastery: number }

const props = defineProps<{
  embeddedStageOnly?: boolean
  activeBeatId?: string
}>()

const TF_STATIONS: Station[] = [
  {
    id: 'profile', name: '画像智能体', role: 'PROFILE', color: TF.purple, glyph: '◉', station: '画像站',
    inputCtx: { from: '系统感知', label: '卡顿信号', items: ['连续 2 次提交错误', '停留 12 分钟'] },
    think: [
      { icon: '⊙', text: '扫描学习行为日志', detail: '行为流 B-12 · 错题 E-07' },
      { icon: '⇆', text: '比对历史掌握度曲线', detail: '约束极值维度近 7 天 -7pt' },
      { icon: '⌖', text: '定位薄弱知识点', detail: '锁定「拉格朗日乘数法」' },
    ],
    courses: [
      { code: 'MATH-201', name: '《高等数学》拉格朗日乘数法', tag: '薄弱' },
      { code: 'OPT-104', name: '《最优化方法》约束极值', tag: '相关' },
    ],
    result: '凸优化「约束极值」掌握度 32%,标记为薄弱', mastery: 32,
    outputCtx: { label: '薄弱画像', items: ['知识点: 拉格朗日基础', '掌握度: 32%', '前置缺口: 偏导/梯度'] },
  },
  {
    id: 'path', name: '路径规划智能体', role: 'PATH', color: TF.cyan, glyph: '◈', station: '路径站',
    inputCtx: { from: '画像智能体', label: '薄弱画像', items: ['拉格朗日基础 32%', '缺口: 偏导/梯度'] },
    think: [
      { icon: '◷', text: '检索知识图谱前置依赖', detail: '偏导数 → 梯度方向 → 拉格朗日' },
      { icon: '↻', text: '计算最短补救路径', detail: '3 跳可达目标节点' },
      { icon: '☰', text: '重排今日学习任务', detail: '插入前置 · 推迟 2 个进阶节点' },
    ],
    courses: [
      { code: 'MATH-102', name: '《微积分》偏导数', tag: '前置' },
      { code: 'MATH-103', name: '《微积分》梯度与方向导数', tag: '前置' },
    ],
    result: '在路径中插入 3 个前置学习节点', mastery: 35,
    outputCtx: { label: '补救路径', items: ['① 偏导数复习', '② 梯度方向', '③ 拉格朗日基础'] },
  },
  {
    id: 'resource', name: '资源推荐智能体', role: 'RESOURCE', color: TF.emerald, glyph: '◬', station: '资源站',
    inputCtx: { from: '路径规划智能体', label: '补救路径', items: ['3 个前置节点', '偏好: 视觉型'] },
    think: [
      { icon: '◎', text: '读取学习偏好画像', detail: '视觉型 · 偏好动画讲解' },
      { icon: '⊞', text: '检索资源库匹配', detail: '1.2k 资源 → 命中 18' },
      { icon: '⇅', text: '按难度梯度排序', detail: '低门槛优先 · 控制时长' },
    ],
    courses: [
      { code: 'VID-3B1B', name: '3Blue1Brown 梯度可视化', tag: '视频 8min' },
      { code: 'OPT-EX12', name: '《最优化》拉格朗日例题精讲', tag: '精读' },
      { code: 'PRAC-07', name: '约束极值基础练习 5 题', tag: '练习' },
    ],
    result: '推荐 3 个低门槛资源(视频 2 · 练习 1)', mastery: 41,
    outputCtx: { label: '资源清单', items: ['梯度可视化视频', '例题精讲', '基础练习'] },
  },
  {
    id: 'tutor', name: 'AI 辅导智能体', role: 'TUTOR', color: TF.amber, glyph: '◊', station: '辅导站',
    inputCtx: { from: '资源推荐智能体', label: '资源清单', items: ['梯度可视化', '例题精讲'] },
    think: [
      { icon: '✦', text: '融合薄弱点与资源', detail: '聚焦「约束相切」直觉' },
      { icon: '◐', text: '生成可视化讲解', detail: '等高线 + 约束曲线相切动画' },
      { icon: '?', text: '准备追问预案', detail: '预置 3 个常见疑点' },
    ],
    courses: [{ code: 'TUT-LAG', name: '拉格朗日几何解释 · 互动讲解', tag: '生成' }],
    result: '生成「等高线相切」可视化讲解 + 追问预案', mastery: 48,
    outputCtx: { label: '讲解记录', items: ['几何直觉已讲透', '学生追问 2 次已解答'] },
  },
  {
    id: 'eval', name: '评估智能体', role: 'EVAL', color: TF.rose, glyph: '◆', station: '评估站',
    inputCtx: { from: 'AI 辅导智能体', label: '讲解记录', items: ['几何直觉已建立', '追问已闭环'] },
    think: [
      { icon: '◈', text: '生成诊断题组', detail: '2 道针对性题目' },
      { icon: '✓', text: '即时评分', detail: '2/2 正确 · 用时 4min' },
      { icon: '⇆', text: '回写画像维度', detail: '约束极值 +13pt' },
    ],
    courses: [{ code: 'QUIZ-09', name: '拉格朗日诊断题组', tag: '测评' }],
    result: '掌握度 48% → 61%,薄弱标记解除', mastery: 61,
    outputCtx: { label: '评估反馈', items: ['掌握度 61%', '明日路径已优化'] },
  },
]

const TF_BEATS: Beat[] = [
  { id: 'depart', station: -1, title: '任务上车', desc: '检测到卡顿,生成任务并送上协同列车', mastery: 32 },
  { id: 'profile', station: 0, title: '到站 · 画像站', mastery: 32 },
  { id: 'path', station: 1, title: '到站 · 路径站', mastery: 35 },
  { id: 'resource', station: 2, title: '到站 · 资源站', mastery: 41 },
  { id: 'tutor', station: 3, title: '到站 · 辅导站', mastery: 48 },
  { id: 'eval', station: 4, title: '到站 · 评估站', mastery: 61 },
  { id: 'loop', station: 5, title: '闭环回站', desc: '评估反馈回写画像,明日路径已更新', mastery: 61 },
]

const beat = ref(0)
const revealed = ref(0)
const done = ref(false)
let timer: ReturnType<typeof setInterval> | null = null
let revealTimer: ReturnType<typeof setInterval> | null = null

const curBeat = computed(() => TF_BEATS[beat.value])
const sIdx = computed(() => curBeat.value.station)
const station = computed(() => {
  const i = sIdx.value
  return i >= 0 && i < TF_STATIONS.length ? TF_STATIONS[i] : null
})
const nextStation = computed(() => {
  const i = sIdx.value
  return station.value && i + 1 < TF_STATIONS.length ? TF_STATIONS[i + 1] : null
})
const accent = computed(() => station.value ? station.value.color : (curBeat.value.id === 'loop' ? TF.emerald : TF.cyan))

function startTimer() {
  if (props.activeBeatId) return
  stopTimer()
  timer = setInterval(() => {
    beat.value = (beat.value + 1) % TF_BEATS.length
  }, 3400)
}
function stopTimer() {
  if (timer) { clearInterval(timer); timer = null }
}

watch(beat, () => {
  if (revealTimer) { clearInterval(revealTimer); revealTimer = null }
  revealed.value = 0
  done.value = false
  if (!station.value) return
  let i = 0
  revealTimer = setInterval(() => {
    i++; revealed.value = i
    if (i >= station.value!.think.length) {
      if (revealTimer) { clearInterval(revealTimer); revealTimer = null }
      setTimeout(() => done.value = true, 360)
    }
  }, 480)
})

watch(
  () => props.activeBeatId,
  (id) => {
    if (!id) {
      startTimer()
      return
    }
    stopTimer()
    const nextBeat = TF_BEATS.findIndex(item => item.id === id)
    if (nextBeat >= 0) beat.value = nextBeat
  },
  { immediate: true },
)

onMounted(() => {
  startTimer()
  if (!props.embeddedStageOnly) mountBlackhole()
})
onBeforeUnmount(() => {
  stopTimer()
  if (revealTimer) { clearInterval(revealTimer); revealTimer = null }
})

function onJump(b: number) {
  if (props.activeBeatId) return
  beat.value = b
}

// ====== 3D Scene helpers ======
const SCENE_W = 1320, SCENE_H = 500
const bridgeY = 372, baseY = 348, padX = 150
const sceneSpan = SCENE_W - padX * 2
function stationX(i: number) { return padX + (sceneSpan * i) / (TF_STATIONS.length - 1) }

const curStationIdx = computed(() => sIdx.value)
const loop = computed(() => curBeat.value.id === 'loop')
const podX = computed(() => {
  const cs = curStationIdx.value
  return cs < 0 ? padX - 64 : cs >= TF_STATIONS.length ? stationX(0) : stationX(cs)
})
const podColor = computed(() => {
  const cs = curStationIdx.value
  return (cs >= 0 && cs < TF_STATIONS.length) ? TF_STATIONS[cs].color : (loop.value ? TF.emerald : TF.cyan)
})

const stars = (() => {
  let s = 7; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
  return Array.from({ length: 70 }, () => ({ x: rnd() * SCENE_W, y: rnd() * 240, r: 0.4 + rnd() * 1.3, o: 0.1 + rnd() * 0.5, d: rnd() * 4 }))
})()

const streamParticles = (() => {
  let s = 91; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
  const cols = [TF.cyan, TF.purple, TF.blue, TF.cyan, TF.emerald]
  return Array.from({ length: 64 }, () => {
    const dur = 6 + rnd() * 10
    const long = rnd() < 0.32
    return { y: 30 + rnd() * (SCENE_H - 70), r: 0.6 + rnd() * 2.2, len: long ? 14 + rnd() * 26 : 0, col: cols[Math.floor(rnd() * cols.length)], o: 0.18 + rnd() * 0.55, dur, delay: -rnd() * dur }
  })
})()

// ====== Blackhole canvas ======
const bhHostRef = ref<HTMLElement | null>(null)

function mountBlackhole() {
  const host = bhHostRef.value
  if (!host) return
  const canvas = document.createElement('canvas')
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '0', pointerEvents: 'none', display: 'block', borderRadius: '18px' })
  host.insertBefore(canvas, host.firstChild)
  const ctx = canvas.getContext('2d')!
  let W: number, H: number, DPR: number, hole: { x: number; y: number; r: number }
  let animId = 0

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2)
    W = host!.clientWidth; H = host!.clientHeight || 1
    canvas.width = W * DPR; canvas.height = H * DPR
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    hole = { x: W * 0.8, y: H * 0.46, r: Math.max(48, Math.min(W, H) * 0.12) }
  }
  resize()
  const ro = new ResizeObserver(resize); ro.observe(host)

  const COLORS = [[0, 212, 255], [124, 58, 237], [59, 130, 246], [6, 214, 160], [236, 72, 153]]
  function pickColor() { const r = Math.random(); if (r < 0.5) return COLORS[0]; if (r < 0.78) return COLORS[1]; if (r < 0.92) return COLORS[2]; if (r < 0.97) return COLORS[3]; return COLORS[4] }
  const particles: any[] = []
  function count() { return Math.round(Math.min(360, Math.max(120, (W * H) / 2600))) }
  function spawn(scatter: boolean) {
    const c = pickColor(); const y = Math.random() * H; const x = scatter ? Math.random() * W * 0.6 : -16 - Math.random() * 60
    return { x, y, vx: 0.35 + Math.random() * 0.9, vy: (Math.random() - 0.5) * 0.3, r: 0.5 + Math.random() * 1.6, col: c, life: 0, maxLife: 500 + Math.random() * 600 }
  }
  for (let i = 0; i < count(); i++) particles.push(spawn(true))
  function reset(p: any) { Object.assign(p, spawn(false)) }

  function frame() {
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = 'rgba(5, 6, 16, 0.30)'; ctx.fillRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'lighter'
    const hx = hole.x, hy = hole.y, hr = hole.r
    while (particles.length < count()) particles.push(spawn(true))
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]; p.life++
      const dx = hx - p.x, dy = hy - p.y, dist = Math.hypot(dx, dy) || 0.001
      const g = Math.min(2.4, 1100 / (dist * dist)), nx = dx / dist, ny = dy / dist
      p.vx += nx * g; p.vy += ny * g
      const swirl = Math.min(2.0, 110 / dist); p.vx += -ny * swirl * 0.6; p.vy += nx * swirl * 0.6
      p.vx *= 0.975; p.vy *= 0.975; p.x += p.vx; p.y += p.vy
      if (dist < hr * 0.6 || p.x > W + 40 || p.y < -60 || p.y > H + 60 || p.life > p.maxLife) { reset(p); continue }
      const near = Math.max(0, 1 - dist / (hr * 6)), speed = Math.min(1, Math.hypot(p.vx, p.vy) / 6)
      const alpha = (0.16 + near * 0.6 + speed * 0.14) * 0.55, [cr, cg, cb] = p.col, rad = p.r * (1 + near * 1.5)
      ctx.beginPath(); ctx.fillStyle = `rgba(${cr},${cg},${cb},${Math.min(0.8, alpha)})`; ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill()
      if (near > 0.2) { ctx.strokeStyle = `rgba(${cr},${cg},${cb},${near * 0.4})`; ctx.lineWidth = rad * 0.8; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2); ctx.stroke() }
    }
    ctx.globalCompositeOperation = 'source-over'
    const ringGrad = ctx.createRadialGradient(hx, hy, hr * 0.5, hx, hy, hr * 2.4)
    ringGrad.addColorStop(0, 'rgba(0,212,255,0.0)'); ringGrad.addColorStop(0.55, 'rgba(0,212,255,0.05)'); ringGrad.addColorStop(0.72, 'rgba(124,58,237,0.08)'); ringGrad.addColorStop(1, 'rgba(124,58,237,0)')
    ctx.fillStyle = ringGrad; ctx.beginPath(); ctx.arc(hx, hy, hr * 2.4, 0, Math.PI * 2); ctx.fill()
    ctx.globalCompositeOperation = 'lighter'
    const t = performance.now() * 0.0006; ctx.lineWidth = 1.6
    const photon = ctx.createLinearGradient(hx - hr, hy, hx + hr, hy)
    photon.addColorStop(0, 'rgba(0,212,255,0.24)'); photon.addColorStop(0.5, 'rgba(190,230,255,0.42)'); photon.addColorStop(1, 'rgba(124,58,237,0.24)')
    ctx.strokeStyle = photon; ctx.beginPath(); ctx.ellipse(hx, hy, hr * 1.04, hr * 1.02, 0, 0, Math.PI * 2); ctx.stroke()
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.strokeStyle = `rgba(${k === 1 ? '124,58,237' : '0,212,255'},${0.09 - k * 0.022})`; ctx.lineWidth = 1; ctx.ellipse(hx, hy, hr * (1.18 + k * 0.22), hr * (1.1 + k * 0.2), t * (1 + k * 0.3), 0, Math.PI * 1.6); ctx.stroke() }
    ctx.globalCompositeOperation = 'source-over'
    const core = ctx.createRadialGradient(hx, hy, hr * 0.2, hx, hy, hr)
    core.addColorStop(0, 'rgba(0,0,0,1)'); core.addColorStop(0.7, 'rgba(0,0,0,1)'); core.addColorStop(0.92, 'rgba(3,4,12,0.82)'); core.addColorStop(1, 'rgba(5,6,16,0)')
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill()
    animId = requestAnimationFrame(frame)
  }
  animId = requestAnimationFrame(frame)

  onBeforeUnmount(() => { cancelAnimationFrame(animId); ro.disconnect() })
}

// ====== Agent Stage helpers ======
const contrib = [
  { id: 'profile', from: 32, to: 35 },
  { id: 'path', from: 35, to: 35 },
  { id: 'resource', from: 35, to: 41 },
  { id: 'tutor', from: 41, to: 48 },
  { id: 'eval', from: 48, to: 61 },
]
</script>

<template>
  <div class="trainflow-page" :class="{ 'stage-only': embeddedStageOnly }">
    <div v-if="!embeddedStageOnly" class="tf-bg-grid" />

    <div class="tf-container">
      <header v-if="!embeddedStageOnly" class="tf-header">
        <div>
          <div class="tf-badge">
            <span class="tf-badge-dot" />
            协同列车
          </div>
          <h1 class="tf-title">六个模块协同,化解一次学习卡顿</h1>
          <p class="tf-subtitle">
    任务搭上协同列车,逐站停靠 — 7 个核心智能体在 6 个模块里<span class="tf-highlight">思考 → 产出 → 把上下文交给下一个</span>,最后闭环回写画像。
          </p>
        </div>
      </header>

      <div v-if="!embeddedStageOnly" class="tf-status-strip" :style="{ borderColor: accent + '44' }">
        <span class="tf-step" :style="{ color: accent }">{{ beat + 1 }}/{{ TF_BEATS.length }}</span>
        <span class="tf-beat-title">{{ curBeat.title }}</span>
        <span v-if="curBeat.desc" class="tf-beat-desc">· {{ curBeat.desc }}</span>
        <div class="tf-mastery-right">
          <span class="tf-mastery-label">掌握度</span>
          <span class="tf-mastery-value" :style="{ color: curBeat.mastery >= 50 ? TF.emerald : TF.cyan }">{{ curBeat.mastery }}%</span>
          <span v-if="curBeat.id === 'loop'" class="tf-mastery-gain">+29 全程</span>
        </div>
      </div>

      <!-- 3D Scene -->
      <div v-if="!embeddedStageOnly" ref="bhHostRef" class="tf-scene-host">
        <div class="tf-scene-inner">
          <svg :viewBox="`0 0 ${SCENE_W} ${SCENE_H}`" class="tf-scene-svg">
            <defs>
              <linearGradient id="s3-front" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#101a36" /><stop offset="100%" stop-color="#070d1e" />
              </linearGradient>
              <linearGradient id="s3-dome" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="rgba(255,255,255,0.25)" /><stop offset="60%" :stop-color="tfHexA(TF.purple, 0.4)" /><stop offset="100%" :stop-color="tfHexA(TF.purple, 0.15)" />
              </linearGradient>
              <linearGradient id="s3-cone" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" :stop-color="tfHexA(TF.amber, 0.5)" /><stop offset="100%" :stop-color="tfHexA(TF.amber, 0)" />
              </linearGradient>
              <radialGradient id="s3-pod" cx="40%" cy="35%" r="70%">
                <stop offset="0%" stop-color="#1a2a4d" /><stop offset="100%" stop-color="#0a1126" />
              </radialGradient>
              <radialGradient id="s3-horizon" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="rgba(0,212,255,0.12)" /><stop offset="100%" stop-color="rgba(0,212,255,0)" />
              </radialGradient>
            </defs>

            <rect x="0" y="0" :width="SCENE_W" :height="SCENE_H" fill="rgba(5,6,16,0.34)" />
            <circle v-for="(s, i) in stars" :key="'star-'+i" :cx="s.x" :cy="s.y" :r="s.r" fill="#fff" :opacity="s.o * 0.7" :style="{ animation: `tf-twinkle ${3 + (i % 4)}s ease-in-out ${s.d}s infinite` }" />

            <g style="mix-blend-mode: screen">
              <g v-for="(p, i) in streamParticles" :key="'sp-'+i" class="s3-stream" :style="{ animation: `s3-stream ${p.dur}s linear ${p.delay}s infinite` }">
                <rect v-if="p.len > 0" x="0" :y="p.y - p.r" :width="p.len" :height="p.r * 2" :rx="p.r" :fill="p.col" :opacity="p.o" :style="{ filter: `drop-shadow(0 0 ${p.r * 2.5}px ${p.col})` }" />
                <circle v-else cx="0" :cy="p.y" :r="p.r" :fill="p.col" :opacity="p.o" :style="{ filter: `drop-shadow(0 0 ${p.r * 2.5}px ${p.col})` }" />
              </g>
            </g>

            <ellipse :cx="SCENE_W / 2" :cy="bridgeY - 6" :rx="SCENE_W * 0.5" ry="120" fill="url(#s3-horizon)" />

            <g opacity="0.5">
              <line v-for="i in 17" :key="'fl-'+i" :x1="SCENE_W / 2" :y1="64" :x2="(i - 1) / 16 * (SCENE_W + 600) - 300" :y2="bridgeY + 110" stroke="rgba(90,140,210,0.1)" stroke-width="0.7" />
              <line v-for="i in 5" :key="'fh-'+i" x1="0" :y1="bridgeY + 8 + Math.pow((i - 1) / 4, 1.7) * 100" :x2="SCENE_W" :y2="bridgeY + 8 + Math.pow((i - 1) / 4, 1.7) * 100" stroke="rgba(90,140,210,0.09)" stroke-width="0.7" />
            </g>

            <!-- feedback loop -->
            <path :d="`M ${stationX(4)} ${bridgeY + 6} C ${stationX(4) + 40} ${bridgeY + 92}, ${stationX(0) - 40} ${bridgeY + 92}, ${stationX(0)} ${bridgeY + 6}`" fill="none" :stroke="loop ? TF.emerald : 'rgba(110,150,210,0.18)'" :stroke-width="loop ? 2.2 : 1.3" :stroke-opacity="loop ? 0.8 : 0.4" stroke-dasharray="7 6" />
            <text :x="SCENE_W / 2" :y="bridgeY + 92 + 18" text-anchor="middle" font-size="11" :font-family="TF.mono" :fill="loop ? TF.emerald : TF.textTri" letter-spacing="0.16em">↺ 评估反馈回写画像 · 闭环</text>

            <!-- light bridge -->
            <rect :x="padX - 80" :y="bridgeY" :width="sceneSpan + 160" height="6" rx="3" fill="rgba(120,160,220,0.18)" />
            <rect :x="padX - 80" :y="bridgeY" :width="Math.max(0, podX - (padX - 80))" height="6" rx="3" :fill="TF.cyan" opacity="0.5" style="transition: width 1.15s cubic-bezier(.45,0,.25,1)" />
            <line :x1="padX - 80" :y1="bridgeY + 3" :x2="padX + sceneSpan + 80" :y2="bridgeY + 3" :stroke="TF.cyan" stroke-width="1" stroke-opacity="0.35" stroke-dasharray="2 14" style="animation: tf-dash 1s linear infinite" />

            <!-- ground glow -->
            <ellipse v-for="(s, i) in TF_STATIONS" :key="'gg-'+s.id" :cx="stationX(i)" :cy="bridgeY + 30" :rx="curStationIdx === i ? 80 : 60" :ry="curStationIdx === i ? 24 : 16" :fill="s.color" :opacity="curStationIdx === i ? 0.16 : 0.06" style="filter: blur(8px); transition: all .4s ease" />

            <!-- stations -->
            <g v-for="(s, i) in TF_STATIONS" :key="s.id" style="cursor: pointer" @click="onJump(i + 1)">
              <g :opacity="curStationIdx === i ? 1 : curStationIdx > i ? 0.82 : 0.6" style="transition: opacity .4s ease">
                <!-- Profile dome -->
                <template v-if="s.id === 'profile'">
                  <ellipse v-if="curStationIdx === i" v-for="j in 2" :key="'scan-'+j" class="s3-scanring" :cx="stationX(i)" :cy="baseY - 30" rx="52" ry="15" fill="none" :stroke="s.color" stroke-width="1.5" :style="{ animation: `s3-scan 2.4s ease-out ${j * 1.2}s infinite` }" />
                  <ellipse :cx="stationX(i)" :cy="baseY" rx="42" ry="13" :fill="tfHexA(s.color, 0.12)" :stroke="tfHexA(s.color, 0.5)" stroke-width="1.2" />
                  <path :d="`M ${stationX(i) - 38} ${baseY} A 38 50 0 0 1 ${stationX(i) + 38} ${baseY} Z`" fill="url(#s3-dome)" :stroke="tfHexA(s.color, 0.7)" stroke-width="1.3" />
                  <line :x1="stationX(i)" :y1="baseY - 50" :x2="stationX(i)" :y2="baseY - 70" :stroke="s.color" stroke-width="1.5" />
                  <circle :cx="stationX(i)" :cy="baseY - 74" r="6" :fill="tfHexA(s.color, 0.25)" :stroke="s.color" stroke-width="1.4" :style="{ filter: `drop-shadow(0 0 8px ${s.color})`, animation: curStationIdx === i ? 'tf-pulse 1.4s ease-in-out infinite' : 'none' }" />
                  <text :x="stationX(i)" :y="baseY - 70.5" text-anchor="middle" font-size="9" :fill="s.color">◉</text>
                </template>
                <!-- Path crystal -->
                <template v-if="s.id === 'path'">
                  <polygon :points="`${stationX(i)},${baseY - 124} ${stationX(i) - 26},${baseY - 70} ${stationX(i)},${baseY - 8}`" :fill="tfHexA(s.color, 0.5)" :stroke="tfHexA(s.color, 0.8)" stroke-width="1.2" />
                  <polygon :points="`${stationX(i)},${baseY - 124} ${stationX(i) + 26},${baseY - 70} ${stationX(i)},${baseY - 8}`" :fill="tfHexA(s.color, 0.28)" :stroke="tfHexA(s.color, 0.8)" stroke-width="1.2" />
                  <circle :cx="stationX(i)" :cy="baseY - 70" :r="curStationIdx === i ? 7 : 5" fill="#fff" :opacity="curStationIdx === i ? 0.9 : 0.5" :style="{ filter: `drop-shadow(0 0 10px ${s.color})`, animation: curStationIdx === i ? 's3-flicker 1.6s ease-in-out infinite' : 'none' }" />
                  <text :x="stationX(i)" :y="baseY - 66.5" text-anchor="middle" font-size="10" :fill="s.color">◈</text>
                  <ellipse :cx="stationX(i)" :cy="baseY" rx="36" ry="11" :fill="tfHexA(s.color, 0.12)" :stroke="tfHexA(s.color, 0.5)" stroke-width="1.1" />
                </template>
                <!-- Resource vault -->
                <template v-if="s.id === 'resource'">
                  <ellipse :cx="stationX(i)" :cy="baseY + 2" rx="46" ry="13" :fill="tfHexA(s.color, 0.1)" :stroke="tfHexA(s.color, 0.4)" stroke-width="1" />
                  <rect v-for="j in 3" :key="'cube-'+j" :x="stationX(i) + [-22, 20, -1][j-1] - 17" :y="baseY + [-2, -2, -40][j-1]" width="34" :height="34" fill="url(#s3-front)" :stroke="tfHexA(s.color, 0.65)" stroke-width="1" />
                  <text :x="stationX(i) - 1" :y="baseY - 40 - 12" text-anchor="middle" font-size="11" :fill="s.color" :style="{ filter: `drop-shadow(0 0 6px ${s.color})` }">◬</text>
                </template>
                <!-- Tutor beacon -->
                <template v-if="s.id === 'tutor'">
                  <ellipse :cx="stationX(i)" :cy="baseY" rx="34" ry="11" :fill="tfHexA(s.color, 0.18)" :stroke="tfHexA(s.color, 0.6)" stroke-width="1.2" />
                  <ellipse :cx="stationX(i)" :cy="baseY - 4" rx="20" ry="6.5" :fill="tfHexA(s.color, 0.4)" :stroke="s.color" stroke-width="1" :style="{ filter: `drop-shadow(0 0 8px ${s.color})` }" />
                  <polygon :points="`${stationX(i) - 14},${baseY - 6} ${stationX(i) + 14},${baseY - 6} ${stationX(i) + 40},${baseY - 116} ${stationX(i) - 40},${baseY - 116}`" fill="url(#s3-cone)" :opacity="curStationIdx === i ? 0.9 : 0.5" />
                  <text :x="stationX(i)" :y="baseY - 60" text-anchor="middle" font-size="11" fill="#fff" opacity="0.95">◊</text>
                </template>
                <!-- Eval gate -->
                <template v-if="s.id === 'eval'">
                  <ellipse :cx="stationX(i)" :cy="baseY + 2" rx="44" ry="12" :fill="tfHexA(s.color, 0.1)" :stroke="tfHexA(s.color, 0.4)" stroke-width="1" />
                  <rect v-for="dir in [-1, 1]" :key="'pillar-'+dir" :x="stationX(i) + dir * 28 - 6" :y="baseY - 96" width="12" :height="96" fill="url(#s3-front)" :stroke="tfHexA(s.color, 0.65)" stroke-width="1.1" />
                  <rect :x="stationX(i) - 34" :y="baseY - 108" width="68" height="12" rx="2" :fill="tfHexA(s.color, 0.25)" :stroke="tfHexA(s.color, 0.7)" stroke-width="1.2" />
                  <text :x="stationX(i)" :y="baseY - 112" text-anchor="middle" font-size="11" :fill="s.color" :style="{ filter: `drop-shadow(0 0 6px ${s.color})` }">◆</text>
                  <circle :cx="stationX(i)" :cy="baseY - 52" r="20" fill="rgba(8,12,28,0.85)" :stroke="tfHexA(s.color, 0.3)" stroke-width="2" />
                  <circle :cx="stationX(i)" :cy="baseY - 52" r="20" fill="none" :stroke="s.color" stroke-width="2.5" :stroke-dasharray="`${2 * Math.PI * 20 * 0.78} ${2 * Math.PI * 20}`" stroke-linecap="round" :transform="`rotate(-90 ${stationX(i)} ${baseY - 52})`" :style="{ filter: `drop-shadow(0 0 6px ${s.color})` }" />
                  <text :x="stationX(i)" :y="baseY - 47" text-anchor="middle" font-size="13" fill="#fff" :font-family="TF.serif">✓</text>
                </template>
              </g>

              <!-- pedestal -->
              <rect :x="stationX(i) - 60" :y="baseY" width="120" height="28" fill="url(#s3-front)" :stroke="tfHexA(s.color, curStationIdx === i ? 0.85 : 0.42)" stroke-width="1.2" />
              <rect :x="stationX(i) - 60" :y="baseY" width="120" height="3" :fill="s.color" :opacity="curStationIdx === i ? 1 : 0.55" />

              <!-- bridge marker -->
              <circle :cx="stationX(i)" :cy="bridgeY + 3" :r="curStationIdx === i ? 7 : 5" :fill="curStationIdx === i ? s.color : curStationIdx > i ? tfHexA(s.color, 0.5) : TF.ink" :stroke="s.color" stroke-width="1.4" :style="{ filter: curStationIdx === i ? `drop-shadow(0 0 8px ${s.color})` : 'none' }" />

              <!-- labels -->
              <text :x="stationX(i)" :y="bridgeY + 56" text-anchor="middle" font-size="9" :font-family="TF.mono" :fill="s.color" letter-spacing="0.12em">0{{ i + 1 }}</text>
              <text :x="stationX(i)" :y="bridgeY + 74" text-anchor="middle" font-size="14" :font-family="TF.serif" fill="#fff">{{ s.name }}</text>
              <text :x="stationX(i)" :y="bridgeY + 90" text-anchor="middle" font-size="9.5" :font-family="TF.mono" :fill="curStationIdx === i ? s.color : curStationIdx > i ? TF.emerald : TF.textTri">
                {{ curStationIdx === i ? '● 思考中…' : curStationIdx > i ? `✓ 掌握 ${s.mastery}%` : '○ 待到站' }}
              </text>
            </g>

            <!-- energy pod -->
            <g :style="{ transform: `translate(${podX}px, ${bridgeY + 3}px)`, transition: 'transform 1.15s cubic-bezier(.45,0,.25,1)' }">
              <ellipse cx="0" cy="10" rx="30" ry="7" :fill="podColor" opacity="0.4" style="filter: blur(6px)" />
              <g style="animation: s3-hover 2s ease-in-out infinite">
                <polygon points="-22,0 -12,-9 16,-9 24,0 16,9 -12,9" fill="url(#s3-pod)" :stroke="podColor" stroke-width="1.6" :style="{ filter: `drop-shadow(0 0 14px ${podColor})` }" />
                <circle cx="2" cy="0" r="4.5" fill="#fff" :style="{ filter: `drop-shadow(0 0 6px ${podColor})` }" />
                <circle cx="20" cy="0" r="2.5" :fill="TF.gold" :style="{ filter: `drop-shadow(0 0 5px ${TF.gold})` }" />
              </g>
            </g>

            <text x="28" y="34" font-size="10" :font-family="TF.mono" :fill="TF.textTri" letter-spacing="0.2em">◇ 协同站台 · 点击站台可跳转</text>
          </svg>
        </div>
      </div>

      <!-- Agent Stage -->
      <!-- Depart state -->
      <div v-if="!station && curBeat.id === 'depart'" class="agent-stage" :style="{ borderColor: tfHexA(TF.cyan, 0.32), background: `radial-gradient(ellipse 600px 460px at 22% 22%, ${tfHexA(TF.rose, 0.12)}, transparent 60%), radial-gradient(ellipse 620px 480px at 90% 80%, ${tfHexA(TF.cyan, 0.12)}, transparent 60%), linear-gradient(155deg, rgba(11,16,38,0.85), rgba(6,8,20,0.7))` }">
        <div class="stage-accent-top" :style="{ background: `linear-gradient(90deg, ${TF.rose}, ${TF.cyan} 60%, transparent)` }" />
        <div class="stage-grid-2">
          <div class="stage-left">
            <div class="stage-status-row">
              <span class="stage-dot" :style="{ background: TF.rose, boxShadow: `0 0 8px ${TF.rose}` }" />
              <span class="stage-role" :style="{ color: TF.rose }">检测到学习卡顿</span>
            </div>
            <div class="stage-agent-name">生成补救任务</div>
            <div class="stage-work-order">
              <div class="work-order-head">
                <span class="work-order-id">任务 #LG-2261</span>
                <span class="work-order-risk">高风险</span>
              </div>
              <div class="work-order-body">
                <div v-for="([k, v], i) in [['知识点', '拉格朗日基础 · 约束极值'], ['来源课程', '《最优化方法》OPT-104'], ['卡顿证据', '连续 2 次停留 >10min · 错题 2'], ['当前掌握', '32% · 标记薄弱']]" :key="i" class="work-order-row">
                  <span class="work-order-key">{{ k }}</span>
                  <span class="work-order-val" :style="{ color: i === 3 ? TF.rose : TF.text }">{{ v }}</span>
                </div>
              </div>
            </div>
            <div class="stage-depart-hint">
              <span class="depart-icon" :style="{ background: tfHexA(TF.cyan, 0.12), borderColor: tfHexA(TF.cyan, 0.4), color: TF.cyan }">↳</span>
              任务已封装，即将逐站接力处理
            </div>
          </div>
          <div class="stage-right">
              <div class="standby-label">6 个模块、7 个核心智能体已就绪</div>
            <div class="standby-track">
              <div class="standby-rail" />
              <div class="standby-rail-dash" />
              <div v-for="(st, i) in TF_STATIONS" :key="st.id" class="standby-agent">
                <div class="standby-glyph" :style="{ background: `radial-gradient(circle at 35% 35%, ${tfHexA(st.color, 0.5)}, ${tfHexA(st.color, 0.12)})`, borderColor: tfHexA(st.color, 0.7), color: st.color, boxShadow: `0 0 16px ${tfHexA(st.color, 0.4)}`, animation: `tf-standby ${1.6 + i * 0.2}s ease-in-out ${i * 0.15}s infinite` }">
                  {{ st.glyph }}
                </div>
                <div class="standby-name">{{ st.name.replace('智能体', '') }}</div>
                <div class="standby-code" :style="{ color: st.color }">0{{ i + 1 }}</div>
              </div>
            </div>
            <div class="depart-banner" :style="{ background: `linear-gradient(90deg, ${tfHexA(TF.cyan, 0.12)}, transparent)`, borderColor: tfHexA(TF.cyan, 0.3) }">
              <span class="depart-emoji">🚄</span>
              <div>
                <div class="depart-title">协同列车发车</div>
                <div class="depart-sub">第一站:画像智能体 · 重新评估薄弱维度</div>
              </div>
              <span class="depart-arrow" :style="{ color: TF.cyan }">▶</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Loop state -->
      <div v-else-if="!station && curBeat.id === 'loop'" class="agent-stage" :style="{ borderColor: tfHexA(TF.emerald, 0.34), background: `radial-gradient(ellipse 680px 460px at 26% 18%, ${tfHexA(TF.emerald, 0.18)}, transparent 60%), radial-gradient(ellipse 520px 420px at 92% 96%, ${tfHexA(TF.cyan, 0.1)}, transparent 60%), linear-gradient(155deg, rgba(8,20,18,0.85), rgba(6,8,20,0.7))` }">
        <div class="stage-accent-top" :style="{ background: `linear-gradient(90deg, ${TF.emerald}, transparent 70%)` }" />
        <div class="stage-grid-2">
          <div class="stage-left">
            <div class="stage-status-row">
              <span class="stage-dot" :style="{ background: TF.emerald, boxShadow: `0 0 8px ${TF.emerald}` }" />
              <span class="stage-role" :style="{ color: TF.emerald }">闭环完成</span>
            </div>
            <div class="stage-agent-name">评估反馈已回写画像</div>
            <div class="loop-desc">
              6 个模块、7 个核心智能体一次接力,把<span style="color: #fff">「拉格朗日基础」</span>从薄弱拉到可用,明日学习路径已自动优化。
            </div>
            <div class="loop-leap" :style="{ background: `linear-gradient(135deg, ${tfHexA(TF.emerald, 0.12)}, ${tfHexA(TF.cyan, 0.06)})`, borderColor: tfHexA(TF.emerald, 0.3) }">
              <div class="leap-label">知识点掌握度 · 全程跃迁</div>
              <div class="leap-nums">
                <span class="leap-from">32%</span>
                <span class="leap-arrow" :style="{ color: TF.emerald }">→</span>
                <span class="leap-to" :style="{ color: TF.emerald, textShadow: `0 0 28px ${tfHexA(TF.emerald, 0.5)}` }">61</span>
                <span class="leap-pct">%</span>
                <span class="leap-gain" :style="{ color: TF.emerald, background: tfHexA(TF.emerald, 0.12) }">+29</span>
              </div>
              <div class="leap-bar-track">
                <div class="leap-bar-fill" :style="{ background: `linear-gradient(90deg, ${TF.blue}, ${TF.emerald})`, boxShadow: `0 0 12px ${tfHexA(TF.emerald, 0.6)}` }" />
              </div>
            </div>
          </div>
          <div class="stage-right">
            <div class="contrib-label">5 站贡献链</div>
            <div class="contrib-bars">
              <div v-for="(cb, i) in contrib" :key="cb.id" class="contrib-col">
                <div class="contrib-gain" :style="{ color: cb.to - cb.from > 0 ? TF_STATIONS[i].color : TF.textTri }">{{ cb.to - cb.from > 0 ? `+${cb.to - cb.from}` : '·' }}</div>
                <div class="contrib-bar-track">
                  <div class="contrib-bar-fill" :style="{ height: `${cb.to}%`, background: `linear-gradient(180deg, ${tfHexA(TF_STATIONS[i].color, 0.85)}, ${tfHexA(TF_STATIONS[i].color, 0.25)})`, borderTop: `2px solid ${TF_STATIONS[i].color}`, boxShadow: `0 0 14px ${tfHexA(TF_STATIONS[i].color, 0.5)}` }" />
                  <div class="contrib-bar-marker" :style="{ bottom: `${cb.from}%` }" />
                </div>
                <div class="contrib-val">{{ cb.to }}%</div>
                <div class="contrib-name" :style="{ color: TF_STATIONS[i].color }">{{ TF_STATIONS[i].name.replace('智能体', '') }}</div>
              </div>
            </div>
            <div class="writeback-strip" :style="{ background: `linear-gradient(90deg, ${tfHexA(TF.rose, 0.08)}, ${tfHexA(TF.purple, 0.1)})`, borderColor: tfHexA(TF.purple, 0.3) }">
              <span class="writeback-glyph" :style="{ filter: `drop-shadow(0 0 8px ${TF.purple})` }">◉</span>
              <div class="writeback-text">
                <div class="writeback-label" :style="{ color: TF.purple }">回写画像</div>
                <div class="writeback-desc">评估结果已反向更新画像 4 个维度,触发明日路径重排</div>
              </div>
              <div class="writeback-dots">
                <span v-for="(dc, i) in [TF.rose, TF.amber, TF.cyan, TF.purple]" :key="i" class="wb-dot" :style="{ background: dc, boxShadow: `0 0 8px ${dc}`, animation: `tf-pulse ${1.2 + i * 0.25}s ease-in-out infinite` }" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Active agent stage -->
      <div v-else-if="station" class="agent-stage" :style="{ borderColor: tfHexA(station.color, 0.32), background: `radial-gradient(ellipse 600px 500px at 88% 50%, ${tfHexA(station.color, 0.2)}, transparent 55%), radial-gradient(ellipse 500px 400px at 8% 8%, ${tfHexA(station.color, 0.1)}, transparent 60%), linear-gradient(155deg, rgba(11,16,38,0.85), rgba(6,8,20,0.7))`, transition: 'all 0.6s ease' }">
        <div class="stage-accent-top" :style="{ background: `linear-gradient(90deg, ${station.color}, transparent 70%)` }" />
        <div class="stage-watermark" :style="{ color: station.color }">{{ station.glyph }}</div>
        <div class="stage-grid-2">
          <div class="stage-left">
            <div class="stage-status-row">
              <span class="stage-dot" :style="{ background: done ? TF.emerald : station.color, boxShadow: `0 0 8px ${done ? TF.emerald : station.color}` }" />
              <span class="stage-role" :style="{ color: done ? TF.emerald : station.color }">{{ done ? '已完成' : '思考中' }}</span>
            </div>
            <div class="stage-agent-name">{{ station.name }}</div>
            <div class="stage-beat-info">第 {{ sIdx + 1 }} / 6 模块 · {{ station.station }}</div>

            <div class="mastery-section">
              <div class="mastery-label">知识点掌握度</div>
              <div class="mastery-big-row">
                <span class="mastery-big" :style="{ color: station.color, textShadow: `0 0 30px ${tfHexA(station.color, 0.5)}` }">{{ station.mastery }}</span>
                <span class="mastery-pct">%</span>
              </div>
              <div class="mastery-bar-track">
                <div class="mastery-bar-fill" :style="{ width: `${station.mastery}%`, background: `linear-gradient(90deg, ${TF.blue}, ${station.color})`, boxShadow: `0 0 12px ${tfHexA(station.color, 0.6)}` }" />
              </div>
              <div class="mastery-result" :style="{ borderLeftColor: station.color }">{{ station.result }}</div>
            </div>
          </div>

          <div class="stage-right">
            <div class="thinking-thread">
              <div v-for="(t, i) in station.think" :key="i" class="think-step" :style="{ opacity: i < revealed ? 1 : 0.28, transform: i < revealed ? 'translateX(0)' : 'translateX(-8px)', transition: 'all 0.45s ease' }">
                <div v-if="i < station.think.length - 1" class="think-connector" :style="{ background: i < revealed ? `linear-gradient(${station.color}, ${tfHexA(station.color, 0.2)})` : 'rgba(255,255,255,0.06)' }" />
                <div class="think-node" :style="{ background: i < revealed ? tfHexA(station.color, 0.16) : 'rgba(255,255,255,0.03)', borderColor: i < revealed ? station.color : 'rgba(255,255,255,0.12)', boxShadow: i < revealed && i === revealed - 1 && !done ? `0 0 14px ${station.color}` : 'none' }">
                  <span :style="i < revealed && i === revealed - 1 && !done ? { animation: 'tf-pulse 0.7s ease-in-out infinite' } : undefined">{{ t.icon }}</span>
                </div>
                <div class="think-content">
                  <div class="think-text-row">
                    <span class="think-text" :style="{ color: i < revealed ? TF.text : TF.textTri }">{{ t.text }}</span>
                    <span v-if="i < revealed" class="think-check" :style="{ color: TF.emerald }">✓</span>
                  </div>
                  <div v-if="i < revealed" class="think-detail">{{ t.detail }}</div>
                </div>
              </div>
            </div>

            <div class="courses-section">
              <div class="courses-label">引用课程</div>
              <div class="courses-list">
                <div v-for="(co, i) in station.courses" :key="i" class="course-chip" :style="{ opacity: revealed > 0 ? 1 : 0.3, transform: revealed > 0 ? 'translateY(0)' : 'translateY(6px)', transition: `all 0.5s ease ${0.1 + i * 0.12}s`, borderColor: tfHexA(station.color, 0.25) }">
                  <span class="course-code" :style="{ color: station.color, background: tfHexA(station.color, 0.12) }">{{ co.code }}</span>
                  <span class="course-name">{{ co.name }}</span>
                  <span class="course-tag">{{ co.tag }}</span>
                </div>
              </div>
            </div>

            <div class="handoff-strip" :style="{ background: `linear-gradient(90deg, ${tfHexA(station.color, 0.04)}, ${tfHexA(nextStation ? nextStation.color : TF.emerald, 0.1)})`, borderColor: tfHexA(station.color, 0.25), opacity: done ? 1 : 0.45 }">
              <div class="handoff-output">
                <div class="handoff-label" :style="{ color: station.color }">本站产出</div>
                <div class="handoff-items">
                  <span v-for="(it, i) in station.outputCtx.items" :key="i" class="handoff-item" :style="{ background: tfHexA(station.color, 0.1) }">{{ it }}</span>
                </div>
              </div>
              <div class="handoff-arrow-area">
                <div class="handoff-line" :style="{ background: done ? `linear-gradient(90deg, ${station.color}, ${nextStation ? nextStation.color : TF.emerald})` : 'rgba(255,255,255,0.1)' }" />
                <span class="handoff-arrow" :style="{ color: nextStation ? nextStation.color : TF.emerald }">▶</span>
              </div>
              <div class="handoff-next">
                <div class="handoff-next-label">交接给</div>
                <div class="handoff-next-name" :style="{ color: nextStation ? nextStation.color : TF.emerald }">{{ nextStation ? nextStation.name : '画像智能体 · 闭环' }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes tf-dash { to { stroke-dashoffset: -100; } }
@keyframes tf-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
@keyframes tf-twinkle { 0%,100% { opacity: 0.25; } 50% { opacity: 1; } }
@keyframes tf-standby { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes s3-scan { 0%{transform:scale(.32);opacity:.85} 100%{transform:scale(1.5);opacity:0} }
@keyframes s3-flicker { 0%,100%{opacity:.9} 50%{opacity:.55} }
@keyframes s3-hover { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
@keyframes s3-stream { from{transform:translateX(-80px)} to{transform:translateX(1400px)} }
.s3-scanring { transform-box: fill-box; transform-origin: center; }
.s3-stream { will-change: transform; }

.trainflow-page {
  position: relative;
  z-index: 1;
  background: radial-gradient(ellipse 1100px 600px at 50% -8%, rgba(0,212,255,0.04), transparent 55%), transparent;
  font-family: 'Outfit','PingFang SC',sans-serif;
  color: #eaf2ff;
  padding: 0 36px 40px;
}

.trainflow-page.stage-only {
  padding: 0 36px 52px;
  background: transparent;
}

.trainflow-page.stage-only .agent-stage {
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
}

.tf-bg-grid {
  position: fixed; inset: 0; opacity: 0.4; pointer-events: none; z-index: 0;
  background-image: linear-gradient(rgba(0,212,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,0.03) 1px,transparent 1px);
  background-size: 46px 46px;
  mask-image: radial-gradient(ellipse at 50% 40%, black 30%, transparent 85%);
}
.tf-container { position: relative; z-index: 1; max-width: 1480px; margin: 0 auto; }
.tf-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 20px; }
.tf-badge {
  display: inline-flex; align-items: center; gap: 8px; padding: 4px 13px; border-radius: 100px;
  background: rgba(0,212,255,0.08); border: 1px solid rgba(0,212,255,0.19); font-size: 11px; color: #00d4ff; margin-bottom: 12px;
}
.tf-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #00d4ff; box-shadow: 0 0 8px #00d4ff; animation: tf-pulse 1.5s ease-in-out infinite; }
.tf-title {
  margin: 0;
  font-family: 'Instrument Serif','Noto Serif SC',serif;
  font-size: 38px;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.05;
  background: linear-gradient(135deg, #fff 30%, #00d4ff 70%, #7c3aed);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.tf-subtitle { margin: 8px 0 0; font-size: 14px; color: #8da3c8; max-width: 680px; line-height: 1.6; }
.tf-highlight { color: #00d4ff; }
.tf-status-strip {
  display: flex; align-items: center; gap: 14px; padding: 11px 18px; border-radius: 12px;
  background: rgba(8,12,30,0.6); border: 1px solid rgba(120,160,220,0.12); margin-bottom: 18px;
}
.tf-step { font-size: 12px; font-family: 'Outfit','PingFang SC',sans-serif; letter-spacing: 0.04em; font-weight: 600; }
.tf-beat-title { font-size: 15px; font-family: 'Instrument Serif','Noto Serif SC',serif; color: #fff; }
.tf-beat-desc { font-size: 12.5px; color: #8da3c8; }
.tf-mastery-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.tf-mastery-label { font-size: 12px; color: #8da3c8; font-family: 'Outfit','PingFang SC',sans-serif; }
.tf-mastery-value { font-size: 20px; font-family: 'Instrument Serif','Noto Serif SC',serif; transition: color 0.4s; }
.tf-mastery-gain { font-size: 11px; color: #06d6a0; font-family: 'JetBrains Mono',monospace; }

.tf-scene-host {
  position: relative; background: linear-gradient(180deg, rgba(10,14,32,0.32), rgba(6,8,20,0.18));
  border: 1px solid rgba(120,160,220,0.12); border-radius: 18px; padding: 6px 8px; margin-bottom: 18px; overflow: hidden;
}
.tf-scene-inner { position: relative; z-index: 1; }
.tf-scene-svg { width: 100%; height: auto; display: block; }

.agent-stage {
  position: relative; min-height: 432px; border-radius: 16px; overflow: hidden;
  border: 1px solid rgba(120,160,220,0.12);
}
.stage-accent-top { position: absolute; top: 0; left: 0; right: 0; height: 3px; }
.stage-watermark {
  position: absolute; right: -40px; top: 50%; transform: translateY(-50%);
  font-size: 360px; line-height: 1; opacity: 0.07; font-family: 'Instrument Serif','Noto Serif SC',serif;
  pointer-events: none; user-select: none;
}
.stage-grid-2 { position: relative; display: grid; grid-template-columns: 300px 1fr; gap: 30px; padding: 30px; height: 100%; }
.stage-left { display: flex; flex-direction: column; }
.stage-right { display: flex; flex-direction: column; min-width: 0; }
.stage-status-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.stage-dot { width: 7px; height: 7px; border-radius: 50%; animation: tf-pulse 1.2s ease-in-out infinite; }
.stage-role { font-size: 12px; font-family: 'Outfit','PingFang SC',sans-serif; letter-spacing: 0.04em; font-weight: 500; }
.stage-agent-name {
  font-family: 'Instrument Serif','Noto Serif SC',serif;
  font-size: 32px;
  color: #fff;
  line-height: 1.12;
  margin-bottom: 6px;
  text-shadow: 0 0 40px rgba(0,212,255,0.25);
}
.stage-beat-info { font-size: 12.5px; color: #8da3c8; margin-bottom: auto; }

.stage-work-order { border-radius: 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(120,160,220,0.12); overflow: hidden; }
.work-order-head { padding: 10px 14px; border-bottom: 1px solid rgba(120,160,220,0.12); display: flex; align-items: center; justify-content: space-between; }
.work-order-id { font-size: 11px; font-family: 'Outfit','PingFang SC',sans-serif; color: #8da3c8; }
.work-order-risk { font-size: 9.5px; font-family: 'JetBrains Mono',monospace; color: #f43f5e; padding: 2px 8px; border-radius: 100px; background: rgba(244,63,94,0.12); border: 1px solid rgba(244,63,94,0.4); }
.work-order-body { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.work-order-row { display: flex; gap: 10px; font-size: 12px; }
.work-order-key { color: #8da3c8; min-width: 64px; font-family: 'Outfit','PingFang SC',sans-serif; font-size: 11px; padding-top: 1px; }
.work-order-val { flex: 1; }

.stage-depart-hint { margin-top: auto; padding-top: 18px; display: flex; align-items: center; gap: 10px; font-size: 12px; color: #8da3c8; }
.depart-icon { display: inline-flex; width: 26px; height: 26px; border-radius: 8px; border: 1px solid; align-items: center; justify-content: center; font-size: 13px; }

.standby-label { font-size: 11px; font-family: 'Outfit','PingFang SC',sans-serif; color: #8da3c8; margin-bottom: 18px; }
.standby-track { position: relative; display: flex; align-items: center; justify-content: space-between; padding: 0 6px; margin-bottom: 18px; }
.standby-rail { position: absolute; left: 18px; right: 18px; top: 50%; height: 2px; background: linear-gradient(90deg, rgba(0,212,255,0.6), rgba(124,58,237,0.4)); }
.standby-rail-dash { position: absolute; left: 18px; right: 18px; top: 50%; height: 2px; background: repeating-linear-gradient(90deg, #00d4ff 0 4px, transparent 4px 18px); opacity: 0.6; animation: tf-railflow 1s linear infinite; }
.standby-agent { position: relative; z-index: 1; text-align: center; }
.standby-glyph {
  width: 52px; height: 52px; border-radius: 14px; margin: 0 auto; display: flex; align-items: center; justify-content: center;
  border: 1.5px solid; font-size: 22px;
}
.standby-name { font-size: 10.5px; color: #fff; margin-top: 8px; }
.standby-code { font-size: 9px; font-family: 'Outfit','PingFang SC',sans-serif; letter-spacing: 0.04em; margin-top: 2px; }
@keyframes tf-railflow { to { background-position: 22px 0; } }

.depart-banner { display: flex; align-items: center; gap: 14px; padding: 14px 20px; border-radius: 16px; border: 1px solid; }
.depart-emoji { font-size: 24px; }
.depart-title { font-family: 'Instrument Serif','Noto Serif SC',serif; font-size: 18px; color: #fff; }
.depart-sub { font-size: 11.5px; color: #8da3c8; margin-top: 2px; }
.depart-arrow { font-size: 20px; animation: tf-pulse 1.2s ease-in-out infinite; }

.loop-desc { font-size: 12.5px; color: #8da3c8; line-height: 1.6; margin-bottom: auto; }
.loop-leap { margin-top: 22px; padding: 18px 20px; border-radius: 16px; border: 1px solid; }
.leap-label { font-size: 11px; font-family: 'Outfit','PingFang SC',sans-serif; color: #8da3c8; margin-bottom: 8px; }
.leap-nums { display: flex; align-items: flex-end; gap: 12px; }
.leap-from { font-family: 'Instrument Serif','Noto Serif SC',serif; font-size: 30px; color: #51648c; text-decoration: line-through; line-height: 1; }
.leap-arrow { font-size: 22px; margin-bottom: 3px; }
.leap-to { font-family: 'Instrument Serif','Noto Serif SC',serif; font-size: 64px; line-height: 0.8; }
.leap-pct { font-size: 20px; color: #8da3c8; margin-bottom: 6px; }
.leap-gain { margin-left: auto; font-size: 13px; font-family: 'JetBrains Mono',monospace; padding: 3px 10px; border-radius: 100px; margin-bottom: 8px; }
.leap-bar-track { height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; margin-top: 12px; }
.leap-bar-fill { width: 61%; height: 100%; border-radius: 3px; }

.contrib-label { font-size: 11px; font-family: 'Outfit','PingFang SC',sans-serif; color: #8da3c8; margin-bottom: 14px; }
.contrib-bars { display: flex; align-items: flex-end; gap: 12px; margin-bottom: 18px; }
.contrib-col { flex: 1; text-align: center; }
.contrib-gain { font-size: 11px; font-family: 'JetBrains Mono',monospace; margin-bottom: 6px; }
.contrib-bar-track { position: relative; height: 120px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(120,160,220,0.12); overflow: hidden; display: flex; flex-direction: column; justify-content: flex-end; }
.contrib-bar-fill { transition: height 0.5s ease; }
.contrib-bar-marker { position: absolute; left: 0; right: 0; height: 1px; background: rgba(255,255,255,0.35); border-top: 1px dashed rgba(255,255,255,0.4); }
.contrib-val { font-size: 13px; font-family: 'Instrument Serif','Noto Serif SC',serif; color: #fff; margin-top: 6px; }
.contrib-name { font-size: 10px; }

.writeback-strip { margin-top: auto; display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 16px; border: 1px solid; }
.writeback-glyph { font-size: 22px; }
.writeback-text { flex: 1; }
.writeback-label { font-size: 11px; font-family: 'Outfit','PingFang SC',sans-serif; font-weight: 500; margin-bottom: 3px; }
.writeback-desc { font-size: 12.5px; color: #eaf2ff; }
.writeback-dots { display: flex; gap: 5px; }
.wb-dot { width: 7px; height: 7px; border-radius: 50%; }

.mastery-section { margin-top: 20px; }
.mastery-label { font-size: 11px; font-family: 'Outfit','PingFang SC',sans-serif; color: #8da3c8; margin-bottom: 8px; }
.mastery-big-row { display: flex; align-items: flex-end; gap: 8px; margin-bottom: 10px; }
.mastery-big { font-family: 'Instrument Serif','Noto Serif SC',serif; font-size: 72px; line-height: 0.85; transition: color 0.5s ease; }
.mastery-pct { font-size: 22px; color: #8da3c8; margin-bottom: 6px; }
.mastery-bar-track { height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; }
.mastery-bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s ease; }
.mastery-result { font-size: 11.5px; color: #eaf2ff; margin-top: 14px; line-height: 1.5; padding-left: 12px; border-left: 2px solid; }

.thinking-thread { position: relative; padding-left: 4px; margin-bottom: 16px; }
.think-step { position: relative; display: flex; gap: 14px; padding-bottom: 16px; }
.think-step:last-child { padding-bottom: 0; }
.think-connector { position: absolute; left: 13px; top: 26px; bottom: 0; width: 2px; }
.think-node {
  width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  border: 1.5px solid; font-size: 14px; z-index: 1;
}
.think-content { flex: 1; padding-top: 3px; min-width: 0; }
.think-text-row { display: flex; align-items: center; gap: 8px; }
.think-text { font-size: 14px; font-weight: 500; }
.think-check { font-size: 12px; margin-top: 4px; }
.think-detail { font-size: 11.5px; color: #8da3c8; font-family: 'Outfit','PingFang SC',sans-serif; margin-top: 2px; }

.courses-section { margin-bottom: auto; }
.courses-label { font-size: 11px; font-family: 'Outfit','PingFang SC',sans-serif; color: #8da3c8; margin-bottom: 8px; }
.courses-list { display: flex; gap: 8px; flex-wrap: wrap; }
.course-chip { display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 16px; background: rgba(255,255,255,0.03); border: 1px solid; }
.course-code { font-size: 9px; font-family: 'Outfit','PingFang SC',sans-serif; padding: 2px 6px; border-radius: 4px; }
.course-name { font-size: 12px; color: #eaf2ff; }
.course-tag { font-size: 9px; color: #8da3c8; padding: 1px 7px; border-radius: 100px; border: 1px solid rgba(120,160,220,0.12); }

.handoff-strip { margin-top: 18px; display: flex; align-items: center; gap: 0; padding: 12px 16px; border-radius: 16px; border: 1px solid; transition: opacity 0.4s ease; }
.handoff-output { flex: 1; min-width: 0; }
.handoff-label { font-size: 11px; font-family: 'Outfit','PingFang SC',sans-serif; font-weight: 500; margin-bottom: 4px; }
.handoff-items { display: flex; gap: 6px; flex-wrap: wrap; }
.handoff-item { font-size: 10.5px; color: #eaf2ff; padding: 2px 8px; border-radius: 6px; white-space: nowrap; }
.handoff-arrow-area { display: flex; align-items: center; gap: 6px; padding: 0 16px; flex-shrink: 0; }
.handoff-line { width: 26px; height: 2px; position: relative; }
.handoff-arrow { font-size: 14px; }
.handoff-next { flex-shrink: 0; text-align: right; }
.handoff-next-label { font-size: 11px; font-family: 'Outfit','PingFang SC',sans-serif; color: #8da3c8; margin-bottom: 3px; }
.handoff-next-name { font-size: 12.5px; font-weight: 600; white-space: nowrap; }

@media (max-width: 900px) {
  .tf-header { flex-direction: column; }
  .stage-grid-2 { grid-template-columns: 1fr; }
  .trainflow-page { padding: 16px; }
  .tf-title { font-size: 28px; }
}
</style>
