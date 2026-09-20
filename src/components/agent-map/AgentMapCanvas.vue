<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import { useAgentMapStore } from './store/agentMapStore'

const store = useAgentMapStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

const canvasWidth = ref(800)
const canvasHeight = ref(500)

let animFrame: number | null = null
let mouseX = ref(0)
let mouseY = ref(0)
const hoveredAgentId = ref<string | null>(null)

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

// Zone definitions for the learning system
const zones = [
  { name: '画像分析区', x: 100, y: 150, w: 200, h: 150, color: 'rgba(0, 212, 255, 0.04)', border: 'rgba(0, 212, 255, 0.1)' },
  { name: '路径规划区', x: 350, y: 70, w: 200, h: 150, color: 'rgba(59, 130, 246, 0.04)', border: 'rgba(59, 130, 246, 0.1)' },
  { name: '资源生成区', x: 600, y: 150, w: 200, h: 150, color: 'rgba(124, 58, 237, 0.04)', border: 'rgba(124, 58, 237, 0.1)' },
  { name: '评估分析区', x: 600, y: 350, w: 200, h: 150, color: 'rgba(245, 158, 11, 0.04)', border: 'rgba(245, 158, 11, 0.1)' },
  { name: '反馈生成区', x: 350, y: 420, w: 200, h: 150, color: 'rgba(6, 214, 160, 0.04)', border: 'rgba(6, 214, 160, 0.1)' },
  { name: '画像更新区', x: 100, y: 350, w: 200, h: 150, color: 'rgba(244, 63, 94, 0.04)', border: 'rgba(244, 63, 94, 0.1)' },
]

const displayZones = [
  { name: '画像采集区', x: 100, y: 150, w: 200, h: 150, color: 'rgba(0, 212, 255, 0.045)', border: 'rgba(0, 212, 255, 0.16)' },
  { name: '路径规划区', x: 350, y: 70, w: 200, h: 150, color: 'rgba(59, 130, 246, 0.045)', border: 'rgba(59, 130, 246, 0.16)' },
  { name: '资源生成区', x: 600, y: 150, w: 200, h: 150, color: 'rgba(124, 58, 237, 0.045)', border: 'rgba(124, 58, 237, 0.16)' },
  { name: '评估分析区', x: 600, y: 350, w: 200, h: 150, color: 'rgba(245, 158, 11, 0.045)', border: 'rgba(245, 158, 11, 0.16)' },
  { name: '反馈生成区', x: 350, y: 420, w: 200, h: 150, color: 'rgba(6, 214, 160, 0.045)', border: 'rgba(6, 214, 160, 0.16)' },
  { name: '画像更新区', x: 100, y: 350, w: 200, h: 150, color: 'rgba(244, 63, 94, 0.045)', border: 'rgba(244, 63, 94, 0.16)' },
]

// Message particles for visual effect
interface Particle {
  x: number; y: number
  targetX: number; targetY: number
  progress: number
  color: string
  fromId: string; toId: string
}
const particles = ref<Particle[]>([])

function getAgentCenter(id: string): { x: number; y: number } {
  const agent = store.agents.get(id)
  if (!agent) return { x: canvasWidth.value / 2, y: canvasHeight.value / 2 }
  return { x: agent.x, y: agent.y }
}

function spawnParticle(fromId: string, toId: string) {
  const from = getAgentCenter(fromId)
  const to = getAgentCenter(toId)
  const agent = store.agents.get(fromId)
  particles.value.push({
    x: from.x, y: from.y,
    targetX: to.x, targetY: to.y,
    progress: 0,
    color: agent?.color || '#06b6d4',
    fromId, toId,
  })
}

// Watch for new messages and spawn particles
watch(() => store.messages.value.length, (newLen, oldLen) => {
  if (newLen > oldLen) {
    const latest = store.messages.value[store.messages.value.length - 1]
    if (latest) spawnParticle(latest.from, latest.to)
  }
})

function resizeCanvas() {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  canvasWidth.value = rect.width
  canvasHeight.value = rect.height

  // Reposition agents proportionally
  const agents = store.agentList.value
  const cx = canvasWidth.value / 2
  const cy = canvasHeight.value / 2
  const radiusX = canvasWidth.value * 0.32
  const radiusY = canvasHeight.value * 0.35

  agents.forEach((agent, i) => {
    const angle = (i / agents.length) * Math.PI * 2 - Math.PI / 2
    const baseX = cx + Math.cos(angle) * radiusX
    const baseY = cy + Math.sin(angle) * radiusY
    if (agent.x === 0 && agent.y === 0) {
      agent.x = baseX
      agent.y = baseY
    }
    agent.targetX = baseX
    agent.targetY = baseY
  })
}

