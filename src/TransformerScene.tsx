import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { TransformerRun } from './transformer'

export type SceneTheme = 'dark' | 'light'

const LAYER_X = [-7, -5, -3, -1, 1, 3, 5, 7]
const CAMERA = new THREE.Vector3(11.5, 5.8, 14)
const PALETTES = {
  dark: { background: '#0a0c10', idle: '#d9dce1', active: '#d9a441', data: '#67ffff', line: '#343c49' },
  light: { background: '#f3f1eb', idle: '#555d68', active: '#c8891c', data: '#007f96', line: '#c5c0b5' },
} as const

type LayerObject = {
  group: THREE.Group
  materials: THREE.MeshBasicMaterial[]
  baseX: number
}

function addBox(group: THREE.Group, materials: THREE.MeshBasicMaterial[], stage: number, position: THREE.Vector3, scale: THREE.Vector3, color: string) {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .18, toneMapped: false })
  material.userData.baseColor = new THREE.Color(color)
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)
  mesh.position.copy(position)
  mesh.scale.copy(scale)
  mesh.userData.stage = stage
  group.add(mesh)
  materials.push(material)
}

function buildLayer(stage: number, run: TransformerRun, theme: SceneTheme): LayerObject {
  const palette = PALETTES[theme]
  const group = new THREE.Group()
  const materials: THREE.MeshBasicMaterial[] = []
  group.position.x = LAYER_X[stage]

  if (stage === 0) {
    const count = Math.min(run.tokens.length, 10)
    for (let index = 0; index < count; index += 1) {
      addBox(group, materials, stage, new THREE.Vector3(0, (index - (count - 1) / 2) * .47, 0), new THREE.Vector3(.24, .32, 1.5), palette.idle)
    }
  } else if (stage === 1 || stage === 2) {
    const values = stage === 1 ? run.embeddings : run.positioned
    const rows = Math.min(values.length, 9)
    const columns = 6
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const value = Math.abs(values[row]?.[column] || 0)
        const wave = stage === 2 ? Math.sin((row + column) * .8) * .16 : 0
        addBox(group, materials, stage, new THREE.Vector3(wave, (row - (rows - 1) / 2) * .42, (column - 2.5) * .42), new THREE.Vector3(.16 + value * .08, .13, .13), value > .72 ? palette.data : palette.idle)
      }
    }
  } else if (stage === 3) {
    for (let head = 0; head < 3; head += 1) {
      const weights = run.attention[head]?.at(-1) || []
      const count = Math.min(weights.length, 10)
      for (let index = 0; index < count; index += 1) {
        const weight = weights[index] || 0
        addBox(group, materials, stage, new THREE.Vector3((head - 1) * .32, (index - (count - 1) / 2) * .43, (head - 1) * 1.1), new THREE.Vector3(.18 + weight * .6, .12, .12), weight > .16 ? palette.data : palette.idle)
      }
    }
  } else if (stage === 4) {
    for (let stream = 0; stream < 2; stream += 1) {
      for (let index = 0; index < 9; index += 1) {
        addBox(group, materials, stage, new THREE.Vector3((stream - .5) * .42, (index - 4) * .45, (stream - .5) * 1.25), new THREE.Vector3(.19, .15, .34), stream ? palette.data : palette.idle)
      }
    }
  } else if (stage === 5) {
    for (let column = 0; column < 3; column += 1) {
      const count = column === 1 ? 14 : 8
      for (let index = 0; index < count; index += 1) {
        addBox(group, materials, stage, new THREE.Vector3((column - 1) * .28, (index - (count - 1) / 2) * .3, (column - 1) * .75), new THREE.Vector3(.15, .1, .15), column === 1 && index % 3 === 0 ? palette.data : palette.idle)
      }
    }
  } else if (stage === 6) {
    run.candidates.slice(0, 10).forEach((candidate, index) => {
      const width = .16 + candidate.probability * 2.6
      addBox(group, materials, stage, new THREE.Vector3(width / 2, (index - 4.5) * .42, 0), new THREE.Vector3(width, .13, .22), candidate.token === run.selected ? palette.active : palette.idle)
    })
  } else {
    addBox(group, materials, stage, new THREE.Vector3(0, 0, 0), new THREE.Vector3(.72, .72, .72), palette.active)
    addBox(group, materials, stage, new THREE.Vector3(0, 0, 0), new THREE.Vector3(.4, 1.65, .4), palette.data)
  }

  return { group, materials, baseX: LAYER_X[stage] }
}

