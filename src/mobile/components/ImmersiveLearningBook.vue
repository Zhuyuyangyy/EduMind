<template>
  <section class="immersive-book" :class="{ 'immersive-book--reduced': reducedMotion }" aria-label="沉浸式学习书桌">
    <canvas ref="canvas" class="immersive-book__canvas" aria-hidden="true"></canvas>
    <div class="immersive-book__vignette" aria-hidden="true"></div>

    <header class="immersive-book__top">
      <div class="immersive-book__brand">
        <span class="immersive-book__brand-mark"><BrandMark :size="25" variant="dark" /></span>
        <span><b>智学星枢</b><small>HOLOGRAPHIC LEARNING DESK</small></span>
      </div>
      <nav class="immersive-book__chapters" aria-label="学习章节">
        <button
          v-for="(chapter, index) in chapters"
          :key="chapter.id"
          type="button"
          :class="{ active: chapter.id === currentChapter.id }"
          :aria-selected="chapter.id === currentChapter.id"
          role="tab"
          @click="selectChapter(chapter.id)"
        >
          <i>{{ chapter.number || String(index + 1).padStart(2, '0') }}</i>{{ chapter.label }}
        </button>
      </nav>
      <span class="immersive-book__hint">拖动旋转 · 选择章节</span>
    </header>

    <div class="immersive-book__hud">
      <div class="immersive-book__copy">
        <p class="immersive-book__eyebrow">{{ eyebrow }} · {{ currentChapter.label }}</p>
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
        <div class="immersive-book__meta">
          <span><MobileIcon name="clock" :size="14" />建议 {{ focusMinutes }} 分钟</span>
          <span><MobileIcon name="path" :size="14" />{{ metaLabel }}</span>
        </div>
      </div>

      <aside class="immersive-book__agent" aria-label="个人 Agent 建议">
        <p class="immersive-book__agent-label">PERSONAL AGENT</p>
        <h3>{{ agentTitle }}</h3>
        <p>{{ agentDetail }}</p>
        <RouterLink :to="agentTo" class="immersive-book__agent-link">{{ agentAction }} <MobileIcon name="chevronRight" :size="14" /></RouterLink>
      </aside>
    </div>

    <footer class="immersive-book__controls">
      <button type="button" class="immersive-book__nav" :disabled="activeIndex === 0" aria-label="上一章节" @click="selectChapter(chapters[activeIndex - 1]?.id)">‹</button>
      <div class="immersive-book__chapter-title"><small>CHAPTER {{ currentChapter.number || String(activeIndex + 1).padStart(2, '0') }}</small><b>{{ currentChapter.label }}</b></div>
      <button type="button" class="immersive-book__nav" :disabled="activeIndex === chapters.length - 1" aria-label="下一章节" @click="selectChapter(chapters[activeIndex + 1]?.id)">›</button>
      <RouterLink :to="primaryTo" class="immersive-book__primary"><MobileIcon name="sparkle" :size="15" />{{ primaryLabel }}</RouterLink>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import BrandMark from '@/components/brand/BrandMark.vue'
import MobileIcon from './MobileIcon.vue'

export interface ImmersiveChapter {
  id: string
  label: string
  number?: string
}

const props = withDefaults(defineProps<{
  eyebrow?: string
  title: string
  description: string
  topic?: string
  chapters: ImmersiveChapter[]
  activeId?: string
  focusMinutes?: number
  metaLabel?: string
  agentTitle?: string
  agentDetail?: string
  agentAction?: string
  agentTo?: RouteLocationRaw
  primaryLabel?: string
  primaryTo?: RouteLocationRaw
}>(), {
  eyebrow: 'TODAY · 今日学习',
  topic: '',
  activeId: '',
  focusMinutes: 25,
  metaLabel: '真实学习记录',
  agentTitle: '先从一小步开始。',
  agentDetail: '我会根据你已经保存的目标和学习记录，给出下一步建议。',
  agentAction: '打开 Agent',
  agentTo: '/agent',
  primaryLabel: '开始专注',
  primaryTo: '/focus',
})

