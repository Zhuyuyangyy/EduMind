<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const loading = ref(true)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let animationId = 0
let centralModel: THREE.Group | null = null
let moduleNodes: THREE.Mesh[] = []
let particleSystem: THREE.Points | null = null
let connectionLines: THREE.Line[] = []

const moduleNames = ['学习画像', '智能体协同', '反向评估', '知识图谱', '学习路径', '资源中心']
const moduleColors = [0x00d4ff, 0x34d399, 0xf59e0b, 0xa78bfa, 0xfb7185, 0x60a5fa]
const moduleImageUrls = [
  '/login-hub/module-1.png',
  '/login-hub/module-2.png',
  '/login-hub/module-3.png',
  '/login-hub/module-4.png',
  '/login-hub/module-5.png',
  '/login-hub/module-6.png',
]

interface ParticleData {
  position: THREE.Vector3
  velocity: THREE.Vector3
  targetIndex: number
  life: number
  maxLife: number
}

const particles: ParticleData[] = []
const maxParticles = 120

function createModuleNode(index: number, total: number): { mesh: THREE.Mesh; angle: number; position: THREE.Vector3 } {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2
  const radius = 3.2
  const x = Math.cos(angle) * radius
  const z = Math.sin(angle) * radius
  const y = (Math.sin(index * 1.3) * 0.3)

  const group = new THREE.Group()

  const glowGeometry = new THREE.RingGeometry(0.45, 0.55, 32)
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: moduleColors[index],
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
  })
  const glow = new THREE.Mesh(glowGeometry, glowMaterial)
  group.add(glow)

  const ringGeometry = new THREE.TorusGeometry(0.5, 0.02, 16, 64)
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: moduleColors[index],
    transparent: true,
    opacity: 0.8,
  })
  const ring = new THREE.Mesh(ringGeometry, ringMaterial)
  group.add(ring)

  const planeGeometry = new THREE.PlaneGeometry(0.75, 0.75)
  const textureLoader = new THREE.TextureLoader()
  const texture = textureLoader.load(moduleImageUrls[index])
  texture.colorSpace = THREE.SRGBColorSpace
  const planeMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
  })
  const imagePlane = new THREE.Mesh(planeGeometry, planeMaterial)
  imagePlane.position.z = 0.01
  group.add(imagePlane)

  const innerGlowGeometry = new THREE.CircleGeometry(0.12, 32)
  const innerGlowMaterial = new THREE.MeshBasicMaterial({
    color: moduleColors[index],
    transparent: true,
    opacity: 0.9,
  })
  const innerGlow = new THREE.Mesh(innerGlowGeometry, innerGlowMaterial)
  innerGlow.position.z = -0.01
  group.add(innerGlow)

  group.position.set(x, y, z)
  group.lookAt(0, y, 0)
  group.userData = {
    index,
    baseY: y,
    phase: index * 0.8,
    glow,
    ring,
    color: moduleColors[index],
  }

  return { mesh: group as unknown as THREE.Mesh, angle, position: new THREE.Vector3(x, y, z) }
}

function createParticles() {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(maxParticles * 3)
  const colors = new Float32Array(maxParticles * 3)
  const sizes = new Float32Array(maxParticles)
  const alphas = new Float32Array(maxParticles)

  for (let i = 0; i < maxParticles; i++) {
    positions[i * 3] = 0
    positions[i * 3 + 1] = 0
    positions[i * 3 + 2] = 0
    colors[i * 3] = 0
    colors[i * 3 + 1] = 0.8
    colors[i * 3 + 2] = 1
    sizes[i] = 0.04
    alphas[i] = 0
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1))

  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      pixelRatio: { value: window.devicePixelRatio || 1 },
    },
    vertexShader: `
      attribute float size;
      attribute float alpha;
      varying float vAlpha;
      varying vec3 vColor;
      uniform float pixelRatio;
      void main() {
        vAlpha = alpha;
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * 300.0 * pixelRatio / -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float glow = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor, vAlpha * glow);
      }
    `,
    transparent: true,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  particleSystem = new THREE.Points(geometry, material)
  scene!.add(particleSystem)
}

