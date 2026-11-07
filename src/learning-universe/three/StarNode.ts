import * as THREE from 'three'
import starVert from '../shaders/star/vertex.glsl?raw'
import starFrag from '../shaders/star/fragment.glsl?raw'
import type { KnowledgeNode } from '../types'

const textureLoader = new THREE.TextureLoader()
const textureCache = new Map<string, THREE.Texture>()

type PlanetMaterialConfig = {
  surface: string
  bump?: string
  bumpScale?: number
  normal?: string
  roughnessMap?: string
  roughness?: number
  metalness?: number
  emissiveIntensity?: number
  atmosphereColor?: number
  atmosphereOpacity?: number
  cloudMap?: string
  cloudOpacity?: number
  overlayMap?: string
  overlayOpacity?: number
  ringMap?: string
  ringInnerScale?: number
  ringOuterScale?: number
  ringTilt?: number
  rotationSpeed?: number
}

const planetMaterialMap: Record<string, PlanetMaterialConfig> = {
  c_java_oop: {
    surface: '/assets/textures/premium/mars-4k.jpg',
    bump: '/assets/textures/premium/mars-bump-2k.jpg',
    bumpScale: 0.03,
    roughness: 0.94,
    metalness: 0.02,
    emissiveIntensity: 0.08,
    atmosphereColor: 0xffa06a,
    atmosphereOpacity: 0.12,
    rotationSpeed: 0.0024,
  },
  c_db: {
    surface: '/assets/textures/premium/jupiter-4k.jpg',
    roughness: 0.98,
    metalness: 0.01,
    emissiveIntensity: 0.06,
    atmosphereColor: 0xffd1a4,
    atmosphereOpacity: 0.12,
    rotationSpeed: 0.0021,
  },
  c_ml: {
    surface: '/assets/textures/premium/earth-daymap-4k.jpg',
    normal: '/assets/textures/premium/earth-normal-2k.jpg',
    roughnessMap: '/assets/textures/premium/earth-roughness-2k.jpg',
    roughness: 1,
    metalness: 0.02,
    emissiveIntensity: 0.03,
    atmosphereColor: 0x6da8ff,
    atmosphereOpacity: 0.22,
    cloudMap: '/assets/textures/premium/earth-clouds-2k.jpg',
    cloudOpacity: 0.92,
    rotationSpeed: 0.0025,
  },
  c_nlp: {
    surface: '/assets/textures/premium/venus-surface-4k.jpg',
    bump: '/assets/textures/premium/venus-surface-bump-2k.jpg',
    bumpScale: 0.018,
    roughness: 0.95,
    metalness: 0.01,
    emissiveIntensity: 0.04,
    atmosphereColor: 0xf4d1ac,
    atmosphereOpacity: 0.14,
    overlayMap: '/assets/textures/premium/venus-atmosphere-4k.jpg',
    overlayOpacity: 0.9,
    rotationSpeed: 0.0018,
  },
  c_cv: {
    surface: '/assets/textures/premium/saturn-4k.jpg',
    roughness: 0.96,
    metalness: 0.01,
    emissiveIntensity: 0.05,
    atmosphereColor: 0xe9d8be,
    atmosphereOpacity: 0.1,
    ringMap: '/assets/textures/premium/saturn-ring-4k.png',
    ringInnerScale: 1.45,
    ringOuterScale: 2.7,
    ringTilt: 0.42,
    rotationSpeed: 0.002,
  },
  c_bigdata: {
    surface: '/assets/textures/premium/moon-4k.jpg',
    bump: '/assets/textures/premium/moon-bump-2k.jpg',
    bumpScale: 0.055,
    roughness: 0.99,
    metalness: 0,
    emissiveIntensity: 0.03,
    atmosphereColor: 0xc8d7ff,
    atmosphereOpacity: 0.08,
    rotationSpeed: 0.0017,
  },
  c_rl: {
    surface: '/assets/textures/premium/mercury-4k.jpg',
    bump: '/assets/textures/premium/mercury-bump-2k.jpg',
    bumpScale: 0.05,
    roughness: 0.98,
    metalness: 0.01,
    emissiveIntensity: 0.05,
    atmosphereColor: 0xffd2b0,
    atmosphereOpacity: 0.08,
    rotationSpeed: 0.0019,
  },
}

function loadTexture(path: string, srgb = true): THREE.Texture {
  const cacheKey = `${path}|${srgb ? 'srgb' : 'linear'}`
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!

  const tex = textureLoader.load(
    path,
    () => {
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
      tex.wrapS = THREE.RepeatWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping
      textureCache.set(cacheKey, tex)
    },
    undefined,
    () => console.warn(`Planet texture failed: ${path}`),
  )

  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  textureCache.set(cacheKey, tex)
  return tex
}