const emit = defineEmits<{ 'chapter-change': [id: string] }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const localActiveId = ref(props.activeId || props.chapters[0]?.id || '')
const reducedMotion = ref(false)
const activeIndex = computed(() => Math.max(0, props.chapters.findIndex(chapter => chapter.id === localActiveId.value)))
const currentChapter = computed(() => props.chapters[activeIndex.value] || props.chapters[0] || { id: 'today', label: '今日学习', number: '01' })

type ThreeModule = typeof import('three')
type PageTexture = { canvas: HTMLCanvasElement; texture: import('three').CanvasTexture }
let three: ThreeModule | null = null
let renderer: import('three').WebGLRenderer | null = null
let scene: import('three').Scene | null = null
let camera: import('three').PerspectiveCamera | null = null
let bookRoot: import('three').Group | null = null
let leftPivot: import('three').Group | null = null
let rightPivot: import('three').Group | null = null
let orb: import('three').Mesh | null = null
let orbRing: import('three').Mesh | null = null
let pointField: import('three').Points | null = null
let pageTextures: PageTexture[] = []
let animationFrame = 0
let resizeHandler: (() => void) | null = null
let dragging = false
let lastPointerX = 0
let userRotation = 0

function selectChapter(id?: string) {
  if (!id) return
  localActiveId.value = id
  emit('chapter-change', id)
}

function drawPage(canvasElement: HTMLCanvasElement, title: string, body: string, side: 'left' | 'right') {
  const context = canvasElement.getContext('2d')!
  const width = canvasElement.width
  const height = canvasElement.height
  context.clearRect(0, 0, width, height)
  context.fillStyle = '#fbfaf7'
  context.fillRect(0, 0, width, height)
  const glow = context.createRadialGradient(width * .5, height * .35, 20, width * .5, height * .5, width)
  glow.addColorStop(0, 'rgba(255,255,255,.8)')
  glow.addColorStop(1, 'rgba(126,148,190,.12)')
  context.fillStyle = glow
  context.fillRect(0, 0, width, height)
  context.fillStyle = '#65708a'
  context.font = '500 24px Microsoft YaHei, sans-serif'
  context.fillText(side === 'left' ? 'TODAY · LEARNING NOTE' : 'HOLOGRAPHIC PATH', 62, 82)
  context.fillStyle = '#26324b'
  context.font = '700 42px Microsoft YaHei, sans-serif'
  const titleLines = title.match(/.{1,9}/g) || [title]
  titleLines.slice(0, 2).forEach((line, index) => context.fillText(line, 58, 160 + index * 54))
  context.fillStyle = '#68738b'
  context.font = '400 22px Microsoft YaHei, sans-serif'
  const bodyLines = body.match(/.{1,18}/g) || [body]
  bodyLines.slice(0, 7).forEach((line, index) => context.fillText(line, 62, 310 + index * 34))
  context.strokeStyle = 'rgba(107,126,164,.22)'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(58, height - 112)
  context.lineTo(width - 58, height - 112)
  context.stroke()
  context.fillStyle = '#8791a5'
  context.font = '400 20px Georgia, serif'
  context.fillText(side === 'left' ? 'KEEP MOVING, ONE SMALL STEP.' : 'AI CURATED LEARNING ROUTE', 62, height - 70)
}

function createPageTexture(title: string, body: string, side: 'left' | 'right'): PageTexture {
  const pageCanvas = document.createElement('canvas')
  pageCanvas.width = 768
  pageCanvas.height = 1024
  drawPage(pageCanvas, title, body, side)
  const texture = new three!.CanvasTexture(pageCanvas)
  texture.colorSpace = three!.SRGBColorSpace
  texture.anisotropy = 4
  return { canvas: pageCanvas, texture }
}

