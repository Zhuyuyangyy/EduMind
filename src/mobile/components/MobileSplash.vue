<template>
  <main class="mobile-splash" :class="{ 'mobile-splash--entering': entering }" aria-labelledby="splash-title">
    <div class="mobile-splash__grain" aria-hidden="true"></div>
    <div class="mobile-splash__field" aria-hidden="true">
      <span class="mobile-splash__halo mobile-splash__halo--outer"></span>
      <span class="mobile-splash__halo mobile-splash__halo--inner"></span>
      <span class="mobile-splash__orbit mobile-splash__orbit--one"></span>
      <span class="mobile-splash__orbit mobile-splash__orbit--two"></span>
      <span class="mobile-splash__spark mobile-splash__spark--one"></span>
      <span class="mobile-splash__spark mobile-splash__spark--two"></span>
      <span class="mobile-splash__spark mobile-splash__spark--three"></span>
      <MobileOrbit class="mobile-splash__art" />
    </div>
    <canvas ref="transitionCanvas" class="mobile-splash__transition-canvas" aria-hidden="true"></canvas>

    <section class="mobile-splash__content">
      <p class="mobile-splash__eyebrow">为学习而设计</p>
      <div class="mobile-splash__brand" aria-hidden="true">
        <BrandMark class="mobile-splash__mark" :size="46" variant="light" title="智学星枢" />
        <span>智学星枢</span>
      </div>
      <h1 id="splash-title">让学习，更适合你。</h1>
      <p class="mobile-splash__subtitle">从一次测评开始，找到适合自己的学习路径。</p>
      <button class="mobile-splash__enter" type="button" :disabled="entering" @click="startEntry">
        <span>{{ entering ? '正在打开学习空间' : '进入学习' }}</span>
        <MobileIcon name="chevronRight" :size="18" :stroke-width="1.8" />
      </button>
      <p class="mobile-splash__hint">点击进入你的学习空间</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
import MobileIcon from './MobileIcon.vue'
import MobileOrbit from './MobileOrbit.vue'
import BrandMark from '@/components/brand/BrandMark.vue'

const emit = defineEmits<{ enter: [] }>()
type ThreeModule = typeof import('three')
const entering = ref(false)
const transitionCanvas = ref<HTMLCanvasElement | null>(null)
let renderer: import('three').WebGLRenderer | null = null
let animationFrame = 0
let resizeHandler: (() => void) | null = null

function easeOutCubic(value: number) { return 1 - Math.pow(1 - value, 3) }

function createGlowTexture(three: ThreeModule) {
  const textureCanvas = document.createElement('canvas')
  textureCanvas.width = 256
  textureCanvas.height = 256
  const context = textureCanvas.getContext('2d')!
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128)
  gradient.addColorStop(0, 'rgba(255,255,255,.98)')
  gradient.addColorStop(.12, 'rgba(255,225,148,.88)')
  gradient.addColorStop(.34, 'rgba(101,170,255,.48)')
  gradient.addColorStop(1, 'rgba(55,105,213,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 256, 256)
  return new three.CanvasTexture(textureCanvas)
}

