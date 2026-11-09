import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export type Expression = 'normal' | 'senang' | 'sedih' | 'bingung' | 'marah'
export type Action = 'none' | 'greeting' | 'interacting' | 'working'
export interface CharState { speed: number; grounded: boolean; action: Action; expression: Expression }
interface Props { state: React.MutableRefObject<CharState>; shirt?: string; skin?: string }

const mouth: Record<Expression, { w: number; h: number; y: number; rot: number }> = {
  normal: { w: 0.22, h: 0.04, y: -0.2, rot: 0 },
  senang: { w: 0.3, h: 0.07, y: -0.19, rot: 0 },
  sedih: { w: 0.2, h: 0.04, y: -0.23, rot: 0.25 },
  bingung: { w: 0.14, h: 0.05, y: -0.22, rot: -0.35 },
  marah: { w: 0.22, h: 0.04, y: -0.23, rot: -0.15 }
}

// Karakter balok. Animasi: idle, walk, run, jump, interacting, working, greeting. Ekspresi dibaca dari state tiap frame.
export default function Character({ state, shirt = '#3f7fbf', skin = '#f0c9a0' }: Props) {
  const lArm = useRef<THREE.Group>(null), rArm = useRef<THREE.Group>(null)
  const lLeg = useRef<THREE.Group>(null), rLeg = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null), mouthRef = useRef<THREE.Mesh>(null)
  const phase = useRef(0)

  useFrame((_, dt) => {
    const s = state.current, t = performance.now() / 1000
    const moving = Math.min(1, s.speed / 4)
    phase.current += dt * (4 + s.speed * 1.4)
    const swing = s.grounded ? Math.sin(phase.current) * 0.8 * moving : 0.9
    const idle = Math.sin(t * 2) * 0.04 * (1 - moving)
    let la = swing + idle, ra = -swing - idle
    if (s.action === 'greeting') ra = -2.7 + Math.sin(t * 10) * 0.35
    else if (s.action === 'interacting') { la = -1.1; ra = -1.1 }
    else if (s.action === 'working') { ra = -1 + Math.sin(t * 8) * 0.7; la = -0.5 + Math.sin(t * 8 + Math.PI) * 0.3 }
    if (lArm.current && rArm.current && lLeg.current && rLeg.current && body.current) {
      lArm.current.rotation.x = la; rArm.current.rotation.x = ra
      lLeg.current.rotation.x = -swing; rLeg.current.rotation.x = swing
      body.current.position.y = s.grounded ? Math.abs(Math.sin(phase.current)) * 0.05 * moving : 0
    }
    if (mouthRef.current) {
      const m = mouth[s.action === 'greeting' ? 'senang' : s.expression]
      mouthRef.current.position.y = m.y
      mouthRef.current.scale.set(m.w / 0.22, m.h / 0.04, 1)
      mouthRef.current.rotation.z = m.rot
    }
  })

  return (
    <group ref={body}>
      <mesh castShadow position={[0, 1.05, 0]}><boxGeometry args={[0.7, 0.9, 0.4]} /><meshStandardMaterial color={shirt} flatShading /></mesh>
      <group position={[0, 1.8, 0]}>
        <mesh castShadow><boxGeometry args={[0.62, 0.62, 0.62]} /><meshStandardMaterial color={skin} flatShading /></mesh>
        <mesh position={[-0.15, 0.06, 0.32]}><boxGeometry args={[0.1, 0.12, 0.02]} /><meshBasicMaterial color="#222" /></mesh>
        <mesh position={[0.15, 0.06, 0.32]}><boxGeometry args={[0.1, 0.12, 0.02]} /><meshBasicMaterial color="#222" /></mesh>
        <mesh ref={mouthRef} position={[0, -0.2, 0.32]}><boxGeometry args={[0.22, 0.04, 0.02]} /><meshBasicMaterial color="#7a2c2c" /></mesh>
        <mesh position={[0, 0.34, 0]}><boxGeometry args={[0.66, 0.14, 0.66]} /><meshStandardMaterial color="#4a3426" flatShading /></mesh>
      </group>
      <group ref={lArm} position={[-0.47, 1.45, 0]}><mesh castShadow position={[0, -0.4, 0]}><boxGeometry args={[0.2, 0.8, 0.2]} /><meshStandardMaterial color={skin} flatShading /></mesh></group>
      <group ref={rArm} position={[0.47, 1.45, 0]}><mesh castShadow position={[0, -0.4, 0]}><boxGeometry args={[0.2, 0.8, 0.2]} /><meshStandardMaterial color={skin} flatShading /></mesh></group>
      <group ref={lLeg} position={[-0.18, 0.6, 0]}><mesh castShadow position={[0, -0.3, 0]}><boxGeometry args={[0.28, 0.6, 0.3]} /><meshStandardMaterial color="#35465a" flatShading /></mesh></group>
      <group ref={rLeg} position={[0.18, 0.6, 0]}><mesh castShadow position={[0, -0.3, 0]}><boxGeometry args={[0.28, 0.6, 0.3]} /><meshStandardMaterial color="#35465a" flatShading /></mesh></group>
    </group>
  )
}
