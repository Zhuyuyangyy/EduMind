<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  BarkType,
  Billboard,
  Tree,
  TreePreset,
  TreeType,
} from '@dgreenheck/ez-tree'
import { applyEzTreeAtmosphere, preloadEzTreeAssets } from './EzTreeEnvironment'

interface KnowledgePoint {
  id?: string
  name: string
  status?: 'none' | 'weak' | 'beginner' | 'basic' | 'proficient' | 'mastered'
  progress?: number
  course?: string
  prerequisiteIds?: string[]
  labelBadge?: string
  labelTone?: 'danger' | 'warning' | 'info' | 'success'
}

type MarkerType = 'course' | 'branch' | 'knowledge'

interface GraphMarker {
  id: string
  type: MarkerType
  label: string
  status?: KnowledgePoint['status']
  progress?: number
  labelBadge?: string
  labelTone?: KnowledgePoint['labelTone']
  description: string
  items?: string[]
}

const props = withDefaults(
  defineProps<{
    modelUrl?: string
    treeConfigUrl?: string
    preferModel?: boolean
    height?: number | string
    fill?: boolean
    knowledgePoints?: KnowledgePoint[]
    sceneScale?: number
    sceneOffsetY?: number
    sceneStretchY?: number
    hideExposedRoots?: boolean
    horizontalOnlyControls?: boolean
    showBackgroundStage?: boolean
    backgroundStageVariant?: 'default' | 'diagnostic'
    sceneDepthOffset?: number
    sceneOffsetX?: number
    highlightNames?: string[]
  }>(),
  {
    treeConfigUrl: '/knowledge-tree/tree.json',
    preferModel: false,
    height: 480,
    fill: false,
    knowledgePoints: () => [],
    sceneScale: 14.8,
    sceneOffsetY: 0.2,
    sceneStretchY: 1,
    horizontalOnlyControls: false,
    showBackgroundStage: true,
    backgroundStageVariant: 'default',
    sceneDepthOffset: 0,
    sceneOffsetX: 0,
    highlightNames: () => [],
  },
)

const emit = defineEmits<{
  markerSelect: [marker: GraphMarker]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const loading = ref(true)
const loadError = ref(false)
const selectedMarkerId = ref<string | null>(null)

const fallbackPoints: KnowledgePoint[] = [
  { name: '编程基础', status: 'mastered', progress: 90, course: '课程主干' },
  { name: '数据结构', status: 'basic', progress: 68, course: '能力分支' },
  { name: '图结构与搜索', status: 'weak', progress: 38, course: '薄弱补救' },
  { name: '算法迁移', status: 'none', progress: 22, course: '下一步' },
]

const displayPoints = computed(() => (props.knowledgePoints.length ? props.knowledgePoints : fallbackPoints))

const courseProgress = computed(() => {
  if (!displayPoints.value.length) return 0
  const total = displayPoints.value.reduce((sum, point) => sum + (point.progress ?? 0), 0)
  return Math.round(total / displayPoints.value.length)
})

const branchGroups = computed(() => {
  const map = new Map<string, KnowledgePoint[]>()
  displayPoints.value.forEach(point => {
    const course = point.course ?? '知识模块'
    if (!map.has(course)) map.set(course, [])
    map.get(course)!.push(point)
  })
  return Array.from(map.entries()).map(([label, points]) => ({ label, points }))
})

const priorityLabelNames = computed(() => {
  const labeled = displayPoints.value
    .filter(point => (point.progress ?? 0) < 65 || point.status === 'weak' || point.status === 'none')
    .sort((a, b) => (a.progress ?? 100) - (b.progress ?? 100))
    .slice(0, 8)
    .map(point => point.name)
  return new Set(labeled)
})

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let animationId = 0
let worldGroup: THREE.Group | null = null
let treeRoot: THREE.Group | null = null
let generatedTree: (THREE.Object3D & { update: (elapsedTime: number) => void; loadFromJson: (options: any) => void }) | null = null
let stageGroup: THREE.Group | null = null
let skyStarGroup: THREE.Points | null = null
let leafGeometry: THREE.ShapeGeometry | null = null
let leafMaterial: THREE.MeshStandardMaterial | null = null
let denseLeafGeometry: THREE.PlaneGeometry | null = null
let denseLeafMaterial: THREE.MeshStandardMaterial | null = null
let gltfLoader: GLTFLoader | null = null
let raycaster: THREE.Raycaster | null = null
let resizeObserver: ResizeObserver | null = null
let isTreeDragging = false
let treeDragStartX = 0
let treeDragLastX = 0
let treeDragMoved = false
let ezEnvironment: ReturnType<typeof applyEzTreeAtmosphere> | null = null

const pointer = new THREE.Vector2()
const interactiveObjects: THREE.Object3D[] = []
const markerObjects: THREE.Object3D[] = []

type DisposableObject = THREE.Object3D & {
  geometry?: THREE.BufferGeometry
  material?: THREE.Material | THREE.Material[]
}

function statusColor(status?: KnowledgePoint['status']) {
  // Binary mastery palette: green = mastered/solid, red = needs work
  if (status === 'mastered' || status === 'proficient') return 0x22c55e
  return 0xef4444
}

function markerStatusLabel(status?: KnowledgePoint['status']) {
  if (status === 'mastered') return '已完成'
  if (status === 'proficient') return '熟练掌握'
  if (status === 'basic') return '基本掌握'
  if (status === 'beginner') return '初步掌握'
  if (status === 'weak') return '薄弱点'
  if (status === 'none') return '未开始'
  return '未完成'
}

function labelBadgeForPoint(point: KnowledgePoint) {
  if (point.labelBadge) {
    return {
      text: point.labelBadge,
      tone: point.labelTone ?? 'info',
    }
  }
  if (!priorityLabelNames.value.has(point.name)) return null

  const progress = point.progress ?? 0
  if (point.status === 'none' || progress < 30) return { text: '先学', tone: 'danger' as const }
  if (point.status === 'weak' || progress < 50) return { text: '补弱', tone: 'danger' as const }
  if (progress < 65) return { text: '巩固', tone: 'warning' as const }
  return { text: `${Math.round(progress)}%`, tone: 'info' as const }
}

function masteryTint() {
  const weak = displayPoints.value.filter(point => point.status === 'weak').length
  const mastered = displayPoints.value.filter(point => point.status === 'mastered').length
  const learning = displayPoints.value.filter(point => point.status && ['beginner', 'basic', 'proficient'].includes(point.status)).length
  if (weak > mastered && weak >= learning) return 0xb2ae65
  if (mastered >= weak && mastered >= learning) return 0x93bd66
  return 0x8caf66
}

function tintAsColor() {
  return new THREE.Color(masteryTint())
}

function stableSeed() {
  const raw = displayPoints.value
    .map(point => `${point.name}:${point.progress ?? 0}:${point.status ?? 'none'}`)
    .join('|')
  let hash = 2166136261
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash % 90000) + 1000
}

function visualTreeSeed() {
  // Keep the generated tree attractive and balanced across data refreshes.
  return 64240
}

function createScene() {
  scene = new THREE.Scene()
  const diagnosticStage = props.backgroundStageVariant === 'diagnostic'

  worldGroup = new THREE.Group()
  worldGroup.name = 'EzKnowledgeTreeWorld'
  worldGroup.position.set(props.sceneOffsetX, 0, props.sceneDepthOffset)
  scene.add(worldGroup)

  ezEnvironment = applyEzTreeAtmosphere(scene, {
    skybox: {
      sunAzimuth: diagnosticStage ? 124 : 110,
      sunElevation: diagnosticStage ? 36 : 42,
      sunColor: new THREE.Color(diagnosticStage ? 0xfff5dc : 0xfff0d0),
      skyColorLow: new THREE.Color(diagnosticStage ? 0x4b86ad : 0xa8d4ff),
      skyColorHigh: new THREE.Color(diagnosticStage ? 0x173b64 : 0x5c9dff),
      sunSize: diagnosticStage ? 1.35 : 1.0,
    },
    ground: { radius: 55, scale: 45, patchiness: diagnosticStage ? 0.66 : 0.72 },
    grass: {
      instanceCount: diagnosticStage ? 500 : 420,
      maxInstanceCount: 1200,
      flowerCount: diagnosticStage ? 6 : 4,
      scale: 36,
      patchiness: 0.74,
      size: new THREE.Vector3(0.48, 0.38, 0.48),
      sizeVariation: new THREE.Vector3(0.1, 0.16, 0.1),
    },
    rocks: { count: 4, spread: 24, size: new THREE.Vector3(0.28, 0.28, 0.28), sizeVariation: new THREE.Vector3(0.5, 0.5, 0.5) },
    fogColor: new THREE.Color(diagnosticStage ? 0x123456 : 0xd9ecff),
    fogDensity: diagnosticStage ? 0.0032 : 0.0045,
    enableClouds: false,
  })

  if (diagnosticStage) {
    createDiagnosticStarField()
  }

  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300)
  camera.position.set(8.5, 8.8, 28.5)
  camera.lookAt(props.sceneOffsetX, 6.6, props.sceneDepthOffset)
}

