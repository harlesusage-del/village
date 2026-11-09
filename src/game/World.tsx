import { useMemo } from 'react'
import * as THREE from 'three'
import { HALF_W, TREES, riverZ } from '../core/layout'
import { WORLD_SIZE, heightAt, smooth } from '../core/world'
import { Bridge, Buildings, Fields, Homes, Plots, Roads } from './Buildings'
import { Crops, WorkBeacon } from './Crops'

function Terrain() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 200, 200)
    g.rotateX(-Math.PI / 2)
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z)
      pos.setY(i, h)
      const bank = 1 - smooth(HALF_W + 0.5, HALF_W + 3.5, Math.abs(z - riverZ(x)))
      const v = 0.04 * Math.sin(x * 0.7) * Math.cos(z * 0.6)
      c.setRGB(0.47 + v, 0.75 + v, 0.35).lerp(new THREE.Color('#d6c58a'), bank * 0.8).lerp(new THREE.Color('#5f9a45'), Math.min(1, Math.abs(h) / 5))
      col.set([c.r, c.g, c.b], i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.computeVertexNormals()
    return g
  }, [])
  return <mesh geometry={geo} receiveShadow><meshStandardMaterial vertexColors flatShading /></mesh>
}

function Water() {
  const geo = useMemo(() => {
    const pts: number[] = [], idx: number[] = []
    const hw = HALF_W + 1.2
    for (let x = -100, i = 0; x <= 100; x += 4, i++) {
      pts.push(x, -0.35, riverZ(x) - hw, x, -0.35, riverZ(x) + hw)
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setIndex(idx); g.computeVertexNormals()
    return g
  }, [])
  return <mesh geometry={geo}><meshStandardMaterial color="#4aa3d8" transparent opacity={0.85} side={THREE.DoubleSide} /></mesh>
}

function Trees() {
  const { trunks, crowns } = useMemo(() => ({
    trunks: TREES.map((t) => new THREE.Matrix4().compose(new THREE.Vector3(t.x, heightAt(t.x, t.z) + t.s, t.z), new THREE.Quaternion(), new THREE.Vector3(t.s, t.s * 2, t.s))),
    crowns: TREES.map((t) => new THREE.Matrix4().compose(new THREE.Vector3(t.x, heightAt(t.x, t.z) + t.s * 3, t.z), new THREE.Quaternion(), new THREE.Vector3(t.s, t.s, t.s)))
  }), [])
  const fill = (list: THREE.Matrix4[]) => (m: THREE.InstancedMesh | null) => {
    if (m) { list.forEach((mat, i) => m.setMatrixAt(i, mat)); m.instanceMatrix.needsUpdate = true }
  }
  return (
    <>
      <instancedMesh args={[undefined, undefined, TREES.length]} ref={fill(trunks)} castShadow frustumCulled={false}><boxGeometry args={[0.4, 1, 0.4]} /><meshStandardMaterial color="#7a5230" flatShading /></instancedMesh>
      <instancedMesh args={[undefined, undefined, TREES.length]} ref={fill(crowns)} castShadow frustumCulled={false}><coneGeometry args={[1.6, 3, 6]} /><meshStandardMaterial color="#3d8a4a" flatShading /></instancedMesh>
    </>
  )
}

export default function World() {
  return (
    <>
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[1200, 1200]} /><meshStandardMaterial color="#6fae4f" /></mesh>
      <Terrain /><Water /><Roads /><Plots /><Fields /><Buildings /><Homes /><Crops /><WorkBeacon /><Bridge /><Trees />
    </>
  )
}