export class StarNode {
  public mesh: THREE.Mesh
  public node: KnowledgeNode
  public ring: THREE.Mesh | null = null

  private atmosphereMesh: THREE.Mesh | null = null
  private cloudMesh: THREE.Mesh | null = null
  private decorativeRingMesh: THREE.Mesh | null = null
  private overlayMesh: THREE.Mesh | null = null
  private rotationSpeed = 0.003

  constructor(node: KnowledgeNode, color: THREE.Color, x: number, y: number, z: number) {
    this.node = node
    const size = 0.4 + node.difficulty * 0.8 + node.mastery * 0.4
    const geo = new THREE.SphereGeometry(size, 56, 56)
    const planetConfig = node.type === 'project' ? planetMaterialMap[node.id] : undefined

    let mat: THREE.Material

    if (planetConfig) {
      mat = new THREE.MeshPhysicalMaterial({
        map: loadTexture(planetConfig.surface),
        bumpMap: planetConfig.bump ? loadTexture(planetConfig.bump, false) : null,
        bumpScale: planetConfig.bumpScale ?? 0,
        normalMap: planetConfig.normal ? loadTexture(planetConfig.normal, false) : null,
        roughnessMap: planetConfig.roughnessMap ? loadTexture(planetConfig.roughnessMap, false) : null,
        roughness: planetConfig.roughness ?? 0.9,
        metalness: planetConfig.metalness ?? 0.02,
        clearcoat: 0.08,
        clearcoatRoughness: 0.65,
        emissive: color.clone().multiplyScalar(0.4),
        emissiveIntensity: planetConfig.emissiveIntensity ?? 0.06,
      })
      this.rotationSpeed = planetConfig.rotationSpeed ?? this.rotationSpeed
    } else if (node.type === 'project') {
      mat = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.55,
        metalness: 0.08,
        clearcoat: 0.08,
        clearcoatRoughness: 0.45,
        emissive: color,
        emissiveIntensity: 0.2,
      })
    } else {
      const uniforms = {
        uColor: { value: color },
        uTime: { value: 0 },
        uGlow: { value: 1.5 },
        uMastery: { value: node.mastery },
      }
      mat = new THREE.ShaderMaterial({
        vertexShader: starVert,
        fragmentShader: starFrag,
        uniforms,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    }

    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.position.set(x, y, z)

    if (planetConfig) {
      if (planetConfig.atmosphereColor) {
        this.buildAtmosphere(size, planetConfig.atmosphereColor, planetConfig.atmosphereOpacity ?? 0.14)
      }
      if (planetConfig.cloudMap) {
        this.buildCloudLayer(size, planetConfig.cloudMap, planetConfig.cloudOpacity ?? 0.8)
      }
      if (planetConfig.overlayMap) {
        this.buildOverlayLayer(size, planetConfig.overlayMap, planetConfig.overlayOpacity ?? 0.85)
      }
      if (planetConfig.ringMap) {
        this.buildPlanetRing(
          size,
          planetConfig.ringMap,
          planetConfig.ringInnerScale ?? 1.4,
          planetConfig.ringOuterScale ?? 2.6,
          planetConfig.ringTilt ?? 0.38,
        )
      }
    }

    this.buildSelectionRing(size)
  }

  private buildAtmosphere(planetSize: number, colorHex: number, opacity: number) {
    const atmosSize = planetSize * 1.09
    const atmoGeo = new THREE.SphereGeometry(atmosSize, 40, 40)
    const atmoMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPos.xyz;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          vec3 normal = normalize(vNormal);
          vec3 viewDir = normalize(vViewPosition);
          float rim = 1.0 - max(0.0, dot(normal, viewDir));
          rim = pow(rim, 3.0);
          float alpha = rim * uOpacity;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      uniforms: {
        uColor: { value: new THREE.Color(colorHex) },
        uOpacity: { value: opacity },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.FrontSide,
    })
    this.atmosphereMesh = new THREE.Mesh(atmoGeo, atmoMat)
    this.mesh.add(this.atmosphereMesh)
  }

  private buildCloudLayer(planetSize: number, mapPath: string, opacity: number) {
    const cloudGeo = new THREE.SphereGeometry(planetSize * 1.025, 40, 40)
    const alphaMap = loadTexture(mapPath, false)
    const cloudMat = new THREE.MeshPhongMaterial({
      color: 0xf7fbff,
      alphaMap,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      shininess: 8,
    })
    this.cloudMesh = new THREE.Mesh(cloudGeo, cloudMat)
    this.mesh.add(this.cloudMesh)
  }

  private buildOverlayLayer(planetSize: number, mapPath: string, opacity: number) {
    const overlayGeo = new THREE.SphereGeometry(planetSize * 1.04, 48, 48)
    const overlayMat = new THREE.MeshStandardMaterial({
      map: loadTexture(mapPath),
      transparent: true,
      opacity,
      depthWrite: false,
      roughness: 0.85,
      metalness: 0,
      side: THREE.DoubleSide,
    })
    this.overlayMesh = new THREE.Mesh(overlayGeo, overlayMat)
    this.mesh.add(this.overlayMesh)
  }

  private buildPlanetRing(
    planetSize: number,
    alphaMapPath: string,
    innerScale: number,
    outerScale: number,
    tilt: number,
  ) {
    const ringGeo = new THREE.RingGeometry(planetSize * innerScale, planetSize * outerScale, 128)
    const alphaMap = loadTexture(alphaMapPath, false)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xe7d2b3,
      alphaMap,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    })
    this.decorativeRingMesh = new THREE.Mesh(ringGeo, ringMat)
    this.decorativeRingMesh.rotation.x = Math.PI / 2 - tilt
    this.decorativeRingMesh.rotation.z = Math.random() * Math.PI
    this.mesh.add(this.decorativeRingMesh)
  }

  private buildSelectionRing(size: number) {
    const ringGeo = new THREE.TorusGeometry(size * 1.5, 0.04, 12, 48)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.ring = new THREE.Mesh(ringGeo, ringMat)
    this.ring.renderOrder = 999
    this.ring.visible = true
    this.ring.rotation.x = Math.PI * 0.3
    this.ring.rotation.z = Math.random() * Math.PI
    this.mesh.add(this.ring)
  }

  update(time: number) {
    if (this.mesh.material instanceof THREE.ShaderMaterial) {
      this.mesh.material.uniforms.uTime.value = time
      this.mesh.material.uniforms.uMastery.value = this.node.mastery
    } else if (this.mesh.material instanceof THREE.MeshPhysicalMaterial) {
      this.mesh.material.emissiveIntensity =
        (this.node.type === 'project' ? 0.05 : 0.2) +
        this.node.mastery * 0.08 +
        Math.sin(time * 1.2 + this.mesh.position.x) * 0.015
      this.mesh.rotation.y += this.rotationSpeed
    }

    if (this.atmosphereMesh) {
      this.atmosphereMesh.rotation.y += 0.0008
    }

    if (this.cloudMesh) {
      this.cloudMesh.rotation.y += this.rotationSpeed * 1.45
    }

    if (this.overlayMesh) {
      this.overlayMesh.rotation.y += this.rotationSpeed * 0.9
    }

    if (this.decorativeRingMesh) {
      this.decorativeRingMesh.rotation.z += 0.0008
    }

    if (this.ring) {
      this.ring.rotation.z += 0.005
      const mat = this.ring.material as THREE.MeshBasicMaterial
      if (mat.opacity < 0.3) {
        mat.opacity = 0.08 + Math.sin(time * 0.6 + this.mesh.position.x) * 0.04
      } else {
        mat.opacity = Math.max(0.1, mat.opacity - 0.004)
      }
    }
  }

  highlight(on: boolean) {
    if (!this.ring) return
    this.ring.visible = true
    const mat = this.ring.material as THREE.MeshBasicMaterial
    mat.color.set(0x60a5fa)
    mat.opacity = on ? 0.5 : 0
  }

  select(on: boolean) {
    if (!this.ring) return
    this.ring.visible = true
    const mat = this.ring.material as THREE.MeshBasicMaterial
    mat.color.set(on ? 0xf0c040 : 0xffffff)
    mat.opacity = on ? 0.8 : 0
  }

  dispose() {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    if (this.atmosphereMesh) {
      this.atmosphereMesh.geometry.dispose()
      ;(this.atmosphereMesh.material as THREE.Material).dispose()
    }
    if (this.cloudMesh) {
      this.cloudMesh.geometry.dispose()
      ;(this.cloudMesh.material as THREE.Material).dispose()
    }
    if (this.overlayMesh) {
      this.overlayMesh.geometry.dispose()
      ;(this.overlayMesh.material as THREE.Material).dispose()
    }
    if (this.decorativeRingMesh) {
      this.decorativeRingMesh.geometry.dispose()
      ;(this.decorativeRingMesh.material as THREE.Material).dispose()
    }
    if (this.ring) {
      this.ring.geometry.dispose()
      ;(this.ring.material as THREE.MeshBasicMaterial).dispose()
    }
  }
}
