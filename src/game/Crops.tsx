import { useSyncExternalStore } from 'react'
import { PLOTS } from '../core/layout'
import { jobs, jobsSubscribe, jobsVersion } from '../jobs/jobs'

const COLOR: Record<string, string> = { padi: '#9bc53d', jagung: '#e6c229', sayuran: '#3fa34d', cabai: '#d9381e' }
// Tanaman di petak lahan pertanian (dari server): ukuran mengikuti progres, emas saat siap panen.
export function Crops() {
  useSyncExternalStore(jobsSubscribe, jobsVersion)
  return <>{jobs.plantings.map((pl) => {
    const plot = PLOTS.find((p) => p.id === pl.land_id)
    if (!plot) return null
    const cols = Math.floor(plot.w / 4), rows = Math.floor(plot.d / 4)
    const col = pl.cell % cols, row = Math.floor(pl.cell / cols)
    if (row >= rows) return null
    const x = plot.x - (cols * 4) / 2 + 2 + col * 4, z = plot.z - (rows * 4) / 2 + 2 + row * 4
    const h = 0.25 + pl.progress * 1.1
    return (
      <group key={pl.land_id + '#' + pl.cell} position={[x, 0, z]}>
        <mesh position={[0, 0.08, 0]}><boxGeometry args={[3.2, 0.12, 3.2]} /><meshStandardMaterial color="#6b4a2b" flatShading /></mesh>
        {[-0.9, 0.9].flatMap((a) => [-0.9, 0.9].map((b) => (
          <mesh key={a + '_' + b} position={[a, 0.14 + h / 2, b]} castShadow><boxGeometry args={[0.45, h, 0.45]} /><meshStandardMaterial color={pl.ready ? '#e0b000' : COLOR[pl.crop_id] ?? '#4caf50'} flatShading /></mesh>
        )))}
      </group>
    )
  })}</>
}

// Tiang penanda lokasi proyek konstruksi yang sedang kamu kerjakan.
export function WorkBeacon() {
  useSyncExternalStore(jobsSubscribe, jobsVersion)
  const o = jobs.orders.find((x) => x.is_mine)
  if (!o) return null
  return <mesh position={[o.site_x, 12, o.site_z]}><cylinderGeometry args={[0.9, 0.9, 24, 12, 1, true]} /><meshBasicMaterial color="#ffd54f" transparent opacity={0.35} /></mesh>
}
