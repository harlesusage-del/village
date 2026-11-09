import { useEffect, useMemo, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { BRIDGE, BUILDINGS, Building, HOUSE, LAPANGAN, PADDIES, PLOTS, Plot, ROADS, STALLS } from '../core/layout'
import { landsSubscribe, landsVersion, lands } from '../land/lands'
import { Home, homeSubscribe, homeVersion, homes } from '../core/homes'

const M = (props: { c: string }) => <meshStandardMaterial color={props.c} flatShading />
const SQ = 1.414
// Atap limas: group diskalakan setelah kerucut diputar 45 derajat agar sisinya sejajar dinding.
function Roof({ w, d, y, h, c }: { w: number; d: number; y: number; h: number; c: string }) {
  return <group position={[0, y + h / 2, 0]} scale={[w / SQ, h, d / SQ]}><mesh rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[1, 1, 4]} /><M c={c} /></mesh></group>
}
function Box({ p, s, c, shadow }: { p: [number, number, number]; s: [number, number, number]; c: string; shadow?: boolean }) {
  return <mesh position={p} castShadow={shadow} receiveShadow><boxGeometry args={s} /><M c={c} /></mesh>
}

function NamePlate({ text, mine, y, z }: { text: string; mine: boolean; y: number; z: number }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64
    const g = c.getContext('2d')!
    g.fillStyle = mine ? '#2f7d4f' : '#f4efe0'; g.fillRect(0, 0, 256, 64)
    g.fillStyle = mine ? '#ffffff' : '#2a2a2a'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(text, 128, 34, 236)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [text, mine])
  useEffect(() => () => tex.dispose(), [tex])
  return <mesh position={[0, y, z]}><planeGeometry args={[2.6, 0.65]} /><meshBasicMaterial map={tex} /></mesh>
}
function House({ b, plate }: { b: Building; plate?: { text: string; mine: boolean } }) {
  return (
    <group position={[b.x, 0, b.z]}>
      <Box p={[0, b.h / 2, 0]} s={[b.w, b.h, b.d]} c={b.color} shadow />
      <Roof w={b.w * 1.2} d={b.d * 1.2} y={b.h} h={2.2} c="#8b3a2f" />
      <Box p={[0, 0.9, b.d / 2 + 0.02]} s={[0.9, 1.8, 0.06]} c="#5a3b24" />
      <Box p={[-1.8, 1.9, b.d / 2 + 0.02]} s={[0.8, 0.8, 0.06]} c="#bfe3f5" />
      <Box p={[1.8, 1.9, b.d / 2 + 0.02]} s={[0.8, 0.8, 0.06]} c="#bfe3f5" />
      {plate && <NamePlate text={plate.text} mine={plate.mine} y={2.95} z={b.d / 2 + 0.05} />}
    </group>
  )
}
function Balai({ b }: { b: Building }) {
  return (
    <group position={[b.x, 0, b.z]}>
      <Box p={[0, b.h / 2, 0]} s={[b.w, b.h, b.d]} c={b.color} shadow />
      <Roof w={b.w * 1.1} d={b.d * 1.25} y={b.h} h={2.8} c="#a84a32" />
      <Box p={[0, 4.75, b.d / 2 + 1]} s={[b.w, 0.25, 2.2]} c="#a84a32" shadow />
      {[-6, -2, 2, 6].map((x) => <Box key={x} p={[x, 2.3, b.d / 2 + 1.7]} s={[0.5, 4.6, 0.5]} c="#f4efe0" shadow />)}
      <Box p={[0, 1.4, b.d / 2 + 0.03]} s={[2.4, 2.8, 0.06]} c="#5a3b24" />
      <Box p={[10, 4, 4]} s={[0.15, 8, 0.15]} c="#777" />
      <Box p={[10.75, 7.4, 4]} s={[1.4, 0.9, 0.05]} c="#d62828" />
    </group>
  )
}
function Warung({ b }: { b: Building }) {
  return (
    <group position={[b.x, 0, b.z]}>
      <Box p={[0, b.h / 2, 0]} s={[b.w, b.h, b.d]} c={b.color} shadow />
      <Roof w={b.w * 1.2} d={b.d * 1.2} y={b.h} h={1.6} c="#7a4a2a" />
      <mesh position={[0, 2.7, b.d / 2 + 0.8]} rotation={[0.3, 0, 0]} castShadow><boxGeometry args={[b.w, 0.12, 2]} /><M c="#d94f4f" /></mesh>
      <Box p={[0, 1.1, b.d / 2 + 0.03]} s={[1.2, 2.2, 0.06]} c="#5a3b24" />
    </group>
  )
}
const AWN = ['#e4572e', '#f3a712', '#29335c', '#669bbc', '#7fb069', '#d65db1']
function Stalls() {
  return <>{STALLS.map((s, i) => (
    <group key={i} position={[s.x, 0, s.z]}>
      <Box p={[0, 0.5, 0]} s={[4, 1, 1.6]} c="#a9743f" shadow />
      <Box p={[-1.8, 1.3, -0.9]} s={[0.12, 2.6, 0.12]} c="#6b4a2b" />
      <Box p={[1.8, 1.3, -0.9]} s={[0.12, 2.6, 0.12]} c="#6b4a2b" />
      <mesh position={[0, 2.7, -0.1]} rotation={[0.25, 0, 0]} castShadow><boxGeometry args={[4.4, 0.12, 2.6]} /><M c={AWN[i % AWN.length]} /></mesh>
    </group>
  ))}</>
}
export function Buildings() {
  return <>{BUILDINGS.map((b, i) => b.kind === 'balai' ? <Balai key={i} b={b} /> : <Warung key={i} b={b} />)}<Stalls /></>
}