function drawAgent(ctx: CanvasRenderingContext2D, agent: any, isSelected: boolean, isHovered: boolean) {
  const { x, y, color, name, icon, state, vitality } = agent
  const baseRadius = isSelected ? 34 : isHovered ? 32 : 28

  // Glow
  if (state === 'working' || state === 'processing') {
    const glowRadius = baseRadius + 12 + Math.sin(Date.now() / 800) * 4
    const gradient = ctx.createRadialGradient(x, y, baseRadius, x, y, glowRadius)
    gradient.addColorStop(0, color + '30')
    gradient.addColorStop(1, 'transparent')
    ctx.beginPath()
    ctx.arc(x, y, glowRadius, 0, Math.PI * 2)
    ctx.fillStyle = gradient
    ctx.fill()
  }

  // Selection ring
  if (isSelected) {
    ctx.beginPath()
    ctx.arc(x, y, baseRadius + 6, 0, Math.PI * 2)
    ctx.strokeStyle = color + '80'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.lineDashOffset = -Date.now() / 100
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Main circle
  const bgGradient = ctx.createRadialGradient(x, y - 8, 0, x, y, baseRadius)
  bgGradient.addColorStop(0, color + '34')
  bgGradient.addColorStop(0.48, 'rgba(30, 41, 59, 0.96)')
  bgGradient.addColorStop(1, 'rgba(2, 6, 23, 0.98)')
  ctx.beginPath()
  ctx.arc(x, y, baseRadius, 0, Math.PI * 2)
  ctx.fillStyle = bgGradient
  ctx.fill()
  ctx.strokeStyle = color + (isSelected ? 'dd' : '78')
  ctx.lineWidth = isSelected ? 2.5 : 1.5
  ctx.stroke()

  // Vitality arc
  const arcRadius = baseRadius - 3
  const arcStart = -Math.PI / 2
  const arcEnd = arcStart + (vitality / 100) * Math.PI * 2
  ctx.beginPath()
  ctx.arc(x, y, arcRadius, arcStart, arcEnd)
  ctx.strokeStyle = vitality > 60 ? '#10b981' : vitality > 30 ? '#f59e0b' : '#ef4444'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.stroke()

  // Icon
  ctx.font = `${baseRadius * 0.62}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(icon, x, y - 2)

  // Name
  ctx.font = `600 10px "JetBrains Mono", monospace`
  ctx.fillStyle = '#e2e8f0'
  ctx.textAlign = 'center'
  ctx.fillText(name, x, y + baseRadius + 14)

  // State badge
  const stateColors: Record<string, string> = {
    idle: '#475569', working: '#10b981', processing: '#06b6d4', pending: '#f59e0b', error: '#ef4444',
  }
  const stateLabels: Record<string, string> = {
    idle: '空闲', working: '工作中', processing: '处理中', pending: '等待', error: '错误',
  }
  const badgeColor = stateColors[state] || '#475569'
  const badgeText = stateLabels[state] || state
  ctx.font = `600 8px "JetBrains Mono", monospace`
  const textW = ctx.measureText(badgeText).width
  const badgeW = textW + 10
  const badgeH = 14
  const badgeX = x - badgeW / 2
  const badgeY = y + baseRadius + 22

  ctx.beginPath()
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3)
  ctx.fillStyle = badgeColor + '25'
  ctx.fill()
  ctx.strokeStyle = badgeColor + '40'
  ctx.lineWidth = 0.5
  ctx.stroke()
  ctx.fillStyle = badgeColor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(badgeText, x, badgeY + badgeH / 2)
}

function drawConnections(ctx: CanvasRenderingContext2D) {
  const agents = store.agentList.value
  agents.forEach(agent => {
    agent.connections.forEach(targetId => {
      const target = store.agents.get(targetId)
      if (!target) return

      const isActive = agent.state === 'working' || agent.state === 'processing'
      ctx.beginPath()
      ctx.moveTo(agent.x, agent.y)

      // Curved connection
      const midX = (agent.x + target.x) / 2
      const midY = (agent.y + target.y) / 2 - 30
      ctx.quadraticCurveTo(midX, midY, target.x, target.y)

      const connectionGradient = ctx.createLinearGradient(agent.x, agent.y, target.x, target.y)
      connectionGradient.addColorStop(0, isActive ? agent.color + '58' : 'rgba(100, 116, 139, 0.16)')
      connectionGradient.addColorStop(0.5, isActive ? 'rgba(125, 211, 252, 0.34)' : 'rgba(100, 116, 139, 0.08)')
      connectionGradient.addColorStop(1, isActive ? target.color + '4d' : 'rgba(100, 116, 139, 0.16)')
      ctx.strokeStyle = connectionGradient
      ctx.lineWidth = isActive ? 2 : 1
      ctx.setLineDash(isActive ? [] : [3, 3])
      ctx.stroke()
      ctx.setLineDash([])

      // Arrow
      const angle = Math.atan2(target.y - midY, target.x - midX)
      const arrowLen = 6
      const arrowX = target.x - Math.cos(angle) * 28
      const arrowY = target.y - Math.sin(angle) * 28
      ctx.beginPath()
      ctx.moveTo(arrowX, arrowY)
      ctx.lineTo(arrowX - Math.cos(angle - 0.4) * arrowLen, arrowY - Math.sin(angle - 0.4) * arrowLen)
      ctx.moveTo(arrowX, arrowY)
      ctx.lineTo(arrowX - Math.cos(angle + 0.4) * arrowLen, arrowY - Math.sin(angle + 0.4) * arrowLen)
      ctx.strokeStyle = isActive ? agent.color + '60' : 'rgba(100, 116, 139, 0.2)'
      ctx.lineWidth = 1
      ctx.stroke()
    })
  })
}

function drawParticles(ctx: CanvasRenderingContext2D) {
  particles.value.forEach(p => {
    p.progress += 0.02
    const t = p.progress
    const x = p.x + (p.targetX - p.x) * t
    const y = p.y + (p.targetY - p.y) * t - Math.sin(t * Math.PI) * 20

    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fillStyle = p.color + 'cc'
    ctx.fill()

    // Trail
    ctx.beginPath()
    ctx.arc(x - (p.targetX - p.x) * 0.05, y, 1.5, 0, Math.PI * 2)
    ctx.fillStyle = p.color + '40'
    ctx.fill()
  })

  // Remove completed particles
  particles.value = particles.value.filter(p => p.progress < 1)
}

function drawZones(ctx: CanvasRenderingContext2D) {
  displayZones.forEach(zone => {
    ctx.beginPath()
    ctx.roundRect(zone.x, zone.y, zone.w, zone.h, 8)
    ctx.fillStyle = zone.color
    ctx.fill()
    ctx.strokeStyle = zone.border
    ctx.lineWidth = 0.5
    ctx.setLineDash([4, 4])
    ctx.stroke()
    ctx.setLineDash([])

    ctx.font = '600 10px "JetBrains Mono", monospace'
    ctx.fillStyle = 'rgba(226, 232, 240, 0.28)'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(zone.name, zone.x + 12, zone.y + 10)

    ctx.beginPath()
    ctx.moveTo(zone.x + 12, zone.y + zone.h - 14)
    ctx.lineTo(zone.x + zone.w - 12, zone.y + zone.h - 14)
    ctx.strokeStyle = zone.border
    ctx.lineWidth = 1
    ctx.stroke()
  })
}

function drawGrid(ctx: CanvasRenderingContext2D) {
  const step = 40
  const subStep = 10

  ctx.strokeStyle = 'rgba(100, 116, 139, 0.025)'
  ctx.lineWidth = 0.35
  for (let x = 0; x < canvasWidth.value; x += subStep) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvasHeight.value)
    ctx.stroke()
  }
  for (let y = 0; y < canvasHeight.value; y += subStep) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(canvasWidth.value, y)
    ctx.stroke()
  }

  ctx.strokeStyle = 'rgba(125, 211, 252, 0.055)'
  ctx.lineWidth = 0.5
  for (let x = 0; x < canvasWidth.value; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvasHeight.value)
    ctx.stroke()
  }
  for (let y = 0; y < canvasHeight.value; y += step) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(canvasWidth.value, y)
    ctx.stroke()
  }
}

function drawLearningCore(ctx: CanvasRenderingContext2D) {
  const cx = canvasWidth.value / 2
  const cy = canvasHeight.value / 2 + 8
  const pulse = Math.sin(Date.now() / 900) * 4

  const coreGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 98 + pulse)
  coreGradient.addColorStop(0, 'rgba(0, 212, 255, 0.18)')
  coreGradient.addColorStop(0.42, 'rgba(124, 58, 237, 0.08)')
  coreGradient.addColorStop(1, 'transparent')
  ctx.fillStyle = coreGradient
  ctx.beginPath()
  ctx.arc(cx, cy, 100 + pulse, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(Date.now() / 9000)
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.ellipse(0, 0, 132 + i * 34, 44 + i * 14, (i * Math.PI) / 3, 0, Math.PI * 2)
    ctx.strokeStyle = i === 0 ? 'rgba(0, 212, 255, 0.16)' : 'rgba(148, 163, 184, 0.08)'
    ctx.lineWidth = 1
    ctx.stroke()
  }
  ctx.restore()

  ctx.font = '700 10px "JetBrains Mono", monospace'
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(226, 248, 255, 0.42)'
  ctx.fillText('LEARNING LOOP CORE', cx, cy - 6)
  ctx.font = '500 9px "JetBrains Mono", monospace'
  ctx.fillStyle = 'rgba(125, 211, 252, 0.36)'
  ctx.fillText('profile -> path -> resource -> evaluation -> feedback', cx, cy + 10)
}

function drawHud(ctx: CanvasRenderingContext2D) {
  const agents = store.agentList.value
  const active = store.activeAgentCount.value

  ctx.font = '600 9px "JetBrains Mono", monospace'
  ctx.fillStyle = 'rgba(125, 211, 252, 0.34)'
  ctx.textAlign = 'left'
  ctx.fillText(`WORLD: ZHIXUE-XINGSHU  AGENTS:${agents.length}  ACTIVE:${active}  MSGS:${store.systemMetrics.totalMessages}`, 14, canvasHeight.value - 64)

  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(255, 229, 143, 0.32)'
  ctx.fillText(`VIEWPORT ${Math.round(canvasWidth.value)}x${Math.round(canvasHeight.value)}  LAT ${store.systemMetrics.avgLatency.toFixed(0)}ms`, canvasWidth.value - 14, canvasHeight.value - 64)
}

function render() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  canvas.width = canvasWidth.value * window.devicePixelRatio
  canvas.height = canvasHeight.value * window.devicePixelRatio
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

  // Clear
  const bg = ctx.createLinearGradient(0, 0, canvasWidth.value, canvasHeight.value)
  bg.addColorStop(0, '#020617')
  bg.addColorStop(0.54, '#061024')
  bg.addColorStop(1, '#030712')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, canvasWidth.value, canvasHeight.value)

  // Grid
  drawGrid(ctx)

  // Learning loop core
  drawLearningCore(ctx)

  // Zones
  drawZones(ctx)

  // Connections
  drawConnections(ctx)

  // Particles
  drawParticles(ctx)

  // Agents
  const agents = store.agentList.value
  agents.forEach(agent => {
    const isSelected = store.selectedAgentId.value === agent.id
    const isHovered = hoveredAgentId.value === agent.id
    drawAgent(ctx, agent, isSelected, isHovered)
  })

  // HUD overlay
  drawHud(ctx)

  animFrame = requestAnimationFrame(render)
}

function handleMouseMove(e: MouseEvent) {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  mouseX.value = e.clientX - rect.left
  mouseY.value = e.clientY - rect.top

  // Check hover
  hoveredAgentId.value = null
  store.agentList.value.forEach(agent => {
    const dx = mouseX.value - agent.x
    const dy = mouseY.value - agent.y
    if (Math.sqrt(dx * dx + dy * dy) < 30) {
      hoveredAgentId.value = agent.id
    }
  })

  if (containerRef.value) {
    containerRef.value.style.cursor = hoveredAgentId.value ? 'pointer' : 'default'
  }
}

function handleClick(e: MouseEvent) {
  if (hoveredAgentId.value) {
    store.selectAgent(hoveredAgentId.value)
    emit('select', hoveredAgentId.value)
  }
}

onMounted(() => {
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
  render()
})

onUnmounted(() => {
  if (animFrame) cancelAnimationFrame(animFrame)
  window.removeEventListener('resize', resizeCanvas)
})
</script>

<template>
  <div ref="containerRef" class="am-canvas-container" @mousemove="handleMouseMove" @click="handleClick">
    <canvas ref="canvasRef" class="am-canvas" />
    <!-- Tooltip -->
    <div
      v-if="hoveredAgentId && store.agents.get(hoveredAgentId)"
      class="am-canvas-tooltip"
      :style="{ left: mouseX + 12 + 'px', top: mouseY + 12 + 'px' }"
    >
      <span class="am-tooltip-name">{{ store.agents.get(hoveredAgentId)?.name }}</span>
      <span class="am-tooltip-task">{{ store.agents.get(hoveredAgentId)?.currentTask || '空闲' }}</span>
    </div>
  </div>
</template>

<style scoped>
.am-canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #020617;
}

.am-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.am-canvas-tooltip {
  position: absolute;
  pointer-events: none;
  z-index: 50;
  padding: 5px 10px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(100, 116, 139, 0.25);
  backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.am-tooltip-name {
  font-size: 11px;
  font-weight: 600;
  color: #e2e8f0;
}

.am-tooltip-task {
  font-size: 10px;
  color: #64748b;
}
</style>