export function TransformerScene({ run, activeStage, theme, resetId, onSelectStage }: {
  run: TransformerRun
  activeStage: number
  theme: SceneTheme
  resetId: number
  onSelectStage: (stage: number) => void
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const layersRef = useRef<LayerObject[]>([])
  const sceneRef = useRef<THREE.Scene | null>(null)
  const activeRef = useRef(activeStage)
  const themeRef = useRef(theme)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const onSelectRef = useRef(onSelectStage)

  useEffect(() => { activeRef.current = activeStage }, [activeStage])
  useEffect(() => { themeRef.current = theme }, [theme])
  useEffect(() => { onSelectRef.current = onSelectStage }, [onSelectStage])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const scene = new THREE.Scene()
    sceneRef.current = scene
    scene.background = new THREE.Color(PALETTES[themeRef.current].background)
    scene.fog = new THREE.FogExp2(PALETTES[themeRef.current].background, .018)
    const camera = new THREE.PerspectiveCamera(46, mount.clientWidth / mount.clientHeight, .1, 100)
    camera.position.copy(CAMERA)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = .07
    controls.rotateSpeed = .55
    controls.zoomSpeed = .8
    controls.panSpeed = .7
    controls.minDistance = 7
    controls.maxDistance = 30
    controls.autoRotate = true
    controls.autoRotateSpeed = .22
    controlsRef.current = controls

    const lineMaterial = new THREE.LineBasicMaterial({ color: PALETTES[themeRef.current].line, transparent: true, opacity: .7 })
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(LAYER_X.map((x) => new THREE.Vector3(x, 0, 0))), lineMaterial)
    scene.add(line)
    const pulseMaterial = new THREE.MeshBasicMaterial({ color: PALETTES[themeRef.current].active, toneMapped: false })
    const pulse = new THREE.Mesh(new THREE.SphereGeometry(.12, 18, 18), pulseMaterial)
    scene.add(pulse)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const pick = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(layersRef.current.map((layer) => layer.group), true)[0]
      if (typeof hit?.object.userData.stage === 'number') onSelectRef.current(hit.object.userData.stage)
    }
    renderer.domElement.addEventListener('pointerup', pick)
    renderer.domElement.addEventListener('pointerdown', () => { controls.autoRotate = false })

    let frame = 0
    const animate = (time: number) => {
      frame = requestAnimationFrame(animate)
      const palette = PALETTES[themeRef.current]
      const activeColor = new THREE.Color(palette.active)
      if (scene.background instanceof THREE.Color) scene.background.set(palette.background)
      if (scene.fog instanceof THREE.FogExp2) scene.fog.color.set(palette.background)
      lineMaterial.color.set(palette.line)
      pulseMaterial.color.set(palette.active)
      const stage = activeRef.current
      const previousX = stage > 0 ? LAYER_X[stage - 1] : LAYER_X[0] - 1
      const progress = (Math.sin(time * .004) + 1) / 2
      pulse.position.set(THREE.MathUtils.lerp(previousX, LAYER_X[stage], progress), 0, 0)
      pulse.scale.setScalar(.7 + progress * .8)
      layersRef.current.forEach((layer, index) => {
        const active = index === stage
        const reached = index < stage
        layer.materials.forEach((material) => {
          material.opacity += ((active ? .98 : reached ? .34 : .1) - material.opacity) * .08
          material.color.lerp(active ? activeColor : material.userData.baseColor as THREE.Color, .09)
        })
        const scale = active ? 1.05 + Math.sin(time * .007) * .035 : 1
        layer.group.scale.setScalar(scale)
        layer.group.position.x += (layer.baseX + (active ? .22 : 0) - layer.group.position.x) * .08
      })
      controls.update()
      renderer.render(scene, camera)
    }
    frame = requestAnimationFrame(animate)
    const resize = new ResizeObserver(() => {
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    })
    resize.observe(mount)

    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      controls.dispose()
      renderer.domElement.removeEventListener('pointerup', pick)
      layersRef.current.forEach((layer) => layer.group.traverse((object) => {
        if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose() }
      }))
      line.geometry.dispose()
      lineMaterial.dispose()
      pulse.geometry.dispose()
      pulseMaterial.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    const rendererScene = sceneRef.current
    if (!rendererScene) return
    layersRef.current.forEach((layer) => {
      rendererScene.remove(layer.group)
      layer.group.traverse((object) => {
        if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose() }
      })
    })
    layersRef.current = LAYER_X.map((_, stage) => buildLayer(stage, run, theme))
    layersRef.current.forEach((layer) => rendererScene.add(layer.group))
  }, [run, theme])

  useEffect(() => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    camera.position.copy(CAMERA)
    controls.target.set(0, 0, 0)
    controls.autoRotate = true
    controls.update()
  }, [resetId])

  return <div ref={mountRef} className="transformer-scene" aria-label="Arquitetura tridimensional e interativa do Transformer" />
}