function updatePages() {
  if (!three || pageTextures.length < 2) return
  drawPage(pageTextures[0].canvas, props.title, props.description, 'left')
  drawPage(pageTextures[1].canvas, props.topic || currentChapter.value.label, props.agentDetail, 'right')
  pageTextures.forEach(page => { page.texture.needsUpdate = true })
}

function createScene() {
  if (!three || !canvas.value) return
  scene = new three.Scene()
  camera = new three.PerspectiveCamera(37, 1, .1, 100)
  camera.position.set(0, .55, 4.9)
  renderer = new three.WebGLRenderer({ canvas: canvas.value, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7))
  renderer.setSize(canvas.value.clientWidth || 800, canvas.value.clientHeight || 480, false)

  scene.add(new three.HemisphereLight(0xffffff, 0x9aa6bd, 1.15))
  const key = new three.PointLight(0x9cbcff, 5, 8)
  key.position.set(-2.4, 2.6, 3.6)
  scene.add(key)
  const warm = new three.PointLight(0xffd5a1, 2.5, 6)
  warm.position.set(2.2, .5, 2)
  scene.add(warm)

  const table = new three.Mesh(new three.PlaneGeometry(12, 12), new three.MeshStandardMaterial({ color: 0xe8edf5, roughness: .82, metalness: .04 }))
  table.rotation.x = -Math.PI / 2
  table.position.y = -1.12
  scene.add(table)

  bookRoot = new three.Group()
  bookRoot.position.set(0, -.45, 0)
  bookRoot.scale.setScalar(.78)
  scene.add(bookRoot)
  leftPivot = new three.Group()
  rightPivot = new three.Group()
  const pageGeometry = new three.PlaneGeometry(1.42, 1.88)
  const coverGeometry = new three.PlaneGeometry(1.5, 1.96)
  pageTextures = [
    createPageTexture(props.title, props.description, 'left'),
    createPageTexture(props.topic || currentChapter.value.label, props.agentDetail, 'right'),
  ]
  const leftCover = new three.Mesh(coverGeometry, new three.MeshStandardMaterial({ color: 0xd5e1f7, roughness: .46, metalness: .08, side: three.DoubleSide }))
  const rightCover = new three.Mesh(coverGeometry, new three.MeshStandardMaterial({ color: 0xd5e1f7, roughness: .46, metalness: .08, side: three.DoubleSide }))
  const leftPage = new three.Mesh(pageGeometry, new three.MeshStandardMaterial({ map: pageTextures[0].texture, roughness: .88, side: three.DoubleSide }))
  const rightPage = new three.Mesh(pageGeometry, new three.MeshStandardMaterial({ map: pageTextures[1].texture, roughness: .88, side: three.DoubleSide }))
  leftCover.position.x = -.76
  rightCover.position.x = .76
  leftPage.position.set(-.71, 0, .04)
  rightPage.position.set(.71, 0, .04)
  leftPivot.add(leftCover, leftPage)
  rightPivot.add(rightCover, rightPage)
  bookRoot.add(leftPivot, rightPivot)
  const spine = new three.Mesh(new three.BoxGeometry(.055, 1.98, .12), new three.MeshStandardMaterial({ color: 0xc5a45f, roughness: .42, metalness: .32 }))
  spine.position.z = .08
  bookRoot.add(spine)

  orb = new three.Mesh(new three.SphereGeometry(.34, 28, 28), new three.MeshStandardMaterial({ color: 0x7182e8, emissive: 0x4454b8, emissiveIntensity: .9, roughness: .24, metalness: .16, transparent: true, opacity: .92 }))
  orb.position.set(0, .55, .5)
  orb.scale.setScalar(.64)
  bookRoot.add(orb)
  orbRing = new three.Mesh(new three.TorusGeometry(.56, .012, 8, 96), new three.MeshBasicMaterial({ color: 0x8899ee, transparent: true, opacity: .56 }))
  orbRing.rotation.x = Math.PI / 2.2
  orbRing.position.copy(orb.position)
  orbRing.scale.setScalar(.68)
  bookRoot.add(orbRing)

  const pointCount = 120
  const positions = new Float32Array(pointCount * 3)
  for (let index = 0; index < pointCount; index += 1) {
    positions[index * 3] = (Math.random() - .5) * 3.2
    positions[index * 3 + 1] = Math.random() * 1.6 - .1
    positions[index * 3 + 2] = Math.random() * 1.2 - .3
  }
  const pointGeometry = new three.BufferGeometry()
  pointGeometry.setAttribute('position', new three.BufferAttribute(positions, 3))
  pointField = new three.Points(pointGeometry, new three.PointsMaterial({ color: 0x8292d9, size: .025, transparent: true, opacity: .38, blending: three.AdditiveBlending, depthWrite: false }))
  scene.add(pointField)

  resizeHandler = () => {
    if (!renderer || !camera || !canvas.value) return
    const width = canvas.value.clientWidth || 800
    const height = canvas.value.clientHeight || 480
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
  }
  window.addEventListener('resize', resizeHandler)
  canvas.value.addEventListener('pointerdown', onPointerDown)
  canvas.value.addEventListener('pointermove', onPointerMove)
  canvas.value.addEventListener('pointerup', onPointerUp)
  canvas.value.addEventListener('pointercancel', onPointerUp)
  resizeHandler()
  render()
}

