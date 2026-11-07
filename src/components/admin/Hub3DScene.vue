<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'

const containerRef = ref<HTMLDivElement | null>(null)
const loading = ref(true)

let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let renderer: THREE.WebGLRenderer | null = null
let animationId = 0
let centralSprite: THREE.Sprite | null = null
let glowSprite: THREE.Sprite | null = null
let particlesData: {
  curve: THREE.QuadraticBezierCurve3
  progress: number
  speed: number
  color: THREE.Color
}[] = []
let particleSystem: THREE.Points | null = null
let ambientParticles: THREE.Points | null = null
let flowTubes: THREE.Mesh[] = []
let agentNodes: THREE.Sprite[] = []

const agentConfigs = [
  { name: '学习诊断智能体', img: '/bigscreen-hub/agent-1.jpg', pos: { x: -5.2, y: 2.6 } },
  { name: '知识图谱智能体', img: '/bigscreen-hub/agent-2.jpg', pos: { x: 5.2, y: 2.6 } },
  { name: '资源推荐智能体', img: '/bigscreen-hub/agent-3.jpg', pos: { x: -6.6, y: 0 } },
  { name: '任务调度智能体', img: '/bigscreen-hub/agent-4.jpg', pos: { x: 6.6, y: 0 } },
  { name: '反向评估智能体', img: '/bigscreen-hub/agent-5.jpg', pos: { x: -5.2, y: -2.6 } },
  { name: '画像生成智能体', img: '/bigscreen-hub/agent-6.jpg', pos: { x: 5.2, y: -2.6 } },
]

const FLOW_COLOR = 0x35c7ff

// 用 flood fill 抠掉深蓝背景，返回 canvas texture
function removeBackground(img: HTMLImageElement, thresh = 40) {
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const w = canvas.width
  const h = canvas.height
  const visited = new Uint8Array(w * h)
  const bgColor = [data[0], data[1], data[2]]
  const queue: number[] = []

  const add = (x: number, y: number) => {
    const idx = y * w + x
    if (x < 0 || x >= w || y < 0 || y >= h || visited[idx]) return
    const i = idx * 4
    const diff =
      Math.abs(data[i] - bgColor[0]) +
      Math.abs(data[i + 1] - bgColor[1]) +
      Math.abs(data[i + 2] - bgColor[2])
    if (diff < thresh) {
      visited[idx] = 1
      data[i + 3] = 0
      queue.push(idx)
    }
  }

  add(0, 0)
  add(w - 1, 0)
  add(0, h - 1)
  add(w - 1, h - 1)

  while (queue.length) {
    const idx = queue.shift()!
    const x = idx % w
    const y = Math.floor(idx / w)
    add(x + 1, y)
    add(x - 1, y)
    add(x, y + 1)
    add(x, y - 1)
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

function loadTexture(src: string, removeBg = false): Promise<THREE.Texture> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (removeBg) {
        const canvas = removeBackground(img, 42)
        const tex = new THREE.CanvasTexture(canvas)
        tex.needsUpdate = true
        resolve(tex)
      } else {
        const tex = new THREE.Texture(img)
        tex.needsUpdate = true
        resolve(tex)
      }
    }
    img.onerror = () => resolve(new THREE.Texture())
    img.src = src
  })
}

function init() {
  const container = containerRef.value
  if (!container) return

  const width = container.clientWidth
  const height = container.clientHeight

  scene = new THREE.Scene()

  camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000)
  camera.position.set(0, 0.4, 12)
  camera.lookAt(0, -0.1, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  container.appendChild(renderer.domElement)

  createStarfield()
  createAmbientParticles()

  Promise.all([
    loadTexture('/manager.png', true),
    ...agentConfigs.map((c) => loadTexture(c.img)),
  ]).then(([managerTex, ...agentTextures]) => {
    // 中央 manager.png（已抠背景）
    const spriteMat = new THREE.SpriteMaterial({
      map: managerTex,
      transparent: true,
      depthWrite: false,
    })
    centralSprite = new THREE.Sprite(spriteMat)
    centralSprite.scale.set(7.0, 3.5, 1)
    centralSprite.position.set(0, -0.2, 0)
    scene!.add(centralSprite)

    // 中央背后光晕
    const glowCanvas = document.createElement('canvas')
    glowCanvas.width = 512
    glowCanvas.height = 512
    const gctx = glowCanvas.getContext('2d')!
    const grad = gctx.createRadialGradient(256, 256, 40, 256, 256, 220)
    grad.addColorStop(0, 'rgba(62, 158, 255, 0.35)')
    grad.addColorStop(0.5, 'rgba(53, 199, 255, 0.12)')
    grad.addColorStop(1, 'rgba(62, 158, 255, 0)')
    gctx.fillStyle = grad
    gctx.fillRect(0, 0, 512, 512)
    const glowTex = new THREE.CanvasTexture(glowCanvas)
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    glowSprite = new THREE.Sprite(glowMat)
    glowSprite.scale.set(9, 9, 1)
    glowSprite.position.set(0, -0.2, -0.5)
    scene!.add(glowSprite)

    // 6个节点图片
    agentConfigs.forEach((config, idx) => {
      const spriteMat = new THREE.SpriteMaterial({
        map: agentTextures[idx],
        transparent: true,
        depthWrite: false,
      })
      const sprite = new THREE.Sprite(spriteMat)
      sprite.position.set(config.pos.x, config.pos.y, 0.5)
      sprite.scale.set(2.4, 1.8, 1)
      ;(sprite as any).userData = { config }
      agentNodes.push(sprite)
      scene!.add(sprite)
    })

    createFlowTubes()
    createParticles()
    loading.value = false
  })

  const resizeObserver = new ResizeObserver(() => {
    if (!container || !camera || !renderer) return
    const w = container.clientWidth
    const h = container.clientHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  })
  resizeObserver.observe(container)
  ;(renderer as any)._resizeObserver = resizeObserver
}

