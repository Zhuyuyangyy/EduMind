<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

type DomainId = 'clang' | 'ds' | 'algo' | 'os' | 'net' | 'db' | 'ml'

interface Domain {
  id: DomainId
  name: string
  short: string
  color: string
  mastery: number
  concepts: number
  weak: string[]
  next: string
  modelUrl: string
}

interface SceneNode {
  id: DomainId
  domain: Domain
  root: THREE.Group
  hitTarget: THREE.Mesh
  basePosition: THREE.Vector3
}

interface LabelPosition {
  id: DomainId | 'core'
  label: string
  mastery: number
  x: number
  y: number
  opacity: number
  scale: number
  color: string
}

interface PlanetLayout {
  domain: Domain
  position: THREE.Vector3
  scale: number
}

interface DistributionSegment {
  label: string
  pct: number
  count: number
  color: string
  evidence: number
  delta: number
  rule: string
}

interface WeakPoint {
  name: string
  domainId: DomainId
  domain: string
  color: string
  value: number
  mastery: number
  delta: number
  evidence: number
  cause: string
  last: string
  route: string
}

interface MapNode {
  domain: Domain
  x: number
  y: number
  z: number
  size: number
  orbitTilt: number
  orbitScale: number
  satellites: MapSatellite[]
}

interface MapSatellite {
  label: string
  angle: number
  distance: number
}

const domains: Domain[] = [
  { id: 'clang', name: 'C语言', short: 'C', color: '#4A8DFF', mastery: 0.88, concepts: 42, weak: ['二级指针', '内存对齐'], next: '强化指针与内存模型专项', modelUrl: '/models/planet_10.glb' },
  { id: 'ds', name: '数据结构', short: 'DS', color: '#35E0D8', mastery: 0.76, concepts: 38, weak: ['图遍历', 'BFS visited'], next: '补全图算法与复杂度分析', modelUrl: '/models/planet_12.glb' },
  { id: 'algo', name: '算法', short: 'AL', color: '#4FD483', mastery: 0.72, concepts: 45, weak: ['动态规划', '二分边界'], next: '练习典型 DP 与二分变形', modelUrl: '/models/planet_10.glb' },
  { id: 'os', name: '操作系统', short: 'OS', color: '#86B7FF', mastery: 0.61, concepts: 34, weak: ['虚拟内存', '进程调度'], next: '梳理内存管理与同步原语', modelUrl: '/models/planet_15.glb' },
  { id: 'net', name: '计算机网络', short: 'NET', color: '#A78BFA', mastery: 0.55, concepts: 28, weak: ['TCP 拥塞控制', 'HTTP/2'], next: '深入传输层与协议栈', modelUrl: '/models/planet_18.glb' },
  { id: 'db', name: '数据库', short: 'DB', color: '#F0B24A', mastery: 0.49, concepts: 30, weak: ['索引优化', '事务隔离'], next: '掌握 SQL 执行计划与锁', modelUrl: '/models/planet_16.glb' },
  { id: 'ml', name: '机器学习', short: 'ML', color: '#F06A7E', mastery: 0.38, concepts: 36, weak: ['反向传播', '正则化'], next: '夯实线性模型与梯度下降', modelUrl: '/models/planet_24.glb' },
]

const router = useRouter()
const selectedId = ref<DomainId>('ds')
const hoverId = ref<DomainId | 'core' | null>(null)
const sceneReady = ref(false)
const sceneError = ref(false)
const labelPositions = ref<LabelPosition[]>([])
const graphShellRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const diagnosticWindow = {
  range: '近 7 天',
  sample: '36 次练习 / 112 道题',
  evidence: 268,
  confidence: 0.86,
  updatedAt: '2 分钟前',
  source: '评估智能体 + 反馈回写',
}

const weakPointDiagnostics: WeakPoint[] = [
  {
    name: '反向传播',
    domainId: 'ml',
    domain: '机器学习',
    color: '#F06A7E',
    value: 72,
    mastery: 34,
    delta: -6,
    evidence: 24,
    cause: '链式求导漏项，矩阵维度检查不稳定',
    last: '近 3 次推导题错 2 次',
    route: '/learning-path',
  },
  {
    name: '正则化',
    domainId: 'ml',
    domain: '机器学习',
    color: '#F06A7E',
    value: 69,
    mastery: 38,
    delta: -4,
    evidence: 18,
    cause: 'L1/L2 约束含义能识别，但不会迁移到损失函数',
    last: '概念题正确率 44%',
    route: '/resources',
  },
  {
    name: '索引优化',
    domainId: 'db',
    domain: '数据库',
    color: '#F0B24A',
    value: 61,
    mastery: 48,
    delta: 2,
    evidence: 16,
    cause: '执行计划与联合索引最左匹配混淆',
    last: 'SQL 分析题耗时高于均值 31%',
    route: '/evaluation',
  },
  {
    name: '事务隔离',
    domainId: 'db',
    domain: '数据库',
    color: '#F0B24A',
    value: 58,
    mastery: 51,
    delta: -1,
    evidence: 13,
    cause: '不可重复读、幻读场景判断不稳',
    last: '并发案例题连续 2 次误判',
    route: '/tutoring',
  },
  {
    name: 'TCP 拥塞控制',
    domainId: 'net',
    domain: '计算机网络',
    color: '#A78BFA',
    value: 54,
    mastery: 55,
    delta: 3,
    evidence: 11,
    cause: '慢启动阈值与拥塞避免切换点不清晰',
    last: '阶段测评 6/10',
    route: '/learning-path',
  },
]

const radarStats = [
  { label: '最大缺口', value: '机器学习 -36', color: '#F06A7E' },
  { label: '证据样本', value: '112 题', color: '#22d3ee' },
  { label: '稳定提升', value: '+4.1%', color: '#4FD483' },
]

const radarInsights = [
  '机器学习低于目标 36 分，主要来自反向传播与正则化。',
  '系统设计类题目失分集中在内存、事务、网络三类并发场景。',
]

const activeDomain = computed(() => (
  domains.find(d => d.id === (hoverId.value ?? selectedId.value)) ?? domains[0]
))

const mapNodes = computed<MapNode[]>(() => {
  const nodeLayout: Record<DomainId, {
    x: number,
    y: number,
    z: number,
    size: number,
    orbitTilt: number,
    orbitScale: number,
    satellites: Array<{ label: string, angle: number, distance: number }>,
  }> = {
    clang: {
      x: 36,
      y: 22,
      z: 70,
      size: 108,
      orbitTilt: 68,
      orbitScale: 1.1,
      satellites: [
        { label: '函数', angle: -80, distance: 1.35 },
        { label: '内存管理', angle: 15, distance: 1.4 },
        { label: '结构体', angle: 60, distance: 1.3 },
        { label: '数据类型', angle: 120, distance: 1.25 },
      ],
    },
    ds: {
      x: 68,
      y: 35,
      z: 100,
      size: 104,
      orbitTilt: 58,
      orbitScale: 0.95,
      satellites: [
        { label: '编组与链表', angle: -70, distance: 1.4 },
        { label: '栈与队列', angle: -25, distance: 1.35 },
        { label: '树', angle: 35, distance: 1.3 },
        { label: '图', angle: 80, distance: 1.38 },
        { label: '哈希表', angle: 125, distance: 1.28 },
      ],
    },
    algo: {
      x: 72,
      y: 66,
      z: 45,
      size: 96,
      orbitTilt: 75,
      orbitScale: 1.0,
      satellites: [
        { label: '排序', angle: -60, distance: 1.3 },
        { label: '查找', angle: -10, distance: 1.35 },
        { label: '递归', angle: 45, distance: 1.28 },
        { label: '贪心', angle: 95, distance: 1.22 },
        { label: '动态规划', angle: 140, distance: 1.32 },
      ],
    },
    os: {
      x: 50,
      y: 76,
      z: -20,
      size: 86,
      orbitTilt: 52,
      orbitScale: 1.15,
      satellites: [
        { label: '进程管理', angle: -50, distance: 1.3 },
        { label: '调度算法', angle: 20, distance: 1.32 },
        { label: '文件系统', angle: 75, distance: 1.28 },
        { label: '设备管理', angle: 130, distance: 1.25 },
      ],
    },
    net: {
      x: 22,
      y: 70,
      z: -80,
      size: 78,
      orbitTilt: 62,
      orbitScale: 1.05,
      satellites: [
        { label: '网络协议', angle: -75, distance: 1.28 },
        { label: 'TCP/IP', angle: -15, distance: 1.3 },
        { label: 'HTTP', angle: 45, distance: 1.25 },
        { label: '网络编程', angle: 110, distance: 1.2 },
      ],
    },
    db: {
      x: 13,
      y: 48,
      z: -10,
      size: 88,
      orbitTilt: 70,
      orbitScale: 1.0,
      satellites: [
        { label: 'SQL 基础', angle: -95, distance: 1.3 },
        { label: '索引优化', angle: -40, distance: 1.32 },
        { label: '事务管理', angle: 20, distance: 1.28 },
        { label: '数据建模', angle: 70, distance: 1.25 },
        { label: '查询优化', angle: 120, distance: 1.3 },
      ],
    },
    ml: {
      x: 16,
      y: 26,
      z: -30,
      size: 92,
      orbitTilt: 65,
      orbitScale: 1.08,
      satellites: [
        { label: '线性回归', angle: -70, distance: 1.35 },
        { label: '逻辑回归', angle: -15, distance: 1.3 },
        { label: '决策树', angle: 40, distance: 1.28 },
        { label: '聚类算法', angle: 90, distance: 1.22 },
        { label: '神经网络', angle: 140, distance: 1.32 },
      ],
    },
  }

  return domains.map(domain => ({
    domain,
    ...nodeLayout[domain.id],
  }))
})

const mapLegend = [
  { label: '优秀（80%+）', color: '#22d3ee' },
  { label: '良好（60%-80%）', color: '#3b82f6' },
  { label: '一般（40%-60%）', color: '#f0b24a' },
  { label: '薄弱（<40%）', color: '#f06a7e' },
]

function selectDomain(id: DomainId) {
  selectedId.value = id
}

function formatPct(n: number) {
  return `${Math.round(n * 100)}%`
}

