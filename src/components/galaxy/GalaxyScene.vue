<script setup lang="ts">
import { ref, onMounted, onUnmounted, shallowRef, reactive, watch, type Ref } from 'vue'
import * as THREE from 'three'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { useGalaxyScene, detectWebGL2, detectGPUTier, getPerfConfig, type PerfTier } from './composables/useGalaxyScene'
import { useGalaxyControls } from './composables/useGalaxyControls'
import { createParticles } from './entities/createParticles'
import { createStar } from './entities/createStar'
import { createOrbitRings } from './entities/createOrbitRing'
import { createPlanets } from './entities/createPlanet'
import { createSatellites } from './entities/createSatellites'
import type { GalaxySceneData, GalaxyEntities } from './galaxy.types'

const props = defineProps<{
  galaxyData?: GalaxySceneData
  activePhaseId?: string | null
}>()

const emit = defineEmits<{
  'scene-ready': []
  'phase-click': [phaseId: string]
  'webgl-error': []
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const labelContainerRef = ref<HTMLDivElement | null>(null)

const containerRef = shallowRef<HTMLElement | null>(null)

const {
  scene,
  camera,
  css2dRenderer,
  composer,
  init: initScene,
  initBloom,
  setBloomEnabled,
  render,
  dispose: disposeScene,
} = useGalaxyScene(canvasRef, containerRef)

const { controls, init: initControls, dispose: disposeControls } = useGalaxyControls(camera, canvasRef)

const galaxyEntities = reactive<GalaxyEntities>({
  star: null,
  planets: [],
  orbitRings: [],
  satellites: [],
  particles: null,
  css2dRenderer: null,
})

let rafId = 0
let startTime = 0
let prevPhaseIds = new Set<string>()

// ─── Animation state ───
const entrancePhase = ref(0) // 0=converge, 1=star, 2=planets, 3=done
const entranceElapsed = ref(0)
const completionWaves: { ring: THREE.Mesh; elapsed: number }[] = []

function triggerCompletionEffect(position: THREE.Vector3) {
  if (!scene.value) return

  const ringGeo = new THREE.TorusGeometry(0.3, 0.02, 8, 32)
  const ringMat = new THREE.MeshBasicMaterial({
    color: '#00d4ff',
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.position.copy(position)
  scene.value.add(ring)

  completionWaves.push({ ring, elapsed: 0 })
}

// ─── Interaction state ───
const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()
let hoveredPlanetIndex = -1
let planetLabels: (CSS2DObject | null)[] = []

function createLabel(phase: { title: string; progress: number; status: string; color: string }): CSS2DObject {
  const el = document.createElement('div')
  el.className = 'galaxy-label'
  if (phase.status === 'locked') {
    el.innerHTML = `<span>${phase.title}</span><span class="pct">未解锁</span>`
  } else {
    el.innerHTML = `<span>${phase.title}</span><span class="pct">${phase.progress}%</span>`
  }
  const label = new CSS2DObject(el)
  label.visible = false
  return label
}

const planetTextureFiles = ['planet_cyan.png', 'planet_purple.png', 'planet_emerald.png', 'planet_amber.png']
const textureLoader = new THREE.TextureLoader()

function applyTextures(allPhases: { color: string }[]) {
  if (!scene.value || !galaxyEntities.star || !galaxyEntities.particles) return

  // Star surface
  textureLoader.load('/planet/star_surface.jpg',
    (tex) => {
      const mat = galaxyEntities.star!.mesh.material as THREE.MeshStandardMaterial
      mat.map = tex
      mat.color.set('#ffffff')
      mat.emissiveIntensity = 0.3
      mat.roughness = 0.5
      mat.needsUpdate = true
    },
    undefined,
    () => console.warn('[Galaxy] 恒星纹理加载失败，使用程序化材质')
  )

  // Planet textures by index
  allPhases.forEach((_, i) => {
    if (i >= planetTextureFiles.length) return
    textureLoader.load(`/planet/${planetTextureFiles[i]}`,
      (tex) => {
        const planet = galaxyEntities.planets[i]
        if (!planet) return
        const mat = planet.mesh.material as THREE.MeshStandardMaterial
        mat.map = tex
        mat.color.set('#ffffff')
        mat.emissive.set('#000000')
        mat.emissiveIntensity = 0
        mat.roughness = 0.6
        mat.metalness = 0
        mat.needsUpdate = true
      },
      undefined,
      () => console.warn(`[Galaxy] 行星${i}纹理加载失败，使用程序化材质`)
    )
  })

  // Particle sprite
  textureLoader.load('/planet/star_particle.png',
    (tex) => {
      if (!galaxyEntities.particles) return
      const mat = galaxyEntities.particles.points.material as THREE.PointsMaterial
      mat.map = tex
      mat.needsUpdate = true
    },
    undefined,
    () => {} // silent fallback
  )

}

function rebuildAll(data: GalaxySceneData) {
  if (!scene.value) return
  const s = scene.value

  // Reset entrance animation
  entrancePhase.value = 0
  entranceElapsed.value = 0
  completionWaves.forEach(w => {
    w.ring.removeFromParent()
    w.ring.geometry.dispose()
    ;(w.ring.material as THREE.Material).dispose()
  })
  completionWaves.length = 0

  // Dispose old
  galaxyEntities.star?.dispose()
  galaxyEntities.orbitRings.forEach(r => r.dispose())
  galaxyEntities.planets.forEach(p => p.dispose())
  galaxyEntities.satellites.forEach(s => s.dispose())
  planetLabels.forEach(l => l?.removeFromParent())

  if (galaxyEntities.star) s.remove(galaxyEntities.star.mesh)
  galaxyEntities.orbitRings.forEach(r => s.remove(r.line))
  galaxyEntities.planets.forEach(p => s.remove(p.mesh))
  galaxyEntities.satellites.forEach(sat => s.remove(sat.points))

  // Null out after disposal
  galaxyEntities.star = null
  galaxyEntities.orbitRings = []
  galaxyEntities.planets = []
  galaxyEntities.satellites = []
  planetLabels = []

  const allPhases = data.domains.flatMap(d => d.phases)
  prevPhaseIds = new Set(allPhases.map(p => p.id))

  // Star
  if (!galaxyEntities.star) {
    const star = createStar(data.totalProgress)
    // Enable transparency for entrance animation
    const starMat = star.mesh.material as THREE.MeshStandardMaterial
    starMat.transparent = true
    starMat.opacity = 0
    ;(star.glowMesh.material as THREE.MeshBasicMaterial).opacity = 0
    s.add(star.mesh)
    galaxyEntities.star = star
  }

  // Orbit rings
  const orbitRadii = computeOrbitRadii(allPhases.length)
  const rings = createOrbitRings(allPhases)
  rings.forEach(r => {
    (r.line.material as THREE.LineBasicMaterial).opacity = 0
    s.add(r.line)
  })
  galaxyEntities.orbitRings = rings

  // Planets
  const planets = createPlanets(allPhases, orbitRadii)
  planets.forEach(p => {
    // Enable transparency for entrance animation
    const mat = p.mesh.material as THREE.MeshStandardMaterial
    mat.transparent = true
    mat.opacity = 0
    p.mesh.scale.setScalar(0)
    s.add(p.mesh)
  })
  galaxyEntities.planets = planets

  // Satellites
  const satellites = createSatellites(allPhases)
  satellites.forEach(sat => s.add(sat.points))
  galaxyEntities.satellites = satellites

  // Labels
  planetLabels.forEach(l => l?.removeFromParent())
  planetLabels = allPhases.map((phase, i) => {
    const label = createLabel(phase)
    planets[i]?.mesh.add(label)
    label.position.set(0, 0.6, 0)
    return label
  })

  // Load textures
  applyTextures(allPhases)
}

function incrementalUpdate(data: GalaxySceneData) {
  const allPhases = data.domains.flatMap(d => d.phases)

  galaxyEntities.star?.update(0, data.totalProgress)

  allPhases.forEach((phase, i) => {
    if (i < galaxyEntities.orbitRings.length) {
      galaxyEntities.orbitRings[i].update(phase.progress, phase.status)
    }
    if (i < galaxyEntities.planets.length) {
      const planet = galaxyEntities.planets[i]
      planet.data = phase
      const mat = planet.mesh.material as THREE.MeshStandardMaterial
      if (phase.status === 'locked') {
        mat.transparent = true
        mat.opacity = 0.35
        planet.mesh.scale.setScalar(0.7)
      } else {
        mat.transparent = false
        mat.opacity = 1
        planet.mesh.scale.setScalar(1)
      }
      if (!mat.map) {
        mat.emissiveIntensity = (phase.progress / 100) * 0.5
      }
    }
  })

  allPhases.forEach((phase, i) => {
    if (i < galaxyEntities.satellites.length) {
      // Check for newly completed nodes
      const oldPhase = galaxyEntities.planets[i]?.data
      if (oldPhase) {
        phase.nodes.forEach((node, ni) => {
          const oldNode = oldPhase.nodes[ni]
          if (oldNode && oldNode.progress < 100 && node.progress >= 100) {
            const planet = galaxyEntities.planets[i]
            if (planet) triggerCompletionEffect(planet.mesh.position.clone())
          }
        })
      }

      const sat = galaxyEntities.satellites[i]
      scene.value?.remove(sat.points)
      sat.dispose()
      const newSat = createSatellites([phase])[0]
      scene.value?.add(newSat.points)
      galaxyEntities.satellites[i] = newSat
    }
  })

  // Update label content
  allPhases.forEach((phase, i) => {
    const label = planetLabels[i]
    if (label && label.element instanceof HTMLElement) {
      const el = label.element
      if (phase.status === 'locked') {
        el.innerHTML = `<span>${phase.title}</span><span class="pct">未解锁</span>`
      } else {
        el.innerHTML = `<span>${phase.title}</span><span class="pct">${phase.progress}%</span>`
      }
    }
  })
}

function computeOrbitRadii(count: number, min = 3, max = 7.5): number[] {
  if (count <= 1) return [(min + max) / 2]
  return Array.from({ length: count }, (_, i) => min + (max - min) * i / (count - 1))
}

// ─── Hover detection ───
function onMouseMove(e: MouseEvent) {
  const el = canvasRef.value
  if (!el || !camera.value || galaxyEntities.planets.length === 0) return

  const rect = el.getBoundingClientRect()
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, camera.value)
  const meshes = galaxyEntities.planets.map(p => p.mesh)
  const intersects = raycaster.intersectObjects(meshes, false)

  const prevHovered = hoveredPlanetIndex

  if (intersects.length > 0) {
    const obj = intersects[0].object as THREE.Mesh
    const idx = meshes.indexOf(obj)
    if (idx !== -1 && galaxyEntities.planets[idx].data.status !== 'locked') {
      hoveredPlanetIndex = idx
    } else {
      hoveredPlanetIndex = -1
    }
  } else {
    hoveredPlanetIndex = -1
  }

  // Handle hover enter/leave
  if (prevHovered !== -1 && prevHovered !== hoveredPlanetIndex) {
    leavePlanet(prevHovered)
  }
  if (hoveredPlanetIndex !== -1 && hoveredPlanetIndex !== prevHovered) {
    enterPlanet(hoveredPlanetIndex)
  }
}

function enterPlanet(idx: number) {
  const planet = galaxyEntities.planets[idx]
  if (!planet) return
  planet.mesh.scale.setScalar(1.15)
  const mat = planet.mesh.material as THREE.MeshStandardMaterial
  mat.emissiveIntensity = mat.map
    ? 0.2
    : Math.min((planet.data.progress / 100) * 0.5 + 0.3, 1.0)

  const label = planetLabels[idx]
  if (label) label.visible = true
}

function leavePlanet(idx: number) {
  const planet = galaxyEntities.planets[idx]
  if (!planet) return
  // Don't reset scale for locked planets
  if (planet.data.status !== 'locked') {
    planet.mesh.scale.setScalar(1)
  }
  const mat = planet.mesh.material as THREE.MeshStandardMaterial
  mat.emissiveIntensity = mat.map ? 0 : (planet.data.progress / 100) * 0.5

  const label = planetLabels[idx]
  if (label) label.visible = false
}

// ─── Click detection ───
function onClick(e: MouseEvent) {
  const el = canvasRef.value
  if (!el || !camera.value || galaxyEntities.planets.length === 0) return

  const rect = el.getBoundingClientRect()
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, camera.value)
  const meshes = galaxyEntities.planets.map(p => p.mesh)
  const intersects = raycaster.intersectObjects(meshes, false)

  if (intersects.length > 0) {
    const obj = intersects[0].object as THREE.Mesh
    const idx = meshes.indexOf(obj)
    if (idx !== -1) {
      const planet = galaxyEntities.planets[idx]
      if (planet.data.status !== 'locked') {
        emit('phase-click', planet.data.id)
      }
    }
  }
}

// ─── Data watch ───
watch(() => props.galaxyData, (data) => {
  if (!data || !scene.value) return

  const allPhases = data.domains.flatMap(d => d.phases)
  const newIds = new Set(allPhases.map(p => p.id))

  const phaseCountChanged = newIds.size !== prevPhaseIds.size
    || [...newIds].some(id => !prevPhaseIds.has(id))

  if (phaseCountChanged || galaxyEntities.planets.length === 0) {
    rebuildAll(data)
  } else {
    incrementalUpdate(data)
  }
}, { deep: true, immediate: true })

watch(() => props.activePhaseId, (id) => {
  galaxyEntities.planets.forEach(p => p.setHighlight(p.data.id === id))
})

// ─── Render loop ───
function renderLoop(now: number) {
  rafId = requestAnimationFrame(renderLoop)
  checkFPS(now)
  if (startTime === 0) startTime = now
  const dt = Math.min((now - startTime) / 1000, 0.1)
  const time = now * 0.001

  controls.value?.update()

  // Entrance animation
  if (entrancePhase.value < 3) {
    entranceElapsed.value += dt

    if (entrancePhase.value === 0) {
      // Particles converge (0 → 0.8s)
      const t = Math.min(entranceElapsed.value / 0.8, 1.0)
      const scale = 0.5 + t * 0.5
      if (galaxyEntities.particles) {
        galaxyEntities.particles.points.scale.setScalar(scale)
        galaxyEntities.particles.update(dt, time)
      }
      if (t >= 1.0) {
        entrancePhase.value = 1
        entranceElapsed.value = 0
      }
    } else if (entrancePhase.value === 1) {
      // Star fades in (0 → 0.8s)
      const t = Math.min(entranceElapsed.value / 0.8, 1.0)
      if (galaxyEntities.star) {
        const mat = galaxyEntities.star.mesh.material as THREE.MeshStandardMaterial
        mat.opacity = t
        ;(galaxyEntities.star.glowMesh.material as THREE.MeshBasicMaterial).opacity = t * 0.2
      }
      if (galaxyEntities.particles) {
        galaxyEntities.particles.update(dt, time)
      }
      if (t >= 1.0) {
        entrancePhase.value = 2
        entranceElapsed.value = 0
      }
    } else if (entrancePhase.value === 2) {
      // Planets appear sequentially (80ms stagger each)
      const staggerTime = 0.08
      galaxyEntities.planets.forEach((p, i) => {
        const pt = Math.max(0, Math.min(1, (entranceElapsed.value - i * staggerTime) / 0.25))
        if (p.data.status !== 'locked') {
          p.mesh.scale.setScalar(pt)
          const mat = p.mesh.material as THREE.MeshStandardMaterial
          mat.opacity = pt
        }
      })
      // Orbit rings fade in alongside their planets
      galaxyEntities.orbitRings.forEach((ring, i) => {
        const pt = Math.max(0, Math.min(1, (entranceElapsed.value - i * staggerTime) / 0.25))
        const phase = galaxyEntities.planets[i]?.data
        if (phase) {
          const targetOpacity = phase.status === 'completed' ? 0.5 : phase.status === 'active' ? 0.3 : 0.15
          ;(ring.line.material as THREE.LineBasicMaterial).opacity = targetOpacity * pt
        }
      })
      if (galaxyEntities.particles) {
        galaxyEntities.particles.update(dt, time)
      }
      const allVisible = galaxyEntities.planets.every((_, i) =>
        entranceElapsed.value - i * staggerTime > 0.25
      )
      if (allVisible && entranceElapsed.value > 1.5) {
        // Restore orbit ring opacities to proper values
        galaxyEntities.orbitRings.forEach((ring, i) => {
          const phase = galaxyEntities.planets[i]?.data
          if (phase) {
            (ring.line.material as THREE.LineBasicMaterial).opacity = phase.status === 'completed' ? 0.5 : phase.status === 'active' ? 0.3 : 0.15
          }
        })
        // Restore planet material state after entrance
        galaxyEntities.planets.forEach((p) => {
          const mat = p.mesh.material as THREE.MeshStandardMaterial
          if (p.data.status === 'locked') {
            mat.transparent = true
            mat.opacity = 0.35
            p.mesh.scale.setScalar(0.7)
          } else {
            mat.transparent = false
            mat.opacity = 1
          }
        })
        entrancePhase.value = 3
      }
    }
  }

  // Completion waves
  for (let i = completionWaves.length - 1; i >= 0; i--) {
    const wave = completionWaves[i]
    wave.elapsed += dt
    const progress = wave.elapsed / 2.0 // 2s total
    if (progress >= 1) {
      wave.ring.removeFromParent()
      wave.ring.geometry.dispose()
      ;(wave.ring.material as THREE.Material).dispose()
      completionWaves.splice(i, 1)
    } else {
      const s = 1 + progress * 3
      wave.ring.scale.setScalar(s)
      ;(wave.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - progress)
    }
  }

  if (entrancePhase.value >= 3) {
    // Normal operation: all entities update
    galaxyEntities.particles?.update(dt, time)
    galaxyEntities.star?.update(dt)
    galaxyEntities.planets.forEach(p => p.update(dt, props.activePhaseId ?? null))
    galaxyEntities.satellites.forEach((sat, i) => {
      const planet = galaxyEntities.planets[i]
      if (planet) sat.update(planet.mesh.position, dt)
    })
  }

  render()

  if (css2dRenderer.value && scene.value && camera.value) {
    css2dRenderer.value.render(scene.value, camera.value)
  }

  startTime = now
}

// ─── Performance monitoring ───
let perfTier: PerfTier = 'high'
let frameCount = 0
let fpsCheckTime = 0
let consecutiveLowFps = 0

function checkFPS(now: number) {
  frameCount++
  if (now - fpsCheckTime >= 10000) {
    const fps = frameCount / ((now - fpsCheckTime) / 1000)
    frameCount = 0
    fpsCheckTime = now

    if (perfTier === 'high' && fps < 55) {
      consecutiveLowFps++
      if (consecutiveLowFps >= 3) degradeTo('mid')
    } else if (perfTier === 'mid' && fps < 30) {
      consecutiveLowFps++
      if (consecutiveLowFps >= 3) degradeTo('low')
    } else {
      consecutiveLowFps = 0
    }
  }
}

function degradeTo(tier: PerfTier) {
  perfTier = tier
  const cfg = getPerfConfig(tier)
  setBloomEnabled(cfg.bloomEnabled)

  // Rebuild particles at new count
  if (galaxyEntities.particles && scene.value) {
    const oldParticles = galaxyEntities.particles
    scene.value.remove(oldParticles.points)
    oldParticles.dispose()

    const newParticles = createParticles(cfg.particles)
    scene.value.add(newParticles.points)
    galaxyEntities.particles = newParticles
  }

  if (tier === 'low' && controls.value) {
    controls.value.autoRotate = false
  }
}

// Visibility change: pause when hidden
function onVisibilityChange() {
  if (document.hidden) {
    cancelAnimationFrame(rafId)
    rafId = 0
  } else if (rafId === 0) {
    startTime = 0
    rafId = requestAnimationFrame(renderLoop)
  }
}

// ─── Lifecycle ───
onMounted(() => {
  // WebGL check
  if (!detectWebGL2()) {
    emit('webgl-error')
    return
  }

  perfTier = detectGPUTier()
  const cfg = getPerfConfig(perfTier)
  const particleCount = cfg.particles
  const parent = (canvasRef.value?.closest('.galaxy-panel') as HTMLElement) ?? null
  containerRef.value = parent

  initScene()
  initBloom()
  initControls()

  if (css2dRenderer.value && labelContainerRef.value) {
    labelContainerRef.value.appendChild(css2dRenderer.value.domElement)
  }
  galaxyEntities.css2dRenderer = css2dRenderer.value

  // Particles (perf-based count)
  if (scene.value) {
    const particles = createParticles(particleCount)
    scene.value.add(particles.points)
    galaxyEntities.particles = particles
  }

  // Apply bloom config
  setBloomEnabled(cfg.bloomEnabled)

  // Trigger initial data build (watch with immediate fires before scene exists)
  if (props.galaxyData) {
    rebuildAll(props.galaxyData)
  }

  // Interaction listeners
  const el = canvasRef.value
  if (el) {
    el.addEventListener('mousemove', onMouseMove)
    el.addEventListener('click', onClick)
  }

  // Visibility change listener
  document.addEventListener('visibilitychange', onVisibilityChange)

  fpsCheckTime = performance.now()
  rafId = requestAnimationFrame(renderLoop)

  emit('scene-ready')
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  document.removeEventListener('visibilitychange', onVisibilityChange)

  const el = canvasRef.value
  if (el) {
    el.removeEventListener('mousemove', onMouseMove)
    el.removeEventListener('click', onClick)
  }

  galaxyEntities.particles?.dispose()
  galaxyEntities.star?.dispose()
  galaxyEntities.orbitRings.forEach(r => r.dispose())
  galaxyEntities.planets.forEach(p => p.dispose())
  galaxyEntities.satellites.forEach(s => s.dispose())
  planetLabels.forEach(l => l?.removeFromParent())

  disposeControls()
  disposeScene()
})

defineExpose({ scene, camera, css2dRenderer, composer, galaxyEntities })
</script>

<template>
  <div class="galaxy-scene-root">
    <div ref="labelContainerRef" class="label-container" />
    <div class="canvas-container">
      <canvas ref="canvasRef" role="img" aria-label="学习路径星系可视化" />
    </div>
  </div>
</template>

<style scoped>
.galaxy-scene-root {
  width: 100%;
  height: 100%;
  position: relative;
}
.canvas-container {
  position: absolute;
  inset: 0;
}
.canvas-container canvas {
  display: block;
}
.label-container {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
}
</style>
