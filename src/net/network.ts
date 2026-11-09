import { Client, Room } from 'colyseus.js'
import { getSupabase } from '../auth/client'
import type { CharState } from '../game/Character'
import { ACTIONS, CLOSE_FLOOD, CLOSE_REPLACED, EXPRESSIONS, EncState, EnterEntry, InMsg, RECONNECT_SECONDS, ROOM_NAME, SEND_DT, Snap, TICK_HZ, Welcome, unpackFlags } from './protocol'

export type NetStatus = 'offline' | 'connecting' | 'online' | 'reconnecting' | 'error'
export interface Remote {
  pid: number; name: string; shirt: string; disc: boolean
  buf: { t: number; x: number; y: number; z: number; f: number }[]
  state: CharState
}
export const net = { v: 0, rv: 0, status: 'offline' as NetStatus, error: null as string | null, count: 0, ping: 0, pid: 0, name: '', shirt: '#3f7fbf', remotes: new Map<number, Remote>() }
const ls = new Set<() => void>()
const emit = () => { net.v++; ls.forEach((l) => l()) }
export const netSubscribe = (l: () => void) => { ls.add(l); return () => { ls.delete(l) } }
export const netVersion = () => net.v
export const remotesVersion = () => net.rv
export const netFrozen = () => net.status === 'reconnecting'
export const setLocalName = (n: string) => { if (net.name !== n) { net.name = n; emit() } }
// Player.tsx mendaftarkan fungsi ini agar server bisa memindahkan pemain (spawn/pemulihan).
export const hooks = { sync: (_x: number, _y: number, _z: number, _f: number) => {} }

const KEY = 'village-life:server'
const URL_OK = /^wss?:\/\/[^\s/]+(:\d+)?$/
export function serverUrl(): string {
  try {
    const q = new URLSearchParams(location.search).get('server')
    if (q && URL_OK.test(q)) localStorage.setItem(KEY, q)
    const saved = localStorage.getItem(KEY)
    if (saved && URL_OK.test(saved)) return saved
  } catch { /* abaikan */ }
  const env = import.meta.env?.VITE_GAME_SERVER_URL as string | undefined
  if (env && URL_OK.test(env)) return env
  return `ws://${location.hostname || 'localhost'}:2567`
}

function setStatus(s: NetStatus, error: string | null = null) { net.status = s; net.error = error; emit() }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------- Prediksi dan rekonsiliasi (posisi pemain sendiri) ----------
const sentLog = new Map<number, [number, number]>()
const corr = { dx: 0, dz: 0, snap: false, y: 0 }
let seq = 0, acc = 0, jumpAcc = false, idleT = 0, lastMoving = false
let prevInput = { ax: 0, ay: 0, yaw: 0, run: false }
export interface NetInput { ax: number; ay: number; yaw: number; run: boolean; jump: boolean }

// Dipanggil Player tiap frame. Mengirim input 20 Hz saat bergerak, jarang saat diam.
export function netTick(dt: number, i: NetInput, sim: { x: number; z: number }, grounded: boolean) {
  if (!room || net.status !== 'online') { acc = 0; jumpAcc = false; lastMoving = false; return }
  acc += dt; jumpAcc = jumpAcc || i.jump
  const idle = i.ax === 0 && i.ay === 0 && !jumpAcc && grounded
  if (!idle) {
    lastMoving = true
    if (acc >= SEND_DT) flush(i, sim)
  } else if (lastMoving) {
    flush(prevInput as NetInput, sim); lastMoving = false; idleT = 0   // kirim sisa gerakan dengan input terakhir yang bergerak
  } else {
    acc = 0; idleT += dt
    if (idleT >= 0.25) { acc = 0.001; flush(i, sim); idleT = 0 }
  }
  if (!idle) prevInput = { ax: i.ax, ay: i.ay, yaw: i.yaw, run: i.run }
}
function flush(i: NetInput, sim: { x: number; z: number }) {
  seq++
  const m: InMsg = { s: seq, d: Math.max(acc, 0.001), x: i.ax, y: i.ay, w: i.yaw, r: i.run ? 1 : 0, j: jumpAcc ? 1 : 0 }
  room!.send('in', m)
  sentLog.set(seq, [sim.x, sim.z])
  if (sentLog.size > 200) sentLog.delete(sentLog.keys().next().value as number)
  acc = 0; jumpAcc = false
}
function reconcile(ack: number, me: number[]) {
  const pred = sentLog.get(ack)
  if (!pred) return
  for (const k of [...sentLog.keys()]) if (k <= ack) sentLog.delete(k)
  const ex = me[0] - pred[0], ez = me[2] - pred[1], d = Math.hypot(ex, ez)
  if (d > 2) { corr.dx += ex; corr.dz += ez; corr.snap = true; corr.y = me[1] }
  else if (d > 0.3) { corr.dx += ex * 0.3; corr.dz += ez * 0.3 }
}
// Player mengambil koreksi sekali per frame. Riwayat prediksi ikut digeser agar tidak terkoreksi dua kali.
export function takeCorrection(): { dx: number; dz: number; snap: boolean; y: number } | null {
  if (!corr.dx && !corr.dz && !corr.snap) return null
  const c = { ...corr }
  for (const [k, v] of sentLog) sentLog.set(k, [v[0] + c.dx, v[1] + c.dz])
  corr.dx = 0; corr.dz = 0; corr.snap = false
  return c
}
// Hanya untuk pengujian: memutus socket tanpa menutup sesi (mensimulasikan sinyal hilang).
export function debugDropConnection() { (room as unknown as { connection: { close(c: number): void } } | null)?.connection.close(4005) }
export function netEmote(action: string, expression: string) {
  room?.send('emote', { a: ACTIONS.indexOf(action as never), e: EXPRESSIONS.indexOf(expression as never) })
}