function getSatellitePosition(
  nodeX: number,
  nodeY: number,
  nodeSize: number,
  angleDeg: number,
  distanceScale: number,
): { x: number, y: number } {
  const angleRad = (angleDeg * Math.PI) / 180
  const orbitRadius = (nodeSize / 2) * distanceScale
  const dx = Math.cos(angleRad) * orbitRadius
  const dy = Math.sin(angleRad) * orbitRadius
  return {
    x: nodeX + (dx / 6.2),
    y: nodeY + (dy / 6.2),
  }
}

function formatSignedPct(n: number) {
  return `${n > 0 ? '+' : ''}${n}%`
}

function goTo(path: string, query: Record<string, string>) {
  router.push({ path, query })
}

function openDiagnosticReport() {
  goTo('/evaluation', { source: 'home-knowledge-map', panel: 'mastery-distribution' })
}

function openRadarReport() {
  goTo('/evaluation', { source: 'home-knowledge-map', panel: 'ability-radar' })
}

function openWeakPoint(item: WeakPoint) {
  selectedId.value = item.domainId
  goTo(item.route, { source: 'home-knowledge-map', domain: item.domainId, focus: item.name })
}

function openDomainResource(domain: Domain) {
  selectedId.value = domain.id
  goTo('/resources', {
    source: 'home-knowledge-map',
    tab: 'resources',
    domain: domain.id,
    module: domain.name,
    topic: domain.name,
    unit: domain.next,
  })
}

const distribution = computed<DistributionSegment[]>(() => {
  const total = domains.reduce((sum, domain) => sum + domain.concepts, 0)
  const mastered = domains.reduce((sum, domain) => {
    const ratio = domain.mastery >= 0.8 ? 0.43 : domain.mastery >= 0.6 ? 0.24 : 0.1
    return sum + Math.round(domain.concepts * ratio)
  }, 0)
  const fair = domains.reduce((sum, domain) => {
    const ratio = domain.mastery >= 0.8 ? 0.45 : domain.mastery >= 0.5 ? 0.52 : 0.38
    return sum + Math.round(domain.concepts * ratio)
  }, 0)
  const weak = Math.max(total - mastered - fair, 0)
  return [
    { label: '稳定掌握', pct: Math.round((mastered / total) * 100), count: mastered, color: '#4FD483', evidence: 91, delta: 4, rule: '连续答对且迁移题通过' },
    { label: '波动区间', pct: Math.round((fair / total) * 100), count: fair, color: '#F0B24A', evidence: 123, delta: 1, rule: '基础题可过，综合题不稳' },
    { label: '待提升', pct: Math.round((weak / total) * 100), count: weak, color: '#F06A7E', evidence: 54, delta: -3, rule: '近两轮测评重复失分' },
  ]
})

const weakPoints = computed<WeakPoint[]>(() => {
  return [...weakPointDiagnostics]
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
})

const totalConcepts = computed(() => domains.reduce((s, d) => s + d.concepts, 0))
const overallMastery = computed(() => Math.round((domains.reduce((s, d) => s + d.mastery, 0) / domains.length) * 100))

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let graphGroup: THREE.Group | null = null
let orbitBackdrop: THREE.Group | null = null
let starfieldGroup: THREE.Group | null = null
let centerPlanet: THREE.Object3D | null = null
let resizeObserver: ResizeObserver | null = null
let animationId = 0
let disposed = false
let targetX = 0
let targetY = 0
const cameraBaseY = 0
const cameraBaseZ = 42
const WORLD_SCALE = 0.04
const CSS_CENTER_X = 500
const CSS_CENTER_Y = 410
const GRAPH_GROUP_Y_OFFSET = 1.1

const loader = new GLTFLoader()
let planetLoadOrder = 0
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const sceneNodes: SceneNode[] = []
const interactables: THREE.Mesh[] = []
const particles: Array<{ curve: THREE.CatmullRomCurve3, mesh: THREE.Mesh, offset: number }> = []
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')

function canAnimate() {
  return !reduceMotion?.matches
}

function colorHex(color: string) {
  return new THREE.Color(color).getHex()
}

function getSceneFrame(width: number, height: number) {
  const tallRatio = Math.max(0, Math.min((height - 380) / 520, 1))
  const wideRatio = Math.max(0, Math.min((width - 620) / 420, 1))

  return {
    cameraZ: cameraBaseZ + tallRatio * 2.4 + wideRatio * 1.2,
    graphScale: 0.84 - tallRatio * 0.03,
  }
}

function applySceneFrame(width: number, height: number) {
  const frame = getSceneFrame(width, height)
  if (camera) {
    camera.position.z = frame.cameraZ
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  graphGroup?.scale.setScalar(frame.graphScale)
}

function fitObject(object: THREE.Object3D, radius: number) {
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxSize = Math.max(size.x, size.y, size.z)
  if (maxSize > 0) object.scale.multiplyScalar((radius * 2) / maxSize)
  object.position.sub(center.multiplyScalar(object.scale.x))
}

function disposeObject(object: THREE.Object3D) {
  object.traverse(child => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const material = mesh.material
    if (Array.isArray(material)) {
      material.forEach(item => item.dispose())
    } else if (material) {
      material.dispose()
    }
  })
}

function createStarfield(target: THREE.Scene) {
  starfieldGroup = new THREE.Group()
  starfieldGroup.name = 'Starfield'
  target.add(starfieldGroup)

  // Layer 1: distant tiny stars
  const count1 = 3200
  const pos1 = new Float32Array(count1 * 3)
  for (let i = 0; i < count1; i += 1) {
    const radius = 40 + Math.random() * 80
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    pos1[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    pos1[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
    pos1[i * 3 + 2] = radius * Math.cos(phi)
  }
  const geo1 = new THREE.BufferGeometry()
  geo1.setAttribute('position', new THREE.BufferAttribute(pos1, 3))
  starfieldGroup.add(new THREE.Points(geo1, new THREE.PointsMaterial({
    color: 0xc8d8ff, size: 0.12, transparent: true, opacity: 0.35, depthWrite: false,
  })))

  // Layer 2: mid-range stars
  const count2 = 1400
  const pos2 = new Float32Array(count2 * 3)
  for (let i = 0; i < count2; i += 1) {
    const radius = 30 + Math.random() * 60
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    pos2[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    pos2[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
    pos2[i * 3 + 2] = radius * Math.cos(phi)
  }
  const geo2 = new THREE.BufferGeometry()
  geo2.setAttribute('position', new THREE.BufferAttribute(pos2, 3))
  starfieldGroup.add(new THREE.Points(geo2, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.22, transparent: true, opacity: 0.52, depthWrite: false,
  })))

  // Layer 3: bright accent stars
  const count3 = 200
  const pos3 = new Float32Array(count3 * 3)
  for (let i = 0; i < count3; i += 1) {
    const radius = 25 + Math.random() * 50
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    pos3[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    pos3[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
    pos3[i * 3 + 2] = radius * Math.cos(phi)
  }
  const geo3 = new THREE.BufferGeometry()
  geo3.setAttribute('position', new THREE.BufferAttribute(pos3, 3))
  starfieldGroup.add(new THREE.Points(geo3, new THREE.PointsMaterial({
    color: 0x9ddfff, size: 0.38, transparent: true, opacity: 0.72, depthWrite: false,
  })))

  // Nebula clouds: subtle colored fog patches
  const nebulaColors = [0x1e3a6e, 0x2a1852, 0x0c2e4a, 0x1a1040]
  nebulaColors.forEach((color, idx) => {
    const cloudGeo = new THREE.SphereGeometry(8 + idx * 3, 16, 16)
    const cloudMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.04 + idx * 0.01,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const cloud = new THREE.Mesh(cloudGeo, cloudMat)
    cloud.position.set(
      (Math.random() - 0.5) * 40,
      (Math.random() - 0.5) * 20,
      -20 + (Math.random() - 0.5) * 30,
    )
    cloud.scale.set(2 + Math.random(), 1.2 + Math.random() * 0.5, 1.5 + Math.random())
    starfieldGroup!.add(cloud)
  })
}

function cssToWorld(cssX: number, cssY: number, cssZ: number) {
  return new THREE.Vector3(
    (cssX * 10 - CSS_CENTER_X) * WORLD_SCALE,
    -(cssY * 10 - CSS_CENTER_Y) * WORLD_SCALE,
    cssZ * WORLD_SCALE,
  )
}

function buildLayout() {
  return mapNodes.value.map<PlanetLayout>(node => ({
    domain: node.domain,
    position: cssToWorld(node.x, node.y, node.z),
    scale: 1,
  }))
}

function addLink(to: THREE.Vector3, color: string, index: number) {
  if (!graphGroup) return

  const from = new THREE.Vector3(0, 0, 0)
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5)
  mid.y += 0.24
  mid.z += 0.2

  const curve = new THREE.CatmullRomCurve3([from, mid, to])
  const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(56))
  graphGroup.add(new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color: colorHex(color),
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
    }),
  ))

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.024, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.68, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  particles.push({ curve, mesh, offset: index * 0.13 })
  graphGroup.add(mesh)
}

async function addPlanetModel(root: THREE.Group, url: string, radius: number, color: string) {
  const placeholder = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 32, 32),
    new THREE.MeshStandardMaterial({
      color: colorHex(color),
      emissive: colorHex(color),
      emissiveIntensity: 0.28,
      roughness: 0.34,
      metalness: 0.04,
    }),
  )
  placeholder.name = 'PlanetLoadingPlaceholder'
  root.add(placeholder)

  try {
    const loadOrder = planetLoadOrder++
    await new Promise<void>((resolve) => window.setTimeout(resolve, 7000 + loadOrder * 1000))
    const gltf = await loader.loadAsync(url)
    if (disposed) return

    const model = gltf.scene
    fitObject(model, radius)
    model.name = `PublicPlanetModel-${url.split('/').pop() ?? 'planet'}`
    model.traverse(child => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      tunePlanetMesh(mesh, color)
    })
    root.remove(placeholder)
    disposeObject(placeholder)
    root.add(model)
  } catch (error) {
    console.warn(`Failed to load planet model ${url}:`, error)
  }
}