function initRenderer() {
  if (!canvasRef.value) return
  const { w, h } = getCanvasSize()

  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6))
  renderer.setSize(w, h)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = props.backgroundStageVariant === 'diagnostic' ? 1.55 : 1.28
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  if (camera) {
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  controls = new OrbitControls(camera!, canvasRef.value)
  controls.enableDamping = true
  controls.dampingFactor = 0.07
  controls.enabled = !props.horizontalOnlyControls
  controls.enablePan = false
  controls.enableRotate = !props.horizontalOnlyControls
  controls.minDistance = 10
  controls.maxDistance = 40
  controls.minPolarAngle = Math.PI * 0.18
  controls.maxPolarAngle = Math.PI * 0.72
  controls.target.set(props.sceneOffsetX, 6.8, props.sceneDepthOffset)
  controls.update()

  raycaster = new THREE.Raycaster()
  canvasRef.value.addEventListener('pointerdown', handlePointerDown)
  canvasRef.value.addEventListener('pointermove', handlePointerMove)
  canvasRef.value.addEventListener('pointerup', handlePointerUp)
  canvasRef.value.addEventListener('pointerleave', handlePointerUp)
  canvasRef.value.addEventListener('click', handleCanvasClick)

  resizeObserver = new ResizeObserver(handleResize)
  resizeObserver.observe(canvasRef.value.parentElement ?? canvasRef.value)
}

function getCanvasSize() {
  if (!canvasRef.value) return { w: 600, h: 480 }
  const rect = canvasRef.value.parentElement?.getBoundingClientRect()
  const w = Math.max(320, rect?.width ?? 600)
  const fallbackHeight = typeof props.height === 'number' ? props.height : 480
  const h = Math.max(320, props.fill ? (rect?.height ?? fallbackHeight) : fallbackHeight)
  return { w, h }
}

function createDiagnosticStarField() {
  if (!scene) return
  const starCount = 1500
  const positions = new Float32Array(starCount * 3)
  const colors = new Float32Array(starCount * 3)
  const colorA = new THREE.Color(0x88d9ff)
  const colorB = new THREE.Color(0xffffff)
  const colorC = new THREE.Color(0x4f86ff)

  for (let i = 0; i < starCount; i++) {
    const radius = 95 + Math.random() * 125
    const theta = Math.random() * Math.PI * 2
    const phi = Math.PI * (0.05 + Math.random() * 0.5)
    const x = Math.sin(phi) * Math.cos(theta) * radius
    const y = Math.cos(phi) * radius + 18
    const z = Math.sin(phi) * Math.sin(theta) * radius - 22
    positions[i * 3] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z

    const mix = Math.random()
    const color = mix < 0.62 ? colorA : mix < 0.88 ? colorB : colorC
    const intensity = 0.72 + Math.random() * 0.58
    colors[i * 3] = color.r * intensity
    colors[i * 3 + 1] = color.g * intensity
    colors[i * 3 + 2] = color.b * intensity
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const material = new THREE.PointsMaterial({
    size: 1.05,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
  })
  skyStarGroup = new THREE.Points(geometry, material)
  skyStarGroup.name = 'DiagnosticStarField'
  skyStarGroup.renderOrder = -1
  scene.add(skyStarGroup)
}

function createTreeOptions() {
  const options = structuredClone(TreePreset['Ash Large'] as any)
  const total = Math.max(displayPoints.value.length, 1)
  const density = Math.min(1, total / 18)

  options.seed = visualTreeSeed()
  options.type = TreeType.Deciduous
  options.bark.type = BarkType.Oak
  options.bark.tint = 0xc8aa85
  options.bark.textured = true
  options.bark.textureScale = { x: 1, y: 9 }
  options.branch.levels = 3
  options.branch.children = {
    0: 10,
    1: 4,
    2: 4,
  }
  options.branch.length = {
    0: 43,
    1: 27,
    2: 14,
    3: 5.2,
  }
  options.branch.radius = {
    0: 3.35,
    1: 0.76,
    2: 0.6,
    3: 0.32,
  }
  options.branch.angle = { 1: 42, 2: 44, 3: 48 }
  options.branch.start = { 1: 0.22, 2: 0.18, 3: 0 }
  options.branch.force = {
    direction: { x: 0, y: 1, z: 0 },
    strength: -0.01,
  }
  options.branch.gnarliness = { 0: -0.02, 1: 0.12, 2: 0.1, 3: 0.04 }
  options.branch.twist = { 0: 0.04, 1: -0.04, 2: 0, 3: 0 }
  options.leaves.type = 'ash'
  options.leaves.billboard = Billboard.Double
  options.leaves.angle = 30
  options.leaves.count = Math.round(72 + density * 24)
  options.leaves.start = 0
  options.leaves.size = 5.15
  options.leaves.sizeVariance = 0.18
  options.leaves.tint = masteryTint()
  options.leaves.alphaTest = 0.2
  options.trellis.enabled = false

  return options
}

function getLeafGeometry() {
  if (leafGeometry) return leafGeometry
  const shape = new THREE.Shape()
  shape.moveTo(0, 0.24)
  shape.bezierCurveTo(0.2, 0.18, 0.22, -0.12, 0, -0.26)
  shape.bezierCurveTo(-0.22, -0.12, -0.2, 0.18, 0, 0.24)
  leafGeometry = new THREE.ShapeGeometry(shape, 8)
  return leafGeometry
}

function getLeafMaterial() {
  if (leafMaterial) return leafMaterial
  const color = tintAsColor().lerp(new THREE.Color(0x2f5a2c), 0.62)
  leafMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0,
    transparent: true,
    opacity: 0.48,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  return leafMaterial
}

function getDenseLeafMaterial() {
  if (denseLeafMaterial) return denseLeafMaterial
  const source = (generatedTree as any)?.leavesMesh?.material as THREE.MeshStandardMaterial | undefined
  denseLeafMaterial = source?.clone?.() ?? new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x346b2b),
    roughness: 0.82,
    metalness: 0,
  })
  denseLeafMaterial.color = new THREE.Color(0x5a963c)
  denseLeafMaterial.transparent = true
  denseLeafMaterial.opacity = 0.9
  denseLeafMaterial.side = THREE.DoubleSide
  denseLeafMaterial.depthWrite = false
  denseLeafMaterial.depthTest = false
  denseLeafMaterial.alphaTest = Math.min(denseLeafMaterial.alphaTest || 0.2, 0.2)
  return denseLeafMaterial
}

function getDenseLeafGeometry() {
  if (denseLeafGeometry) return denseLeafGeometry
  denseLeafGeometry = new THREE.PlaneGeometry(1, 1, 1, 1)
  return denseLeafGeometry
}

function canopySample(seed: number) {
  const raw = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return raw - Math.floor(raw)
}

function addLeaf(parent: THREE.Group, position: THREE.Vector3, scale: number, rotation: THREE.Euler) {
  const leaf = new THREE.Mesh(getLeafGeometry(), getLeafMaterial())
  leaf.position.copy(position)
  leaf.rotation.copy(rotation)
  leaf.scale.set(scale * 0.72, scale, scale * 0.72)
  leaf.castShadow = false
  leaf.receiveShadow = false
  parent.add(leaf)
}

