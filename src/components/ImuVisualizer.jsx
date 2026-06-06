import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'

export default function ImuVisualizer({ roll = 0, pitch = 0, yaw = 0 }) {
  const mountRef = useRef(null)
  const targetRef = useRef({ roll, pitch, yaw })

  useEffect(() => {
    targetRef.current = { roll, pitch, yaw }
  }, [roll, pitch, yaw])

  useEffect(() => {
    const el = mountRef.current
    const W = el.clientWidth
    const H = 340 

    const OBJ_SCALE = 0.005 
    const GLB_SCALE = 5.0  
    const MODEL_Y_POSITION = -1.0 

    // ── Scene, Camera, Renderer ──────────────────────────────
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf5f5f5)

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100)
    camera.position.set(0, -0.2, 0.4)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(W, H)
    renderer.shadowMap.enabled = true
    el.appendChild(renderer.domElement)

    // ── Lights ───────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.8))
    const dirLight = new THREE.DirectionalLight(0xffffff, 1)
    dirLight.position.set(5, 10, 7)
    dirLight.castShadow = true
    scene.add(dirLight)

    // ── OBJ Model Setup (Centered & Anchored) ────────────────
    const headPivot = new THREE.Group()
    
    // 👇 THIS is your master anchor point. 
    // Change this to move the whole OBJ and its rotation center anywhere.
    headPivot.position.set(0, -0.13, 0.015) 
    scene.add(headPivot)

    const objLoader = new OBJLoader()
    objLoader.load(
      '/model.obj', 
      (obj) => {
        // 1. Scale first so bounding box calculations are accurate
        obj.scale.set(OBJ_SCALE, OBJ_SCALE, OBJ_SCALE)
        
        // 2. Auto-center the geometry perfectly onto the pivot
        const box = new THREE.Box3().setFromObject(obj)
        const center = new THREE.Vector3()
        box.getCenter(center)
        obj.position.sub(center) 
        obj.position.z += 0.02;
        
        // 3. Apply Materials
        obj.traverse((child) => {
          if (child.isMesh) {
            child.material = new THREE.MeshStandardMaterial({ 
              color: 0x2196f3,
              wireframe: true,
              transparent: true,
              opacity: 0.3
            })
            child.castShadow = true
          }
        })
        headPivot.add(obj)
      },
      undefined,
      (error) => console.error("Error loading OBJ:", error)
    )

    // ── GLB Model Setup (Rigged + Draco) ─────────────────────
    let headBone = null 
    let initialHeadRot = null // Stores the rig's default posture
    
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
    
    const gltfLoader = new GLTFLoader()
    gltfLoader.setDRACOLoader(dracoLoader)

    gltfLoader.load(
      '/uploads_files_2582366_F010.glb', 
      (gltf) => {
        const glbModel = gltf.scene
        
        glbModel.position.set(0, MODEL_Y_POSITION, 0) 
        glbModel.scale.set(GLB_SCALE, GLB_SCALE, GLB_SCALE)

        glbModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true
            child.receiveShadow = true
          }
          
          if (child.isBone && child.name.toLowerCase().includes('head')) {
            console.log("Found bone:", child.name) 
            headBone = child
            // Clone and save the exact starting rotation so it doesn't look down
            initialHeadRot = child.rotation.clone() 
          }
        })

        scene.add(glbModel)
      }, 
      undefined, 
      (error) => console.error("Error loading GLB:", error)
    )

    // ── Animation Loop ───────────────────────────────────────
    let raf
    // ── Animation Loop ───────────────────────────────────────
      const animate = () => {
        raf = requestAnimationFrame(animate)

        // 1. Define a sensitivity (0.1 = 10% movement, 0.5 = 50% movement)
        const SENSITIVITY = 0.02

        const tr = targetRef.current.roll * SENSITIVITY
        const tp = targetRef.current.pitch * SENSITIVITY
        const ty = targetRef.current.yaw * SENSITIVITY*5

        // 2. Animate OBJ Pivot
        headPivot.rotation.z = THREE.MathUtils.lerp(headPivot.rotation.z, -tr, 0.07)
        headPivot.rotation.x = THREE.MathUtils.lerp(headPivot.rotation.x,  tp, 0.07)
        headPivot.rotation.y = THREE.MathUtils.lerp(headPivot.rotation.y, -ty, 0.07)

        // 3. Animate the Head Bone
        if (headBone && initialHeadRot) {
          const targetZ = initialHeadRot.z - tr
          const targetX = initialHeadRot.x + tp
          const targetY = initialHeadRot.y - ty

          headBone.rotation.z = THREE.MathUtils.lerp(headBone.rotation.z, targetZ, 0.07)
          headBone.rotation.x = THREE.MathUtils.lerp(headBone.rotation.x, targetX, 0.07)
          headBone.rotation.y = THREE.MathUtils.lerp(headBone.rotation.y, targetY, 0.07)
        }

        renderer.render(scene, camera)
      }
    animate()

    // ── Resize & Cleanup ─────────────────────────────────────
    const onResize = () => {
      if (!el) return
      const W2 = el.clientWidth
      camera.aspect = W2 / H
      camera.updateProjectionMatrix()
      renderer.setSize(W2, H)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      dracoLoader.dispose()
      if (el && el.contains(renderer.domElement)) {
        el.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: 340 }}>
      <div
        ref={mountRef}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}