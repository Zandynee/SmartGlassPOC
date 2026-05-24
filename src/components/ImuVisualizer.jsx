// ─────────────────────────────────────────────
//  ImuVisualizer.jsx  –  Three.js viewport
//  Loads a .obj file from /public/model.obj.
//  Falls back to a box if the file is missing.
// ─────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'

const toRad = (d) => (d * Math.PI) / 180

/** Path to the OBJ file served from /public */
const OBJ_PATH = '/model.obj'

/**
 * Centres + normalises the loaded object so it always
 * fits nicely in the viewport regardless of original scale.
 */
function normalise(obj) {
  const box    = new THREE.Box3().setFromObject(obj)
  const center = box.getCenter(new THREE.Vector3())
  const size   = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const scale  = 2.4 / maxDim

  obj.scale.setScalar(scale)
  obj.position.copy(center).multiplyScalar(-scale)
}

/**
 * Apply a shared material to every mesh in a group so the
 * model still looks good even when the OBJ has no .mtl.
 */
function applyMaterial(obj, mat) {
  obj.traverse((child) => {
    if (child.isMesh) {
      child.material   = mat
      child.castShadow = true
    }
  })
}

/** Fallback board geometry (original behaviour) */
function makeFallbackBoard() {
  const group = new THREE.Group()

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.2, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x2a2d3e, roughness: 0.35, metalness: 0.25 })
  )
  box.castShadow    = true
  box.receiveShadow = true
  group.add(box)

  const mkArrow = (color, dir, len) =>
    new THREE.ArrowHelper(
      dir.clone().normalize(),
      new THREE.Vector3(0, 0.1, 0),
      len, color, 0.22, 0.12
    )
  group.add(mkArrow(0xee2233, new THREE.Vector3(1, 0, 0), 1.4))
  group.add(mkArrow(0x22bb44, new THREE.Vector3(0, 1, 0), 1.4))
  group.add(mkArrow(0x2266ee, new THREE.Vector3(0, 0, 1), 1.4))

  return group
}

export function ImuVisualizer({ roll = 0, pitch = 0, yaw = 0 }) {
  const mountRef  = useRef(null)
  const targetRef = useRef({ roll: 0, pitch: 0, yaw: 0 })
  const [loadState, setLoadState] = useState('loading') // 'loading' | 'ok' | 'fallback'

  // Keep target angles in sync without restarting the renderer
  useEffect(() => {
    targetRef.current = {
      roll:  toRad(roll),
      pitch: toRad(pitch),
      yaw:   toRad(yaw),
    }
  }, [roll, pitch, yaw])

  useEffect(() => {
    const el = mountRef.current
    const W  = el.clientWidth
    const H  = el.clientHeight

    // ── Scene ──────────────────────────────────────
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xfafafa)

    const grid = new THREE.GridHelper(12, 12, 0xdddddd, 0xdddddd)
    grid.position.y = -2.2
    scene.add(grid)

    // ── Camera ─────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100)
    camera.position.set(0, 3.0, 6.0)
    camera.lookAt(0, 0, 0)

    // ── Renderer ───────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)

    // ── Lighting ───────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.75))

    const key = new THREE.DirectionalLight(0xffffff, 1.4)
    key.position.set(5, 8, 5)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.near = 0.5
    key.shadow.camera.far  = 40
    scene.add(key)

    const fill = new THREE.DirectionalLight(0xddeeff, 0.5)
    fill.position.set(-5, 3, 2)
    scene.add(fill)

    const rim = new THREE.DirectionalLight(0xfff8e0, 0.35)
    rim.position.set(0, -2, -6)
    scene.add(rim)

    // ── Ground shadow catcher ──────────────────────
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 1.0 })
    )
    ground.rotation.x  = -Math.PI / 2
    ground.position.y  = -2.2
    ground.receiveShadow = true
    scene.add(ground)

    // ── Board group (pivot for roll/pitch/yaw) ─────
    const board = new THREE.Group()
    scene.add(board)

    // ── Axis arrows ───────────────────────────────
    const mkArrow = (color, dir, len) =>
      new THREE.ArrowHelper(
        dir.clone().normalize(),
        new THREE.Vector3(0, 0, 0),
        len, color, 0.22, 0.12
      )
    const axisGroup = new THREE.Group()
    axisGroup.add(mkArrow(0xee2233, new THREE.Vector3(1, 0, 0), 1.5))
    axisGroup.add(mkArrow(0x22bb44, new THREE.Vector3(0, 1, 0), 1.5))
    axisGroup.add(mkArrow(0x2266ee, new THREE.Vector3(0, 0, 1), 1.5))
    axisGroup.position.y = 0.15
    board.add(axisGroup)

    // ── Shared material for the OBJ ────────────────
    const objMaterial = new THREE.MeshStandardMaterial({
      color:     0x2a2d3e,
      roughness: 0.35,
      metalness: 0.30,
    })

    // ── Load OBJ ───────────────────────────────────
    let cancelled = false
    const loader = new OBJLoader()

    loader.load(
      OBJ_PATH,
      (obj) => {
        if (cancelled) return
        normalise(obj)
        applyMaterial(obj, objMaterial)
        board.add(obj)
        setLoadState('ok')
      },
      undefined,
      () => {
        if (cancelled) return
        const fallback = makeFallbackBoard()
        board.add(fallback)
        setLoadState('fallback')
      }
    )

    // ── Render loop ────────────────────────────────
    let raf
    const animate = () => {
      raf = requestAnimationFrame(animate)
      const { roll: tr, pitch: tp, yaw: ty } = targetRef.current
      board.rotation.z = THREE.MathUtils.lerp(board.rotation.z, -tr, 0.07)
      board.rotation.x = THREE.MathUtils.lerp(board.rotation.x,  tp, 0.07)
      board.rotation.y = THREE.MathUtils.lerp(board.rotation.y, -ty, 0.07)
      renderer.render(scene, camera)
    }
    animate()

    // ── Resize ────────────────────────────────────
    const onResize = () => {
      const W2 = el.clientWidth
      camera.aspect = W2 / H
      camera.updateProjectionMatrix()
      renderer.setSize(W2, H)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div style={{ position: 'relative', width: '40%', height: 340 }}>
      <div
        ref={mountRef}
        style={{ width: '100%', height: '100%' }}
        className="rounded-xl overflow-hidden border border-[var(--border)]"
      />

      {loadState === 'loading' && (
        <span
          style={{ position: 'absolute', bottom: 10, right: 12 }}
          className="text-[10px] font-mono opacity-50 text-[var(--text)]"
        >
          loading model…
        </span>
      )}

      {loadState === 'fallback' && (
        <span
          title="Place a .obj file at public/model.obj to replace this placeholder"
          style={{ position: 'absolute', bottom: 10, right: 12 }}
          className="text-[10px] font-mono opacity-50 text-[var(--text)] cursor-help"
        >
          ⚠ model.obj not found — using fallback
        </span>
      )}
    </div>
  )
}