function addDenseLeaf(parent: THREE.Group, position: THREE.Vector3, scale: number, rotation: THREE.Euler) {
  const leaf = new THREE.Mesh(getDenseLeafGeometry(), getDenseLeafMaterial())
  leaf.position.copy(position)
  leaf.rotation.copy(rotation)
  leaf.scale.set(scale * 1.35, scale * 1.65, scale * 1.35)
  leaf.castShadow = false
  leaf.receiveShadow = false
  parent.add(leaf)
}

function addMirroredLeafCluster(
  parent: THREE.Group,
  centerX: number,
  centerY: number,
  centerZ: number,
  radiusX: number,
  radiusY: number,
  radiusZ: number,
  count: number,
  seed: number,
) {
  for (let i = 0; i < count; i++) {
    const u = canopySample(seed + i * 5.17)
    const v = canopySample(seed + i * 9.31)
    const w = canopySample(seed + i * 13.73)
    const angle = u * Math.PI * 2
    const spread = Math.sqrt(v)
    const localX = Math.cos(angle) * radiusX * spread
    const localY = (w - 0.5) * radiusY
    const localZ = Math.sin(angle) * radiusZ * spread
    const size = 0.28 + canopySample(seed + i * 17.19) * 0.18

    for (const side of [-1, 1]) {
      addLeaf(
        parent,
        new THREE.Vector3(side * (centerX + localX), centerY + localY, centerZ + localZ),
        size,
        new THREE.Euler(
          -0.22 + canopySample(seed + i * 3.7) * 0.5,
          side * (0.18 + canopySample(seed + i * 6.3) * 0.38),
          side * (angle * 0.24 + 0.16),
        ),
      )
    }
  }
}

function addCenterLeafCluster(
  parent: THREE.Group,
  centerY: number,
  radiusX: number,
  radiusY: number,
  radiusZ: number,
  count: number,
  seed: number,
) {
  for (let i = 0; i < count; i++) {
    const u = canopySample(seed + i * 4.21)
    const v = canopySample(seed + i * 8.61)
    const w = canopySample(seed + i * 11.29)
    const angle = u * Math.PI * 2
    const spread = Math.sqrt(v)
    addLeaf(
      parent,
      new THREE.Vector3(
        Math.cos(angle) * radiusX * spread,
        centerY + (w - 0.5) * radiusY,
        Math.sin(angle) * radiusZ * spread,
      ),
      0.28 + canopySample(seed + i * 15.4) * 0.16,
      new THREE.Euler(-0.12 + w * 0.28, Math.cos(angle) * 0.2, angle * 0.12),
    )
  }
}

function createSymmetricFoliage() {
  const foliage = new THREE.Group()
  foliage.name = 'SymmetricKnowledgeTreeFoliage'

  addMirroredLeafCluster(foliage, 1.05, 5.9, 0.1, 0.95, 1.2, 0.5, 20, 101)
  addMirroredLeafCluster(foliage, 2.05, 7.0, 0.02, 1.05, 1.35, 0.58, 26, 211)
  addMirroredLeafCluster(foliage, 2.85, 8.3, -0.05, 1.18, 1.35, 0.66, 30, 307)
  addMirroredLeafCluster(foliage, 2.5, 9.65, 0.02, 1.12, 1.28, 0.62, 28, 419)
  addMirroredLeafCluster(foliage, 1.55, 10.85, 0.02, 0.98, 1.12, 0.56, 22, 523)
  addCenterLeafCluster(foliage, 7.7, 1.05, 1.25, 0.58, 28, 617)
  addCenterLeafCluster(foliage, 11.85, 1.15, 1.35, 0.58, 30, 733)

  return foliage
}

function branchBetween(start: THREE.Vector3, end: THREE.Vector3, radiusTop: number, radiusBottom: number) {
  const direction = new THREE.Vector3().subVectors(end, start)
  const length = direction.length()
  const branch = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 14, 2),
    new THREE.MeshStandardMaterial({
      color: 0x725033,
      roughness: 0.86,
      metalness: 0,
    }),
  )
  branch.position.copy(start).add(end).multiplyScalar(0.5)
  branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
  branch.castShadow = true
  branch.receiveShadow = true
  return branch
}

function addMirroredBranch(
  parent: THREE.Group,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radiusTop: number,
  radiusBottom: number,
) {
  for (const side of [-1, 1]) {
    const mirroredStart = new THREE.Vector3(start.x * side, start.y, start.z)
    const mirroredEnd = new THREE.Vector3(end.x * side, end.y, end.z)
    parent.add(branchBetween(mirroredStart, mirroredEnd, radiusTop, radiusBottom))
  }
}

function addCanopyCloud(parent: THREE.Group, center: THREE.Vector3, radiusX: number, radiusY: number, radiusZ: number, count: number, seed: number) {
  for (let i = 0; i < count; i++) {
    const u = canopySample(seed + i * 4.73)
    const v = canopySample(seed + i * 8.11)
    const w = canopySample(seed + i * 13.37)
    const angle = u * Math.PI * 2
    const spread = Math.sqrt(v)
    const position = new THREE.Vector3(
      center.x + Math.cos(angle) * radiusX * spread,
      center.y + (w - 0.5) * radiusY,
      center.z + Math.sin(angle) * radiusZ * spread,
    )
    addLeaf(
      parent,
      position,
      0.18 + canopySample(seed + i * 19.9) * 0.1,
      new THREE.Euler(-0.2 + w * 0.48, Math.cos(angle) * 0.28, angle * 0.18),
    )
  }
}

function addDenseCanopyCloud(parent: THREE.Group, center: THREE.Vector3, radiusX: number, radiusY: number, radiusZ: number, count: number, seed: number) {
  for (let i = 0; i < count; i++) {
    const u = canopySample(seed + i * 4.73)
    const v = canopySample(seed + i * 8.11)
    const w = canopySample(seed + i * 13.37)
    const angle = u * Math.PI * 2
    const spread = Math.sqrt(v)
    const position = new THREE.Vector3(
      center.x + Math.cos(angle) * radiusX * spread,
      center.y + (w - 0.5) * radiusY,
      center.z + Math.sin(angle) * radiusZ * spread,
    )
    addDenseLeaf(
      parent,
      position,
      0.3 + canopySample(seed + i * 19.9) * 0.16,
      new THREE.Euler(-0.2 + w * 0.48, Math.cos(angle) * 0.28, angle * 0.18),
    )
  }
}

function addLeafRibbon(
  parent: THREE.Group,
  start: THREE.Vector3,
  end: THREE.Vector3,
  count: number,
  radius: number,
  seed: number,
) {
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    const base = new THREE.Vector3().lerpVectors(start, end, t)
    const angle = canopySample(seed + i * 7.23) * Math.PI * 2
    const spread = radius * (0.35 + canopySample(seed + i * 9.41) * 0.65)
    const position = base.add(new THREE.Vector3(
      Math.cos(angle) * spread,
      (canopySample(seed + i * 11.13) - 0.5) * radius * 1.35,
      Math.sin(angle) * spread,
    ))

    addDenseLeaf(
      parent,
      position,
      0.24 + canopySample(seed + i * 13.91) * 0.14,
      new THREE.Euler(-0.16 + canopySample(seed + i * 17.1) * 0.42, Math.cos(angle) * 0.28, angle * 0.18),
    )
  }
}

function addMirroredCanopyCloud(
  parent: THREE.Group,
  center: THREE.Vector3,
  radiusX: number,
  radiusY: number,
  radiusZ: number,
  count: number,
  seed: number,
) {
  for (const side of [-1, 1]) {
    addCanopyCloud(
      parent,
      new THREE.Vector3(center.x * side, center.y, center.z),
      radiusX,
      radiusY,
      radiusZ,
      count,
      seed + (side > 0 ? 503 : 0),
    )
  }
}