function createGate(three: ThreeModule, scene: import('three').Scene) {
  const gate = new three.Group()
  gate.position.set(0, .08, 0)
  gate.scale.setScalar(.92)

  const gateMaterial = new three.MeshBasicMaterial({ color: 0x183d77, transparent: true, opacity: .96, side: three.DoubleSide })
  const trimMaterial = new three.MeshBasicMaterial({ color: 0xc69a52, transparent: true, opacity: .9, side: three.DoubleSide })
  const left = new three.Group()
  const right = new three.Group()
  const panelGeometry = new three.PlaneGeometry(1.36, 2.18)
  const leftPanel = new three.Mesh(panelGeometry, gateMaterial)
  const rightPanel = new three.Mesh(panelGeometry, gateMaterial)
  leftPanel.position.x = -.68
  rightPanel.position.x = .68
  left.add(leftPanel)
  right.add(rightPanel)
  gate.add(left, right)

  const leftTrim = new three.Mesh(new three.PlaneGeometry(.045, 2.18), trimMaterial)
  const rightTrim = new three.Mesh(new three.PlaneGeometry(.045, 2.18), trimMaterial)
  leftTrim.position.set(-.02, 0, .03)
  rightTrim.position.set(.02, 0, .03)
  left.add(leftTrim)
  right.add(rightTrim)

  const arch = new three.Mesh(new three.TorusGeometry(1.02, .035, 12, 72), trimMaterial)
  arch.scale.y = 1.25
  arch.position.set(0, .08, .08)
  gate.add(arch)

  const glow = new three.Sprite(new three.SpriteMaterial({
    map: createGlowTexture(three),
    transparent: true,
    opacity: 0,
    blending: three.AdditiveBlending,
    depthWrite: false,
  }))
  glow.scale.set(.6, .6, 1)
  glow.position.set(0, .05, .2)
  gate.add(glow)

  const particleCount = 80
  const positions = new Float32Array(particleCount * 3)
  for (let index = 0; index < particleCount; index += 1) {
    positions[index * 3] = (Math.random() - .5) * 2.3
    positions[index * 3 + 1] = (Math.random() - .5) * 1.7
    positions[index * 3 + 2] = .3 + Math.random() * .65
  }
  const particlesGeometry = new three.BufferGeometry()
  particlesGeometry.setAttribute('position', new three.BufferAttribute(positions, 3))
  const particlesMaterial = new three.PointsMaterial({
    color: 0xb9d8ff,
    size: .035,
    transparent: true,
    opacity: 0,
    blending: three.AdditiveBlending,
    depthWrite: false,
  })
  const particles = new three.Points(particlesGeometry, particlesMaterial)
  particles.position.z = .24
  gate.add(particles)
  scene.add(gate)
  return { gate, left, right, glow, glowMaterial: glow.material as import('three').SpriteMaterial, particles, particlesMaterial }
}

function disposeScene(scene: import('three').Scene | null) {
  if (!scene) return
  scene.traverse(object => {
    const mesh = object as import('three').Mesh & { geometry?: import('three').BufferGeometry; material?: import('three').Material | import('three').Material[] }
    mesh.geometry?.dispose()
    if (Array.isArray(mesh.material)) mesh.material.forEach(material => material.dispose())
    else mesh.material?.dispose()
  })
}

async function startEntry() {
  if (entering.value) return
  entering.value = true
  await nextTick()
  const canvas = transitionCanvas.value
  if (!canvas) { window.setTimeout(() => emit('enter'), 760); return }

  let scene: import('three').Scene | null = null
  try {
    const three = await import('three')
    scene = new three.Scene()
    const camera = new three.PerspectiveCamera(34, window.innerWidth / window.innerHeight, .1, 100)
    camera.position.set(0, .1, 5.2)
    renderer = new three.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(window.innerWidth, window.innerHeight, false)
    resizeHandler = () => {
      if (!renderer) return
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight, false)
    }
    window.addEventListener('resize', resizeHandler)
    const gate = createGate(three, scene)
    const startedAt = performance.now()
    const duration = 1500
    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1)
      const eased = easeOutCubic(progress)
      gate.left.rotation.y = -eased * 1.38
      gate.right.rotation.y = eased * 1.38
      gate.left.position.x = -eased * .18
      gate.right.position.x = eased * .18
      gate.gate.scale.setScalar(.92 + eased * .3)
      gate.glowMaterial.opacity = eased * .98
      gate.glow.scale.setScalar(.6 + eased * 4.8)
      gate.particlesMaterial.opacity = eased * .92
      gate.particles.scale.setScalar(1 + eased * 4.6)
      gate.particles.position.z = .24 + eased * 1.8
      camera.position.z = 6.4 - eased * 3.9
      camera.position.y = .08 + eased * .1
      camera.lookAt(0, .08, 0)
      renderer?.render(scene!, camera)
      if (progress < 1) animationFrame = requestAnimationFrame(animate)
      else window.setTimeout(() => emit('enter'), 70)
    }
    animationFrame = requestAnimationFrame(animate)
  } catch {
    disposeScene(scene)
    renderer?.dispose()
    renderer = null
    window.setTimeout(() => emit('enter'), 760)
  }
}

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame)
  if (resizeHandler) window.removeEventListener('resize', resizeHandler)
  renderer?.dispose()
  renderer = null
})
</script>