function isFlatAuxiliaryMesh(mesh: THREE.Mesh) {
  mesh.geometry.computeBoundingBox()
  const box = mesh.geometry.boundingBox
  if (!box) return false
  const size = new THREE.Vector3()
  box.getSize(size)
  const dims = [size.x, size.y, size.z].sort((a, b) => a - b)
  return dims[2] > 0 && dims[0] / dims[2] < 0.035
}

function tunePlanetMesh(mesh: THREE.Mesh, color: string) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  const flatAuxiliary = isFlatAuxiliaryMesh(mesh)

  materials.forEach(material => {
    if (!(material instanceof THREE.MeshStandardMaterial) && !(material instanceof THREE.MeshPhysicalMaterial)) return
    material.needsUpdate = true
    material.color.lerp(new THREE.Color(0xffffff), 0.08)
    if (material.map) material.map.colorSpace = THREE.SRGBColorSpace
    if ('emissive' in material) {
      material.emissive = new THREE.Color(color).multiplyScalar(0.16)
      material.emissiveIntensity = Math.max(material.emissiveIntensity ?? 0, 0.28)
    }
    material.roughness = Math.min(material.roughness ?? 0.5, 0.42)
    material.metalness = Math.min(material.metalness ?? 0.05, 0.06)
    material.envMapIntensity = Math.max(material.envMapIntensity ?? 0, 1.35)

    if (flatAuxiliary) {
      material.transparent = true
      material.opacity = Math.min(material.opacity ?? 1, 0.72)
      material.alphaTest = 0.22
      material.depthWrite = false
      material.side = THREE.DoubleSide
    } else {
      material.opacity = 1
      material.alphaTest = 0
      material.transparent = false
      material.depthWrite = true
      material.side = THREE.FrontSide
    }
  })
}

function createRaycastMaterial(color: THREE.ColorRepresentation) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
  })
  material.colorWrite = false
  return material
}

function createCenterPlanet() {
  if (!graphGroup) return

  const root = new THREE.Group()
  root.name = 'KnowledgeCenterPlanet'
  root.userData.id = 'core'
  root.position.set(0, 0, 0)

  const centerRadius = 128 * WORLD_SCALE / 2
  const hitTarget = new THREE.Mesh(
    new THREE.SphereGeometry(centerRadius * 1.6, 32, 32),
    createRaycastMaterial(0x22d3ee),
  )
  hitTarget.userData.id = 'core'
  root.add(hitTarget)
  interactables.push(hitTarget)

  centerPlanet = root
  graphGroup.add(root)
  addPlanetModel(root, '/models/planet_17.glb', centerRadius, '#22d3ee')
}

function createDomainNode(domain: Domain, position: THREE.Vector3, index: number, visualScale = 1) {
  if (!graphGroup) return

  const cssNode = mapNodes.value.find(n => n.domain.id === domain.id)
  const cssSize = cssNode?.size ?? 90

  const root = new THREE.Group()
  root.position.copy(position)
  root.userData.id = domain.id

  const color = colorHex(domain.color)
  const radius = (cssSize * WORLD_SCALE / 2) * visualScale
  const hitRadius = Math.max(radius * 1.45, 1.2)

  const hitTarget = new THREE.Mesh(new THREE.SphereGeometry(hitRadius, 36, 36), createRaycastMaterial(color))
  hitTarget.userData.id = domain.id
  root.add(hitTarget)

  graphGroup.add(root)
  interactables.push(hitTarget)
  sceneNodes.push({ id: domain.id, domain, root, hitTarget, basePosition: position })
  addLink(position, domain.color, index)
  addPlanetModel(root, domain.modelUrl, radius * 0.95, domain.color)
}

function handlePointer(event: PointerEvent) {
  if (!graphShellRef.value || !camera) return

  const rect = graphShellRef.value.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  targetX = pointer.x
  targetY = pointer.y

  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObjects(interactables, false)[0]
  hoverId.value = (hit?.object.userData.id as DomainId | 'core' | undefined) ?? null
  graphShellRef.value.style.cursor = hoverId.value ? 'pointer' : 'grab'
}

function handleClick(event: MouseEvent) {
  if (!graphShellRef.value || !camera) return
  handlePointer(event as PointerEvent)
  if (hoverId.value === 'core') {
    openDiagnosticReport()
  } else if (hoverId.value) {
    const domain = domains.find(item => item.id === hoverId.value)
    if (domain) openDomainResource(domain)
  }
}

function handlePointerLeave() {
  hoverId.value = null
  targetX = 0
  targetY = 0
  if (graphShellRef.value) graphShellRef.value.style.cursor = 'grab'
}

function updateLabels() {
  if (!camera || !graphShellRef.value) return

  const rect = graphShellRef.value.getBoundingClientRect()
  const nextLabels: LabelPosition[] = []

  if (centerPlanet) {
    const world = new THREE.Vector3()
    centerPlanet.getWorldPosition(world)
    world.y -= 2.2
    world.project(camera!)
    const active = hoverId.value === 'core'
    nextLabels.push({
      id: 'core',
      label: '学习中枢',
      mastery: overallMastery.value / 100,
      x: (world.x * 0.5 + 0.5) * rect.width,
      y: (-world.y * 0.5 + 0.5) * rect.height,
      opacity: world.z < 1 ? (active ? 1 : 0.85) : 0,
      scale: active ? 1.1 : 1,
      color: '#22d3ee',
    })
  }

  sceneNodes.forEach(node => {
    const world = new THREE.Vector3()
    node.root.getWorldPosition(world)
    world.y -= (node.hitTarget.geometry as THREE.SphereGeometry).parameters.radius * 1.35
    world.project(camera!)

    const active = node.id === selectedId.value || node.id === hoverId.value
    nextLabels.push({
      id: node.id,
      label: node.domain.name,
      mastery: node.domain.mastery,
      x: (world.x * 0.5 + 0.5) * rect.width,
      y: (-world.y * 0.5 + 0.5) * rect.height,
      opacity: world.z < 1 ? (active ? 1 : 0.76) : 0,
      scale: active ? 1.08 : 1,
      color: node.domain.color,
    })
  })

  labelPositions.value = nextLabels
}

function resizeScene() {
  if (!graphShellRef.value || !camera || !renderer) return
  const width = Math.max(graphShellRef.value.clientWidth, 320)
  const height = Math.max(graphShellRef.value.clientHeight, 280)
  applySceneFrame(width, height)
  renderer.setSize(width, height, false)
}

async function initKnowledgeScene() {
  if (!graphShellRef.value || !canvasRef.value) return

  disposed = false
  sceneReady.value = false
  sceneError.value = false

  try {
    const width = Math.max(graphShellRef.value.clientWidth, 320)
    const height = Math.max(graphShellRef.value.clientHeight, 280)

    scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x020712, 0.004)

    camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 300)
    camera.position.set(0, cameraBaseY, getSceneFrame(width, height).cameraZ)

    renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(width, height, false)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.24

    scene.add(new THREE.AmbientLight(0xffffff, 0.72))
    scene.add(new THREE.HemisphereLight(0xc7f9ff, 0x07111f, 0.72))
    const white = new THREE.PointLight(0xffffff, 3.6)
    white.position.set(18, 28, 22)
    scene.add(white)
    const key = new THREE.DirectionalLight(0xffffff, 2.1)
    key.position.set(-12, 18, 24)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x93c5fd, 1.7)
    rim.position.set(18, 8, -20)
    scene.add(rim)
    const cyan = new THREE.PointLight(0x22d3ee, 2.7)
    cyan.position.set(-22, -18, 16)
    scene.add(cyan)
    const violet = new THREE.PointLight(0x8b5cf6, 2.0)
    violet.position.set(14, 4, -18)
    scene.add(violet)

    createStarfield(scene)

    orbitBackdrop = new THREE.Group()
    scene.add(orbitBackdrop)

    graphGroup = new THREE.Group()
    graphGroup.scale.setScalar(getSceneFrame(width, height).graphScale)
    graphGroup.position.y = GRAPH_GROUP_Y_OFFSET
    scene.add(graphGroup)

    const pmrem = new THREE.PMREMGenerator(renderer)
    pmrem.compileEquirectangularShader()
    scene.environment = pmrem.fromScene(scene).texture

    createCenterPlanet()
    buildLayout().forEach(({ domain, position, scale }, index) => createDomainNode(domain, position, index, scale))
    scene.environment = pmrem.fromScene(scene).texture
    pmrem.dispose()

    resizeObserver = new ResizeObserver(() => resizeScene())
    resizeObserver.observe(graphShellRef.value)
    graphShellRef.value.addEventListener('pointermove', handlePointer)
    graphShellRef.value.addEventListener('pointerleave', handlePointerLeave)
    graphShellRef.value.addEventListener('click', handleClick)

    sceneReady.value = true
    animateScene()
  } catch (error) {
    console.error('Failed to initialize homepage planet knowledge map:', error)
    sceneError.value = true
  }
}

function animateScene() {
  if (!renderer || !scene || !camera || !graphGroup) return

  const clock = new THREE.Clock()
  const tick = () => {
    const elapsed = clock.getElapsedTime()
    const motion = canAnimate()

    if (motion) {
      graphGroup!.rotation.y += 0.0015
      orbitBackdrop!.rotation.z = elapsed * 0.18
      orbitBackdrop!.rotation.x = Math.sin(elapsed * 0.18) * 0.08
      if (centerPlanet) centerPlanet.rotation.y += 0.004
      if (starfieldGroup) starfieldGroup.rotation.y += 0.0003
    }

    camera!.position.x += (targetX * 5 - camera!.position.x) * 0.045
    camera!.position.y += (targetY * 3.5 + cameraBaseY - camera!.position.y) * 0.045
    camera!.lookAt(0, 0, 0)

    const coreActive = hoverId.value === 'core'
    if (centerPlanet) {
      const pulse = motion ? 1 + Math.sin(elapsed * 2.2) * 0.025 : 1
      centerPlanet.scale.setScalar(coreActive ? pulse * 1.05 : pulse)
    }

    sceneNodes.forEach((node, index) => {
      const active = node.id === selectedId.value || node.id === hoverId.value
      const pulse = motion ? 1 + Math.sin(elapsed * 2.4 + index) * 0.035 : 1
      node.root.position.y = node.basePosition.y + (motion ? Math.sin(elapsed * 1.35 + index) * 0.18 : 0)
      node.hitTarget.scale.setScalar(active ? pulse * 1.04 : pulse)
    })

    if (motion) {
      particles.forEach(item => {
        const progress = (elapsed * 0.18 + item.offset) % 1
        item.mesh.position.copy(item.curve.getPoint(progress))
      })
    }

    updateLabels()
    renderer!.render(scene!, camera!)
    animationId = window.requestAnimationFrame(tick)
  }

  animationId = window.requestAnimationFrame(tick)
}