function createDesignedSymmetricTree() {
  const tree = new THREE.Group() as THREE.Group & { update: (elapsedTime: number) => void }
  tree.name = 'DesignedSymmetricKnowledgeTree'
  tree.update = () => {}

  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x6c4a2d,
    roughness: 0.9,
    metalness: 0,
  })
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 1.1, 8.4, 22, 4), trunkMaterial)
  trunk.position.y = 4.15
  trunk.castShadow = true
  trunk.receiveShadow = true
  tree.add(trunk)

  const crown = new THREE.Group()
  crown.name = 'DesignedSymmetricLeafCrown'

  const branchRows = [
    { y: 2.7, x: 3.25, endY: 5.35, z: 0.06, top: 0.2, bottom: 0.42, leaves: 44, rx: 1.18, ry: 1.25, rz: 0.58 },
    { y: 3.65, x: 3.75, endY: 6.75, z: -0.08, top: 0.18, bottom: 0.36, leaves: 50, rx: 1.28, ry: 1.36, rz: 0.64 },
    { y: 4.75, x: 3.55, endY: 8.0, z: 0.08, top: 0.16, bottom: 0.32, leaves: 52, rx: 1.26, ry: 1.34, rz: 0.64 },
    { y: 5.85, x: 2.95, endY: 9.15, z: -0.05, top: 0.13, bottom: 0.27, leaves: 44, rx: 1.08, ry: 1.2, rz: 0.56 },
    { y: 6.9, x: 2.15, endY: 10.35, z: 0.04, top: 0.1, bottom: 0.22, leaves: 34, rx: 0.92, ry: 1.06, rz: 0.5 },
  ]

  branchRows.forEach((row, index) => {
    const start = new THREE.Vector3(0, row.y, 0)
    const end = new THREE.Vector3(row.x, row.endY, row.z)
    addMirroredBranch(tree, start, end, row.top, row.bottom)

    const forkStart = new THREE.Vector3(row.x * 0.48, row.y + (row.endY - row.y) * 0.52, row.z * 0.5)
    addMirroredBranch(tree, forkStart, new THREE.Vector3(row.x * 0.95, row.endY + 0.58, row.z + 0.48), row.top * 0.62, row.bottom * 0.58)
    addMirroredBranch(tree, forkStart, new THREE.Vector3(row.x * 0.78, row.endY + 0.26, row.z - 0.5), row.top * 0.58, row.bottom * 0.52)

    addMirroredCanopyCloud(
      crown,
      new THREE.Vector3(row.x, row.endY + 0.18, row.z),
      row.rx,
      row.ry,
      row.rz,
      row.leaves,
      900 + index * 137,
    )
  })

  tree.add(branchBetween(new THREE.Vector3(0, 6.3, 0), new THREE.Vector3(0, 12.0, 0.02), 0.16, 0.36))
  addCanopyCloud(crown, new THREE.Vector3(0, 11.65, 0), 1.35, 1.55, 0.68, 70, 1717)
  addCanopyCloud(crown, new THREE.Vector3(0, 8.65, -0.02), 1.6, 1.45, 0.64, 56, 1919)
  tree.add(crown)

  return tree
}

function addNaturalCanopyFill() {
  if (!treeRoot) return

  const fill = new THREE.Group()
  fill.name = 'NaturalCanopyFill'

  // Only subtle mid-plane branches and foliage to keep the generated tree as the hero
  fill.add(branchBetween(new THREE.Vector3(0.28, 3.25, 0.02), new THREE.Vector3(-2.15, 5.55, 0.08), 0.06, 0.18))
  fill.add(branchBetween(new THREE.Vector3(0.48, 4.15, -0.02), new THREE.Vector3(2.25, 7.12, -0.06), 0.05, 0.14))

  addCanopyCloud(fill, new THREE.Vector3(-2.35, 5.95, 0.08), 0.78, 0.95, 0.44, 18, 2401)
  addCanopyCloud(fill, new THREE.Vector3(2.45, 7.25, -0.04), 0.82, 0.92, 0.48, 20, 2609)
  addCanopyCloud(fill, new THREE.Vector3(2.0, 8.55, 0.08), 0.68, 0.82, 0.42, 14, 2851)
  addCanopyCloud(fill, new THREE.Vector3(-0.9, 8.15, -0.06), 0.72, 0.86, 0.42, 14, 3049)
  addCanopyCloud(fill, new THREE.Vector3(-2.85, 5.1, 0.02), 0.64, 0.78, 0.36, 18, 3313)
  addCanopyCloud(fill, new THREE.Vector3(2.85, 5.8, -0.04), 0.82, 0.86, 0.44, 24, 4421)
  addCanopyCloud(fill, new THREE.Vector3(-2.15, 4.75, 0.08), 0.78, 0.78, 0.38, 22, 4019)
  addCanopyCloud(fill, new THREE.Vector3(-3.15, 5.95, 0.02), 0.62, 0.72, 0.34, 16, 4211)

  treeRoot.add(fill)
}

function fitObjectToScene(object: THREE.Object3D, targetHeight = props.sceneScale, offsetY = props.sceneOffsetY) {
  const box = new THREE.Box3()
  object.updateWorldMatrix(true, true)
  object.traverseVisible(child => {
    if (!(child as unknown as THREE.Mesh).isMesh) return
    box.expandByObject(child)
  })
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const scale = targetHeight / Math.max(size.y, 0.001)

  object.scale.set(scale, scale * props.sceneStretchY, scale)
  object.position.set(-center.x * scale, -box.min.y * scale * props.sceneStretchY, -center.z * scale)
  object.position.y += offsetY
}

function decorateTreeObject(object: THREE.Object3D) {
  object.traverse(child => {
    if (!(child as unknown as THREE.Mesh).isMesh) return
    const mesh = child as unknown as THREE.Mesh
    mesh.castShadow = true
    mesh.receiveShadow = true
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.forEach(material => {
      material.transparent = material.name === 'leaves'
      if (material.name === 'leaves') {
        material.opacity = 0.95
        material.depthWrite = false
      }
    })
  })
}

function styleRealTreeModel(object: THREE.Object3D) {
  const barkMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b4429,
    roughness: 0.93,
    metalness: 0,
  })
  const branchMaterial = new THREE.MeshStandardMaterial({
    color: 0x815735,
    roughness: 0.9,
    metalness: 0,
  })
  const leafMaterials = [0x4f8f3d, 0x5f9b45, 0x6ca54d, 0x3f7f35, 0x79aa57].map(color => new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0,
    side: THREE.DoubleSide,
  }))

  const nameHash = (value: string) => {
    let hash = 0
    for (let i = 0; i < value.length; i++) {
      hash = Math.imul(hash ^ value.charCodeAt(i), 2654435761)
    }
    return Math.abs(hash)
  }

  object.traverse(child => {
    if (!(child as unknown as THREE.Mesh).isMesh) return
    const mesh = child as THREE.Mesh
    const label = `${mesh.name} ${Array.isArray(mesh.material) ? mesh.material.map(m => m.name).join(' ') : mesh.material?.name ?? ''}`.toLowerCase()
    const isGreenLeaf = label.includes('leaf_ginkgo') || label.includes('ginkgo_leaf')
    const isTreeWood = label.includes('hero_mainbranch')
      || label.includes('herotrunkspine')
      || label.includes('hero_root')
      || label.includes('hero_ancient_trunk')
      || label.includes('ancient_bark')
    const isBulkyGeneratedTrunk = label.includes('hero_ancient_trunk')

    if (!isGreenLeaf && !isTreeWood) {
      mesh.visible = false
      return
    }

    if (isBulkyGeneratedTrunk) {
      mesh.scale.set(0.32, 1.02, 0.32)
    }

    if (isGreenLeaf) {
      mesh.material = leafMaterials[nameHash(mesh.name) % leafMaterials.length]
      mesh.castShadow = false
      mesh.receiveShadow = true
      return
    }

    mesh.material = label.includes('trunk') || label.includes('root') ? barkMaterial : branchMaterial
    mesh.castShadow = true
    mesh.receiveShadow = true
  })
}

