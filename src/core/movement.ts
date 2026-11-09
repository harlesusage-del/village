import { groundAt, resolveCollisions } from './world'

// Simulasi gerak murni, dipakai klien (prediksi) DAN server (penentu posisi sah). Jangan diberi dependensi browser.
export const RADIUS = 0.4, GRAVITY = 24, JUMP_V = 8.5, WALK = 4, RUN = 8
export interface Sim { x: number; y: number; z: number; vy: number; facing: number }
export interface MoveInput { ax: number; ay: number; yaw: number; run: boolean; jump: boolean }
export interface StepResult { speed: number; grounded: boolean }

export function stepSim(s: Sim, i: MoveInput, dt: number): StepResult {
  const sy = Math.sin(i.yaw), cy = Math.cos(i.yaw)
  let mx = -sy * i.ay + cy * i.ax, mz = -cy * i.ay - sy * i.ax
  const mag = Math.min(1, Math.hypot(i.ax, i.ay))
  const speed = (i.run ? RUN : WALK) * mag
  const px = s.x, pz = s.z
  if (mag > 0.01) {
    const l = Math.hypot(mx, mz); mx /= l; mz /= l
    s.x += mx * speed * dt; s.z += mz * speed * dt
    let diff = Math.atan2(mx, mz) - s.facing
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    s.facing += diff * Math.min(1, dt * 12)
  }
  const [rx, rz] = resolveCollisions(s.x, s.z, RADIUS, px, pz)
  s.x = rx; s.z = rz
  const ground = groundAt(s.x, s.z)
  if (i.jump && s.y <= ground + 0.02) s.vy = JUMP_V
  s.vy -= GRAVITY * dt
  s.y += s.vy * dt
  if (s.y <= ground) { s.y = ground; s.vy = 0 }
  return { speed, grounded: s.y <= ground + 0.05 }
}