function onPointerDown(event: PointerEvent) { dragging = true; lastPointerX = event.clientX; canvas.value?.setPointerCapture(event.pointerId) }
function onPointerMove(event: PointerEvent) { if (!dragging || !bookRoot) return; userRotation += (event.clientX - lastPointerX) * .006; lastPointerX = event.clientX }
function onPointerUp() { dragging = false }

function render() {
  if (!renderer || !scene || !camera || !bookRoot) return
  const time = performance.now() * .001
  if (!dragging && !reducedMotion.value) bookRoot.rotation.y = userRotation + Math.sin(time * .18) * .035
  if (leftPivot && rightPivot) { leftPivot.rotation.y = -.14; rightPivot.rotation.y = .14 }
  if (orb) { orb.position.y = .55 + Math.sin(time * .8) * .035; orb.rotation.y += .004 }
  if (orbRing) { orbRing.position.y = orb?.position.y || .55; orbRing.rotation.z += .006 }
  if (pointField && !reducedMotion.value) pointField.rotation.y += .0007
  camera.lookAt(0, -.2, 0)
  renderer.render(scene, camera)
  animationFrame = requestAnimationFrame(render)
}

function dispose() {
  cancelAnimationFrame(animationFrame)
  if (resizeHandler) window.removeEventListener('resize', resizeHandler)
  if (canvas.value) {
    canvas.value.removeEventListener('pointerdown', onPointerDown)
    canvas.value.removeEventListener('pointermove', onPointerMove)
    canvas.value.removeEventListener('pointerup', onPointerUp)
    canvas.value.removeEventListener('pointercancel', onPointerUp)
  }
  pageTextures.forEach(page => page.texture.dispose())
  scene?.traverse(object => {
    const mesh = object as import('three').Mesh & { geometry?: import('three').BufferGeometry; material?: import('three').Material | import('three').Material[] }
    mesh.geometry?.dispose()
    if (Array.isArray(mesh.material)) mesh.material.forEach(material => material.dispose())
    else mesh.material?.dispose()
  })
  renderer?.dispose()
  renderer = null
  scene = null
  three = null
}

watch(() => props.activeId, value => { if (value) localActiveId.value = value })
watch(() => [props.title, props.description, props.topic, currentChapter.value.id], updatePages)

onMounted(async () => {
  reducedMotion.value = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
  await nextTick()
  try {
    three = await import('three')
    createScene()
  } catch {
    // The HUD remains fully usable if WebGL is unavailable.
  }
})

onBeforeUnmount(dispose)
</script>