function cleanupScene() {
  disposed = true
  window.cancelAnimationFrame(animationId)
  resizeObserver?.disconnect()
  resizeObserver = null

  if (graphShellRef.value) {
    graphShellRef.value.removeEventListener('pointermove', handlePointer)
    graphShellRef.value.removeEventListener('pointerleave', handlePointerLeave)
    graphShellRef.value.removeEventListener('click', handleClick)
    graphShellRef.value.style.cursor = ''
  }

  if (scene) disposeObject(scene)
  renderer?.dispose()

  renderer = null
  scene = null
  camera = null
  graphGroup = null
  orbitBackdrop = null
  starfieldGroup = null
  centerPlanet = null
  sceneNodes.length = 0
  interactables.length = 0
  particles.length = 0
  labelPositions.value = []
}

const radarChartRef = ref<HTMLDivElement | null>(null)
let radarChart: echarts.ECharts | null = null

function initRadarChart() {
  if (!radarChartRef.value) return
  radarChart = echarts.init(radarChartRef.value)
  updateRadarChart()
}

function updateRadarChart() {
  if (!radarChart) return
  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item' },
    legend: {
      data: ['当前水平', '目标水平'],
      textStyle: { color: '#7f93ba', fontSize: 10 },
      right: 0,
      top: 0,
      itemWidth: 8,
      itemHeight: 8,
    },
    radar: {
      indicator: [
        { name: '编码能力', max: 100 },
        { name: '算法思维', max: 100 },
        { name: '系统设计', max: 100 },
        { name: '数学基础', max: 100 },
        { name: '机器学习', max: 100 },
        { name: '工程实践', max: 100 },
      ],
      radius: '62%',
      center: ['50%', '54%'],
      axisName: { color: '#9badcc', fontSize: 10 },
      splitArea: { areaStyle: { color: ['rgba(150,175,220,0.05)', 'rgba(150,175,220,0.02)'] } },
      axisLine: { lineStyle: { color: 'rgba(150,175,220,0.12)' } },
      splitLine: { lineStyle: { color: 'rgba(150,175,220,0.10)' } },
    },
    series: [{
      type: 'radar',
      data: [
        { value: [82, 74, 58, 78, 42, 64], name: '当前水平', itemStyle: { color: '#22d3ee' }, areaStyle: { color: 'rgba(34,211,238,0.18)' } },
        { value: [90, 88, 80, 85, 78, 82], name: '目标水平', itemStyle: { color: '#a78bfa' }, lineStyle: { type: 'dashed' }, areaStyle: { color: 'rgba(167,139,250,0.08)' } },
      ],
    }],
  }
  radarChart.setOption(option)
}

function handleResize() {
  radarChart?.resize()
  resizeScene()
}

onMounted(() => {
  nextTick(() => {
    initRadarChart()
    initKnowledgeScene()
  })
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  radarChart?.dispose()
  radarChart = null
  cleanupScene()
})
</script>

