import { Canvas } from '@react-three/fiber'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import World from './game/World'
import RemotePlayers from './game/RemotePlayers'
import { setLocalName, startNet, stopNet } from './net/network'
import Player, { spawnAt } from './game/Player'
import MobileControls from './ui/MobileControls'
import Hud from './ui/Hud'
import { installKeyboard, rotateCamera } from './input/input'
import { setMenu, setPanel, ui } from './core/interaction'
import { startWallet, stopWallet } from './economy/wallet'
import { startLands, stopLands } from './land/lands'
import { startJobs, stopJobs } from './jobs/jobs'
import { useAuth } from './auth/AuthContext'
import AuthScreen from './auth/AuthScreen'
import { getSupabase } from './auth/client'
import { homeStatus, homeSubscribe, homes, loadHome, refreshHomes, resetHomes } from './core/homes'

type Quality = 'low' | 'medium' | 'high'
const Q = {
  low: { dpr: 0.75, shadows: false, shadowMap: 512, aa: false },
  medium: { dpr: 1, shadows: true, shadowMap: 1024, aa: true },
  high: { dpr: Math.min(2, window.devicePixelRatio || 1), shadows: true, shadowMap: 2048, aa: true }
}
function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
}

export default function App() {
  const [quality, setQuality] = useState<Quality>('medium')
  const touch = useRef('ontouchstart' in window || navigator.maxTouchPoints > 0).current
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)
  const q = Q[quality]
  const auth = useAuth()
  const hs = useSyncExternalStore(homeSubscribe, homeStatus)
  const [tries, setTries] = useState(0)
  const needsHome = auth.status === 'signedIn' && !!auth.profile
  const inGame = auth.status === 'guest' || (needsHome && hs === 'ready')

  // Setelah login: klaim rumah (idempotent), muat daftar rumah, lalu spawn di depan rumah sendiri.
  useEffect(() => {
    const sb = getSupabase()
    if (!needsHome || !sb) { resetHomes(); return }
    let alive = true
    void loadHome(sb).then((sp) => { if (alive && sp) spawnAt(sp.x, sp.z, Math.PI) })
    return () => { alive = false }
  }, [needsHome, auth.profile?.id, tries])
  // Dompet: dimuat dari database setelah login dan rumah siap (tamu tidak punya dompet).
  useEffect(() => {
    if (!inGame || auth.status !== 'signedIn') return
    void startWallet(); void startLands(); void startJobs()
    return () => { stopWallet(); stopLands(); stopJobs() }
  }, [inGame, auth.status])
  // Multiplayer: sambung ke game server setelah masuk game, putus saat keluar.
  const guestName = useRef('Tamu' + Math.floor(1000 + Math.random() * 9000)).current
  useEffect(() => {
    if (!inGame) return
    const guest = auth.status === 'guest'
    setLocalName(guest ? guestName : auth.profile?.display_name ?? '')
    startNet(guest ? 'guest' : 'user', guestName)
    return () => stopNet()
  }, [inGame, auth.status, auth.profile?.display_name, guestName])
  useEffect(() => {
    const sb = getSupabase()
    if (hs !== 'ready' || !sb) return
    const t = window.setInterval(() => { void refreshHomes(sb) }, 30000)
    return () => window.clearInterval(t)
  }, [hs])

  useEffect(() => { if (inGame) return installKeyboard() }, [inGame])
  useEffect(() => {
    if (!inGame) return
    const k = (e: KeyboardEvent) => { if (e.code === 'Escape') { if (ui.panel) setPanel(null); else setMenu(!ui.menu) } }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [inGame])

  if (auth.status === 'signedIn' && !auth.profile) {
    return <div style={{ padding: 24, fontFamily: 'system-ui,sans-serif' }}><p>{auth.profileError ?? 'Memuat profil...'}</p>{auth.profileError && <button onClick={() => void auth.signOut()}>Keluar</button>}</div>
  }
  if (needsHome && hs !== 'ready') {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: 'system-ui,sans-serif', background: 'linear-gradient(#9fd3f0,#cfe9c4)' }}>
        <div style={{ background: '#fff', padding: 24, borderRadius: 14, maxWidth: 360, textAlign: 'center' }}>
          {hs === 'error' ? <><p>{homes.error}</p><button onClick={() => setTries((t) => t + 1)}>Coba lagi</button> <button onClick={() => void auth.signOut()}>Keluar</button></> : <p>Menyiapkan rumahmu...</p>}
        </div>
      </div>
    )
  }
  if (!inGame) return <AuthScreen />
  if (!hasWebGL()) return <div style={{ padding: 24, fontSize: 18 }}>Browser kamu tidak mendukung WebGL, atau akselerasi grafis dimatikan. Coba Chrome atau Firefox terbaru dan aktifkan hardware acceleration.</div>

  return (
    <div style={{ position: 'absolute', inset: 0 }} onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => { if (e.target instanceof HTMLCanvasElement) drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY } }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d || d.id !== e.pointerId) return
        rotateCamera(e.clientX - d.x, e.clientY - d.y)
        d.x = e.clientX; d.y = e.clientY
      }}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
      <Canvas key={quality} shadows={q.shadows} dpr={q.dpr} camera={{ fov: 60, near: 0.1, far: 260 }} gl={{ antialias: q.aa }}>
        <color attach="background" args={['#9fd3f0']} />
        <fog attach="fog" args={['#9fd3f0', 90, 200]} />
        <hemisphereLight args={['#ffffff', '#6fae4f', 0.75]} />
        <directionalLight position={[30, 50, 20]} intensity={1.1} castShadow={q.shadows}
          shadow-mapSize={[q.shadowMap, q.shadowMap]} shadow-camera-left={-45} shadow-camera-right={45}
          shadow-camera-top={45} shadow-camera-bottom={-45} shadow-camera-far={160} />
        <World />
        <RemotePlayers />
        <Player />
      </Canvas>
      <Hud quality={quality} setQuality={setQuality} touch={touch} />
      {touch && <MobileControls />}
    </div>
  )
}
