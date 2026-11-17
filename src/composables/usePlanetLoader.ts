import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import type { Galaxy, Course } from '../types'
import { useUniverseStore } from '../stores/universeStore'
import { useSpiralLayout } from './useSpiralLayout'

function createPlanetLabel(name: string, yOffset: number): CSS2DObject {
  const div = document.createElement('div')
  div.textContent = name
  div.style.color = '#ffffff'
  div.style.fontSize = '14px'
  div.style.fontWeight = 'bold'
  div.style.textShadow = '0 0 10px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,0.8)'
  div.style.whiteSpace = 'nowrap'
  div.style.pointerEvents = 'none'
  div.style.userSelect = 'none'
  div.style.background = 'rgba(0,0,0,0.4)'
  div.style.padding = '2px 8px'
  div.style.borderRadius = '4px'
  const label = new CSS2DObject(div)
  label.position.set(0, yOffset, 0)
  label.name = 'planet-label'
  return label
}

export function usePlanetLoader(
  parentGroup: THREE.Group,
) {
  const gltfLoader = new GLTFLoader()
  gltfLoader.setMeshoptDecoder(MeshoptDecoder)
  const planetMeshes = new Map<number, THREE.Object3D>()
  const planetAssetVersion = '20261117'

  async function loadAllPlanets(
    galaxies: Galaxy[],
    courses: Course[],
    onProgress: (pct: number) => void,
  ): Promise<Map<number, THREE.Object3D>> {
    const store = useUniverseStore()
    const spiral = useSpiralLayout(galaxies)
    const planetLayouts = spiral.computePlanetPositions()

    // Create placeholders at ring positions
    for (const layout of planetLayouts) {
      const galaxy = galaxies.find(g => g.id === layout.galaxyId)
      const placeholderGeo = new THREE.SphereGeometry(1.0, 32, 32)
      const placeholderMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(galaxy?.color || '#4488aa'),
        roughness: 0.5,
        metalness: 0.2,
        emissive: new THREE.Color(galaxy?.color || '#4488aa'),
        emissiveIntensity: 0.3,
      })
      const placeholder = new THREE.Mesh(placeholderGeo, placeholderMat)
      placeholder.position.copy(layout.position)
      placeholder.userData.courseId = layout.courseId
      placeholder.name = `planet-${layout.courseId}`
      parentGroup.add(placeholder)
      planetMeshes.set(layout.courseId, placeholder)
    }

    let loaded = 0
    const total = 24
    const loadPromises: Promise<void>[] = []

    for (let i = 1; i <= total; i++) {
      const promise = gltfLoader
        .loadAsync(`/models/planet_${i}.glb?v=${planetAssetVersion}`)
        .then((gltf) => {
          const model = gltf.scene

          const placeholder = planetMeshes.get(i)
          if (placeholder) {
            parentGroup.remove(placeholder)
            if (placeholder instanceof THREE.Mesh) {
              placeholder.geometry.dispose()
              ;(placeholder.material as THREE.Material).dispose()
            }
          }

          const savedPos = placeholder?.position.clone() || new THREE.Vector3()
          model.userData.courseId = i
          model.name = `planet-${i}`

          // Center the model geometry around its local origin
          const box = new THREE.Box3().setFromObject(model)
          const center = box.getCenter(new THREE.Vector3())
          const size = box.getSize(new THREE.Vector3())
          const maxDim = Math.max(size.x, size.y, size.z)

          // Offset children so geometry center is at local origin, model stays at spiral position
          model.children.forEach((child) => {
            child.position.sub(center)
          })
          model.position.copy(savedPos)

          const courseData = courses.find((c) => c.id === i)
          const diff = courseData?.difficulty
          const baseRadius = diff === '高级' ? 2.5 : diff === '进阶' ? 2.0 : 1.6
          const variation = (Math.random() - 0.5) * 0.25
          const targetRadius = baseRadius + variation
          const scale = targetRadius / maxDim
          model.scale.setScalar(scale)

          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true
              child.receiveShadow = true
              child.userData.courseId = i
            }
          })

          const state = store.getPlanetState(i)
          applyPlanetState(model, state)

          // Attach course name label just above the planet surface
          if (courseData) {
            model.add(createPlanetLabel(courseData.name, maxDim / 2 + 0.2))
          }

          parentGroup.add(model)
          planetMeshes.set(i, model)

          loaded++
          onProgress((loaded / total) * 100)
        })
        .catch((err) => {
          console.warn(`Failed to load planet_${i}.glb:`, err)
          loaded++
          onProgress((loaded / total) * 100)
        })

      loadPromises.push(promise)
    }

    await Promise.all(loadPromises)
    return planetMeshes
  }

  function applyPlanetState(model: THREE.Group, state: string) {
    model.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshStandardMaterial

        // Ensure smooth normals for all models
        if (child.geometry && !child.geometry.attributes.normal) {
          child.geometry.computeVertexNormals()
        }
        mat.flatShading = false

        // Fix textures: generate mipmaps + anisotropic filtering for sharp rendering at distance
        const textures = [mat.map, mat.roughnessMap, mat.metalnessMap, mat.normalMap, mat.aoMap, mat.emissiveMap]
        const hasTextures = textures.some((tex) => tex !== null && tex !== undefined)
        textures.forEach((tex) => {
          if (tex) {
            tex.anisotropy = 16
            tex.minFilter = THREE.LinearMipmapLinearFilter
            tex.magFilter = THREE.LinearFilter
            tex.generateMipmaps = true
            tex.needsUpdate = true
          }
        })

        switch (state) {
          case 'locked':
            if (hasTextures) {
              mat.color.multiplyScalar(0.45)
              mat.emissive = new THREE.Color(0x111111)
              mat.emissiveIntensity = 0.1
            } else {
              mat.color.set('#445566')
              mat.emissive = new THREE.Color(0x111122)
              mat.emissiveIntensity = 0.15
            }
            mat.roughness = 0.65
            mat.metalness = 0.2
            break
          case 'available':
            if (!hasTextures) {
              mat.roughness = 0.4
              mat.metalness = 0.3
            } else {
              mat.roughness = 0.5
              mat.metalness = 0.2
            }
            mat.emissive = mat.color.clone().multiplyScalar(0.2)
            mat.emissiveIntensity = 0.4
            break
          case 'completed':
            if (!hasTextures) {
              mat.roughness = 0.35
              mat.metalness = 0.35
            } else {
              mat.roughness = 0.45
              mat.metalness = 0.25
            }
            mat.emissive = new THREE.Color(0x22aa44)
            mat.emissiveIntensity = 0.4
            break
        }
      }
    })
  }

  return { loadAllPlanets, planetMeshes }
}
