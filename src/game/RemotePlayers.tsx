import { useRef, useSyncExternalStore } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Character, { CharState } from './Character'
import NameTag from './NameTag'
import { net, netSubscribe, remotesVersion, sampleRemote } from '../net/network'

function RemoteAvatar({ pid }: { pid: number }) {
  const r = net.remotes.get(pid)
  const g = useRef<THREE.Group>(null), m = useRef<THREE.Group>(null), out = useRef({ x: 0, y: 0, z: 0, f: 0 })
  useFrame(() => {
    if (!r || !g.current || !m.current) return
    if (sampleRemote(r, performance.now(), out.current)) {
      g.current.position.set(out.current.x, out.current.y, out.current.z); m.current.rotation.y = out.current.f
    }
  })
  const st = useRef<CharState>(r?.state ?? { speed: 0, grounded: true, action: 'none', expression: 'normal' })
  if (!r) return null
  st.current = r.state
  return <group ref={g}><group ref={m}><Character state={st} shirt={r.shirt} /></group><NameTag text={r.disc ? r.name + ' (terputus)' : r.name} /></group>
}

// Karakter pemain lain: berasal dari sesi multiplayer sungguhan di server, bukan dekorasi.
export default function RemotePlayers() {
  useSyncExternalStore(netSubscribe, remotesVersion)
  return <>{[...net.remotes.keys()].map((pid) => <RemoteAvatar key={pid} pid={pid} />)}</>
}