<template>
  <section class="section-skyline">
    <div class="skyline-inner">
      <header class="sky-header">
        <div>
          <div class="sky-eyebrow"><span />KNOWLEDGE MAP</div>
          <h2>知识地图</h2>
          <p class="sky-sub">以学习中枢为核心，查看各学科域的掌握度与薄弱连接。</p>
        </div>
        <div class="sky-score glass-card">
          <span>总体掌握度</span>
          <strong>{{ overallMastery }}%</strong>
        </div>
      </header>

      <div class="knowledge-board">
        <div class="graph-panel glass-card">
          <div class="graph-header">
            <span class="card-title">知识成长图谱</span>
            <div class="graph-actions">
              <span class="graph-meta">{{ totalConcepts }} 知识点 · {{ domains.length }} 域</span>
              <button type="button" class="view-chip" @click="openDiagnosticReport">视图：领域</button>
            </div>
          </div>
          <div
            ref="graphShellRef"
            class="graph-shell knowledge-map-visual"
            aria-label="知识成长图谱，点击节点查看知识域详情"
          >
            <canvas ref="canvasRef" class="knowledge-canvas" />
            <svg class="map-svg" viewBox="0 0 1000 620" aria-hidden="true">
              <defs>
                <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#67e8f9" stop-opacity="0.9" />
                  <stop offset="35%" stop-color="#22d3ee" stop-opacity="0.35" />
                  <stop offset="70%" stop-color="#2563eb" stop-opacity="0.12" />
                  <stop offset="100%" stop-color="#020617" stop-opacity="0" />
                </radialGradient>
                <radialGradient id="hubCore" cx="45%" cy="40%" r="55%">
                  <stop offset="0%" stop-color="#a5f3fc" stop-opacity="1" />
                  <stop offset="40%" stop-color="#22d3ee" stop-opacity="0.85" />
                  <stop offset="100%" stop-color="#0e7490" stop-opacity="0.6" />
                </radialGradient>
                <linearGradient id="linkGlowCyan" x1="0%" x2="100%" y1="0%" y2="100%">
                  <stop offset="0%" stop-color="#22d3ee" stop-opacity="0" />
                  <stop offset="30%" stop-color="#22d3ee" stop-opacity="0.5" />
                  <stop offset="70%" stop-color="#22d3ee" stop-opacity="0.5" />
                  <stop offset="100%" stop-color="#22d3ee" stop-opacity="0" />
                </linearGradient>
                <linearGradient id="linkGlowBlue" x1="0%" x2="100%" y1="0%" y2="100%">
                  <stop offset="0%" stop-color="#3b82f6" stop-opacity="0" />
                  <stop offset="30%" stop-color="#3b82f6" stop-opacity="0.45" />
                  <stop offset="70%" stop-color="#3b82f6" stop-opacity="0.45" />
                  <stop offset="100%" stop-color="#3b82f6" stop-opacity="0" />
                </linearGradient>
                <linearGradient id="linkGlowPurple" x1="0%" x2="100%" y1="0%" y2="100%">
                  <stop offset="0%" stop-color="#a78bfa" stop-opacity="0" />
                  <stop offset="30%" stop-color="#a78bfa" stop-opacity="0.4" />
                  <stop offset="70%" stop-color="#a78bfa" stop-opacity="0.4" />
                  <stop offset="100%" stop-color="#a78bfa" stop-opacity="0" />
                </linearGradient>
                <linearGradient id="linkGlowAmber" x1="0%" x2="100%" y1="0%" y2="100%">
                  <stop offset="0%" stop-color="#f59e0b" stop-opacity="0" />
                  <stop offset="30%" stop-color="#f59e0b" stop-opacity="0.4" />
                  <stop offset="70%" stop-color="#f59e0b" stop-opacity="0.4" />
                  <stop offset="100%" stop-color="#f59e0b" stop-opacity="0" />
                </linearGradient>
                <linearGradient id="linkGlowGreen" x1="0%" x2="100%" y1="0%" y2="100%">
                  <stop offset="0%" stop-color="#4ade80" stop-opacity="0" />
                  <stop offset="30%" stop-color="#4ade80" stop-opacity="0.4" />
                  <stop offset="70%" stop-color="#4ade80" stop-opacity="0.4" />
                  <stop offset="100%" stop-color="#4ade80" stop-opacity="0" />
                </linearGradient>
                <linearGradient id="linkGlowRose" x1="0%" x2="100%" y1="0%" y2="100%">
                  <stop offset="0%" stop-color="#fb7185" stop-opacity="0" />
                  <stop offset="30%" stop-color="#fb7185" stop-opacity="0.4" />
                  <stop offset="70%" stop-color="#fb7185" stop-opacity="0.4" />
                  <stop offset="100%" stop-color="#fb7185" stop-opacity="0" />
                </linearGradient>
                <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="strongGlow" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="10" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <g class="map-backdrop">
                <ellipse cx="500" cy="330" rx="350" ry="140" fill="rgba(34,211,238,0.015)" stroke="rgba(34,211,238,0.05)" stroke-width="1" />
                <ellipse cx="500" cy="330" rx="280" ry="100" fill="rgba(34,211,238,0.02)" stroke="rgba(34,211,238,0.065)" stroke-width="1" />
                <ellipse cx="500" cy="330" rx="200" ry="65" fill="rgba(34,211,238,0.025)" stroke="rgba(34,211,238,0.085)" stroke-width="1" />
                <ellipse cx="500" cy="330" rx="130" ry="40" fill="rgba(34,211,238,0.035)" stroke="rgba(34,211,238,0.11)" stroke-width="1" />
              </g>

              <g class="map-links" filter="url(#softGlow)">
                <path d="M500 330 C420 260 330 180 360 136" fill="none" stroke="url(#linkGlowBlue)" stroke-width="2.5" />
                <path d="M500 330 C590 270 670 245 680 217" fill="none" stroke="url(#linkGlowCyan)" stroke-width="2.5" />
                <path d="M500 330 C600 370 700 410 720 409" fill="none" stroke="url(#linkGlowGreen)" stroke-width="2.5" />
                <path d="M500 330 C500 410 500 470 500 471" fill="none" stroke="url(#linkGlowBlue)" stroke-width="2" />
                <path d="M500 330 C390 420 290 450 220 434" fill="none" stroke="url(#linkGlowPurple)" stroke-width="2" />
                <path d="M500 330 C350 360 210 330 130 298" fill="none" stroke="url(#linkGlowAmber)" stroke-width="2" />
                <path d="M500 330 C370 250 240 195 160 161" fill="none" stroke="url(#linkGlowPurple)" stroke-width="2" />
              </g>

              <g class="energy-particles">
                <circle v-for="i in 21" :key="`p-${i}`" :r="1.5 + (i % 3) * 0.5" fill="#ffffff" :opacity="0.3 + (i % 4) * 0.12">
                  <animateMotion dur="3s" :begin="`${i * 0.15}s`" repeatCount="indefinite">
                    <mpath href="#pathEnergy" />
                  </animateMotion>
                </circle>
              </g>
              <path id="pathEnergy" d="M500 330 C590 270 670 245 680 217" fill="none" stroke="none" />
            </svg>

            <div class="scene-3d-container" aria-hidden="true">
              <button type="button" class="central-hub" @click="openDiagnosticReport">
                <span class="hub-outer-glow" />
                <span class="hub-ring hub-ring-1" />
                <span class="hub-ring hub-ring-2" />
                <span class="hub-ring hub-ring-3" />
                <span class="hub-ring hub-ring-4" />
                <span class="hub-core-glow" />
                <span class="hub-surface">
                  <strong>学习中枢</strong>
                </span>
              </button>

              <div
                v-for="(node, nIdx) in mapNodes"
                :key="node.domain.id"
                class="orb-wrapper"
                :class="{ active: node.domain.id === selectedId || node.domain.id === hoverId }"
                :style="{
                  left: `${node.x}%`,
                  top: `${node.y}%`,
                  zIndex: Math.round(200 + node.z + node.size / 2),
                  '--node-z': `${node.z}px`,
                  '--node-color': node.domain.color,
                  '--orb-size': `${node.size}px`,
                  '--orbit-tilt': `${node.orbitTilt}deg`,
                  '--orbit-scale': `${node.orbitScale}`,
                  '--depth-scale': `${1 + node.z / 180}`,
                  '--depth-opacity': `${Math.max(0.35, Math.min(1, 0.35 + (node.z + 80) / 190))}`,
                  '--depth-blur': `${Math.max(0, (-node.z - 10) / 30)}px`,
                  '--depth-shadow': `${Math.max(0, (node.z + 20) / 30)}px`,
                }"
              >
                <button
                  type="button"
                  class="knowledge-orb"
                  @mouseenter="hoverId = node.domain.id"
                  @mouseleave="hoverId = null"
                  @click="openDomainResource(node.domain)"
                >
                  <span class="orb-far-glow" />
                  <span class="orb-near-glow" />
                  <span class="orb-shell" />
                  <span class="orb-inner-glow" />
                  <span class="orb-core">
                    <strong>{{ node.domain.name }}</strong>
                    <em>{{ formatPct(node.domain.mastery) }}</em>
                  </span>
                </button>

                <div class="orb-satellites" aria-hidden="true">
                  <span
                    v-for="(sat, sIdx) in node.satellites"
                    :key="`${node.domain.id}-sat-${sIdx}`"
                    class="satellite-dot"
                    :style="{
                      '--sat-angle': `${sat.angle}deg`,
                      '--sat-dist': `${sat.distance * (node.size / 2)}px`,
                      '--satellite-color': node.domain.color,
                    }"
                  >
                    <i />
                    <b>{{ sat.label }}</b>
                  </span>
                </div>
              </div>
            </div>

            <div class="node-labels">
              <div
                v-for="label in labelPositions"
                :key="`label-${label.id}`"
                class="node-label"
                :class="{ active: label.id === selectedId || label.id === hoverId }"
                :style="{
                  left: `${label.x}px`,
                  top: `${label.y}px`,
                  opacity: label.opacity,
                  transform: `translate(-50%, -50%) scale(${label.scale})`,
                  '--label-color': label.color,
                }"
              >
                <strong>{{ label.label }}</strong>
                <em>{{ formatPct(label.mastery) }}</em>
              </div>
            </div>

            <div class="map-legend">
              <span v-for="item in mapLegend" :key="item.label">
                <i :style="{ background: item.color }" />
                {{ item.label }}
              </span>
            </div>

            <Transition name="fade">
              <div
                :key="activeDomain.id"
                class="node-detail glass-card"
                :style="{ '--detail-color': activeDomain.color }"
              >
                <div class="detail-kicker">DOMAIN INFO</div>
                <div class="detail-title">{{ activeDomain.name }}</div>
                <div class="detail-meta">{{ activeDomain.concepts }} 知识点 · {{ formatPct(activeDomain.mastery) }}</div>
                <div class="detail-weak">
                  <span>薄弱项</span>
                  {{ activeDomain.weak.join('、') }}
                </div>
                <div class="detail-next">
                  <span>建议</span>
                  {{ activeDomain.next }}
                </div>
              </div>
            </Transition>
          </div>

          <div class="map-action-panel">
            <div class="map-action-head">
              <span>LEARNING ROUTE</span>
              <strong>今日补强动线</strong>
              <em>点击任一节点继续学习</em>
            </div>
            <button
              v-if="weakPoints[0]"
              type="button"
              class="map-primary-action"
              :style="{ '--action-color': weakPoints[0].color }"
              @click="openWeakPoint(weakPoints[0])"
            >
              <span class="action-orb" />
              <span>
                <em>优先处理</em>
                <strong>{{ weakPoints[0].name }}</strong>
                <b>{{ weakPoints[0].cause }}</b>
              </span>
              <i>掌握 {{ weakPoints[0].mastery }}%</i>
            </button>
            <div class="map-action-grid">
              <button type="button" class="map-action-link" @click="openDomainResource(activeDomain)">
                <span>当前领域</span>
                <strong>{{ activeDomain.next }}</strong>
              </button>
              <button type="button" class="map-action-link" @click="openDiagnosticReport">
                <span>诊断报告</span>
                <strong>{{ diagnosticWindow.evidence }} 条证据待回看</strong>
              </button>
            </div>
            <div class="map-route-lane" aria-label="今日学习动线">
              <button type="button" @click="openDiagnosticReport">
                <i>01</i>
                <span>确认薄弱证据</span>
              </button>
              <button type="button" @click="openDomainResource(activeDomain)">
                <i>02</i>
                <span>进入专项资源</span>
              </button>
              <button type="button" @click="openRadarReport">
                <i>03</i>
                <span>刷新能力雷达</span>
              </button>
            </div>
            <div class="map-mini-queue">
              <button
                v-for="item in weakPoints.slice(1, 4)"
                :key="item.name"
                type="button"
                :style="{ '--queue-color': item.color }"
                @click="openWeakPoint(item)"
              >
                <i />
                <span>{{ item.name }}</span>
                <b>{{ item.mastery }}%</b>
              </button>
            </div>
          </div>
        </div>

        <div class="data-col">
          <div class="glass-card distribution-card">
            <div class="card-head">
              <div>
                <div class="card-title">掌握度分布</div>
                <p>{{ diagnosticWindow.range }} · {{ diagnosticWindow.sample }}</p>
              </div>
              <button type="button" class="mini-link" @click="openDiagnosticReport">看报告</button>
            </div>
            <div class="diagnostic-strip">
              <span>证据 {{ diagnosticWindow.evidence }} 条</span>
              <span>置信度 {{ diagnosticWindow.confidence }}</span>
              <span>{{ diagnosticWindow.updatedAt }} 更新</span>
            </div>
            <div class="dist-bar">
              <div
                v-for="seg in distribution"
                :key="seg.label"
                class="dist-segment"
                :style="{ width: `${seg.pct}%`, background: seg.color }"
              >
                <span v-if="seg.pct > 10">{{ seg.pct }}%</span>
              </div>
            </div>
            <div class="dist-legend">
              <button
                v-for="seg in distribution"
                :key="seg.label"
                type="button"
                class="dist-row"
                @click="openDiagnosticReport"
              >
                <i :style="{ background: seg.color }" />
                <span>
                  <strong>{{ seg.label }}</strong>
                  <em>{{ seg.count }} 个知识点 · {{ seg.rule }}</em>
                </span>
                <b :class="{ positive: seg.delta > 0, negative: seg.delta < 0 }">
                  {{ formatSignedPct(seg.delta) }}
                </b>
              </button>
            </div>
          </div>

          <div class="glass-card radar-card">
            <div class="card-head">
              <div>
                <div class="card-title">能力雷达</div>
                <p>{{ diagnosticWindow.source }}</p>
              </div>
              <button type="button" class="mini-link" @click="openRadarReport">看报告</button>
            </div>
            <div class="radar-stat-grid">
              <button
                v-for="stat in radarStats"
                :key="stat.label"
                type="button"
                class="radar-stat"
                :style="{ '--stat-color': stat.color }"
                @click="openRadarReport"
              >
                <span>{{ stat.label }}</span>
                <strong>{{ stat.value }}</strong>
              </button>
            </div>
            <div ref="radarChartRef" class="radar-body" />
            <div class="radar-insights">
              <p v-for="item in radarInsights" :key="item">{{ item }}</p>
            </div>
          </div>

          <div class="glass-card weak-card">
            <div class="card-head">
              <div>
                <div class="card-title">待提升知识点 TOP5</div>
                <p>按重复失分、耗时异常、目标差距加权排序</p>
              </div>
            </div>
            <div class="weak-list">
              <button
                v-for="(item, idx) in weakPoints"
                :key="item.name"
                type="button"
                class="weak-item"
                :style="{ '--item-color': item.color }"
                @click="openWeakPoint(item)"
              >
                <div class="weak-info">
                  <span class="weak-rank">0{{ idx + 1 }}</span>
                  <span class="weak-title">
                    <strong>{{ item.name }}</strong>
                    <em>{{ item.domain }} · 证据 {{ item.evidence }} 条</em>
                  </span>
                  <span class="weak-score">
                    掌握 {{ item.mastery }}%
                    <b :class="{ positive: item.delta > 0, negative: item.delta < 0 }">{{ formatSignedPct(item.delta) }}</b>
                  </span>
                </div>
                <div class="weak-track">
                  <div
                    class="weak-fill"
                    :style="{ width: `${item.value}%`, background: item.color, '--fill-color': item.color }"
                  />
                </div>
                <div class="weak-evidence">
                  <span>{{ item.cause }}</span>
                  <b>{{ item.last }}</b>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.section-skyline {
  position: relative;
  padding: 24px;
  color: #e8edf5;
  font-family: 'Outfit', 'PingFang SC', sans-serif;
}

