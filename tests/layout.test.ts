import { readFileSync } from 'fs'
import { PLOTS, ROADS, PADDIES, LAPANGAN, PASAR, BUILDINGS, INTERACTABLES, HALF_W, riverZ, STALLS } from '../src/core/layout'
import { heightAt } from '../src/core/world'
const bad: string[] = [], t = (n: string, ok: boolean, i = '') => { if (!ok) bad.push(n); console.log((ok ? 'OK    ' : 'GAGAL ') + n + (i ? '  ' + i : '')) }
type R = { id: string; x: number; z: number; w: number; d: number }
const hit = (a: R, b: R, m = 0) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + m && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + m
const plots: R[] = PLOTS.map((p) => ({ id: p.id, x: p.x, z: p.z, w: p.w, d: p.d }))
const others: R[] = [
  ...ROADS.map((r, i) => ({ id: 'jalan' + i, x: r.x, z: r.z, w: r.w, d: r.d })), ...PADDIES.map((r, i) => ({ id: 'sawah' + i, ...r })),
  { id: 'lapangan', ...LAPANGAN }, { id: 'pasar', ...PASAR }, ...BUILDINGS.filter((b) => b.kind === 'balai').map((b) => ({ id: 'balai', x: b.x, z: b.z + 2, w: b.w + 4, d: b.d + 8 })),
  { id: 'plaza', x: 0, z: -43, w: 22, d: 10 }
]
t('id lahan unik', new Set(PLOTS.map((p) => p.id)).size === PLOTS.length, PLOTS.length + ' lahan')
const ov: string[] = []
for (let i = 0; i < plots.length; i++) for (let j = i + 1; j < plots.length; j++) if (hit(plots[i], plots[j])) ov.push(plots[i].id + '~' + plots[j].id)
t('tidak ada lahan yang saling tumpang tindih', ov.length === 0, ov.join(','))
const ov2: string[] = []
for (const p of plots) for (const o of others) if (hit(p, o)) ov2.push(p.id + '~' + o.id)
t('lahan tidak menimpa jalan, sawah, lapangan, pasar, balai', ov2.length === 0, ov2.join(','))
const wet = plots.filter((p) => [-1, 0, 1].some((a) => [-1, 0, 1].some((b) => Math.abs(p.z + b * p.d / 2 - riverZ(p.x + a * p.w / 2)) < HALF_W + 2)))
t('tidak ada lahan yang menyentuh sungai', wet.length === 0, wet.map((p) => p.id).join(','))
const slope = plots.filter((p) => [-1, 0, 1].some((a) => [-1, 0, 1].some((b) => Math.abs(heightAt(p.x + a * p.w / 2, p.z + b * p.d / 2)) > 0.05)))
t('semua lahan berdiri di tanah datar (sudut-sudutnya juga)', slope.length === 0, slope.map((p) => p.id).join(','))
t('lahan tidak menimpa lapak pasar', !STALLS.some((s) => plots.some((p) => hit(p, { id: 's', x: s.x, z: s.z, w: 4, d: 2 }))))
t('id interaksi unik', new Set(INTERACTABLES.map((i) => i.id)).size === INTERACTABLES.length)
// SQL seed harus sama dengan layout (id, jenis, posisi, ukuran)
const sql = readFileSync(new URL('../supabase/migrations/004_land.sql', import.meta.url), 'utf8')
const rows = [...sql.matchAll(/\('([A-Z]-\d+)', '(\w+)', (-?[\d.]+), (-?[\d.]+), ([\d.]+), ([\d.]+), (\d+), (true|false)\)/g)]
t('jumlah baris seed SQL = jumlah lahan di game', rows.length === PLOTS.length, rows.length + ' vs ' + PLOTS.length)
const mism = PLOTS.filter((p) => { const r = rows.find((m) => m[1] === p.id); return !r || r[2] !== p.type || +r[3] !== p.x || +r[4] !== p.z || +r[5] !== p.w || +r[6] !== p.d })
t('seed SQL cocok dengan tata letak game', mism.length === 0, mism.map((p) => p.id).join(','))
t('lahan rumah dan warung desa ditandai tidak dijual di SQL', rows.filter((m) => m[8] === 'true').every((m) => m[2] === 'rumah' || m[1] === 'D-01') && rows.filter((m) => m[2] === 'rumah').every((m) => m[8] === 'true'))
t('harga dasar di seed = luas x tarif (tidak nol untuk lahan dijual)', rows.filter((m) => m[8] === 'false').every((m) => +m[7] > 0))
console.log('\n' + (bad.length ? 'GAGAL: ' + bad.join('; ') : 'SEMUA TES TATA LETAK LULUS'))
process.exit(bad.length ? 1 : 0)
