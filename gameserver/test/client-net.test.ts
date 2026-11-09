// Menguji kode jaringan KLIEN asli (src/net/network.ts) terhadap server asli: prediksi, rekonsiliasi, remote, reconnect.
process.env.ALLOW_GUESTS = 'true'
;(globalThis as any).location = { hostname: 'localhost', search: '' }
import { Client } from 'colyseus.js'
import { startServer } from '../src/server'
import { net, netTick, startNet, stopNet, takeCorrection, hooks, sampleRemote, serverUrl, debugDropConnection, netFrozen, netSubscribe } from '../../src/net/network'
import { Sim, stepSim } from '../../src/core/movement'

const PORT = 2598, fails: string[] = []
const check = (n: string, ok: boolean, info = '') => { if (!ok) fails.push(n); console.log((ok ? 'OK    ' : 'GAGAL ') + n + (info ? '  ' + info : '')) }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const waitFor = async (f: () => boolean, ms = 4000) => { const e = Date.now() + ms; while (Date.now() < e) { if (f()) return true; await sleep(25) } return f() }

;(globalThis as any).localStorage = { _m: new Map<string, string>(), getItem(k: string) { return this._m.get(k) ?? null }, setItem(k: string, v: string) { this._m.set(k, v) } }
localStorage.setItem('village-life:server', `ws://localhost:${PORT}`)
check('alamat server dapat dikonfigurasi dan divalidasi', serverUrl() === `ws://localhost:${PORT}`)

const server = await startServer(PORT)
// Pemain lain (klien mentah) untuk dilihat oleh klien yang diuji
const other = await new Client(`ws://localhost:${PORT}`).joinOrCreate('village', { guest: true, name: 'Lawan01' })
let otherPid = 0; other.onMessage('w', (m) => { otherPid = m.pid }); other.onMessage('s', () => {}); other.onMessage('e', () => {}); other.onMessage('l', () => {}); other.onMessage('pong', () => {})

const sim: Sim = { x: 0, y: 0, z: 6, vy: 0, facing: Math.PI }
hooks.sync = (x, y, z, f) => { if (Math.hypot(x - sim.x, z - sim.z) > 1.5) { sim.x = x; sim.y = y; sim.z = z; sim.vy = 0; sim.facing = f } }
startNet('guest', 'KlienUji')
check('status berpindah ke online dan mendapat pid', await waitFor(() => net.status === 'online' && net.pid > 0), 'status=' + net.status)
check('pemain lain muncul di daftar remote', await waitFor(() => net.remotes.has(otherPid)))
check('hitung pemain dari server', await waitFor(() => net.count === 2), 'count=' + net.count)

// Meniru loop Player.tsx: stepSim lokal (prediksi) + netTick, 60 fps, 3 detik jalan lari ke timur
async function play(sec: number, ax: number, ay: number, yaw: number, run: boolean, jumpAt = -1) {
  let corrections = 0, maxCorr = 0, t0 = performance.now(), last = t0, elapsed = 0
  while (elapsed < sec) {
    await sleep(16)
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; elapsed = (now - t0) / 1000
    const c = takeCorrection(); if (c) { sim.x += c.dx; sim.z += c.dz; corrections++; maxCorr = Math.max(maxCorr, Math.hypot(c.dx, c.dz)) }
    const inp = { ax, ay, yaw, run, jump: jumpAt >= 0 && elapsed > jumpAt && elapsed < jumpAt + 0.05 }
    const r = stepSim(sim, inp, dt)
    netTick(dt, inp, sim, r.grounded)
  }
  return { corrections, maxCorr }
}
const st0 = { x: sim.x, z: sim.z }
const r1 = await play(3, 0, 1, -Math.PI / 2, true)
await sleep(300); await play(0.1, 0, 0, 0, false); await sleep(300)
const srvMe = other  // posisi server dibaca lewat snapshot klien uji? gunakan remote lain: other melihat klien uji
check('klien bergerak ke timur sekitar 24 m', sim.x - st0.x > 20 && sim.x - st0.x < 27, 'dx=' + (sim.x - st0.x).toFixed(2))
check('prediksi klien selaras dengan server (koreksi kecil/jarang)', r1.maxCorr < 1.0, `koreksi=${r1.corrections}, maks=${r1.maxCorr.toFixed(2)} m`)
void srvMe