function createStarfield() {
  const starGeo = new THREE.BufferGeometry()
  const starCount = 800
  const positions = new Float32Array(starCount * 3)
  for (let i = 0; i < starCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 50
    positions[i * 3 + 1] = (Math.random() - 0.5) * 32
    positions[i * 3 + 2] = (Math.random() - 0.5) * 30 - 10
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const starMat = new THREE.PointsMaterial({ color: 0xaaccff, size: 0.04, transparent: true, opacity: 0.5 })
  scene!.add(new THREE.Points(starGeo, starMat))
}

// 环境漂浮光点
function createAmbientParticles() {
  const count = 120
  const positions = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const speeds: number[] = []
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 18
    positions[i * 3 + 1] = (Math.random() - 0.5) * 10
    positions[i * 3 + 2] = (Math.random() - 0.5) * 4 - 1
    sizes[i] = 0.04 + Math.random() * 0.06
    speeds.push(0.2 + Math.random() * 0.4)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  ;(geo as any).userData = { speeds, basePositions: positions.slice() }

  const mat = new THREE.ShaderMaterial({
    vertexShader: `
      attribute float size;
      varying float vAlpha;
      void main() {
        vAlpha = 0.4 + 0.4 * sin(position.y * 2.0);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (280.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float a = (1.0 - smoothstep(0.0, 0.45, d)) * vAlpha;
        gl_FragColor = vec4(0.6, 0.85, 1.0, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  ambientParticles = new THREE.Points(geo, mat)
  scene!.add(ambientParticles)
}

function getCentralConnectionPoint(config: typeof agentConfigs[0]) {
  const { x, y } = config.pos
  const edgeX = x < 0 ? -3.5 : 3.5
  const edgeY = Math.max(-1.4, Math.min(1.4, y * 0.55))
  return new THREE.Vector3(edgeX, edgeY, 0)
}

function getNodeConnectionPoint(config: typeof agentConfigs[0]) {
  const { x, y } = config.pos
  const offset = x < 0 ? 1.1 : -1.1
  return new THREE.Vector3(x + offset, y, 0.5)
}

function createFlowTubes() {
  agentConfigs.forEach((config) => {
    const start = getCentralConnectionPoint(config)
    const end = getNodeConnectionPoint(config)

    const mid = new THREE.Vector3().lerpVectors(start, end, 0.5)
    mid.z += 0.25

    const curve = new THREE.QuadraticBezierCurve3(start, mid, end)

    const tubeGeo = new THREE.TubeGeometry(curve, 36, 0.035, 8, false)
    const tubeMat = new THREE.MeshBasicMaterial({
      color: FLOW_COLOR,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const tube = new THREE.Mesh(tubeGeo, tubeMat)
    ;(tube as any).userData = { baseOp: 0.2 }
    flowTubes.push(tube)
    scene!.add(tube)

    const coreGeo = new THREE.TubeGeometry(curve, 36, 0.014, 8, false)
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x88e0ff,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const core = new THREE.Mesh(coreGeo, coreMat)
    ;(core as any).userData = { baseOp: 0.45, isCore: true }
    flowTubes.push(core)
    scene!.add(core)
  })
}

function createParticles() {
  const particleCount = 720
  const positions = new Float32Array(particleCount * 3)
  const colors = new Float32Array(particleCount * 3)
  const sizes = new Float32Array(particleCount)

  particlesData = []

  for (let i = 0; i < particleCount; i++) {
    const agentIdx = i % agentConfigs.length
    const config = agentConfigs[agentIdx]
    const start = getCentralConnectionPoint(config)
    const end = getNodeConnectionPoint(config)
    const mid = new THREE.Vector3().lerpVectors(start, end, 0.5)
    mid.z += 0.25
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end)

    particlesData.push({
      curve,
      progress: Math.random(),
      speed: 0.003 + Math.random() * 0.006,
      color: new THREE.Color(FLOW_COLOR),
    })

    positions[i * 3] = 0
    positions[i * 3 + 1] = 0
    positions[i * 3 + 2] = 0
    colors[i * 3] = particlesData[i].color.r
    colors[i * 3 + 1] = particlesData[i].color.g
    colors[i * 3 + 2] = particlesData[i].color.b
    sizes[i] = 0.07 + Math.random() * 0.05
  }

  const particleGeo = new THREE.BufferGeometry()
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  particleGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

  const particleMat = new THREE.ShaderMaterial({
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (360.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float a = 1.0 - smoothstep(0.0, 0.45, d);
        gl_FragColor = vec4(vColor, a);
      }
    `,
    transparent: true,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  particleSystem = new THREE.Points(particleGeo, particleMat)
  scene!.add(particleSystem)
}

function animate() {
  animationId = requestAnimationFrame(animate)
  if (!scene || !camera || !renderer) return

  const time = performance.now() * 0.001

  if (centralSprite) {
    const s = 1 + Math.sin(time * 0.8) * 0.015
    centralSprite.scale.set(7.0 * s, 3.5 * s, 1)
  }

  if (glowSprite) {
    const gs = 1 + Math.sin(time * 0.6) * 0.05
    glowSprite.scale.set(9 * gs, 9 * gs, 1)
    const mat = glowSprite.material as THREE.SpriteMaterial
    mat.opacity = 0.7 + Math.sin(time * 1.2) * 0.2
  }

  agentNodes.forEach((node, idx) => {
    const ud = (node as any).userData
    if (!ud) return
    const { x, y } = ud.config.pos
    node.position.y = y + Math.sin(time * 0.7 + idx * 0.9) * 0.06
    node.position.x = x
  })

  // 环境光点漂浮
  if (ambientParticles) {
    const geo = ambientParticles.geometry
    const positions = geo.attributes.position.array as Float32Array
    const base = geo.userData.basePositions as Float32Array
    const speeds = geo.userData.speeds as number[]
    for (let i = 0; i < speeds.length; i++) {
      positions[i * 3 + 1] = base[i * 3 + 1] + Math.sin(time * speeds[i] + i) * 0.3
      positions[i * 3] = base[i * 3] + Math.cos(time * speeds[i] * 0.5 + i) * 0.1
    }
    geo.attributes.position.needsUpdate = true
  }

  if (particleSystem) {
    const positions = particleSystem.geometry.attributes.position.array as Float32Array
    particlesData.forEach((p, i) => {
      p.progress += p.speed
      if (p.progress > 1) p.progress = 0
      const point = p.curve.getPoint(p.progress)
      positions[i * 3] = point.x
      positions[i * 3 + 1] = point.y
      positions[i * 3 + 2] = point.z
    })
    particleSystem.geometry.attributes.position.needsUpdate = true
  }

  flowTubes.forEach((tube, idx) => {
    const mat = tube.material as THREE.MeshBasicMaterial
    const base = (tube as any).userData?.baseOp ?? 0.2
    const isCore = (tube as any).userData?.isCore
    mat.opacity = base + Math.sin(time * (isCore ? 2.2 : 1.6) + idx * 0.5) * (isCore ? 0.15 : 0.07)
  })

  camera.position.x = Math.sin(time * 0.08) * 0.3
  camera.position.y = 0.4 + Math.sin(time * 0.12) * 0.08
  camera.lookAt(0, -0.1, 0)

  renderer.render(scene, camera)
}

onMounted(() => {
  init()
  animate()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationId)
  if (renderer) {
    const ro = (renderer as any)._resizeObserver
    if (ro) ro.disconnect()
    renderer.dispose()
    if (containerRef.value && renderer.domElement.parentNode === containerRef.value) {
      containerRef.value.removeChild(renderer.domElement)
    }
  }
})
</script>

<template>
  <div ref="containerRef" class="hub-3d-container">
    <div v-if="loading" class="hub-loading">
      <div class="loading-spinner" />
      <span>中枢加载中...</span>
    </div>
  </div>
</template>

<style scoped>
.hub-3d-container {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  overflow: hidden;
}

.hub-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  justify-content: center;
  color: rgba(120, 200, 255, 0.8);
  font-size: 12px;
  z-index: 50;
}

.loading-spinner {
  width: 36px;
  height: 36px;
  border: 2px solid rgba(62, 158, 255, 0.2);
  border-top-color: #35c7ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