// ---------- Pemain lain: buffer snapshot dan interpolasi ----------
const INTERP_MS = 120
export function sampleRemote(r: Remote, now: number, out: { x: number; y: number; z: number; f: number }): boolean {
  const b = r.buf
  if (!b.length) return false
  const t = now - INTERP_MS
  let a = b[0], c = b[0], k = 0
  if (t >= b[b.length - 1].t) { a = c = b[b.length - 1] }
  else if (t > b[0].t) {
    while (k < b.length - 2 && b[k + 1].t <= t) k++
    a = b[k]; c = b[k + 1]
  }
  const w = a === c ? 0 : (t - a.t) / (c.t - a.t)
  out.x = a.x + (c.x - a.x) * w; out.y = a.y + (c.y - a.y) * w; out.z = a.z + (c.z - a.z) * w
  let df = c.f - a.f; df = Math.atan2(Math.sin(df), Math.cos(df))
  out.f = a.f + df * w
  return true
}
function applyState(r: Remote, st: EncState, now: number, initial: boolean) {
  const f = unpackFlags(st[6])
  const disc = f.disc
  r.state.speed = st[5]; r.state.grounded = f.grounded
  r.state.action = ACTIONS[f.action] ?? 'none'; r.state.expression = EXPRESSIONS[f.expr] ?? 'normal'
  const last = r.buf[r.buf.length - 1]
  if (last && now - last.t > 250) r.buf.push({ ...last, t: now - 1000 / TICK_HZ })
  r.buf.push({ t: now, x: st[1], y: st[2], z: st[3], f: st[4] })
  if (r.buf.length > 12) r.buf.shift()
  if (r.disc !== disc) { r.disc = disc; if (!initial) net.rv++ }
}
function resetRemotes() { net.remotes.clear(); net.rv++; emit() }

// ---------- Koneksi ----------
let wanted = false, room: Room | null = null, loopId = 0, client: Client | null = null, pingTimer: ReturnType<typeof setInterval> | undefined
const TERMINAL: Record<number, string> = {
  401: 'Sesi login tidak valid. Keluar lalu masuk lagi.', 403: 'Server menolak akses ini (akun tidak aktif atau tamu tidak diizinkan). Main solo.',
  409: 'Rumahmu belum siap. Muat ulang halaman.', 503: 'Server multiplayer belum dikonfigurasi. Hubungi admin.'
}
async function getToken(): Promise<string | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data } = await sb.auth.getSession()
  return data.session?.access_token ?? null
}

export function startNet(mode: 'user' | 'guest', guestName?: string) {
  if (wanted) return
  wanted = true
  void loop(++loopId, mode, guestName)
}
export function stopNet() {
  wanted = false; loopId++
  clearInterval(pingTimer)
  const r = room; room = null
  if (r) void Promise.resolve(r.leave(true)).catch(() => {})
  net.pid = 0; net.count = 0; net.ping = 0
  sentLog.clear(); seq = 0; acc = 0; lastMoving = false
  resetRemotes(); setStatus('offline')
}

