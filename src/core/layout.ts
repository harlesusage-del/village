// Data tata letak desa (statis untuk Phase 2). Phase 4 dan 7 akan menggantinya dengan data dari database.
export type PlotType = 'rumah' | 'perdagangan' | 'usaha' | 'pertanian' | 'perkebunan' | 'peternakan' | 'kosong'
export interface Plot { id: string; x: number; z: number; w: number; d: number; type: PlotType; house: boolean }
export interface Road { x: number; z: number; w: number; d: number; stone: boolean }
export interface Building { kind: 'house' | 'balai' | 'warung'; x: number; z: number; w: number; d: number; h: number; color: string }
export interface Solid { x: number; z: number; w: number; d: number; h: number }
export interface Interactable { id: string; name: string; x: number; z: number; r: number; msg: string }

export const HALF_W = 4
export const riverZ = (x: number) => 52 + Math.sin(x * 0.05) * 6
export const BRIDGE = { x: 0, z: riverZ(0), halfW: 2.6, halfLen: 6, y: 0.15 }

export const ROADS: Road[] = [
  { x: 0, z: 0.5, w: 5, d: 91, stone: true },
  { x: 0, z: 66.5, w: 5, d: 17, stone: true },
  { x: 0, z: 10, w: 144, d: 5, stone: true },
  { x: 0, z: -43, w: 22, d: 10, stone: true },
  { x: -35, z: 4, w: 4, d: 72, stone: false },
  { x: 31, z: -15, w: 3, d: 50, stone: false },
  { x: -65, z: 4, w: 4, d: 72, stone: false }
]
export const LAPANGAN = { x: 18, z: -20, w: 22, d: 16 }
export const PASAR = { x: 20, z: 26, w: 20, d: 16 }
export const PADDIES = [40, 56].flatMap((x) => [-32, -20, -8].map((z) => ({ x, z, w: 14, d: 10 })))
export const STALLS = [14, 20, 26].flatMap((x) => [22, 30].map((z) => ({ x, z })))

export const HOUSE = { w: 6, d: 5, h: 3.4 }
export const PLOTS: Plot[] = []
export const BUILDINGS: Building[] = [
  { kind: 'balai', x: 0, z: -52, w: 16, d: 8, h: 5, color: '#e8e0c8' },
  { kind: 'warung', x: -12, z: 22, w: 7, d: 5, h: 3.4, color: '#e8d8b0' }
]
// 20 slot rumah untuk pemain (R-01..R-20). Rumah muncul hanya jika slot dimiliki pemain (data dari database).
let n = 1
for (const z of [-26, -14, -2, 22, 34]) for (const x of [-44, -26, -56, -74]) {
  PLOTS.push({ id: 'R-' + String(n).padStart(2, '0'), x, z, w: 10, d: 10, type: 'rumah', house: false })
  n++
}
PLOTS.push({ id: 'D-01', x: -12, z: 22, w: 10, d: 10, type: 'perdagangan', house: true })
PLOTS.push({ id: 'D-02', x: -12, z: 34, w: 10, d: 10, type: 'perdagangan', house: false })
PLOTS.push({ id: 'P-01', x: 44, z: 28, w: 12, d: 12, type: 'pertanian', house: false })
PLOTS.push({ id: 'P-02', x: 58, z: 28, w: 12, d: 12, type: 'pertanian', house: false })
// Lahan tambahan yang bisa dibeli (harga dan kepemilikan sebenarnya ada di database, tabel land_plots).
for (const [id, type, x, z, w, d] of [
  ['D-03', 'perdagangan', -19, -45, 10, 10], ['D-04', 'perdagangan', 19, -45, 10, 10],
  ['U-01', 'usaha', -31, -45, 10, 10], ['U-02', 'usaha', 31, -45, 10, 10],
  ['K-01', 'perkebunan', 36, -58, 14, 10], ['K-02', 'perkebunan', 51, -58, 14, 10], ['K-03', 'perkebunan', 28, -70, 14, 10],
  ['T-01', 'peternakan', -55, -50, 16, 12], ['T-02', 'peternakan', -42, -62, 16, 12],
  ['L-01', 'kosong', 13, -66, 12, 12],
  ['P-03', 'pertanian', 72, 28, 12, 12], ['P-04', 'pertanian', 44, 39, 12, 10], ['P-05', 'pertanian', 58, 39, 12, 10]
] as [string, PlotType, number, number, number, number][]) PLOTS.push({ id, x, z, w, d, type, house: false })

export const SOLIDS: Solid[] = [
  ...BUILDINGS.map((b) => ({ x: b.x, z: b.z, w: b.w, d: b.d, h: b.h })),
  ...STALLS.map((s) => ({ x: s.x, z: s.z, w: 4, d: 1.6, h: 1 })),
  { x: -2.4, z: BRIDGE.z, w: 0.3, d: BRIDGE.halfLen * 2, h: 1.2 },
  { x: 2.4, z: BRIDGE.z, w: 0.3, d: BRIDGE.halfLen * 2, h: 1.2 }
]

// SOLIDS = objek tetap. ALL_SOLIDS = SOLIDS + rumah pemain (diisi oleh homes.ts). Collision memakai ALL_SOLIDS.
export const ALL_SOLIDS: Solid[] = [...SOLIDS]

const rects = [...ROADS, ...PLOTS, ...PADDIES, LAPANGAN, PASAR, { x: 0, z: -50, w: 24, d: 16 }]
export function occupied(x: number, z: number, m: number): boolean {
  if (Math.abs(z - riverZ(x)) < HALF_W + 6) return true
  return rects.some((r) => Math.abs(x - r.x) < r.w / 2 + m && Math.abs(z - r.z) < r.d / 2 + m)
}

export interface Tree { x: number; z: number; s: number }
export const TREES: Tree[] = []
{
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let tries = 0; tries < 4000 && TREES.length < 220; tries++) {
    const x = (rnd() - 0.5) * 188, z = (rnd() - 0.5) * 188
    if (occupied(x, z, 2.5) || TREES.some((t) => Math.hypot(t.x - x, t.z - z) < 2.5)) continue
    TREES.push({ x, z, s: 0.8 + rnd() * 0.7 })
  }
}

const TYPE_NAME: Record<PlotType, string> = { rumah: 'Lahan rumah', perdagangan: 'Lahan perdagangan', usaha: 'Lahan usaha', pertanian: 'Lahan pertanian', perkebunan: 'Lahan perkebunan', peternakan: 'Lahan peternakan', kosong: 'Lahan kosong' }
export const TYPE_LABEL = TYPE_NAME
export const INTERACTABLES: Interactable[] = [
  { id: 'balai', name: 'Balai Desa', x: 0, z: -46, r: 6, msg: 'Balai Desa, kantor Pak Lurah. Dashboard pemerintahan baru tersedia di Phase 10.' },
  { id: 'warung', name: 'Warung', x: -12, z: 26, r: 4, msg: 'Warung contoh (statis). Sistem toko dan stok baru tersedia di Phase 9.' },
  { id: 'pasar', name: 'Pasar', x: PASAR.x, z: PASAR.z, r: 9, msg: 'Pasar desa. Perdagangan antarpemain baru tersedia di Phase 9.' }
]
for (const p of PLOTS) {
  if (p.id === 'D-01') continue
  INTERACTABLES.push({ id: p.id, name: p.id, x: p.x, z: p.z, r: p.type === 'rumah' ? 5 : 6, msg: p.id + ': ' + TYPE_NAME[p.type] + ', masih kosong. Pembelian lahan baru aktif di Phase 7.' })
}
