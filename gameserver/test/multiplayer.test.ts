// Tes integrasi: server asli + beberapa klien WebSocket asli (guest). Butuh ALLOW_GUESTS=true (diatur di sini).
process.env.ALLOW_GUESTS = 'true'
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY
import { Client, Room } from 'colyseus.js'
import { startServer } from '../src/server'
import { unpackFlags } from '../../src/net/protocol'

const PORT = 2599, fails: string[] = []
const check = (name: string, ok: boolean, info = '') => { if (!ok) fails.push(name + (info ? ' [' + info + ']' : '')); console.log((ok ? 'OK    ' : 'GAGAL ') + name + (info ? '  ' + info : '')) }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface C { room: Room; pid: number; me: number[]; ack: number; enters: Map<number, any>; leaves: number[]; states: Map<number, number[]>; n: number; seq: number; closeCode?: number; name: string }
async function connect(client: Client, opts: object = { guest: true }): Promise<C> {
  const room = await client.joinOrCreate('village', opts)
  const c: C = { room, pid: 0, me: [], ack: 0, enters: new Map(), leaves: [], states: new Map(), n: 0, seq: 0, name: '' }
  attach(c); return c
}
function attach(c: C) {
  const room = c.room
  room.onMessage('w', (m) => { c.pid = m.pid; c.name = m.name; c.me = [m.x, m.y, m.z, m.f] })
  room.onMessage('e', (l: any[]) => l.forEach((e) => { c.enters.set(e.pid, e); c.states.set(e.pid, e.st) }))
  room.onMessage('l', (l: number[]) => l.forEach((id) => { c.leaves.push(id); c.states.delete(id) }))
  room.onMessage('s', (s) => { c.me = s.me; c.ack = s.a; c.n = s.n; s.p.forEach((st: number[]) => c.states.set(st[0], st)) })
  room.onLeave((code) => { c.closeCode = code })
  room.onError(() => {})
}
const send = (c: C, ax: number, ay: number, yaw: number, run: boolean, d = 0.05, jump = false) =>
  c.room.send('in', { s: ++c.seq, d, x: ax, y: ay, w: yaw, r: run ? 1 : 0, j: jump ? 1 : 0 })
// Mengirim input 20 Hz selama N detik (waktu nyata)
async function drive(c: C, ax: number, ay: number, yaw: number, run: boolean, sec: number) {
  const end = Date.now() + sec * 1000
  while (Date.now() < end) { send(c, ax, ay, yaw, run); await sleep(50) }
}

const server = await startServer(PORT)
const client = new Client(`ws://localhost:${PORT}`)

// 1. Gabung dan welcome
const A = await connect(client), B = await connect(client), Cc = await connect(client), D = await connect(client)
await sleep(400)
check('semua pemain mendapat pid unik', new Set([A.pid, B.pid, Cc.pid, D.pid]).size === 4 && A.pid > 0)
check('server melaporkan 4 pemain', A.n === 4, 'n=' + A.n)
check('pemain saling melihat saat berdekatan (enter)', A.enters.has(B.pid) && B.enters.has(A.pid) && A.enters.has(D.pid))
check('nama pemain dari server valid', /^[A-Za-z0-9_]{3,16}$/.test(A.name))

// 2. Gerak authoritative: jalan maju 1 detik = sekitar 4 m (WALK=4)
const a0 = [...A.me]
await drive(A, 0, 1, 0, false, 1.0); await sleep(300)
const dz = a0[2] - A.me[2]
check('gerak jalan diproses server (~4 m dalam 1 dtk)', dz > 3.0 && dz < 5.0, 'bergeser ' + dz.toFixed(2) + ' m')
check('server mengakui seq input (ack)', A.ack > 0 && A.ack <= A.seq)
check('pemain lain melihat posisi A yang sama (delta)', Math.abs((B.states.get(A.pid)?.[3] ?? 99) - A.me[2]) < 0.6)

// 3. Anti speed-hack: kirim 100 paket "dt besar" sekaligus (setara 10 dtk sim) dalam < 1 dtk
const b0 = [...B.me]
for (let i = 0; i < 100; i++) send(B, 0, 1, 0, true, 0.1)
await sleep(500)
const cheat = Math.hypot(B.me[0] - b0[0], B.me[2] - b0[2])
check('speed-hack ditolak (maks ~6 m, bukan 80 m)', cheat < 6.5, 'bergeser ' + cheat.toFixed(2) + ' m')