function createHybridTreeOptions() {
  const options = structuredClone(TreePreset['Ash Large'] as any)
  options.seed = 29919
  options.type = TreeType.Deciduous
  options.bark.type = BarkType.Pine
  options.bark.tint = 0xcedabe
  options.bark.flatShading = false
  options.bark.textured = true
  options.bark.textureScale = { x: 0.5, y: 5 }
  options.branch.levels = 3
  options.branch.angle = { 1: 39, 2: 39, 3: 51 }
  options.branch.children = {
    0: 10,
    1: 4,
    2: 3,
  }
  options.branch.force = {
    direction: { x: 0, y: 1, z: 0 },
    strength: -0.010869565217391311,
  }
  options.branch.gnarliness = { 0: -0.05, 1: 0.2, 2: 0.16, 3: 0.05 }
  options.branch.length = {
    0: 45,
    1: 29.42,
    2: 15.3,
    3: 4.6,
  }
  options.branch.radius = {
    0: 3.03,
    1: 0.53,
    2: 0.79,
    3: 1.11,
  }
  options.branch.sections = { 0: 12, 1: 8, 2: 6, 3: 4 }
  options.branch.segments = { 0: 8, 1: 6, 2: 4, 3: 3 }
  options.branch.start = { 1: 0.32, 2: 0.34, 3: 0 }
  options.branch.taper = { 0: 0.7, 1: 0.62, 2: 0.76, 3: 0 }
  options.branch.twist = { 0: 0.09, 1: -0.07, 2: 0, 3: 0 }
  options.leaves.type = 'ash'
  options.leaves.billboard = Billboard.Double
  options.leaves.angle = 30
  options.leaves.count = 10
  options.leaves.start = 0.01
  options.leaves.size = 4.62
  options.leaves.sizeVariance = 0.72
  options.leaves.tint = 0x6fa44c
  options.leaves.alphaTest = 0.5
  options.trellis.enabled = false
  return options
}

function styleHybridGeneratorLayer(object: THREE.Object3D) {
  object.traverse(child => {
    if (!(child as unknown as THREE.Mesh).isMesh) return
    const mesh = child as THREE.Mesh
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const meshLabel = mesh.name.toLowerCase()
    const styled = materials.map(source => {
      const label = `${meshLabel} ${source.name}`.toLowerCase()
      const isLeaf = label.includes('leaf') || label.includes('leaves')
      const material = new THREE.MeshStandardMaterial({
        map: (source as THREE.MeshStandardMaterial | undefined)?.map ?? null,
        color: isLeaf ? 0x5e9340 : 0x755036,
        emissive: isLeaf ? 0x0a1807 : 0x201409,
        emissiveIntensity: isLeaf ? 0.06 : 0.1,
        roughness: isLeaf ? 0.82 : 0.9,
        metalness: 0,
        side: THREE.DoubleSide,
      })
      material.transparent = isLeaf
      material.opacity = isLeaf ? 0.58 : 0.92
      material.depthWrite = !isLeaf
      material.alphaTest = isLeaf ? 0.24 : 0
      return material
    })
    mesh.material = Array.isArray(mesh.material) ? styled : styled[0]
    mesh.castShadow = !styled.some(material => material.transparent)
    mesh.receiveShadow = true
  })
}

function createHybridGeneratorLayer() {
  const layer = new Tree() as unknown as THREE.Object3D & { update: (elapsedTime: number) => void; loadFromJson: (options: any) => void }
  layer.loadFromJson(createHybridTreeOptions())
  layer.name = 'EzTreeDepthLayer'
  styleHybridGeneratorLayer(layer)
  fitObjectToScene(layer, props.sceneScale * 0.62, props.sceneOffsetY + 2.55)
  layer.scale.x *= 0.54
  layer.scale.z *= 0.38
  layer.position.y += 0.22
  layer.position.z -= 0.72
  layer.rotation.y = -0.08
  return layer
}

function createCanopyDepthScaffold() {
  const scaffold = new THREE.Group()
  scaffold.name = 'HybridCanopyDepthScaffold'

  const branchPairs = [
    [new THREE.Vector3(-0.1, 5.65, 0.18), new THREE.Vector3(3.25, 7.95, 0.18), 0.055, 0.18],
    [new THREE.Vector3(0.08, 6.45, -0.08), new THREE.Vector3(4.15, 8.85, -0.18), 0.045, 0.15],
    [new THREE.Vector3(-0.06, 7.2, 0.12), new THREE.Vector3(2.75, 10.05, 0.22), 0.038, 0.12],
    [new THREE.Vector3(0.04, 7.8, -0.12), new THREE.Vector3(1.75, 11.6, -0.02), 0.03, 0.1],
  ] as const

  branchPairs.forEach(([start, end, top, bottom], index) => {
    addMirroredBranch(scaffold, start, end, top, bottom)
    addMirroredBranch(
      scaffold,
      new THREE.Vector3(end.x * 0.58, start.y + (end.y - start.y) * 0.58, end.z),
      new THREE.Vector3(end.x * 1.08, end.y + 0.38, end.z + (index % 2 ? -0.38 : 0.38)),
      top * 0.52,
      bottom * 0.56,
    )
  })

  addMirroredCanopyCloud(scaffold, new THREE.Vector3(2.65, 7.65, 0.22), 0.82, 0.58, 0.28, 18, 18211)
  addMirroredCanopyCloud(scaffold, new THREE.Vector3(2.25, 8.9, -0.16), 0.72, 0.54, 0.26, 16, 18433)
  addCanopyCloud(scaffold, new THREE.Vector3(0, 10.5, 0.18), 0.9, 0.64, 0.28, 20, 18679)

  scaffold.traverse(child => {
    if (!(child as unknown as THREE.Mesh).isMesh) return
    const mesh = child as THREE.Mesh
    mesh.renderOrder = mesh.material instanceof THREE.MeshStandardMaterial && mesh.material.transparent ? 2 : 1
  })

  return scaffold
}

async function loadTreeConfig(): Promise<any> {
  const response = await fetch(props.treeConfigUrl)
  if (!response.ok) throw new Error(`Failed to load tree config: ${response.status}`)
  return response.json()
}

async function createEzTree(options?: any) {
  generatedTree = new Tree() as unknown as THREE.Object3D & {
    update: (elapsedTime: number) => void
    loadFromJson: (options: any) => void
  }
  generatedTree.loadFromJson(options ?? createTreeOptions() as any)
  generatedTree.name = 'EzTreeKnowledgeModel'
  decorateTreeObject(generatedTree)

  treeRoot = new THREE.Group()
  treeRoot.name = 'EzKnowledgeTreeRoot'
  treeRoot.add(generatedTree)
  treeRoot.rotation.y = 0.72
  treeRoot.scale.set(1.2, 0.94, 1.1)
  fitObjectToScene(generatedTree)
  addNaturalCanopyFill()
  worldGroup?.add(treeRoot)
}

async function createGeneratedTree() {
  if (props.preferModel && props.modelUrl) {
    try {
      gltfLoader ??= new GLTFLoader()
      const gltf = await gltfLoader.loadAsync(props.modelUrl)
      generatedTree = gltf.scene as unknown as THREE.Object3D & {
        update: (elapsedTime: number) => void
        loadFromJson: (options: any) => void
      }
      generatedTree.update = () => {}
      generatedTree.name = 'RealKnowledgeTreeModel'
      decorateTreeObject(generatedTree)
      styleRealTreeModel(generatedTree)

      treeRoot = new THREE.Group()
      treeRoot.name = 'RealKnowledgeTreeRoot'
      treeRoot.add(generatedTree)
      fitObjectToScene(generatedTree)
      const generatorLayer = createHybridGeneratorLayer()
      treeRoot.add(generatorLayer)
      generatedTree.update = (elapsedTime: number) => {
        generatorLayer.update(elapsedTime)
      }
      worldGroup?.add(treeRoot)
      return
    } catch (error) {
      console.warn('Failed to load real knowledge tree model, falling back to ez-tree:', error)
    }
  }

  try {
    const config = await loadTreeConfig()
    await createEzTree(config)
  } catch (error) {
    console.warn('Failed to load tree config, using built-in tree options:', error)
    await createEzTree()
  }
}