function spawnParticle() {
  if (particles.length >= maxParticles) return
  const targetIndex = Math.floor(Math.random() * moduleNodes.length)
  const targetNode = moduleNodes[targetIndex]
  const targetPos = targetNode.position.clone()

  const startRadius = 0.3 + Math.random() * 0.2
  const startAngle = Math.random() * Math.PI * 2
  const startY = (Math.random() - 0.5) * 0.3
  const startPos = new THREE.Vector3(
    Math.cos(startAngle) * startRadius,
    startY,
    Math.sin(startAngle) * startRadius,
  )

  const direction = targetPos.clone().sub(startPos).normalize()
  const speed = 0.012 + Math.random() * 0.018

  particles.push({
    position: startPos,
    velocity: direction.multiplyScalar(speed),
    targetIndex,
    life: 1,
    maxLife: 1,
  })
}

function createConnectionLines() {
  moduleNodes.forEach((node) => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      node.position.clone(),
    ]
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({
      color: node.userData.color,
      transparent: true,
      opacity: 0.25,
    })
    const line = new THREE.Line(geometry, material)
    line.userData = { targetIndex: node.userData.index }
    connectionLines.push(line)
    scene!.add(line)
  })
}

function initScene() {
  if (!canvasRef.value) return

  const container = canvasRef.value.parentElement
  const width = container?.clientWidth || window.innerWidth
  const height = container?.clientHeight || window.innerHeight

  scene = new THREE.Scene()

  camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
  camera.position.set(0, 1.5, 7.5)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,
    alpha: true,
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(width, height)
  renderer.setClearColor(0x000000, 0)

  const ambientLight = new THREE.AmbientLight(0x4488ff, 0.6)
  scene.add(ambientLight)

  const mainLight = new THREE.DirectionalLight(0x88ccff, 1.2)
  mainLight.position.set(3, 5, 3)
  scene.add(mainLight)

  const rimLight = new THREE.DirectionalLight(0x00ffff, 0.5)
  rimLight.position.set(-3, 2, -3)
  scene.add(rimLight)

  const loader = new GLTFLoader()
  loader.load(
    '/login-hub/central-model.glb',
    (gltf) => {
      centralModel = gltf.scene

      const box = new THREE.Box3().setFromObject(centralModel)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      const scale = 2.2 / maxDim
      centralModel.scale.setScalar(scale)
      centralModel.position.sub(center.multiplyScalar(scale))

      centralModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const material = child.material as THREE.MeshStandardMaterial
          if (material) {
            material.emissive = new THREE.Color(0x0044aa)
            material.emissiveIntensity = 0.3
            material.metalness = 0.7
            material.roughness = 0.3
          }
        }
      })

      scene!.add(centralModel)
      loading.value = false
    },
    undefined,
    (error) => {
      console.warn('GLB model load failed, using fallback:', error)
      const fallbackGeometry = new THREE.IcosahedronGeometry(1, 2)
      const fallbackMaterial = new THREE.MeshStandardMaterial({
        color: 0x0088ff,
        emissive: 0x0044aa,
        emissiveIntensity: 0.4,
        metalness: 0.8,
        roughness: 0.2,
        wireframe: false,
      })
      centralModel = new THREE.Mesh(fallbackGeometry, fallbackMaterial) as unknown as THREE.Group
      scene!.add(centralModel)
      loading.value = false
    },
  )

  for (let i = 0; i < 6; i++) {
    const nodeData = createModuleNode(i, 6)
    moduleNodes.push(nodeData.mesh)
    scene.add(nodeData.mesh)
  }

  createConnectionLines()
  createParticles()

  const starGeometry = new THREE.BufferGeometry()
  const starCount = 500
  const starPositions = new Float32Array(starCount * 3)
  for (let i = 0; i < starCount; i++) {
    const radius = 10 + Math.random() * 15
    const theta = Math.random() * Math.PI * 2
    const phi = Math.random() * Math.PI
    starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    starPositions[i * 3 + 1] = radius * Math.cos(phi)
    starPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta)
  }
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  const starMaterial = new THREE.PointsMaterial({
    color: 0x88ccff,
    size: 0.03,
    transparent: true,
    opacity: 0.6,
  })
  const stars = new THREE.Points(starGeometry, starMaterial)
  scene.add(stars)
}