// 4. Input tidak valid tidak merusak server
const bBefore = [...B.me]
for (const bad of [null, 'x', { s: 'a' }, { s: 1e9, d: NaN, x: 1, y: 1, w: 0 }, { s: -5, d: 1, x: 1, y: 1, w: 0 }, { s: 99999, d: 0.05, x: Infinity, y: 1, w: 0 }, { s: 100000, d: 0.05, x: 1e30, y: -1e30, w: 1e30, r: 1, j: 1 }]) B.room.send('in', bad as any)
await sleep(300)
check('input sampah tidak membuat posisi NaN/hilang', B.me.every(Number.isFinite) && Math.hypot(B.me[0] - bBefore[0], B.me[2] - bBefore[2]) < 3)

// 5. Collision di server + interest management: C lari ke utara (balai desa), D lari ke timur (keluar jangkauan)
const dBefore = D.enters.size
await Promise.all([drive(Cc, 0, 1, 0, true, 7.5), drive(D, 0, 1, -Math.PI / 2, true, 8.6)])
await sleep(500)
check('server menghentikan C di tembok balai desa (z sekitar -47.6)', Cc.me[2] > -47.9 && Cc.me[2] < -46.9, 'z=' + Cc.me[2])
check('D keluar dari jangkauan A (menerima leave)', A.leaves.includes(D.pid), 'x D=' + D.me[0])
check('D tidak lagi tersimpan di daftar A', !A.states.has(D.pid))
check('D juga tidak melihat A lagi', D.leaves.includes(A.pid))
void dBefore

// 6. Emote tervalidasi dan tersiar
A.room.send('emote', { a: 1, e: 1 }); A.room.send('emote', { a: 99, e: -3 })
await sleep(300)
const fl = unpackFlags(B.states.get(A.pid)![6])
check('aksi dan ekspresi tersiar, nilai ilegal diabaikan', fl.action === 1 && fl.expr === 1, JSON.stringify(fl))

// 7. Disconnect + reconnect
const token = B.room.reconnectionToken, bPid = B.pid, posB = [...B.me]
;(B.room as any).connection.close(4005)
await sleep(600)
check('pemain terputus tetap terlihat dengan status disconnected', unpackFlags(A.states.get(bPid)?.[6] ?? 0).disc === true)
const room2 = await client.reconnect(token)
const B2: C = { room: room2, pid: 0, me: [], ack: 0, enters: new Map(), leaves: [], states: new Map(), n: 0, seq: B.seq, name: '' }
attach(B2); await sleep(500)
check('reconnect memulihkan identitas dan posisi', B2.pid === bPid && Math.hypot(B2.me[0] - posB[0], B2.me[2] - posB[2]) < 0.3)
check('pemain tidak menghilang bagi orang lain saat reconnect', !A.leaves.includes(bPid) && unpackFlags(A.states.get(bPid)?.[6] ?? 64).disc === false)
check('input setelah reconnect diproses', await (async () => { const z0 = B2.me[2]; await drive(B2, 0, 1, 0, false, 0.6); await sleep(250); return Math.abs(B2.me[2] - z0) > 1.5 })())

// 8. Keluar normal -> orang lain menerima leave
const bLeaveCount = A.leaves.length
await B2.room.leave(true); await sleep(500)
check('keluar normal disiarkan sebagai leave', A.leaves.length > bLeaveCount && A.leaves.includes(bPid))

// 9. Banjir pesan -> diputus; pemain lain tidak terganggu
for (let i = 0; i < 400; i++) Cc.room.send('ping', Date.now())
await sleep(500)
check('banjir pesan memutus pelaku (kode 4002)', Cc.closeCode === 4002, 'kode=' + Cc.closeCode)
const aZ = A.me[2]; await drive(A, 0, 1, 0, false, 0.5); await sleep(250)
check('pemain lain tetap berjalan normal setelah itu', Math.abs(A.me[2] - aZ) > 1)

// 10. Autentikasi: non-guest tanpa konfigurasi Supabase ditolak, guest ditolak jika dimatikan
let rejected = false
try { await new Client(`ws://localhost:${PORT}`).joinOrCreate('village', { token: 'x'.repeat(40) }) } catch { rejected = true }
check('login tanpa Supabase terkonfigurasi ditolak', rejected)
process.env.ALLOW_GUESTS = 'false'
rejected = false
try { await new Client(`ws://localhost:${PORT}`).joinOrCreate('village', { guest: true }) } catch { rejected = true }
check('tamu ditolak saat ALLOW_GUESTS=false', rejected)
process.env.ALLOW_GUESTS = 'true'

for (const c of [A, D]) await c.room.leave(true)
await sleep(200)
console.log('\n' + (fails.length ? 'GAGAL: ' + fails.join('; ') : 'SEMUA TES MULTIPLAYER LULUS'))
await server.gracefullyShutdown(false).catch(() => {})
process.exit(fails.length ? 1 : 0)