function createStage() {
  if (!worldGroup || !props.showBackgroundStage) return
  stageGroup = new THREE.Group()
  stageGroup.name = 'EzKnowledgeTreeStage'

  // Small dark soil pad beneath the tree to blend roots with the ez-tree ground
  const soilMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a4a2a,
    roughness: 0.95,
    metalness: 0,
    transparent: true,
    opacity: 0.4,
  })
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 0.08, 64), soilMaterial)
  mound.position.y = 0.02
  mound.scale.z = 0.8
  mound.receiveShadow = true
  stageGroup.add(mound)

  const litterMaterial = new THREE.MeshBasicMaterial({
    color: 0x6f6548,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
  })
  for (let i = 0; i < 20; i++) {
    const angle = i * 2.399
    const radius = 1.4 + ((i * 37) % 100) / 100 * 2.6
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.05), litterMaterial.clone())
    leaf.rotation.set(-Math.PI / 2, 0, angle + i * 0.17)
    leaf.position.set(Math.cos(angle) * radius, 0.035, Math.sin(angle) * radius * 0.62)
    stageGroup.add(leaf)
  }

  worldGroup.add(stageGroup)
}

function createAppleMarker(marker: GraphMarker, position: THREE.Vector3, size: number, color: number) {
  const appleSize = size * 0.9
  const group = new THREE.Group()
  group.position.copy(position)
  group.name = `KnowledgeMarker-${marker.id}`
  group.userData.marker = marker
  group.userData.baseColor = color

  const isHighlighted = props.highlightNames.length > 0 && props.highlightNames.includes(marker.label)
  group.userData.isHighlighted = isHighlighted

  // Visible glow for all apples so they stand out against foliage
  const glowSize = isHighlighted ? appleSize * 1.9 : appleSize * 1.55
  const glowOpacity = isHighlighted ? 0.42 : 0.28
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(glowSize, 20, 14),
    new THREE.MeshBasicMaterial({
      color: isHighlighted ? 0x00d4ff : color,
      transparent: true,
      opacity: glowOpacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  glow.userData.marker = marker
  glow.userData.markerRole = 'glow'
  glow.userData.baseColor = color
  group.add(glow)

  // Apple body: slightly tapered sphere with dimple on top
  const appleGeometry = new THREE.SphereGeometry(appleSize, 28, 22)
  const pos = appleGeometry.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y > appleSize * 0.55) {
      // narrow toward stem and create top dimple
      const t = (y - appleSize * 0.55) / (appleSize * 0.45)
      const pinch = 1 - t * 0.22
      pos.setX(i, pos.getX(i) * pinch)
      pos.setZ(i, pos.getZ(i) * pinch)
      pos.setY(i, y - t * t * appleSize * 0.12)
    }
    if (y < -appleSize * 0.3) {
      // taper bottom slightly
      const t = Math.abs(y + appleSize * 0.3) / (appleSize * 0.7)
      const pinch = 1 - t * 0.12
      pos.setX(i, pos.getX(i) * pinch)
      pos.setZ(i, pos.getZ(i) * pinch)
    }
  }
  appleGeometry.computeVertexNormals()

  const baseColor = new THREE.Color(color)
  const body = new THREE.Mesh(
    appleGeometry,
    new THREE.MeshPhysicalMaterial({
      color: baseColor,
      emissive: isHighlighted ? new THREE.Color(0x00d4ff) : baseColor,
      emissiveIntensity: isHighlighted ? 0.45 : 0.22,
      roughness: 0.35,
      metalness: 0.02,
      clearcoat: 0.12,
      clearcoatRoughness: 0.35,
    }),
  )
  body.scale.set(1, 0.92, 0.96)
  body.castShadow = true
  body.receiveShadow = true
  body.userData.marker = marker
  body.userData.markerRole = 'body'
  body.userData.baseColor = color
  group.add(body)

  // Subtle highlight spot to make it look rounder
  const highlight = new THREE.Mesh(
    new THREE.SphereGeometry(appleSize * 0.28, 16, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  )
  highlight.position.set(appleSize * 0.32, appleSize * 0.28, appleSize * 0.34)
  highlight.scale.set(1, 0.6, 1)
  group.add(highlight)

  // Stem
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(appleSize * 0.045, appleSize * 0.065, appleSize * 0.38, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.85 }),
  )
  stem.position.set(0, appleSize * 0.92, 0)
  stem.rotation.z = -0.18
  stem.castShadow = true
  stem.userData.marker = marker
  group.add(stem)

  // Small leaf near stem
  const leafShape = new THREE.Shape()
  leafShape.moveTo(0, 0)
  leafShape.quadraticCurveTo(appleSize * 0.18, appleSize * 0.06, appleSize * 0.22, appleSize * 0.24)
  leafShape.quadraticCurveTo(appleSize * 0.06, appleSize * 0.28, 0, appleSize * 0.12)
  leafShape.quadraticCurveTo(-appleSize * 0.06, appleSize * 0.28, -appleSize * 0.22, appleSize * 0.24)
  leafShape.quadraticCurveTo(-appleSize * 0.18, appleSize * 0.06, 0, 0)
  const leafGeometry = new THREE.ShapeGeometry(leafShape)
  const leaf = new THREE.Mesh(
    leafGeometry,
    new THREE.MeshStandardMaterial({
      color: 0x7cb04a,
      roughness: 0.7,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    }),
  )
  leaf.position.set(appleSize * 0.12, appleSize * 0.86, appleSize * 0.08)
  leaf.rotation.set(-0.4, 0.25, -0.35)
  leaf.castShadow = true
  leaf.userData.marker = marker
  group.add(leaf)

  const hitTarget = new THREE.Mesh(
    new THREE.SphereGeometry(size * 2.2, 18, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  )
  hitTarget.userData.marker = marker
  group.add(hitTarget)

  if (marker.labelBadge) {
    const label = createAppleLabel(marker.labelBadge, appleSize, marker.labelTone ?? 'info')
    label.position.set(0, appleSize * 1.85, 0)
    group.add(label)
  }

  interactiveObjects.push(group)
  markerObjects.push(group)
  return group
}

function updateMarkerHighlight(markerObject: THREE.Object3D, isHighlighted: boolean) {
  markerObject.userData.isHighlighted = isHighlighted
  const baseColor = markerObject.userData.baseColor ?? 0xef4444

  markerObject.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return
    const role = child.userData.markerRole
    const material = child.material
    if (!material || Array.isArray(material)) return

    if (role === 'glow' && material instanceof THREE.MeshBasicMaterial) {
      material.color.set(isHighlighted ? 0x00d4ff : baseColor)
      material.opacity = isHighlighted ? 0.42 : 0.28
      child.scale.setScalar(isHighlighted ? 1.22 : 1)
      material.needsUpdate = true
    }

    if (role === 'body' && material instanceof THREE.MeshPhysicalMaterial) {
      material.color.set(baseColor)
      material.emissive.set(isHighlighted ? 0x00d4ff : baseColor)
      material.emissiveIntensity = isHighlighted ? 0.45 : 0.22
      material.clearcoat = isHighlighted ? 0.22 : 0.12
      material.needsUpdate = true
    }
  })
}

function applyMarkerHighlights() {
  const highlightedNames = new Set(props.highlightNames)
  markerObjects.forEach(marker => {
    const label = marker.userData.marker?.label
    updateMarkerHighlight(marker, highlightedNames.has(label))
  })
}