// Pemain lain melihat posisi klien uji: ambil lewat room 'other' tidak tersedia, jadi cek dari sisi server via snapshot 'me' yang direkonsiliasi:
// bila ada selisih besar akan terjadi snap. Paksa selisih: geser sim 5 m (seolah klien dimodifikasi), server harus menariknya kembali.
const before = sim.x
sim.x += 5
const r2 = await play(1.2, 0, 0, 0, false)
await sleep(300)
const snapped = Math.abs(sim.x - before) < 1.0
check('klien yang posisinya dimanipulasi 5 m ditarik kembali oleh server', snapped, 'selisih akhir=' + Math.abs(sim.x - before).toFixed(2) + ' m, koreksi=' + r2.corrections)

// Interpolasi remote: gerakkan 'other' lalu cek sampleRemote halus (bukan loncat)
let seq = 0
const rem = net.remotes.get(otherPid)!
const first = { x: 0, y: 0, z: 0, f: 0 }; sampleRemote(rem, performance.now(), first)
const xs: number[] = []
const t0 = Date.now()
while (Date.now() - t0 < 1500) { other.send('in', { s: ++seq, d: 0.05, x: 0, y: 1, w: 0, r: 0, j: 0 }); await sleep(50); const o = { x: 0, y: 0, z: 0, f: 0 }; if (sampleRemote(rem, performance.now(), o)) xs.push(o.z) }
let maxStep = 0; for (let i = 1; i < xs.length; i++) maxStep = Math.max(maxStep, Math.abs(xs[i] - xs[i - 1]))
check('interpolasi pemain lain halus (langkah antar-frame kecil)', xs.length > 20 && maxStep < 0.45, 'langkah maks=' + maxStep.toFixed(3) + ' m, total gerak=' + Math.abs(xs[xs.length - 1] - xs[0]).toFixed(2))

// Reconnect: putus paksa. Klien harus masuk 'reconnecting' (gerak dibekukan), lalu 'online' lagi dengan pid dan posisi yang sama.
const pidBefore = net.pid, posBefore = { x: sim.x, z: sim.z }
const statuses: string[] = []
let frozenWhileDown = false
const unsub = netSubscribe(() => { if (statuses[statuses.length - 1] !== net.status) { statuses.push(net.status); if (net.status === 'reconnecting') frozenWhileDown = netFrozen() } })
debugDropConnection()
await waitFor(() => statuses.includes('reconnecting'), 3000)
check('putus tidak sengaja -> status reconnecting dan gerak dibekukan', statuses.includes('reconnecting') && frozenWhileDown, statuses.join('>'))
check('klien tersambung lagi (online) dengan identitas sama', await waitFor(() => net.status === 'online', 8000) && net.pid === pidBefore, 'urutan=' + statuses.join('>'))
await sleep(500)
check('posisi tidak berubah setelah reconnect', Math.hypot(sim.x - posBefore.x, sim.z - posBefore.z) < 0.5)
check('daftar pemain lain terisi ulang setelah reconnect', await waitFor(() => net.remotes.has(otherPid)))
const zr = sim.z
await play(0.8, 0, 1, 0, false); await sleep(300)
check('gerak berfungsi lagi setelah reconnect', Math.abs(sim.z - zr) > 2.5 && net.status === 'online')
unsub()

stopNet()
check('stopNet mengembalikan status offline dan mengosongkan remote', net.status === 'offline' && net.remotes.size === 0)
await other.leave(true); await sleep(200)
console.log('\n' + (fails.length ? 'GAGAL: ' + fails.join('; ') : 'SEMUA TES KLIEN LULUS'))
await server.gracefullyShutdown(false).catch(() => {})
process.exit(fails.length ? 1 : 0)