<style scoped>
.mobile-splash {
  --splash-blue: #3769d5;
  --splash-blue-deep: #234da8;
  --splash-gold: #bd8a42;
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  overflow: hidden;
  min-height: 100dvh;
  padding: 44px 26px 36px;
  background:
    radial-gradient(circle at 50% 32%, rgba(255,255,255,.96) 0 12%, rgba(238,243,252,.9) 35%, transparent 61%),
    linear-gradient(180deg, #f8f9fc 0%, #f1f3f8 100%);
  color: #20242e;
  isolation: isolate;
}

.mobile-splash__grain {
  position: absolute;
  inset: 0;
  opacity: .22;
  pointer-events: none;
  background-image: radial-gradient(rgba(55,105,213,.14) .6px, transparent .6px);
  background-size: 7px 7px;
  mask-image: linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent);
}

.mobile-splash__field {
  position: relative;
  width: min(82vw, 330px);
  aspect-ratio: 1;
  margin-top: -40px;
  display: grid;
  place-items: center;
  animation: splash-field-in 900ms cubic-bezier(.22,1,.36,1) both;
}

.mobile-splash__transition-canvas { position: absolute; inset: 0; z-index: 4; width: 100%; height: 100%; opacity: 0; pointer-events: none; transition: opacity 240ms ease; }
.mobile-splash--entering .mobile-splash__transition-canvas { opacity: 1; }
.mobile-splash--entering .mobile-splash__field { opacity: 0; transform: scale(.9); transition: opacity 260ms ease, transform 500ms cubic-bezier(.22,1,.36,1); }
.mobile-splash--entering .mobile-splash__content { opacity: 0; transform: translateY(8px) scale(.97); transition: opacity 260ms ease, transform 500ms cubic-bezier(.22,1,.36,1); }

.mobile-splash__halo,
.mobile-splash__orbit,
.mobile-splash__spark {
  position: absolute;
  display: block;
  pointer-events: none;
}

.mobile-splash__halo {
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,255,255,.94), rgba(181,209,255,.36) 42%, transparent 72%);
  filter: blur(2px);
}

.mobile-splash__halo--outer { width: 92%; height: 92%; opacity: .54; animation: splash-breathe 4.8s ease-in-out infinite; }
.mobile-splash__halo--inner { width: 64%; height: 64%; opacity: .7; animation: splash-breathe 3.8s ease-in-out .3s infinite reverse; }

.mobile-splash__orbit {
  width: 76%;
  height: 24%;
  border: 1px solid rgba(55,105,213,.28);
  border-radius: 50%;
  box-shadow: 0 0 22px rgba(55,105,213,.12);
}

.mobile-splash__orbit::after {
  content: '';
  position: absolute;
  top: -3px;
  left: 15%;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--splash-gold);
  box-shadow: 0 0 14px rgba(189,138,66,.72);
}

.mobile-splash__orbit--one { transform: rotate(26deg); animation: splash-orbit-one 8s linear infinite; }
.mobile-splash__orbit--two { transform: rotate(-38deg) scaleY(.74); border-color: rgba(189,138,66,.24); animation: splash-orbit-two 9s linear infinite reverse; }

.mobile-splash__art {
  width: 52%;
  z-index: 2;
  filter: drop-shadow(0 20px 24px rgba(48,80,145,.18));
  animation: splash-art 3.9s ease-in-out .45s infinite;
}

