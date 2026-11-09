import { Client, Room } from 'colyseus'
import { authenticate, AuthData, getAdmin } from './auth'
import { SpatialGrid } from './spatial'
import { Sim, stepSim } from '../../src/core/movement'
import { groundAt } from '../../src/core/world'
import { setHomes, spawnFor } from '../../src/core/homes'
import {
  ACTIONS, CLOSE_FLOOD, CLOSE_REPLACED, EXPRESSIONS, EncState, EmoteMsg, InMsg, MAX_DT, RECONNECT_SECONDS,
  SHIRTS, TICK_HZ, VIS_ENTER, VIS_EXIT, packFlags, r2
} from '../../src/net/protocol'

interface P {
  pid: number; userId: string; name: string; shirt: string; client: Client; online: boolean
  sim: Sim; speed: number; grounded: boolean; action: number; expr: number
  lastSeq: number; budget: number; lastT: number
  rateT: number; rateAll: number; rateIn: number; flooded: boolean
  known: Map<number, string>; pending?: { reject: Function }
}
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export class VillageRoom extends Room {
  maxClients = 100 // batas konfigurasi, BUKAN kapasitas terbukti. Kapasitas nyata harus diukur lewat load test (Phase 11).
  private players = new Map<number, P>()
  private bySession = new Map<string, P>()
  private grid = new SpatialGrid(25)
  private nextPid = 1
  private lastHomesAt = 0

  async onCreate() {
    await this.refreshHomes(true)
    this.setSimulationInterval(() => this.tick(), 1000 / TICK_HZ)
    this.clock.setInterval(() => { void this.refreshHomes(false) }, 30000)
    this.onMessage('in', (c, m: InMsg) => this.onInput(c, m))
    this.onMessage('emote', (c, m: EmoteMsg) => {
      const p = this.guard(c, false); if (!p) return
      if (m && Number.isInteger(m.a) && m.a >= 0 && m.a < ACTIONS.length) p.action = m.a
      if (m && Number.isInteger(m.e) && m.e >= 0 && m.e < EXPRESSIONS.length) p.expr = m.e
    })
    this.onMessage('ping', (c, t) => { if (this.guard(c, false) && finite(t)) c.send('pong', t) })
  }

  async onAuth(_c: Client, options: Record<string, unknown>): Promise<AuthData> { return authenticate(options) }

  async onJoin(client: Client, _o: unknown, auth: AuthData) {
    // Satu sesi per akun: sesi lama (online atau sedang menunggu reconnect) diganti.
    for (const old of [...this.players.values()]) if (old.userId === auth.userId) {
      old.pending?.reject(); old.pending = undefined; old.client.leave(CLOSE_REPLACED); this.drop(old)
    }
    if (auth.slot && !spawnFor(auth.slot)) throw new Error('slot tidak dikenal')
    if (auth.slot) await this.refreshHomes(true) // pastikan rumah pemain baru sudah jadi solid di server
    const sp = auth.slot ? spawnFor(auth.slot)! : { x: (Math.random() - 0.5) * 6, z: 8 + Math.random() }
    const p: P = {
      pid: this.nextPid++, userId: auth.userId, name: auth.name, shirt: SHIRTS[hash(auth.userId) % SHIRTS.length], client, online: true,
      sim: { x: sp.x, y: groundAt(sp.x, sp.z), z: sp.z, vy: 0, facing: auth.slot ? Math.PI : 0 },
      speed: 0, grounded: true, action: 0, expr: 0, lastSeq: 0, budget: 0.3, lastT: Date.now(),
      rateT: Date.now(), rateAll: 0, rateIn: 0, flooded: false, known: new Map()
    }
    this.players.set(p.pid, p); this.bySession.set(client.sessionId, p)
    this.welcome(p)
  }

  async onLeave(client: Client, consented?: boolean) {
    const p = this.bySession.get(client.sessionId)
    if (!p) return
    if (consented || p.flooded) { this.drop(p); return }
    p.online = false; p.speed = 0 // status disconnected: tetap di dunia sementara, terlihat pemain lain
    try {
      const d = this.allowReconnection(client, RECONNECT_SECONDS)
      p.pending = d
      const c = await d
      p.pending = undefined
      this.bySession.delete(client.sessionId)
      p.client = c; this.bySession.set(c.sessionId, p)
      p.online = true; p.known.clear(); p.lastT = Date.now(); p.budget = 0.3
      this.welcome(p)
    } catch { this.drop(p) } // waktu habis atau digantikan sesi baru
  }

  private welcome(p: P) {
    p.client.send('w', { pid: p.pid, name: p.name, shirt: p.shirt, x: r2(p.sim.x), y: r2(p.sim.y), z: r2(p.sim.z), f: r2(p.sim.facing) })
  }
  private drop(p: P) {
    this.players.delete(p.pid)
    for (const [s, q] of this.bySession) if (q === p) this.bySession.delete(s)
  }

  // Pembatasan laju pesan per pemain. Pesan berlebih diabaikan; banjir pesan ekstrem memutus koneksi.
  private guard(c: Client, isInput: boolean): P | null {
    const p = this.bySession.get(c.sessionId)
    if (!p || !p.online) return null
    const now = Date.now()
    if (now - p.rateT >= 1000) { p.rateT = now; p.rateAll = 0; p.rateIn = 0 }
    p.rateAll++
    if (p.rateAll > 200) { if (!p.flooded) { p.flooded = true; c.leave(CLOSE_FLOOD) } return null }
    if (isInput && ++p.rateIn > 60) return null
    return p
  }

  private onInput(c: Client, m: InMsg) {
    const p = this.guard(c, true); if (!p) return
    if (!m || !finite(m.s) || !finite(m.d) || !finite(m.x) || !finite(m.y) || !finite(m.w)) return
    if (!Number.isInteger(m.s) || m.s <= p.lastSeq || m.d <= 0) return
    p.lastSeq = m.s
    const now = Date.now()
    // Anggaran waktu simulasi: maksimal 1,25x waktu nyata + cadangan kecil. Mencegah percepatan lewat paket "dt" besar.
    p.budget = Math.min(0.5, p.budget + ((now - p.lastT) / 1000) * 1.25); p.lastT = now
    const dt = Math.min(Math.min(m.d, MAX_DT), p.budget)
    if (dt < 0.0005) return
    p.budget -= dt
    const inp = { ax: Math.max(-1, Math.min(1, m.x)), ay: Math.max(-1, Math.min(1, m.y)), yaw: m.w % (Math.PI * 2), run: m.r === 1, jump: m.j === 1 }
    const n = Math.ceil(dt / (1 / 60)); let r = { speed: 0, grounded: true }
    for (let i = 0; i < n; i++) r = stepSim(p.sim, inp, dt / n)
    p.speed = r.speed; p.grounded = r.grounded
  }

  private encode(q: P): EncState {
    return [q.pid, r2(q.sim.x), r2(q.sim.y), r2(q.sim.z), r2(q.sim.facing), Math.round(q.speed * 10) / 10, packFlags(q.grounded, q.action, q.expr, !q.online)]
  }

  // Siaran 15 Hz. Tiap pemain hanya menerima pemain dalam jangkauan (interest management) dan hanya yang berubah (delta).
  private tick() {
    this.grid.clear()
    for (const p of this.players.values()) this.grid.insert(p.pid, p.sim.x, p.sim.z)
    for (const p of this.players.values()) {
      if (!p.online) continue
      const seen = new Set<number>(), enters: { pid: number; name: string; shirt: string; st: EncState }[] = [], upd: EncState[] = []
      for (const id of this.grid.query(p.sim.x, p.sim.z, VIS_EXIT)) {
        const q = this.players.get(id)
        if (!q || q === p) continue
        const d = Math.hypot(q.sim.x - p.sim.x, q.sim.z - p.sim.z), known = p.known.has(id)
        if (d > (known ? VIS_EXIT : VIS_ENTER)) continue
        seen.add(id)
        const st = this.encode(q), key = st.slice(1).join(',')
        if (!known) { enters.push({ pid: id, name: q.name, shirt: q.shirt, st }); p.known.set(id, key) }
        else if (p.known.get(id) !== key) { upd.push(st); p.known.set(id, key) }
      }
      const leaves: number[] = []
      for (const id of p.known.keys()) if (!seen.has(id)) { leaves.push(id); p.known.delete(id) }
      if (enters.length) p.client.send('e', enters)
      if (leaves.length) p.client.send('l', leaves)
      p.client.send('s', { n: this.players.size, a: p.lastSeq, me: [r2(p.sim.x), r2(p.sim.y), r2(p.sim.z), r2(p.sim.facing)], p: upd })
    }
  }

  private async refreshHomes(force: boolean) {
    const sb = getAdmin()
    if (!sb || (!force && Date.now() - this.lastHomesAt < 5000)) return
    this.lastHomesAt = Date.now()
    const { data, error } = await sb.from('player_homes').select('slot_id,color,profiles!inner(display_name)')
    if (error || !data) return
    setHomes(data.map((r) => ({ slot_id: r.slot_id as string, color: r.color as string, owner_name: (r as unknown as { profiles: { display_name: string } }).profiles.display_name, is_mine: false })))
  }
}