export function Roads() {
  return <>{ROADS.map((r, i) => <Box key={i} p={[r.x, r.stone ? 0.04 + (i === 3 ? 0.005 : 0) : 0.03, r.z]} s={[r.w, 0.06, r.d]} c={r.stone ? '#8d8d92' : '#b89a6a'} />)}
    <Box p={[LAPANGAN.x, 0.04, LAPANGAN.z]} s={[LAPANGAN.w, 0.06, LAPANGAN.d]} c="#92d46b" />
    <Box p={[LAPANGAN.x, 0.08, LAPANGAN.z]} s={[0.2, 0.04, LAPANGAN.d - 1]} c="#ffffff" />
    <Box p={[LAPANGAN.x, 0.08, LAPANGAN.z - LAPANGAN.d / 2 + 0.5]} s={[LAPANGAN.w - 1, 0.04, 0.2]} c="#ffffff" />
    <Box p={[LAPANGAN.x, 0.08, LAPANGAN.z + LAPANGAN.d / 2 - 0.5]} s={[LAPANGAN.w - 1, 0.04, 0.2]} c="#ffffff" /></>
}

const SIGN = { rumah: '#4f81bd', perdagangan: '#e0a030', pertanian: '#6aa84f', usaha: '#8e5bb5', perkebunan: '#2e7d32', peternakan: '#a1887f', kosong: '#9e9e9e' }
export function Homes() {
  useSyncExternalStore(homeSubscribe, homeVersion)
  return <>{homes.list.map((h: Home) => {
    const p = PLOTS.find((q) => q.id === h.slot_id)
    return p ? <House key={h.slot_id} b={{ kind: 'house', x: p.x, z: p.z, ...HOUSE, color: h.color }} plate={{ text: h.owner_name, mine: h.is_mine }} /> : null
  })}</>
}

