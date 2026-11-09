import { ALL_SOLIDS, BRIDGE, HALF_W, TREES, riverZ } from './layout'

export const WORLD_SIZE = 200
export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
// Desa datar sampai radius 85, bukit di pinggir, sungai dipahat ke tanah.
export function heightAt(x: number, z: number): number {
  const d = Math.hypot(x, z)
  const edge = 1 - smooth(88, 100, Math.max(Math.abs(x), Math.abs(z)))
  const hills = (Math.sin(x * 0.045) * Math.cos(z * 0.04) * 3 + Math.sin((x + z) * 0.09)) * smooth(85, 105, d) * edge
  const dr = Math.abs(z - riverZ(x))
  const infl = 1 - smooth(HALF_W + 2, HALF_W + 12, dr)
  return hills * (1 - infl) - 1.4 * (1 - smooth(HALF_W - 0.5, HALF_W + 1.5, dr))
}
export const onBridge = (x: number, z: number) => Math.abs(x) <= BRIDGE.halfW && Math.abs(z - BRIDGE.z) <= BRIDGE.halfLen
export const groundAt = (x: number, z: number) => (onBridge(x, z) ? BRIDGE.y : heightAt(x, z))
export const inRiver = (x: number, z: number) => Math.abs(x) > BRIDGE.halfW && Math.abs(z - riverZ(x)) < HALF_W + 0.2

export function resolveCollisions(px: number, pz: number, r: number, prevX: number, prevZ: number): [number, number] {
  for (let pass = 0; pass < 2; pass++) {
    for (const b of ALL_SOLIDS) {
      const hx = b.w / 2, hz = b.d / 2
      const cx = Math.max(b.x - hx, Math.min(px, b.x + hx)), cz = Math.max(b.z - hz, Math.min(pz, b.z + hz))
      const dx = px - cx, dz = pz - cz, dist = Math.hypot(dx, dz)
      if (dist >= r) continue
      if (dist > 1e-5) { px = cx + (dx / dist) * r; pz = cz + (dz / dist) * r }
      else {
        const ox = hx - Math.abs(px - b.x), oz = hz - Math.abs(pz - b.z)
        if (ox < oz) px = b.x + (px >= b.x ? 1 : -1) * (hx + r)
        else pz = b.z + (pz >= b.z ? 1 : -1) * (hz + r)
      }
    }
    for (const t of TREES) {
      const dx = px - t.x, dz = pz - t.z, rr = r + 0.4 * t.s
      if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue
      const dist = Math.hypot(dx, dz)
      if (dist >= rr) continue
      if (dist > 1e-5) { px = t.x + (dx / dist) * rr; pz = t.z + (dz / dist) * rr } else px = t.x + rr
    }
  }
  const lim = WORLD_SIZE / 2 - 2
  px = Math.max(-lim, Math.min(lim, px)); pz = Math.max(-lim, Math.min(lim, pz))
  if (inRiver(px, pz)) {
    if (!inRiver(px, prevZ)) pz = prevZ
    else if (!inRiver(prevX, pz)) px = prevX
    else { px = prevX; pz = prevZ }
  }
  return [px, pz]
}

// Mengembalikan faktor jarak kamera (0.2..1) agar kamera tidak masuk ke dalam bangunan.
export function cameraClip(tx: number, ty: number, tz: number, cx: number, cy: number, cz: number): number {
  const N = 14
  for (let i = 1; i <= N; i++) {
    const t = i / N, x = tx + (cx - tx) * t, y = ty + (cy - ty) * t, z = tz + (cz - tz) * t
    for (const s of ALL_SOLIDS) {
      if (Math.abs(x - s.x) < s.w / 2 + 0.35 && Math.abs(z - s.z) < s.d / 2 + 0.35 && y < s.h + 0.35) return Math.max(0.2, (i - 1) / N)
    }
  }
  return 1
}