.skyline-inner {
  max-width: 1440px;
  margin: 0 auto;
}

.sky-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 20px;
  align-items: end;
  margin-bottom: 18px;
}

.sky-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #22d3ee;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
}

.sky-eyebrow span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22d3ee;
  animation: soft-pulse 1.6s ease-in-out infinite;
}

.sky-header h2 {
  margin: 8px 0 0;
  color: #f7fbff;
  font-size: 26px;
  font-weight: 760;
  line-height: 1.1;
}

.sky-sub {
  margin: 6px 0 0;
  color: #91a3c7;
  font-size: 13px;
  line-height: 1.6;
}

.sky-score {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 120px;
  padding: 12px 16px;
}

.sky-score span {
  font-size: 10px;
  color: #7f93ba;
  letter-spacing: 0.08em;
}

.sky-score strong {
  font-size: 28px;
  font-weight: 760;
  color: #22d3ee;
  line-height: 1;
}

.glass-card {
  position: relative;
  border-radius: 16px;
  padding: 16px;
  background:
    radial-gradient(ellipse at 20% 0%, rgba(34, 211, 238, 0.04), transparent 46%),
    linear-gradient(180deg, rgba(12, 18, 38, 0.72), rgba(6, 10, 24, 0.55));
  border: 1px solid rgba(150, 175, 220, 0.10);
  backdrop-filter: blur(26px) saturate(1.24);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 18px 46px rgba(0, 0, 0, 0.22);
  isolation: isolate;
  overflow: hidden;
}

.glass-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.35), transparent);
  opacity: 0.6;
}

.card-title {
  font-size: 13px;
  font-weight: 650;
  color: #c8d6f0;
  letter-spacing: 0.04em;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.card-head p {
  margin: 5px 0 0;
  color: #7184aa;
  font-size: 10px;
  line-height: 1.35;
}

.mini-link {
  flex: 0 0 auto;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(34, 211, 238, 0.22);
  border-radius: 8px;
  background: rgba(34, 211, 238, 0.08);
  color: #67e8f9;
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.mini-link:hover {
  border-color: rgba(34, 211, 238, 0.5);
  background: rgba(34, 211, 238, 0.14);
  color: #ecfeff;
}

.mini-link:focus-visible,
.view-chip:focus-visible,
.dist-row:focus-visible,
.radar-stat:focus-visible,
.weak-item:focus-visible,
.map-primary-action:focus-visible,
.map-action-link:focus-visible,
.map-mini-queue button:focus-visible,
.map-route-lane button:focus-visible {
  outline: 2px solid rgba(34, 211, 238, 0.72);
  outline-offset: 2px;
}

.knowledge-board {
  display: grid;
  grid-template-columns: minmax(0, 1.22fr) minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
}

.graph-panel {
  display: flex;
  flex-direction: column;
  min-height: 342px;
  height: auto;
}

.graph-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.graph-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.graph-meta {
  font-size: 11px;
  color: #7f93ba;
}

.view-chip {
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(150, 175, 220, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
  color: #a8badc;
  font-size: 11px;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.view-chip:hover {
  border-color: rgba(34, 211, 238, 0.32);
  background: rgba(34, 211, 238, 0.08);
  color: #e8f8ff;
}

.graph-shell {
  position: relative;
  flex: 0 0 clamp(360px, 33vw, 470px);
  min-height: 0;
  cursor: default;
  overflow: hidden;
  border-radius: 12px;
  perspective: 900px;
  perspective-origin: 50% 50%;
  background:
    radial-gradient(ellipse at 50% 46%, rgba(34, 211, 238, 0.075) 0%, transparent 54%),
    radial-gradient(ellipse at 32% 22%, rgba(167, 139, 250, 0.05) 0%, transparent 43%),
    radial-gradient(ellipse at 75% 64%, rgba(79, 212, 131, 0.035) 0%, transparent 38%),
    linear-gradient(180deg, #061426 0%, #020817 100%);
  box-shadow: inset 0 0 0 1px rgba(120, 154, 205, 0.06);
}

.map-action-panel {
  position: relative;
  flex: 1 1 auto;
  min-height: 258px;
  margin-top: 12px;
  padding: 14px;
  border-radius: 12px;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 18% 18%, rgba(34, 211, 238, 0.11), transparent 42%),
    radial-gradient(ellipse at 78% 72%, rgba(167, 139, 250, 0.10), transparent 44%),
    linear-gradient(180deg, rgba(8, 16, 32, 0.62), rgba(3, 8, 19, 0.36));
  border: 1px solid rgba(120, 154, 205, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.map-action-panel::before {
  content: '';
  position: absolute;
  inset: auto -12% 14px -8%;
  height: 120px;
  border-radius: 50%;
  border: 1px dashed rgba(96, 165, 250, 0.18);
  transform: rotate(-8deg);
  pointer-events: none;
}

.map-action-head {
  position: relative;
  display: grid;
  gap: 3px;
}

.map-action-head span {
  color: #22d3ee;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.18em;
}

.map-action-head strong {
  color: #f7fbff;
  font-size: 17px;
  font-weight: 760;
}

.map-action-head em {
  color: #7f93ba;
  font-size: 11px;
  font-style: normal;
}

.map-primary-action,
.map-action-link,
.map-mini-queue button,
.map-route-lane button {
  position: relative;
  border: 1px solid rgba(150, 175, 220, 0.10);
  background: rgba(255, 255, 255, 0.035);
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.map-primary-action:hover,
.map-action-link:hover,
.map-mini-queue button:hover,
.map-route-lane button:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--action-color, var(--queue-color, #22d3ee)) 34%, rgba(150, 175, 220, 0.14));
  background: color-mix(in srgb, var(--action-color, var(--queue-color, #22d3ee)) 9%, rgba(255, 255, 255, 0.045));
  box-shadow: 0 12px 26px color-mix(in srgb, var(--action-color, var(--queue-color, #22d3ee)) 10%, transparent);
}

.map-primary-action {
  --action-color: #22d3ee;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 92px;
  padding: 14px;
  border-radius: 12px;
}

.action-orb {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 38% 30%, rgba(255, 255, 255, 0.9), transparent 18%),
    radial-gradient(circle, var(--action-color), color-mix(in srgb, var(--action-color) 34%, #020617));
  box-shadow: 0 0 22px color-mix(in srgb, var(--action-color) 48%, transparent);
}

.map-primary-action span:not(.action-orb) {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.map-primary-action em,
.map-action-link span {
  color: #8ea2c7;
  font-size: 10px;
  font-style: normal;
}

.map-primary-action strong {
  color: #fff;
  font-size: 16px;
  font-weight: 760;
}

.map-primary-action b {
  color: #9fb2d3;
  font-size: 11px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-primary-action i {
  color: color-mix(in srgb, var(--action-color) 76%, #fff);
  font-style: normal;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  white-space: nowrap;
}

.map-action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.map-action-link {
  min-height: 70px;
  padding: 12px;
  border-radius: 10px;
}

.map-action-link strong {
  display: block;
  margin-top: 5px;
  color: #dce8ff;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.35;
}

.map-route-lane {
  position: relative;
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: 10px 0 2px;
  align-items: stretch;
}

.map-route-lane::before {
  content: '';
  position: absolute;
  left: 12%;
  right: 12%;
  top: 24px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.28), rgba(167, 139, 250, 0.22), transparent);
}

.map-route-lane button {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 7px;
  min-height: 76px;
  padding: 10px 8px;
  border-radius: 10px;
  text-align: center;
  --action-color: #22d3ee;
}

.map-route-lane i {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(34, 211, 238, 0.11);
  border: 1px solid rgba(34, 211, 238, 0.28);
  color: #67e8f9;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-style: normal;
  box-shadow: 0 0 16px rgba(34, 211, 238, 0.12);
}

.map-route-lane span {
  color: #aebfe0;
  font-size: 11px;
  line-height: 1.3;
}

.map-mini-queue {
  position: relative;
  display: grid;
  gap: 8px;
}

.map-mini-queue button {
  --queue-color: #22d3ee;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 8px 10px;
  border-radius: 9px;
}

.map-mini-queue i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--queue-color);
  box-shadow: 0 0 10px color-mix(in srgb, var(--queue-color) 70%, transparent);
}

.map-mini-queue span {
  color: #c8d6f0;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-mini-queue b {
  color: color-mix(in srgb, var(--queue-color) 70%, #fff);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
}

.knowledge-canvas {
  position: absolute;
  inset: 0;
  z-index: 4;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: auto;
  opacity: 1;
  filter: saturate(1.08) contrast(1.06);
}

.scene-3d-container {
  position: absolute;
  inset: 0;
  z-index: 3;
  transform-origin: 50% 54%;
  transform-style: preserve-3d;
  pointer-events: none;
  transition: transform 0.22s ease;
  display: none;
}

.node-labels {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  transform-origin: 50% 54%;
  transition: transform 0.22s ease;
}

.node-label {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 3px 10px;
  border-radius: 12px;
  background: rgba(2, 6, 23, 0.55);
  border: 1px solid color-mix(in srgb, var(--label-color, #22d3ee) 30%, transparent);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25), 0 0 12px color-mix(in srgb, var(--label-color, #22d3ee) 20%, transparent);
  backdrop-filter: blur(4px);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
  transition: opacity 0.25s ease, transform 0.25s ease;
  pointer-events: none;
}

.node-label strong {
  display: block;
  font-size: 13px;
  letter-spacing: 0.02em;
}

.node-label em {
  display: block;
  font-size: 11px;
  font-style: normal;
  color: color-mix(in srgb, var(--label-color, #22d3ee) 80%, #fff);
  margin-top: 1px;
}

.map-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
  pointer-events: none;
  transform-origin: 50% 54%;
  transition: transform 0.22s ease;
}

.map-svg .map-backdrop {
  display: none;
}

.map-svg .map-backdrop ellipse {
  animation: backdrop-spin 60s linear infinite;
  transform-origin: 500px 330px;
  fill: none;
  stroke-opacity: 0.58;
}

.map-svg .map-backdrop ellipse:nth-child(2) {
  animation-duration: 45s;
  animation-direction: reverse;
}

.map-svg .map-backdrop ellipse:nth-child(3) {
  animation-duration: 30s;
}

.map-svg .map-backdrop ellipse:nth-child(4) {
  animation-duration: 20s;
  animation-direction: reverse;
}

.map-svg .map-links path {
  stroke-dasharray: 8 6;
  animation: link-flow 4s linear infinite;
}

.map-svg .map-links path:nth-child(2) { animation-duration: 3.2s; }
.map-svg .map-links path:nth-child(3) { animation-duration: 4.5s; }
.map-svg .map-links path:nth-child(4) { animation-duration: 3.8s; }
.map-svg .map-links path:nth-child(5) { animation-duration: 5s; }
.map-svg .map-links path:nth-child(6) { animation-duration: 4.2s; }
.map-svg .map-links path:nth-child(7) { animation-duration: 3.5s; }

@keyframes backdrop-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes link-flow {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: -28; }
}

.central-hub {
  position: absolute;
  left: 50%;
  top: 53%;
  z-index: 500;
  width: 128px;
  height: 128px;
  transform: translate(-50%, -50%) translateZ(160px);
  transform-style: preserve-3d;
  border: none;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
  padding: 0;
}

.hub-outer-glow {
  position: absolute;
  inset: -60px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(34, 211, 238, 0.18) 0%, rgba(34, 211, 238, 0.06) 40%, transparent 70%);
  animation: hub-pulse-outer 3s ease-in-out infinite;
}

.hub-core-glow {
  position: absolute;
  inset: -20px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(34, 211, 238, 0.35) 0%, rgba(59, 130, 246, 0.15) 45%, transparent 75%);
  filter: blur(8px);
}

@keyframes hub-pulse-outer {
  0%, 100% { opacity: 0.7; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.08); }
}

.hub-ring {
  position: absolute;
  left: 50%;
  top: 50%;
  border-radius: 50%;
  border: 1px solid rgba(34, 211, 238, 0.25);
  transform: translate(-50%, -50%);
  transform-style: preserve-3d;
}

.hub-ring-1 {
  width: 175px;
  height: 175px;
  transform: translate(-50%, -50%) rotateX(72deg);
  border-color: rgba(34, 211, 238, 0.12);
  animation: ring-rotate-1 12s linear infinite;
}

.hub-ring-2 {
  width: 210px;
  height: 210px;
  transform: translate(-50%, -50%) rotateX(65deg) rotateZ(30deg);
  border-color: rgba(99, 102, 241, 0.1);
  animation: ring-rotate-2 16s linear infinite reverse;
}

.hub-ring-3 {
  width: 255px;
  height: 255px;
  transform: translate(-50%, -50%) rotateX(70deg) rotateZ(-20deg);
  border-color: rgba(167, 139, 250, 0.08);
  animation: ring-rotate-3 20s linear infinite;
}

.hub-ring-4 {
  width: 300px;
  height: 300px;
  transform: translate(-50%, -50%) rotateX(60deg) rotateZ(50deg);
  border-color: rgba(34, 211, 238, 0.06);
  animation: ring-rotate-1 25s linear infinite reverse;
}

@keyframes ring-rotate-1 {
  from { transform: translate(-50%, -50%) rotateX(72deg) rotateZ(0deg); }
  to { transform: translate(-50%, -50%) rotateX(72deg) rotateZ(360deg); }
}

@keyframes ring-rotate-2 {
  from { transform: translate(-50%, -50%) rotateX(65deg) rotateZ(30deg); }
  to { transform: translate(-50%, -50%) rotateX(65deg) rotateZ(390deg); }
}

@keyframes ring-rotate-3 {
  from { transform: translate(-50%, -50%) rotateX(70deg) rotateZ(-20deg); }
  to { transform: translate(-50%, -50%) rotateX(70deg) rotateZ(340deg); }
}

.hub-surface {
  position: absolute;
  inset: 10px;
  border-radius: 50%;
  background:
    radial-gradient(ellipse at 35% 28%, rgba(255, 255, 255, 0.35) 0%, rgba(165, 243, 252, 0.15) 25%, transparent 50%),
    radial-gradient(circle at 50% 50%, #22d3ee 0%, #0891b2 45%, #164e63 85%);
  box-shadow:
    inset 0 -8px 25px rgba(8, 145, 178, 0.5),
    inset 0 8px 20px rgba(165, 243, 252, 0.4),
    0 0 40px rgba(34, 211, 238, 0.4),
    0 0 80px rgba(34, 211, 238, 0.2);
  display: grid;
  place-items: center;
  border: 2px solid rgba(165, 243, 252, 0.3);
}

.hub-surface::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background:
    radial-gradient(ellipse at 65% 70%, rgba(255, 255, 255, 0.1) 0%, transparent 40%),
    radial-gradient(circle at 30% 75%, rgba(8, 145, 178, 0.3) 0%, transparent 35%);
}

.hub-surface strong {
  position: relative;
  z-index: 1;
  color: #ffffff;
  font-size: 15px;
  font-weight: 760;
  letter-spacing: 0.08em;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.orb-wrapper {
  position: absolute;
  transform: translate(-50%, -50%) translateZ(var(--node-z)) scale(var(--depth-scale));
  transform-style: preserve-3d;
  pointer-events: none;
  transition: filter 0.3s ease, opacity 0.3s ease;
  filter: blur(var(--depth-blur));
  opacity: var(--depth-opacity);
}

.orb-wrapper.active {
  z-index: 400 !important;
  filter: brightness(1.25) drop-shadow(0 0 16px var(--node-color)) blur(0);
  opacity: 1;
}

.orb-wrapper.active .knowledge-orb .orb-shell {
  box-shadow:
    inset 0 0 25px color-mix(in srgb, var(--node-color) 25%, transparent),
    0 0 30px color-mix(in srgb, var(--node-color) 40%, transparent);
}

.orb-wrapper.active .knowledge-orb .orb-core {
  transform: scale(1.12) translateZ(8px);
}

.knowledge-orb {
  position: relative;
  width: var(--orb-size);
  height: var(--orb-size);
  transform-style: preserve-3d;
  border: none;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
  padding: 0;
  filter: drop-shadow(0 calc(var(--depth-shadow) * 4px) calc(var(--depth-shadow) * 8px) rgba(0, 0, 0, calc(var(--depth-shadow) * 0.12)));
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.3s ease;
  animation: orb-float 5s ease-in-out infinite;
}

.knowledge-orb:hover {
  transform: translateZ(40px) scale(1.12);
  animation-play-state: paused;
  filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.3)) drop-shadow(0 0 16px color-mix(in srgb, var(--node-color) 40%, transparent));
}

.orb-wrapper:has(.knowledge-orb:hover) {
  filter: brightness(1.15) drop-shadow(0 0 10px var(--node-color)) blur(0);
  opacity: 1;
  z-index: 380 !important;
}

.orb-far-glow {
  position: absolute;
  inset: -40%;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--node-color) 20%, transparent) 0%, transparent 65%);
  animation: orb-far-pulse 4s ease-in-out infinite;
  pointer-events: none;
}

.orb-near-glow {
  position: absolute;
  inset: -18%;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--node-color) 35%, transparent) 0%, transparent 60%);
  filter: blur(6px);
  pointer-events: none;
}

@keyframes orb-far-pulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.08); }
}

.orb-shell {
  position: absolute;
  inset: 6%;
  border-radius: 50%;
  background:
    linear-gradient(145deg,
      color-mix(in srgb, var(--node-color) 12%, rgba(255,255,255,0.08)) 0%,
      color-mix(in srgb, var(--node-color) 6%, rgba(255,255,255,0.02)) 40%,
      color-mix(in srgb, var(--node-color) 18%, rgba(0,0,0,0.1)) 100%);
  border: 0;
  box-shadow:
    inset 0 2px 6px rgba(255, 255, 255, 0.15),
    inset 0 -4px 12px rgba(0, 0, 0, 0.15),
    inset 0 0 20px color-mix(in srgb, var(--node-color) 12%, transparent),
    0 4px 20px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(4px);
  pointer-events: none;
  transition: box-shadow 0.3s ease;
}

.orb-shell::before {
  content: '';
  position: absolute;
  inset: 8%;
  border-radius: 50%;
  background: radial-gradient(ellipse at 32% 25%, rgba(255, 255, 255, 0.25) 0%, transparent 50%);
}

.orb-inner-glow {
  position: absolute;
  inset: 20%;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--node-color) 55%, transparent) 0%, transparent 70%);
  filter: blur(4px);
  pointer-events: none;
}