function createAppleLabel(text: string, appleSize: number, tone: NonNullable<GraphMarker['labelTone']>) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const fontSize = 22
  const paddingX = 18
  const paddingY = 9
  const maxChars = 6
  const displayText = text.length > maxChars ? text.slice(0, maxChars) + '…' : text
  const palette = {
    danger: { bg: 'rgba(55, 9, 18, 0.82)', border: 'rgba(255, 113, 133, 0.72)', text: '#ffe4e6', glow: 'rgba(244, 63, 94, 0.35)' },
    warning: { bg: 'rgba(55, 35, 5, 0.82)', border: 'rgba(245, 158, 11, 0.72)', text: '#fef3c7', glow: 'rgba(245, 158, 11, 0.3)' },
    info: { bg: 'rgba(8, 34, 55, 0.82)', border: 'rgba(56, 189, 248, 0.7)', text: '#e0f2fe', glow: 'rgba(56, 189, 248, 0.32)' },
    success: { bg: 'rgba(7, 42, 26, 0.82)', border: 'rgba(34, 197, 94, 0.72)', text: '#dcfce7', glow: 'rgba(34, 197, 94, 0.3)' },
  }[tone]

  ctx.font = `bold ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`
  const textWidth = ctx.measureText(displayText).width
  const width = Math.ceil(textWidth + paddingX * 2)
  const height = fontSize + paddingY * 2

  canvas.width = width
  canvas.height = height

  ctx.font = `bold ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const radius = height / 2
  ctx.shadowColor = palette.glow
  ctx.shadowBlur = 12
  ctx.fillStyle = palette.bg
  ctx.strokeStyle = palette.border
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(radius, 0)
  ctx.lineTo(width - radius, 0)
  ctx.quadraticCurveTo(width, 0, width, radius)
  ctx.lineTo(width, height - radius)
  ctx.quadraticCurveTo(width, height, width - radius, height)
  ctx.lineTo(radius, height)
  ctx.quadraticCurveTo(0, height, 0, height - radius)
  ctx.lineTo(0, radius)
  ctx.quadraticCurveTo(0, 0, radius, 0)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'
  ctx.shadowBlur = 4
  ctx.fillStyle = palette.text
  ctx.fillText(displayText, width / 2, height / 2 + 1)
  ctx.shadowBlur = 0

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.82,
    depthTest: false,
    depthWrite: false,
  })

  const sprite = new THREE.Sprite(material)
  const worldScale = Math.max(0.28, appleSize * 1.62)
  sprite.scale.set(worldScale * (width / height), worldScale, 1)
  sprite.userData.isLabel = true
  return sprite
}

function leafAnchor(index: number, fallbackAngle: number) {
  const leavesMesh = (generatedTree as any)?.leavesMesh as THREE.Mesh | undefined
  const position = leavesMesh?.geometry?.attributes.position
  const ring = index % 3
  const balanced = new THREE.Vector3(
    Math.cos(fallbackAngle) * (2.2 + ring * 0.36),
    6.65 + (index % 6) * 0.58,
    Math.sin(fallbackAngle) * (1.05 + ring * 0.18),
  )
  if (generatedTree && treeRoot && position?.count) {
    const vertex = new THREE.Vector3()
    const sampleIndex = Math.abs((stableSeed() + index * 7919) % position.count)
    vertex.fromBufferAttribute(position, sampleIndex)
    generatedTree.localToWorld(vertex)
    treeRoot.worldToLocal(vertex)
    vertex.x += Math.sin(index * 1.37) * 0.12
    vertex.y -= 0.04 + (index % 3) * 0.03
    vertex.z += Math.cos(index * 1.71) * 0.1
    return vertex
  }
  return balanced
}

function addGraphMarkers() {
  if (!treeRoot) return
  interactiveObjects.length = 0
  markerObjects.length = 0

  const rootMarker: GraphMarker = {
    id: 'course-main',
    type: 'course',
    label: '课程总览',
    progress: courseProgress.value,
    description: '树干代表课程主线，果实代表具体知识点掌握状态。',
    items: branchGroups.value.map(group => group.label),
  }
  const rootColor = courseProgress.value >= 80 ? 0x22c55e : 0xef4444
  treeRoot.add(createAppleMarker(rootMarker, new THREE.Vector3(-0.18, 5.4, 0.72), 0.20, rootColor))

  branchGroups.value.slice(0, 8).forEach((group, index) => {
    const progress = Math.round(group.points.reduce((sum, point) => sum + (point.progress ?? 0), 0) / group.points.length)
    const marker: GraphMarker = {
      id: `branch-${index}`,
      type: 'branch',
      label: group.label,
      progress,
      description: '树枝节点代表课程模块。',
      items: group.points.map(point => `${point.name} · ${markerStatusLabel(point.status)} · ${point.progress ?? 0}%`),
    }
    const branchColor = progress >= 80 ? 0x22c55e : 0xef4444
    treeRoot!.add(createAppleMarker(
      marker,
      leafAnchor(index + 11, index * 1.1),
      0.17,
      branchColor,
    ))
  })

  const maxPoints = 42
  const knowledgeAnchors = new Map<string, { position: THREE.Vector3; point: KnowledgePoint }>()
  displayPoints.value.slice(0, maxPoints).forEach((point, index) => {
    const angle = index * 2.399
    const badge = labelBadgeForPoint(point)
    const prereqNames = (point.prerequisiteIds ?? [])
      .map(id => displayPoints.value.find(p => (p.id ?? p.name) === id)?.name)
      .filter((name): name is string => Boolean(name))
    const marker: GraphMarker = {
      id: `knowledge-${index}-${point.name}`,
      type: 'knowledge',
      label: point.name,
      status: point.status ?? 'none',
      progress: point.progress ?? 0,
      labelBadge: badge?.text,
      labelTone: badge?.tone,
      description: `果实状态：${markerStatusLabel(point.status)}。`,
      items: [
        `掌握度: ${point.progress ?? 0}%`,
        ...(prereqNames.length ? [`先修: ${prereqNames.join('、')}`] : []),
        `建议: ${point.status === 'weak' ? '安排补弱练习' : point.status === 'mastered' ? '进入迁移应用' : '继续当前路径'}`,
      ],
    }

    const isSolid = point.status === 'mastered' || point.status === 'proficient'
    const position = leafAnchor(index + 31, angle)
    knowledgeAnchors.set(point.id ?? point.name, { position, point })
    treeRoot!.add(createAppleMarker(
      marker,
      position,
      isSolid ? 0.18 : 0.20,
      statusColor(point.status),
    ))
  })

  addPrerequisiteEdges(knowledgeAnchors)
}

/** 与 astripath/src/logic/plan.ts 的 PREREQ_READY 保持一致 */
const PREREQ_READY = 60

function addPrerequisiteEdges(anchors: Map<string, { position: THREE.Vector3; point: KnowledgePoint }>) {
  if (!treeRoot) return
  anchors.forEach(({ position, point }) => {
    for (const prereqId of point.prerequisiteIds ?? []) {
      const prereq = anchors.get(prereqId)
      if (!prereq || prereq.position.equals(position)) continue
      const ready = prereq.point.status !== 'none' && (prereq.point.progress ?? 0) >= PREREQ_READY
      treeRoot!.add(createPrerequisiteEdge(prereq.position, position, ready))
    }
  })
}

function createPrerequisiteEdge(from: THREE.Vector3, to: THREE.Vector3, ready: boolean) {
  const group = new THREE.Group()
  group.name = ready ? 'prereq-edge-ready' : 'prereq-edge-blocked'

  // 弧线向树冠外侧鼓起，避免直线穿过树干
  const mid = from.clone().add(to).multiplyScalar(0.5)
  const outward = new THREE.Vector3(mid.x, 0, mid.z)
  if (outward.lengthSq() < 0.01) outward.set(0.6, 0, 0.6)
  outward.normalize().multiplyScalar(0.55)
  mid.add(outward)
  mid.y += 0.25
  const curve = new THREE.QuadraticBezierCurve3(from, mid, to)

  // 管线几何保证线宽可见；depthTest 关闭使连线不被树叶遮挡
  const color = ready ? 0x16a34a : 0x94a3b8
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: ready ? 0.92 : 0.85,
    depthTest: false,
    depthWrite: false,
  })
  const radius = 0.022
  if (ready) {
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, radius, 6), material)
    tube.renderOrder = 5
    group.add(tube)
  } else {
    const length = curve.getLength()
    const dash = 0.16
    const gap = 0.11
    for (let s = 0; s < length; s += dash + gap) {
      const t0 = s / length
      const t1 = Math.min((s + dash) / length, 1)
      const segment = new THREE.LineCurve3(curve.getPoint(t0), curve.getPoint(t1))
      const tube = new THREE.Mesh(new THREE.TubeGeometry(segment, 1, radius, 6), material)
      tube.renderOrder = 5
      group.add(tube)
    }
  }

  const arrowTip = curve.getPoint(0.86)
  const tangent = curve.getTangent(0.86).normalize()
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.2, 10),
    material,
  )
  arrow.renderOrder = 5
  arrow.position.copy(arrowTip)
  arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent)
  group.add(arrow)

  return group
}

async function rebuildTree() {
  loading.value = true
  loadError.value = false
  selectedMarkerId.value = null
  removeCurrentTree()
  try {
    await createGeneratedTree()
    addGraphMarkers()
    loading.value = false
  } catch (error) {
    console.error('Failed to create ez-tree knowledge tree:', error)
    removeCurrentTree()
    loadError.value = true
    loading.value = false
  }
}

function markerHitFromIntersection(event: PointerEvent) {
  if (!canvasRef.value || !camera || !raycaster || !interactiveObjects.length) return null
  const rect = canvasRef.value.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)

  const hits = raycaster.intersectObjects(interactiveObjects, true)
  const hit = hits.find(item => item.object.userData.marker)
  if (!hit) return null

  let object = hit.object
  while (object.parent?.userData.marker) {
    object = object.parent
  }
  return { marker: hit.object.userData.marker as GraphMarker, object }
}

function handlePointerDown(event: PointerEvent) {
  if (!canvasRef.value) return
  if (props.horizontalOnlyControls) {
    isTreeDragging = true
    treeDragMoved = false
    treeDragStartX = event.clientX
    treeDragLastX = event.clientX
    canvasRef.value.setPointerCapture?.(event.pointerId)
  }
  canvasRef.value.style.cursor = 'grabbing'
}

function handlePointerMove(event: PointerEvent) {
  if (!canvasRef.value) return
  if (props.horizontalOnlyControls && isTreeDragging && worldGroup) {
    const dx = event.clientX - treeDragLastX
    if (Math.abs(event.clientX - treeDragStartX) > 4) treeDragMoved = true
    worldGroup.rotation.y += dx * 0.006
    treeDragLastX = event.clientX
    canvasRef.value.style.cursor = 'grabbing'
    return
  }
  canvasRef.value.style.cursor = markerHitFromIntersection(event) ? 'pointer' : 'grab'
}

function handlePointerUp(event: PointerEvent) {
  if (!canvasRef.value) return
  if (isTreeDragging && canvasRef.value.hasPointerCapture?.(event.pointerId)) {
    canvasRef.value.releasePointerCapture(event.pointerId)
  }
  isTreeDragging = false
  canvasRef.value.style.cursor = 'grab'
}

function handleCanvasClick(event: PointerEvent) {
  if (treeDragMoved) {
    treeDragMoved = false
    return
  }

  const hit = markerHitFromIntersection(event)
  if (!hit?.marker) return
  selectedMarkerId.value = hit.marker.id
  hit.object.userData.clickedUntil = performance.now() + 720
  emit('markerSelect', hit.marker)
}

function animate() {
  animationId = requestAnimationFrame(animate)
  const time = performance.now() * 0.001

  generatedTree?.update(time)
  ezEnvironment?.update(time)
  if (skyStarGroup) {
    skyStarGroup.rotation.y = time * 0.012
  }
  if (worldGroup && !props.horizontalOnlyControls) {
    worldGroup.rotation.y = 0
  }

  markerObjects.forEach((marker, index) => {
    const clickedUntil = marker.userData.clickedUntil ?? 0
    const clickedBoost = clickedUntil > performance.now() ? 0.18 * ((clickedUntil - performance.now()) / 720) : 0
    const selectedBoost = marker.userData.marker?.id === selectedMarkerId.value ? 0.1 : 0
    const highlightedBoost = marker.userData.isHighlighted ? 0.18 : 0
    const pulseSpeed = marker.userData.isHighlighted ? 3 : 1.2
    const pulseAmp = marker.userData.isHighlighted ? 0.09 : 0.035
    const pulse = 1 + Math.sin(time * pulseSpeed + index * 0.65) * pulseAmp
    marker.scale.setScalar(pulse + clickedBoost + selectedBoost + highlightedBoost)
  })

  controls?.update()
  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}

function handleResize() {
  if (!canvasRef.value || !renderer || !camera) return
  const { w, h } = getCanvasSize()
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

function disposeObject(object: DisposableObject) {
  object.geometry?.dispose()
  if (Array.isArray(object.material)) {
    object.material.forEach(material => material.dispose())
  } else {
    object.material?.dispose()
  }
}

function removeCurrentTree() {
  if (treeRoot && worldGroup) {
    worldGroup.remove(treeRoot)
  }
  treeRoot?.traverse(child => disposeObject(child as DisposableObject))
  treeRoot = null
  generatedTree = null
  leafGeometry = null
  leafMaterial = null
  denseLeafGeometry = null
  denseLeafMaterial = null
  interactiveObjects.length = 0
  markerObjects.length = 0
}

function removeStage() {
  if (stageGroup && worldGroup) {
    worldGroup.remove(stageGroup)
  }
  stageGroup?.traverse(child => disposeObject(child as DisposableObject))
  stageGroup = null
}

function removeStarField() {
  if (skyStarGroup && scene) {
    scene.remove(skyStarGroup)
  }
  skyStarGroup && disposeObject(skyStarGroup as DisposableObject)
  skyStarGroup = null
}

onMounted(async () => {
  loading.value = true
  await preloadEzTreeAssets()
  createScene()
  initRenderer()
  createStage()
  rebuildTree()
  animate()
  loading.value = false
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', handleResize)
  resizeObserver?.disconnect()
  controls?.dispose()
  canvasRef.value?.removeEventListener('pointerdown', handlePointerDown)
  canvasRef.value?.removeEventListener('pointermove', handlePointerMove)
  canvasRef.value?.removeEventListener('pointerup', handlePointerUp)
  canvasRef.value?.removeEventListener('pointerleave', handlePointerUp)
  canvasRef.value?.removeEventListener('click', handleCanvasClick)
  removeCurrentTree()
  removeStage()
  removeStarField()
  renderer?.dispose()
  scene?.clear()
  worldGroup = null
})

watch(() => props.knowledgePoints, rebuildTree, { deep: true })
watch(() => props.highlightNames, applyMarkerHighlights, { deep: true })
</script>

<template>
  <div class="three-tree-wrapper" :style="fill ? { height: '100%' } : { height: typeof height === 'number' ? `${height}px` : height }">
    <canvas ref="canvasRef" class="three-tree-canvas" aria-label="3D knowledge tree" />
    <div v-if="loading" class="three-tree-loading">
      <div class="loading-tree">
        <span />
        <span />
        <span />
      </div>
      <span>生成知识树...</span>
    </div>
    <div v-if="loadError" class="three-tree-error">
      <span>知识树生成失败</span>
    </div>
    <div class="tree-vignette" />
  </div>
</template>

<style scoped>
.three-tree-wrapper {
  position: relative;
  width: 100%;
  border-radius: 0;
  overflow: hidden;
  background: linear-gradient(180deg, #b8ddff 0%, #e2f0ff 45%, #f0f8e8 100%);
  border: 0;
}

.three-tree-canvas {
  position: relative;
  z-index: 2;
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
}

.tree-vignette {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    radial-gradient(circle at center, transparent 55%, rgba(255, 255, 255, 0.08) 100%),
    url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
  opacity: 0.22;
}

.three-tree-loading,
.three-tree-error {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: rgba(242, 246, 250, 0.68);
  font-size: 13px;
  background: rgba(9, 16, 18, 0.78);
  backdrop-filter: blur(10px);
}

.three-tree-error {
  color: #c98a45;
}

.loading-tree {
  position: relative;
  width: 52px;
  height: 58px;
}

.loading-tree span {
  position: absolute;
  left: 50%;
  bottom: 0;
  display: block;
  width: 5px;
  height: 44px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(127, 154, 99, 0.9), rgba(92, 66, 42, 0.82));
  transform-origin: bottom center;
  animation: branch-sway 1.35s ease-in-out infinite;
}

.loading-tree span:nth-child(1) {
  transform: translateX(-50%) rotate(-32deg);
  height: 36px;
}

.loading-tree span:nth-child(2) {
  transform: translateX(-50%);
}

.loading-tree span:nth-child(3) {
  transform: translateX(-50%) rotate(32deg);
  height: 36px;
}

@keyframes branch-sway {
  50% {
    filter: brightness(1.24);
  }
}
</style>