async function loop(id: number, mode: 'user' | 'guest', guestName?: string) {
  let backoff = 1000
  while (wanted && id === loopId) {
    setStatus('connecting')
    try {
      const opts = mode === 'guest' ? { guest: true, name: guestName } : { token: await getToken() }
      if (mode === 'user' && !(opts as { token: string | null }).token) { wanted = false; setStatus('error', TERMINAL[401]); return }
      client = new Client(serverUrl())
      const r = await client.joinOrCreate(ROOM_NAME, opts)
      if (!wanted || id !== loopId) { void r.leave(true); return }
      seq = 0; acc = 0; sentLog.clear(); backoff = 1000
      room = r
      const code = await session(r, id)
      if (code === CLOSE_REPLACED) { wanted = false; setStatus('error', 'Akunmu masuk dari tempat lain. Sesi ini ditutup.'); return }
      if (code === CLOSE_FLOOD) { wanted = false; setStatus('error', 'Terputus karena terlalu banyak permintaan.'); return }
      if (code === 4000) return
    } catch (e) {
      const c = (e as { code?: number })?.code
      if (typeof c === 'number' && TERMINAL[c]) { wanted = false; setStatus('error', TERMINAL[c]); return }
      resetRemotes(); setStatus('offline', 'Server multiplayer tidak terjangkau. Mode solo, mencoba lagi...')
    }
    if (wanted && id === loopId && net.status !== 'offline') setStatus('offline', 'Koneksi terputus. Mencoba lagi...')
    await sleep(backoff); backoff = Math.min(15000, Math.round(backoff * 1.7))
  }
}

// Menjalankan satu sesi sampai berakhir. Putus tidak sengaja dicoba dipulihkan (reconnect) sampai RECONNECT_SECONDS.
function session(first: Room, id: number): Promise<number> {
  return new Promise((resolve) => {
    const bind = (r: Room) => {
      r.onMessage('w', (m: Welcome) => {
        net.pid = m.pid; net.name = m.name; net.shirt = m.shirt
        resetRemotes(); sentLog.clear()
        hooks.sync(m.x, m.y, m.z, m.f)
        setStatus('online')
      })
      r.onMessage('e', (l: EnterEntry[]) => {
        const now = performance.now()
        for (const e of l) {
          const rem: Remote = { pid: e.pid, name: e.name, shirt: e.shirt, disc: false, buf: [], state: { speed: 0, grounded: true, action: 'none', expression: 'normal' } }
          applyState(rem, e.st, now, true)
          net.remotes.set(e.pid, rem)
        }
        net.rv++; emit()
      })
      r.onMessage('l', (l: number[]) => { for (const p of l) net.remotes.delete(p); net.rv++; emit() })
      r.onMessage('s', (s: Snap) => {
        net.count = s.n
        reconcile(s.a, s.me)
        const now = performance.now()
        for (const st of s.p) { const rem = net.remotes.get(st[0]); if (rem) applyState(rem, st, now, false) }
        if (net.rv !== lastRv) { lastRv = net.rv; emit() }
      })
      r.onMessage('pong', (t: number) => { net.ping = Math.round(performance.now() - t); emit() })
      r.onError(() => {})
      r.onLeave((code) => { void onClose(r, code) })
      clearInterval(pingTimer)
      pingTimer = setInterval(() => { try { r.send('ping', performance.now()) } catch { /* sedang putus */ } }, 3000)
    }
    let lastRv = net.rv
    const onClose = async (r: Room, code: number) => {
      clearInterval(pingTimer)
      if (r !== room) return
      if (!wanted || id !== loopId || code === 4000 || code === CLOSE_REPLACED || code === CLOSE_FLOOD) { resolve(code); return }
      setStatus('reconnecting')
      const token = r.reconnectionToken, deadline = Date.now() + RECONNECT_SECONDS * 1000 - 2000
      while (wanted && id === loopId && Date.now() < deadline) {
        try {
          const r2 = await client!.reconnect(token)
          if (!wanted || id !== loopId) { void r2.leave(true); resolve(4000); return }
          room = r2; bind(r2); return
        } catch { await sleep(1500) }
      }
      resolve(1006)
    }
    bind(first)
  })
}