.orb-core {
  position: absolute;
  inset: 22%;
  border-radius: 50%;
  background:
    radial-gradient(ellipse at 38% 30%, rgba(255, 255, 255, 0.4) 0%, rgba(255,255,255,0.1) 30%, transparent 55%),
    radial-gradient(circle at 50% 55%, var(--node-color) 0%, color-mix(in srgb, var(--node-color) 65%, #000) 85%);
  box-shadow:
    inset 0 2px 8px rgba(255, 255, 255, 0.25),
    inset 0 -3px 10px color-mix(in srgb, var(--node-color) 50%, #000),
    0 0 18px color-mix(in srgb, var(--node-color) 45%, transparent);
  display: grid;
  place-items: center;
  transform: translateZ(6px);
  transform-style: preserve-3d;
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  pointer-events: none;
}

.orb-core strong {
  position: relative;
  z-index: 1;
  display: block;
  color: #ffffff;
  font-size: 12px;
  font-weight: 720;
  line-height: 1.2;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  text-align: center;
}

.orb-core em {
  position: relative;
  z-index: 1;
  display: block;
  margin-top: 1px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 11px;
  font-weight: 650;
  font-style: normal;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}

.orb-satellites {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  pointer-events: none;
}

.satellite-dot {
  position: absolute;
  left: 50%;
  top: 50%;
  display: flex;
  align-items: center;
  gap: 5px;
  transform: translate(-50%, -50%) rotate(var(--sat-angle)) translateX(var(--sat-dist)) rotate(calc(-1 * var(--sat-angle)));
  white-space: nowrap;
  pointer-events: auto;
}

.satellite-dot i {
  display: block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--satellite-color, #22d3ee);
  box-shadow:
    0 0 6px var(--satellite-color, #22d3ee),
    0 0 12px color-mix(in srgb, var(--satellite-color, #22d3ee) 50%, transparent);
  border: 1px solid rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
}

.satellite-dot b {
  font-size: 10px;
  font-weight: 500;
  color: #c8d6f0;
  font-style: normal;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7);
  background: rgba(2, 6, 23, 0.5);
  padding: 2px 6px;
  border-radius: 4px;
  backdrop-filter: blur(4px);
}

.orb-satellites .satellite-dot:nth-child(odd) i {
  animation: sat-pulse 2.5s ease-in-out infinite;
}

.orb-satellites .satellite-dot:nth-child(even) i {
  animation: sat-pulse 3s ease-in-out infinite 0.5s;
}

@keyframes sat-pulse {
  0%, 100% { opacity: 0.7; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.3); }
}

@keyframes orb-float {
  0%, 100% { transform: translateZ(0) translateY(0); }
  50% { transform: translateZ(8px) translateY(-3px); }
}

.orb-wrapper:nth-child(2) .knowledge-orb { animation-delay: 0.5s; animation-duration: 4.5s; }
.orb-wrapper:nth-child(3) .knowledge-orb { animation-delay: 1s; animation-duration: 5.5s; }
.orb-wrapper:nth-child(4) .knowledge-orb { animation-delay: 1.5s; animation-duration: 4.8s; }
.orb-wrapper:nth-child(5) .knowledge-orb { animation-delay: 2s; animation-duration: 6s; }
.orb-wrapper:nth-child(6) .knowledge-orb { animation-delay: 0.8s; animation-duration: 5.2s; }
.orb-wrapper:nth-child(7) .knowledge-orb { animation-delay: 1.8s; animation-duration: 4.2s; }
.orb-wrapper:nth-child(8) .knowledge-orb { animation-delay: 2.5s; animation-duration: 5.8s; }

.scene-state {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 4;
  transform: translate(-50%, -50%);
  color: #9badcc;
  font-size: 13px;
}

.scene-state.error {
  color: #ff8fa3;
}

.map-legend {
  position: absolute;
  bottom: 16px;
  left: 50%;
  z-index: 50;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 14px;
  border-radius: 20px;
  background: rgba(6, 12, 28, 0.6);
  border: 1px solid rgba(150, 175, 220, 0.1);
  backdrop-filter: blur(12px);
}

.map-legend span {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: #91a3c7;
}

.map-legend i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.node-detail {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 4;
  width: 190px;
  padding: 12px;
  pointer-events: none;
  --detail-color: #22d3ee;
}

.detail-kicker {
  font-size: 9px;
  color: #7f93ba;
  letter-spacing: 0.12em;
  margin-bottom: 6px;
}

.detail-title {
  font-size: 16px;
  font-weight: 720;
  color: #f7fbff;
  margin-bottom: 2px;
}

.detail-meta {
  font-size: 11px;
  color: var(--detail-color);
  margin-bottom: 10px;
}

.detail-weak,
.detail-next {
  font-size: 11px;
  line-height: 1.55;
  color: #9badcc;
  margin-top: 8px;
}

.detail-weak span,
.detail-next span {
  display: block;
  font-size: 9px;
  color: #7f93ba;
  letter-spacing: 0.08em;
  margin-bottom: 2px;
}

.detail-next {
  padding: 8px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--detail-color) 8%, rgba(255, 255, 255, 0.03));
  border: 1px solid color-mix(in srgb, var(--detail-color) 20%, rgba(255, 255, 255, 0.06));
}

.data-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.distribution-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.diagnostic-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.diagnostic-strip span {
  min-height: 28px;
  padding: 7px 8px;
  border: 1px solid rgba(150, 175, 220, 0.09);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
  color: #93a8cc;
  font-size: 10px;
  line-height: 1.2;
}

.dist-bar {
  display: flex;
  height: 24px;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
}

.dist-segment {
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 700;
  color: #070b1a;
  transition: width 0.4s ease;
}

.dist-legend {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dist-legend i {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dist-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 8px 9px;
  border: 1px solid rgba(150, 175, 220, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.025);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease;
}

.dist-row:hover {
  border-color: rgba(34, 211, 238, 0.24);
  background: rgba(34, 211, 238, 0.06);
}

.dist-row strong {
  display: block;
  color: #dbe7fb;
  font-size: 11px;
  font-weight: 700;
}

.dist-row em {
  display: block;
  margin-top: 2px;
  color: #7184aa;
  font-size: 10px;
  font-style: normal;
  line-height: 1.25;
}

.dist-row b,
.weak-score b {
  color: #9badcc;
  font-size: 10px;
  font-weight: 750;
}

.dist-row b.positive,
.weak-score b.positive {
  color: #4FD483;
}

.dist-row b.negative,
.weak-score b.negative {
  color: #F06A7E;
}

.radar-card {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 300px;
}

.radar-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.radar-stat {
  min-height: 52px;
  padding: 9px;
  border: 1px solid color-mix(in srgb, var(--stat-color) 22%, rgba(255, 255, 255, 0.06));
  border-radius: 8px;
  background: color-mix(in srgb, var(--stat-color) 8%, rgba(255, 255, 255, 0.025));
  text-align: left;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease;
}

.radar-stat:hover {
  border-color: color-mix(in srgb, var(--stat-color) 42%, rgba(255, 255, 255, 0.08));
  background: color-mix(in srgb, var(--stat-color) 12%, rgba(255, 255, 255, 0.035));
}

.radar-stat span {
  display: block;
  color: #7184aa;
  font-size: 9px;
  letter-spacing: 0.06em;
}

.radar-stat strong {
  display: block;
  margin-top: 5px;
  color: #f3f8ff;
  font-size: 13px;
  line-height: 1.1;
}

.radar-body {
  flex: 1 1 190px;
  width: 100%;
  min-height: 180px;
  margin-top: 8px;
}

.radar-insights {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 4px;
}

.radar-insights p {
  margin: 0;
  padding-left: 9px;
  border-left: 2px solid rgba(34, 211, 238, 0.38);
  color: #91a3c7;
  font-size: 10px;
  line-height: 1.45;
}

.weak-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.weak-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.weak-item {
  display: flex;
  flex-direction: column;
  gap: 7px;
  width: 100%;
  min-height: 76px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--item-color) 16%, rgba(255, 255, 255, 0.06));
  border-radius: 8px;
  background: color-mix(in srgb, var(--item-color) 5%, rgba(255, 255, 255, 0.02));
  text-align: left;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease;
}

.weak-item:hover {
  border-color: color-mix(in srgb, var(--item-color) 38%, rgba(255, 255, 255, 0.08));
  background: color-mix(in srgb, var(--item-color) 8%, rgba(255, 255, 255, 0.035));
}

.weak-info {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.weak-rank {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--item-color) 18%, rgba(255, 255, 255, 0.04));
  color: var(--item-color);
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 800;
}

