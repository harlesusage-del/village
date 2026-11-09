import { useRef, useSyncExternalStore } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Character, { Action, CharState, Expression } from './Character'
import NameTag from './NameTag'
import { axis, endFrame, input, isRunning, wantsJump } from '../input/input'
import { cameraClip, groundAt, heightAt } from '../core/world'
import { stepSim } from '../core/movement'
import { saved } from '../core/playerState'
import { INTERACTABLES, Interactable, PLOTS } from '../core/layout'
import { setPanel, setPrompt, showToast, ui } from '../core/interaction'
import { msgOf, nameOf } from '../core/homes'
import { hooks, net, netEmote, netFrozen, netSubscribe, netTick, netVersion, takeCorrection } from '../net/network'

// State pemain di luar komponen agar tidak reset saat Canvas dibuat ulang (ganti kualitas grafis).
// Memindahkan pemain ke titik spawn (di depan rumahnya), kamera langsung menyusul tanpa meluncur.
export function spawnAt(x: number, z: number, facing: number) {
  const s = saved.sim
  s.x = x; s.z = z; s.y = groundAt(x, z); s.vy = 0; s.facing = facing; saved.camF = 1; saved.snap = true
  input.yaw = 0; input.pitch = 0.45
}
// Server berhak memindahkan pemain (misalnya setelah reconnect gagal). Selisih kecil diabaikan.
hooks.sync = (x, y, z, f) => {
  const s = saved.sim
  if (Math.hypot(x - s.x, z - s.z) > 1.5) { s.x = x; s.y = y; s.z = z; s.vy = 0; s.facing = f; saved.snap = true; saved.camF = 1 }
}
const CAM_DIST = 7
const EXPR: Expression[] = ['normal', 'senang', 'sedih', 'bingung', 'marah']

export default function Player() {
  useSyncExternalStore(netSubscribe, netVersion)
  const root = useRef<THREE.Group>(null), model = useRef<THREE.Group>(null)
  const st = useRef<CharState>({ speed: 0, grounded: true, action: 'none', expression: 'normal' })
  const until = useRef(0), sent = useRef({ a: 'none', e: 'normal' })
  const camTarget = useRef(new THREE.Vector3(0, 1.6, 6)), tmp = useRef(new THREE.Vector3())
  const setAction = (a: Action, sec: number) => { st.current.action = a; until.current = sec === Infinity ? Infinity : performance.now() + sec * 1000 }

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05), paused = ui.menu || ui.panel !== null || netFrozen(), s = saved.sim
    const c = takeCorrection()   // koreksi dari server (anti-cheat dan sinkronisasi)
    if (c) { s.x += c.dx; s.z += c.dz; if (c.snap) { s.y = c.y; s.vy = 0 } }
    const { x, y } = paused ? { x: 0, y: 0 } : axis()
    const inp = { ax: x, ay: y, yaw: input.yaw, run: isRunning(), jump: !paused && wantsJump() }
    const r = stepSim(s, inp, dt)   // logika sama dengan server (prediksi sisi klien)
    const mag = Math.min(1, Math.hypot(x, y))

    let near: Interactable | null = null, best = Infinity
    for (const it of INTERACTABLES) {
      const d = Math.hypot(s.x - it.x, s.z - it.z)
      if (d < it.r && d < best) { best = d; near = it }
    }
    setPrompt(near ? nameOf(near) : null)

    if (st.current.action !== 'none' && performance.now() > until.current) st.current.action = 'none'
    if (!paused) {
      if (input.emote === 'greeting') setAction('greeting', 1.8)
      if (input.emote === 'working') setAction(st.current.action === 'working' ? 'none' : 'working', Infinity)
      if (input.expr >= 0) st.current.expression = EXPR[input.expr]
      if (input.interact && near) {
        const pl = PLOTS.find((q) => q.id === near!.id)
        if (pl && pl.type !== 'rumah') setPanel('land', near.id)   // papan informasi lahan
        else showToast(msgOf(near))
        setAction('interacting', 1.2)
      }
      if (mag > 0.3 && st.current.action !== 'none') st.current.action = 'none'
    }
    if (sent.current.a !== st.current.action || sent.current.e !== st.current.expression) {
      sent.current = { a: st.current.action, e: st.current.expression }
      netEmote(st.current.action, st.current.expression)
    }
    st.current.speed = r.speed; st.current.grounded = r.grounded
    netTick(dt, inp, s, r.grounded)

    if (root.current) root.current.position.set(s.x, s.y, s.z)
    if (model.current) model.current.rotation.y = s.facing

    if (saved.snap) { camTarget.current.set(s.x, s.y + 1.6, s.z); saved.snap = false }
    camTarget.current.lerp(tmp.current.set(s.x, s.y + 1.6, s.z), Math.min(1, dt * 10))
    const t = camTarget.current, sy = Math.sin(input.yaw), cy = Math.cos(input.yaw), cp = Math.cos(input.pitch)
    const dx = sy * cp * CAM_DIST, dy = Math.sin(input.pitch) * CAM_DIST, dz = cy * cp * CAM_DIST
    const f = cameraClip(t.x, t.y, t.z, t.x + dx, t.y + dy, t.z + dz)
    saved.camF += (f - saved.camF) * Math.min(1, dt * (f < saved.camF ? 25 : 4))
    camera.position.set(t.x + dx * saved.camF, t.y + dy * saved.camF, t.z + dz * saved.camF)
    const minY = heightAt(camera.position.x, camera.position.z) + 0.5
    if (camera.position.y < minY) camera.position.y = minY
    camera.lookAt(t)
    endFrame()
  })

  return (
    <group ref={root}>
      <group ref={model}><Character state={st} shirt={net.shirt} /></group>
      {net.name && <NameTag text={net.name} />}
    </group>
  )
}