function resize() {
  if (!canvasRef.value || !renderer || !camera) return
  const container = canvasRef.value.parentElement
  const width = container?.clientWidth || window.innerWidth
  const height = container?.clientHeight || window.innerHeight
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
}

function animate(time: number) {
  animationId = requestAnimationFrame(animate)

  const t = time * 0.001

  if (centralModel) {
    centralModel.rotation.y = t * 0.25
    centralModel.position.y = Math.sin(t * 0.8) * 0.08
  }

  moduleNodes.forEach((node, i) => {
    const userData = node.userData
    node.position.y = userData.baseY + Math.sin(t * 0.6 + userData.phase) * 0.15
    node.rotation.z = t * 0.3 + userData.phase
    if (userData.glow) {
      userData.glow.material.opacity = 0.4 + Math.sin(t * 1.5 + userData.phase) * 0.2
    }
    if (userData.ring) {
      userData.ring.rotation.z = t * 0.5 + userData.phase
      userData.ring.scale.setScalar(1 + Math.sin(t * 1.2 + userData.phase) * 0.08)
    }
  })

  if (Math.random() < 0.4) spawnParticle()

  const positions = particleSystem?.geometry.attributes.position.array as Float32Array
  const colors = particleSystem?.geometry.attributes.color.array as Float32Array
  const alphas = particleSystem?.geometry.attributes.alpha.array as Float32Array

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.position.add(p.velocity)
    p.life -= 0.012

    const targetNode = moduleNodes[p.targetIndex]
    const distToTarget = p.position.distanceTo(targetNode.position)

    if (p.life <= 0 || distToTarget < 0.25) {
      particles.splice(i, 1)
      continue
    }

    const idx = i
    positions[idx * 3] = p.position.x
    positions[idx * 3 + 1] = p.position.y
    positions[idx * 3 + 2] = p.position.z

    const color = new THREE.Color(moduleColors[p.targetIndex])
    colors[idx * 3] = color.r
    colors[idx * 3 + 1] = color.g
    colors[idx * 3 + 2] = color.b

    const fadeIn = Math.min(1, (1 - p.life) * 5)
    const fadeOut = p.life
    alphas[idx] = fadeIn * fadeOut * 0.9
  }

  for (let i = particles.length; i < maxParticles; i++) {
    positions[i * 3] = 0
    positions[i * 3 + 1] = -100
    positions[i * 3 + 2] = 0
    alphas[i] = 0
  }

  if (particleSystem) {
    particleSystem.geometry.attributes.position.needsUpdate = true
    particleSystem.geometry.attributes.color.needsUpdate = true
    particleSystem.geometry.attributes.alpha.needsUpdate = true
  }

  connectionLines.forEach((line) => {
    const material = line.material as THREE.LineBasicMaterial
    const targetIdx = line.userData.targetIndex
    material.opacity = 0.15 + Math.sin(t * 1.2 + targetIdx * 0.9) * 0.1
  })

  if (camera) {
    camera.position.x = Math.sin(t * 0.08) * 0.3
    camera.position.y = 1.5 + Math.sin(t * 0.12) * 0.1
    camera.lookAt(0, 0, 0)
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}

