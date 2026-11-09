import { resolveCollisions, inRiver, groundAt, heightAt, cameraClip } from '../src/core/world.ts'
import { ALL_SOLIDS as SOLIDS, TREES, ROADS, PLOTS, riverZ, HALF_W, HOUSE } from '../src/core/layout.ts'
import { setHomes, spawnFor, nameOf, msgOf } from '../src/core/homes.ts'
import { INTERACTABLES } from '../src/core/layout.ts'
import { readFileSync } from 'fs'
setHomes(PLOTS.filter((p) => p.type === 'rumah').map((p, i) => ({ slot_id: p.id, owner_name: 'P' + i, color: '#e7c9a0', is_mine: i === 0 })))
const R = 0.4
let bad: string[] = []
const insideSolid = (x: number, z: number) => SOLIDS.some(s => Math.abs(x - s.x) < s.w / 2 + R - 0.02 && Math.abs(z - s.z) < s.d / 2 + R - 0.02 && (Math.abs(x - s.x) < s.w / 2 || Math.abs(z - s.z) < s.d / 2))
// 1. random walk 600k langkah (kecepatan lari, dt 16ms)
let x = 0, z = 6, h = 0, seed = 11
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
let crossed = 0
for (let i = 0; i < 600000; i++) {
  if (i % 40 === 0) h += (rnd() - 0.5) * 3
  const px = x, pz = z
  x += Math.sin(h) * 8 * 0.016; z += Math.cos(h) * 8 * 0.016
  ;[x, z] = resolveCollisions(x, z, R, px, pz)
  if (!isFinite(x) || !isFinite(z)) { bad.push('NaN'); break }
  if (inRiver(x, z)) { bad.push(`in river ${x.toFixed(1)},${z.toFixed(1)}`); break }
  if (insideSolid(x, z)) { bad.push(`in solid ${x.toFixed(1)},${z.toFixed(1)}`); break }
  if (z > riverZ(x) + HALF_W + 1 && Math.abs(x) > 3) { crossed++ }
  if (i % 5000 === 0 && rnd() < 0.3) { const tx = (rnd() - .5) * 150, tz = (rnd() - .5) * 150; if (!inRiver(tx, tz) && !insideSolid(tx, tz) && Math.abs(tz - riverZ(tx)) > 7) { x = tx; z = tz } }
}
console.log('random walk problems:', bad.length ? bad : 'none')
// 2. jembatan bisa dilewati
x = 0; z = 38
for (let i = 0; i < 1200; i++) { const px = x, pz = z; z += 8 * 0.016; ;[x, z] = resolveCollisions(x, z, R, px, pz) }
console.log('bridge crossing end z:', z.toFixed(1), '(harus > 60)', 'ground on bridge', groundAt(0, riverZ(0)))
// 3. sungai tidak bisa diseberangi di luar jembatan
for (const sx of [-60, -20, 20, 40, 70]) {
  x = sx; z = 30
  for (let i = 0; i < 1500; i++) { const px = x, pz = z; z += 8 * 0.016; ;[x, z] = resolveCollisions(x, z, R, px, pz) }
  if (z > riverZ(x) - HALF_W + 0.5) bad.push('menyeberang di x=' + sx)
}
// 4. tanah datar di jalan/plot, pohon tidak menimpa objek, spawn aman
const flat = ROADS.every(r => [[r.x, r.z], [r.x - r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z + r.d / 2]].every(([a, b]) => Math.abs(heightAt(a, b)) < 0.01))
const treesOk = TREES.every(t => !SOLIDS.some(s => Math.abs(t.x - s.x) < s.w / 2 + 1 && Math.abs(t.z - s.z) < s.d / 2 + 1))
console.log('jalan datar:', flat, '| pohon:', TREES.length, 'tidak menimpa bangunan:', treesOk, '| spawn ground:', groundAt(0, 6))
console.log('camera clip dekat balai:', cameraClip(0, 1.6, -44, 0, 4, -52).toFixed(2), '| lapang:', cameraClip(0, 1.6, 6, 0, 4, 12))
// Phase 4: 20 rumah terisi
const slots = PLOTS.filter((p) => p.type === 'rumah')
if (slots.length !== 20) bad.push('jumlah slot ' + slots.length)
if (SOLIDS.length < 20 + 2) bad.push('rumah belum jadi solid')
for (const p of slots) {
  const sp = spawnFor(p.id)!
  const [rx, rz] = resolveCollisions(sp.x, sp.z, R, sp.x, sp.z)
  if (Math.hypot(rx - sp.x, rz - sp.z) > 1e-6) bad.push('spawn terdorong ' + p.id)
  if (inRiver(sp.x, sp.z)) bad.push('spawn di sungai ' + p.id)
  if (TREES.some((t) => Math.hypot(t.x - sp.x, t.z - sp.z) < 1.5)) bad.push('pohon dekat spawn ' + p.id)
  if (Math.abs(heightAt(sp.x, sp.z)) > 0.01) bad.push('spawn tidak datar ' + p.id)
  if (sp.z - (p.z + HOUSE.d / 2) < 1) bad.push('spawn terlalu dekat dinding ' + p.id)
  const hit = SOLIDS.filter((b) => Math.abs(sp.x - b.x) < b.w / 2 + R && Math.abs(sp.z - b.z) < b.d / 2 + R)
  if (hit.length) bad.push('spawn dalam solid ' + p.id)
}
for (const a of slots) for (const b of slots) if (a !== b && Math.abs(a.x - b.x) < 8 && Math.abs(a.z - b.z) < 8) bad.push('plot bertumpuk')
// SQL seed harus sama dengan layout
const sql = readFileSync(new URL('../supabase/migrations/002_player_homes.sql', import.meta.url), 'utf8')
for (const p of slots) if (!sql.includes(`('${p.id}', `) || !new RegExp(`\\('${p.id}', \\d+, ${p.x}, ${p.z}\\)`).test(sql)) bad.push('seed SQL beda dengan layout ' + p.id)
const it = INTERACTABLES.find((i) => i.id === 'R-01')!
if (nameOf(it) !== 'Rumahmu' || !msgOf(it).includes('rumahmu')) bad.push('nama interaksi rumah sendiri')
console.log('semua tes:', bad.length ? bad : 'LULUS')