.weak-title {
  min-width: 0;
}

.weak-title strong {
  display: block;
  color: #e8edf5;
  font-size: 12px;
  font-weight: 720;
  line-height: 1.2;
}

.weak-title em {
  display: block;
  margin-top: 3px;
  color: #7184aa;
  font-size: 10px;
  font-style: normal;
  line-height: 1.2;
}

.weak-score {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  color: #a8badc;
  font-size: 10px;
  white-space: nowrap;
}

.weak-track {
  height: 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.weak-fill {
  height: 100%;
  border-radius: 3px;
  box-shadow: 0 0 8px color-mix(in srgb, var(--fill-color) 35%, transparent);
  transition: width 0.6s ease;
}

.weak-evidence {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  color: #8ca0c3;
  font-size: 10px;
  line-height: 1.35;
}

.weak-evidence span {
  min-width: 0;
}

.weak-evidence b {
  color: color-mix(in srgb, var(--item-color) 68%, #f7fbff);
  font-weight: 650;
  white-space: nowrap;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

@keyframes soft-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}

@media (prefers-reduced-motion: reduce) {
  .sky-eyebrow span,
  .dist-segment,
  .weak-fill {
    animation: none !important;
    transition: none !important;
  }
}

@media (max-width: 1100px) {
  .knowledge-board {
    grid-template-columns: 1fr;
  }

  .graph-panel {
    min-height: 324px;
    height: auto;
  }

  .graph-shell {
    flex-basis: clamp(340px, 52vw, 460px);
  }

  .graph-shell {
    perspective: 700px;
  }

  .central-hub {
    width: 100px;
    height: 100px;
    transform: translate(-50%, -50%) translateZ(100px);
  }

  .node-detail {
    width: 170px;
  }

  .graph-header {
    align-items: flex-start;
  }

  .graph-actions {
    max-width: 78%;
  }
}

@media (max-width: 720px) {
  .section-skyline {
    padding: 16px;
  }

  .sky-header {
    grid-template-columns: 1fr;
  }

  .sky-score {
    width: fit-content;
  }

  .graph-header {
    flex-direction: column;
  }

  .graph-actions {
    justify-content: flex-start;
    max-width: 100%;
  }

  .graph-shell {
    perspective: 600px;
    flex-basis: 330px;
  }

  .map-action-panel {
    min-height: 0;
  }

  .map-primary-action,
  .map-action-grid,
  .map-route-lane {
    grid-template-columns: 1fr;
  }

  .map-route-lane::before {
    left: 22px;
    right: auto;
    top: 16px;
    bottom: 16px;
    width: 1px;
    height: auto;
    background: linear-gradient(180deg, transparent, rgba(34, 211, 238, 0.28), rgba(167, 139, 250, 0.22), transparent);
  }

  .map-route-lane button {
    grid-template-columns: auto minmax(0, 1fr);
    justify-items: start;
    min-height: 48px;
    text-align: left;
  }

  .map-primary-action i {
    justify-self: start;
  }

  .central-hub {
    width: 80px;
    height: 80px;
    transform: translate(-50%, -50%) translateZ(80px);
  }

  .diagnostic-strip,
  .radar-stat-grid {
    grid-template-columns: 1fr;
  }

  .weak-info,
  .weak-evidence {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .weak-score,
  .weak-evidence b {
    grid-column: 2;
    align-items: flex-start;
    white-space: normal;
  }
}
</style>