function Sign({ p }: { p: Plot }) {
  return <><Box p={[0, 0.8, p.d / 2 - 1]} s={[0.15, 1.6, 0.15]} c="#6b4a2b" /><Box p={[0, 1.7, p.d / 2 - 1]} s={[1, 0.55, 0.1]} c={SIGN[p.type]} /></>
}
// Papan lahan: kosong = papan berwarna sesuai jenis; dimiliki = papan nama pemilik; dijual = tambahan papan oranye.
function LandMarker({ p }: { p: Plot }) {
  const land = lands.byId.get(p.id)
  const taken = !!land && !!land.owner_name && land.status !== 'tidak_dijual' && land.status !== 'desa'
  return (
    <>
      <Box p={[0, 0.8, p.d / 2 - 1]} s={[0.15, 1.6, 0.15]} c="#6b4a2b" />
      {taken ? <NamePlate text={land!.owner_name!} mine={land!.is_mine} y={1.7} z={p.d / 2 - 0.85} /> : <Box p={[0, 1.7, p.d / 2 - 1]} s={[1, 0.55, 0.1]} c={SIGN[p.type]} />}
      {land?.status === 'dijual' && <Box p={[0, 2.25, p.d / 2 - 1]} s={[0.9, 0.3, 0.1]} c="#ff9800" />}
    </>
  )
}
export function Plots() {
  useSyncExternalStore(homeSubscribe, homeVersion)
  useSyncExternalStore(landsSubscribe, landsVersion)
  const owned = new Set(homes.list.map((h) => h.slot_id))
  return <>{PLOTS.map((p) => {
    const st = lands.byId.get(p.id)?.status
    const ground = p.house || owned.has(p.id) ? '#d8cfa8' : st === 'milik_saya' ? '#a5d6a7' : st === 'dimiliki' || st === 'dijual' ? '#e0c9a6' : '#cfe0a0'
    return (
      <group key={p.id} position={[p.x, 0, p.z]}>
        <Box p={[0, 0.035, 0]} s={[p.w - 0.6, 0.05, p.d - 0.6]} c={ground} />
        {!p.house && p.type === 'rumah' && !owned.has(p.id) && <Sign p={p} />}
        {!p.house && p.type !== 'rumah' && <LandMarker p={p} />}
      </group>
    )
  })}</>
}

export function Fields() {
  const rice = useMemo(() => {
    const out: THREE.Matrix4[] = []
    for (const f of PADDIES) for (let x = -f.w / 2 + 1.2; x < f.w / 2 - 0.8; x += 1.1) for (let z = -f.d / 2 + 1.2; z < f.d / 2 - 0.8; z += 1.1)
      out.push(new THREE.Matrix4().makeTranslation(f.x + x, 0.62, f.z + z))
    return out
  }, [])
  return (
    <>
      {PADDIES.map((f, i) => (
        <group key={i} position={[f.x, 0, f.z]}>
          <Box p={[0, 0.12, 0]} s={[f.w, 0.24, f.d]} c="#7a6540" />
          <Box p={[0, 0.27, 0]} s={[f.w - 1, 0.1, f.d - 1]} c="#8fc25a" />
        </group>
      ))}
      <instancedMesh args={[undefined, undefined, rice.length]} frustumCulled={false}
        ref={(m) => { if (m) { rice.forEach((mt, i) => m.setMatrixAt(i, mt)); m.instanceMatrix.needsUpdate = true } }}>
        <boxGeometry args={[0.12, 0.7, 0.12]} /><meshStandardMaterial color="#c9d84a" flatShading />
      </instancedMesh>
    </>
  )
}

export function Bridge() {
  const len = BRIDGE.halfLen * 2
  return (
    <group position={[BRIDGE.x, 0, BRIDGE.z]}>
      <Box p={[0, 0, 0]} s={[BRIDGE.halfW * 2 - 0.2, 0.3, len]} c="#a9743f" shadow />
      <Box p={[-2.4, 0.75, 0]} s={[0.3, 1.2, len]} c="#6b4a2b" shadow />
      <Box p={[2.4, 0.75, 0]} s={[0.3, 1.2, len]} c="#6b4a2b" shadow />
    </group>
  )
}