<style scoped>
.immersive-book { position: relative; min-height: 520px; overflow: hidden; border: 1px solid rgba(93,112,157,.16); border-radius: 25px; background: radial-gradient(circle at 50% 26%, rgba(220,229,255,.92), transparent 42%), linear-gradient(180deg, #f9fbff 0%, #edf2fb 100%); color: #24304a; box-shadow: 0 20px 60px rgba(49,71,116,.12), inset 0 1px 0 rgba(255,255,255,.9); isolation: isolate; }
.immersive-book__canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: grab; touch-action: none; opacity: .38; }
.immersive-book__canvas:active { cursor: grabbing; }
.immersive-book__vignette { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, rgba(249,251,255,.02) 0%, rgba(249,251,255,.18) 42%, rgba(249,251,255,.88) 77%, rgba(249,251,255,.98) 100%), radial-gradient(circle at 50% 48%, transparent 0 43%, rgba(89,111,160,.04) 82%, rgba(89,111,160,.14) 100%); }
.immersive-book__top,.immersive-book__hud,.immersive-book__controls { position: relative; z-index: 2; }
.immersive-book__top { display: flex; align-items: center; gap: 18px; padding: 16px 18px 0; }
.immersive-book__brand { display: flex; align-items: center; gap: 8px; flex: none; }
.immersive-book__brand-mark { display: grid; place-items: center; width: 30px; height: 30px; }
.immersive-book__brand b { display: block; font-size: 13px; font-weight: 650; letter-spacing: .08em; }
.immersive-book__brand small { display: block; margin-top: 3px; color: rgba(70,84,116,.58); font-size: 8px; letter-spacing: .16em; }
.immersive-book__chapters { display: flex; align-items: center; gap: 4px; max-width: 100%; padding: 5px; overflow-x: auto; border: 1px solid rgba(93,112,157,.16); border-radius: 13px; background: rgba(255,255,255,.72); box-shadow: 0 6px 18px rgba(59,78,121,.06); backdrop-filter: blur(12px); scrollbar-width: none; }
.immersive-book__chapters::-webkit-scrollbar { display: none; }
.immersive-book__chapters button { flex: none; min-height: 34px; padding: 7px 10px; border: 0; border-radius: 9px; color: #6d7891; background: transparent; font: inherit; font-size: 11px; cursor: pointer; white-space: nowrap; transition: background 180ms ease, color 180ms ease, box-shadow 180ms ease; }
.immersive-book__chapters button i { margin-right: 5px; color: #a0a9bc; font-size: 9px; font-style: normal; }
.immersive-book__chapters button.active { color: #2e4c9c; background: #e9efff; box-shadow: 0 3px 10px rgba(73,105,181,.12); }
.immersive-book__chapters button:focus-visible,.immersive-book__nav:focus-visible,.immersive-book__primary:focus-visible,.immersive-book__agent-link:focus-visible { outline: 3px solid rgba(55,105,213,.28); outline-offset: 2px; }
.immersive-book__hint { margin-left: auto; color: #7e8aa0; font-size: 10px; line-height: 1.6; text-align: right; white-space: nowrap; }
.immersive-book__hud { display: flex; align-items: flex-end; justify-content: space-between; gap: 22px; padding: 290px 20px 18px; pointer-events: none; }
.immersive-book__copy { max-width: 430px; padding: 14px 16px; border: 1px solid rgba(93,112,157,.12); border-radius: 18px; background: rgba(255,255,255,.72); box-shadow: 0 8px 24px rgba(59,78,121,.06); backdrop-filter: blur(12px); }
.immersive-book__eyebrow,.immersive-book__agent-label { margin: 0 0 8px; color: #5572c5; font-size: 10px; letter-spacing: .14em; }
.immersive-book__copy h2 { margin: 0 0 8px; color: #26324b; font-size: clamp(22px, 3.2vw, 32px); font-weight: 650; letter-spacing: -.03em; }
.immersive-book__copy > p:not(.immersive-book__eyebrow) { margin: 0; max-width: 40em; color: #68748b; font-size: 13px; line-height: 1.75; }
.immersive-book__meta { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 13px; color: #7c879a; font-size: 11px; }
.immersive-book__meta span { display: inline-flex; align-items: center; gap: 5px; }
.immersive-book__agent { width: min(280px, 32%); padding: 15px; border: 1px solid rgba(93,112,157,.16); border-radius: 16px; background: rgba(255,255,255,.72); box-shadow: 0 10px 26px rgba(59,78,121,.08); backdrop-filter: blur(14px); pointer-events: auto; }
.immersive-book__agent h3 { margin: 0 0 6px; color: #2b3854; font-size: 15px; font-weight: 650; }
.immersive-book__agent > p:not(.immersive-book__agent-label) { margin: 0; color: #6d7890; font-size: 12px; line-height: 1.7; }
.immersive-book__agent-link { display: inline-flex; align-items: center; gap: 4px; min-height: 36px; margin-top: 10px; color: #4665bb; font-size: 12px; text-decoration: none; }
.immersive-book__controls { display: flex; align-items: center; justify-content: center; gap: 13px; width: max-content; max-width: calc(100% - 28px); margin: 0 auto 16px; padding: 8px 10px; border: 1px solid rgba(93,112,157,.16); border-radius: 17px; background: rgba(255,255,255,.76); box-shadow: 0 10px 24px rgba(59,78,121,.08); backdrop-filter: blur(14px); }
.immersive-book__nav { display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid rgba(93,112,157,.22); border-radius: 50%; color: #5b6b8d; background: rgba(255,255,255,.6); font: inherit; font-size: 19px; cursor: pointer; transition: background 180ms ease, transform 180ms ease; }
.immersive-book__nav:hover:not(:disabled) { background: #edf2ff; transform: translateY(-1px); }
.immersive-book__nav:disabled { opacity: .25; cursor: default; }
.immersive-book__chapter-title { min-width: 130px; text-align: center; }
.immersive-book__chapter-title small { display: block; margin-bottom: 2px; color: #9aa5b8; font-size: 9px; letter-spacing: .24em; }
.immersive-book__chapter-title b { color: #354360; font-size: 13px; font-weight: 650; letter-spacing: .08em; }
.immersive-book__primary { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px; border: 1px solid rgba(55,105,213,.22); border-radius: 11px; color: #3557af; background: #edf2ff; font-size: 12px; text-decoration: none; transition: background 180ms ease, transform 180ms ease; }
.immersive-book__primary:hover { background: #e4ebff; transform: translateY(-1px); }

@media (max-width: 900px) {
  .immersive-book { min-height: 540px; }
  .immersive-book__top { align-items: flex-start; flex-wrap: wrap; padding: 14px 14px 0; }
  .immersive-book__chapters { order: 3; width: 100%; }
  .immersive-book__hint { display: none; }
  .immersive-book__hud { align-items: stretch; flex-direction: column; padding: 210px 14px 14px; gap: 10px; }
  .immersive-book__agent { width: 100%; }
  .immersive-book__controls { margin-bottom: 12px; }
}

@media (max-width: 479px) {
  .immersive-book { min-height: 570px; border-radius: 21px; }
  .immersive-book__brand small { display: none; }
  .immersive-book__brand b { font-size: 12px; }
  .immersive-book__canvas { opacity: .27; }
  .immersive-book__copy { padding: 13px 14px; }
  .immersive-book__hud { padding-top: 165px; }
  .immersive-book__copy h2 { font-size: 24px; }
  .immersive-book__copy > p:not(.immersive-book__eyebrow) { font-size: 12px; }
  .immersive-book__agent { padding: 12px; }
  .immersive-book__agent h3 { font-size: 14px; }
  .immersive-book__controls { gap: 8px; }
  .immersive-book__chapter-title { min-width: 102px; }
  .immersive-book__primary { padding-inline: 9px; font-size: 11px; }
}

@media (prefers-reduced-motion: reduce) {
  .immersive-book__chapters button,.immersive-book__nav,.immersive-book__primary { transition: none; }
}
</style>