function cleanup() {
  cancelAnimationFrame(animationId)
  if (renderer) {
    renderer.dispose()
  }
  if (particleSystem) {
    particleSystem.geometry.dispose()
    ;(particleSystem.material as THREE.Material).dispose()
  }
  moduleNodes.forEach((node) => {
    if (node.parent) node.parent.remove(node)
    node.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
  })
  connectionLines.forEach((line) => {
    line.geometry.dispose()
    ;(line.material as THREE.Material).dispose()
  })
}

onMounted(() => {
  initScene()
  window.addEventListener('resize', resize)
  animationId = requestAnimationFrame(animate)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  cleanup()
})
</script>

<template>
  <div class="hub-scene-container">
    <canvas ref="canvasRef" class="hub-canvas" />
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner" />
      <span class="loading-text">系统初始化中...</span>
    </div>
    <div class="hub-labels">
      <div
        v-for="(name, index) in moduleNames"
        :key="index"
        class="module-label"
        :style="{ '--idx': index, '--color': `#${moduleColors[index].toString(16).padStart(6, '0')}` }"
      >
        {{ name }}
      </div>
    </div>
    <div class="hub-core-title">
          <h2>智学星枢平台</h2>
      <p>AI-Powered Multi-Agent Learning System</p>
    </div>
  </div>
</template>

<style scoped>
.hub-scene-container {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 500px;
}

.hub-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: rgba(2, 8, 22, 0.6);
  backdrop-filter: blur(8px);
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 2px solid rgba(0, 180, 255, 0.2);
  border-top-color: #00d4ff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 14px;
  color: rgba(150, 220, 255, 0.8);
  letter-spacing: 0.1em;
}

.hub-labels {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.module-label {
  position: absolute;
  font-size: 13px;
  font-weight: 600;
  color: #e0f2ff;
  padding: 6px 14px;
  border-radius: 20px;
  background: rgba(8, 24, 56, 0.6);
  border: 1px solid var(--color);
  backdrop-filter: blur(12px);
  white-space: nowrap;
  transform: translate(-50%, -50%);
  text-shadow: 0 0 20px var(--color);
  box-shadow: 0 0 20px color-mix(in srgb, var(--color) 30%, transparent);
  animation: label-float 3s ease-in-out infinite;
  animation-delay: calc(var(--idx) * 0.3s);
}

.module-label:nth-child(1) { top: 12%; left: 50%; }
.module-label:nth-child(2) { top: 28%; left: 82%; }
.module-label:nth-child(3) { top: 68%; left: 82%; }
.module-label:nth-child(4) { top: 82%; left: 50%; }
.module-label:nth-child(5) { top: 68%; left: 18%; }
.module-label:nth-child(6) { top: 28%; left: 18%; }

@keyframes label-float {
  0%, 100% { transform: translate(-50%, -50%) translateY(0); opacity: 0.9; }
  50% { transform: translate(-50%, -50%) translateY(-6px); opacity: 1; }
}

.hub-core-title {
  position: absolute;
  bottom: 8%;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  pointer-events: none;
}

.hub-core-title h2 {
  margin: 0;
  font-size: 28px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.15em;
  text-shadow: 0 0 30px rgba(0, 180, 255, 0.6), 0 0 60px rgba(0, 120, 255, 0.3);
}

.hub-core-title p {
  margin: 8px 0 0;
  font-size: 12px;
  color: rgba(130, 200, 255, 0.7);
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

@media (max-width: 900px) {
  .hub-core-title h2 {
    font-size: 22px;
  }
  .module-label {
    font-size: 11px;
    padding: 4px 10px;
  }
  .module-label:nth-child(1) { top: 10%; }
  .module-label:nth-child(2) { top: 25%; left: 78%; }
  .module-label:nth-child(3) { top: 72%; left: 78%; }
  .module-label:nth-child(4) { top: 85%; }
  .module-label:nth-child(5) { top: 72%; left: 22%; }
  .module-label:nth-child(6) { top: 25%; left: 22%; }
}
</style>