.mobile-splash__spark { width: 5px; height: 5px; border-radius: 50%; background: var(--splash-gold); box-shadow: 0 0 12px rgba(189,138,66,.72); }
.mobile-splash__spark--one { top: 19%; left: 19%; animation: splash-spark 2.8s ease-in-out .2s infinite; }
.mobile-splash__spark--two { right: 16%; top: 36%; animation: splash-spark 3.3s ease-in-out .8s infinite reverse; }
.mobile-splash__spark--three { bottom: 18%; left: 27%; animation: splash-spark 3s ease-in-out 1s infinite; }

.mobile-splash__content {
  position: relative;
  z-index: 3;
  width: min(100%, 350px);
  margin-top: -10px;
  text-align: center;
  animation: splash-content-in 780ms cubic-bezier(.22,1,.36,1) 420ms both;
}

.mobile-splash__eyebrow { margin: 0 0 16px; color: var(--splash-blue); font-size: 12px; letter-spacing: 2.2px; }
.mobile-splash__brand { display: inline-flex; align-items: center; gap: 11px; margin-bottom: 18px; color: #2b3444; font-size: 16px; font-weight: 560; letter-spacing: .2px; }
.mobile-splash__mark { filter: drop-shadow(0 8px 18px rgba(55,105,213,.12)); }
.mobile-splash h1 { margin: 0; color: #283141; font-size: clamp(28px, 8vw, 34px); font-weight: 600; letter-spacing: -1.15px; line-height: 1.2; }
.mobile-splash__subtitle { margin: 14px auto 0; max-width: 285px; color: #687284; font-size: 13px; line-height: 1.8; }
.mobile-splash__enter { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-width: 182px; min-height: 50px; margin-top: 26px; padding: 0 22px; border: 1px solid rgba(55,105,213,.15); border-radius: 16px; color: #fff; background: linear-gradient(135deg, #4676db, #3263ca); box-shadow: 0 12px 26px rgba(55,105,213,.2), inset 0 1px 0 rgba(255,255,255,.22); font: inherit; font-size: 14px; font-weight: 580; cursor: pointer; transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease; }
.mobile-splash__enter:hover { background: var(--splash-blue-deep); box-shadow: 0 15px 28px rgba(55,105,213,.28); }
.mobile-splash__enter:disabled { cursor: wait; opacity: .86; }
.mobile-splash__enter:active { transform: translateY(1px) scale(.985); }
.mobile-splash__enter:focus-visible { outline: 3px solid rgba(55,105,213,.28); outline-offset: 4px; }
.mobile-splash__hint { margin: 12px 0 0; color: #9299a7; font-size: 11px; }

@keyframes splash-field-in { from { opacity: 0; transform: scale(.78) translateY(14px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes splash-content-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes splash-art { 0%,100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-6px) rotate(1deg); } }
@keyframes splash-breathe { 0%,100% { transform: scale(.94); opacity: .42; } 50% { transform: scale(1.04); opacity: .76; } }
@keyframes splash-orbit-one { from { transform: rotate(26deg); } to { transform: rotate(386deg); } }
@keyframes splash-orbit-two { from { transform: rotate(-38deg) scaleY(.74); } to { transform: rotate(-398deg) scaleY(.74); } }
@keyframes splash-spark { 0%,100% { opacity: .35; transform: scale(.7); } 50% { opacity: 1; transform: scale(1.45); } }

@media (max-height: 700px) {
  .mobile-splash { padding-block: 24px; }
  .mobile-splash__field { width: min(62vw, 250px); margin-top: -16px; }
  .mobile-splash__content { margin-top: -4px; }
  .mobile-splash__brand { margin-bottom: 12px; }
  .mobile-splash__enter { margin-top: 18px; }
}

@media (prefers-reduced-motion: reduce) {
  .mobile-splash *, .mobile-splash *::before, .mobile-splash *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
</style>
