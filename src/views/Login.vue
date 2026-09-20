<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import LoginPanel from '@/components/login/LoginPanel.vue'

const rootRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let mediaQuery: MediaQueryList | null = null
const isMobile = ref(false)

function updateCompact(event?: MediaQueryListEvent | MediaQueryList) {
  isMobile.value = Boolean(event?.matches ?? mediaQuery?.matches)
}

// ---- ambient particle layer ----
interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  alpha: number
}

let rafId = 0
let ctx: CanvasRenderingContext2D | null = null
let width = 0
let height = 0
let dpr = 1
const particles: Particle[] = []
const maxParticles = 80
const bgImage = new Image()
bgImage.fetchPriority = 'high'
bgImage.decoding = 'sync'
bgImage.src = '/login.png'

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  width = window.innerWidth
  height = window.innerHeight
  canvas.width = width * dpr
  canvas.height = height * dpr
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  ctx = canvas.getContext('2d')
  if (ctx) ctx.scale(dpr, dpr)
}

function spawnParticle() {
  const x = Math.random() * width
  const y = Math.random() * height
  const angle = Math.random() * Math.PI * 2
  const speed = 0.15 + Math.random() * 0.35

  particles.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 1,
    maxLife: 0.5 + Math.random() * 0.8,
    size: 0.6 + Math.random() * 1.4,
    alpha: 0.15 + Math.random() * 0.35,
  })
}

function drawParticles() {
  if (!ctx) return
  ctx.clearRect(0, 0, width, height)

  if (bgImage.complete && bgImage.naturalWidth > 0) {
    const scale = Math.max(width / bgImage.naturalWidth, height / bgImage.naturalHeight)
    const x = (width - bgImage.naturalWidth * scale) / 2
    const y = (height - bgImage.naturalHeight * scale) / 2
    ctx.drawImage(bgImage, x, y, bgImage.naturalWidth * scale, bgImage.naturalHeight * scale)
  }

  if (particles.length < maxParticles && Math.random() < 0.25) {
    spawnParticle()
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.x += p.vx
    p.y += p.vy
    p.life -= 0.003

    if (p.life <= 0 || p.x < -20 || p.x > width + 20 || p.y < -20 || p.y > height + 20) {
      particles.splice(i, 1)
      continue
    }

    const currentAlpha = (p.life / p.maxLife) * p.alpha
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5)
    glow.addColorStop(0, `rgba(120, 210, 255, ${currentAlpha})`)
    glow.addColorStop(0.5, `rgba(60, 160, 255, ${currentAlpha * 0.45})`)
    glow.addColorStop(1, 'rgba(60, 160, 255, 0)')

    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size * 5, 0, Math.PI * 2)
    ctx.fillStyle = glow
    ctx.fill()
    ctx.restore()
  }

  rafId = requestAnimationFrame(drawParticles)
}

onMounted(() => {
  mediaQuery = window.matchMedia('(max-width: 900px)')
  updateCompact(mediaQuery)
  mediaQuery.addEventListener('change', updateCompact)
  document.body.classList.add('login-page-active')

  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
  rafId = requestAnimationFrame(drawParticles)
})

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', updateCompact)
  document.body.classList.remove('login-page-active')
  window.removeEventListener('resize', resizeCanvas)
  cancelAnimationFrame(rafId)
})
</script>

<template>
  <main ref="rootRef" class="login-view">
    <canvas ref="canvasRef" class="particle-canvas" aria-hidden="true" />

    <div class="login-layout">
      <section class="login-left" aria-hidden="true" />
      <section class="login-right" aria-label="登录面板">
        <div class="panel-wrapper" :class="{ mobile: isMobile }">
          <LoginPanel />
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.login-view {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  color: #f0f6ff;
  background: #02060f;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei UI', sans-serif;
  isolation: isolate;
}

.particle-canvas {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  touch-action: none;
}

.login-layout {
  position: relative;
  z-index: 2;
  min-height: 100vh;
  display: flex;
  align-items: stretch;
}

.login-left {
  width: 55%;
  min-height: 100vh;
  pointer-events: none;
}

.login-right {
  width: 45%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 56px;
  background: transparent;
}

.panel-wrapper {
  width: 100%;
  max-width: 460px;
  animation: panel-breathe 4s ease-in-out infinite;
}

@keyframes panel-breathe {
  0%, 100% {
    filter: drop-shadow(0 8px 24px rgba(0, 80, 180, 0.08));
  }
  50% {
    filter: drop-shadow(0 10px 30px rgba(0, 130, 230, 0.12));
  }
}

@media (max-width: 1200px) {
  .login-left { width: 50%; }
  .login-right {
    width: 50%;
    padding: 32px 40px;
  }
  .panel-wrapper { max-width: 420px; }
}

@media (max-width: 900px) {
  .login-layout {
    flex-direction: column;
  }
  .login-left {
    width: 100%;
    min-height: 30vh;
    height: 30vh;
  }
  .login-right {
    width: 100%;
    min-height: auto;
    flex: 1;
    padding: 24px;
    background: transparent;
    justify-content: flex-start;
  }
  .panel-wrapper {
    max-width: 520px;
    margin-top: -60px;
  }
  .panel-wrapper.mobile {
    animation: none;
    filter: drop-shadow(0 20px 60px rgba(0, 80, 180, 0.3));
  }
}

@media (max-width: 540px) {
  .login-right { padding: 20px; }
  .panel-wrapper {
    max-width: 100%;
    margin-top: -40px;
  }
}
</style>
