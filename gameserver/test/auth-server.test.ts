// Menguji jalur login lewat token Supabase di server, memakai Supabase TIRUAN lokal (bukan layanan asli).
import http from 'node:http'
const fails: string[] = []
const check = (n: string, ok: boolean, info = '') => { if (!ok) fails.push(n); console.log((ok ? 'OK    ' : 'GAGAL ') + n + (info ? '  ' + info : '')) }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const U: Record<string, { id: string; name: string; status: string; slot: string | null }> = {
  'good-token-aaaaaaaaaaaaaaaaaaaa': { id: '11111111-1111-1111-1111-111111111111', name: 'Budi_Tani', status: 'aktif', slot: 'R-03' },
  'frozen-token-bbbbbbbbbbbbbbbbbb': { id: '22222222-2222-2222-2222-222222222222', name: 'Dibekukan', status: 'dibekukan', slot: 'R-04' },
  'nohome-token-cccccccccccccccccc': { id: '33333333-3333-3333-3333-333333333333', name: 'TanpaRumah', status: 'aktif', slot: null }
}
const byId = (id: string) => Object.values(U).find((u) => u.id === id)
const fake = http.createServer((req, res) => {
  const url = new URL(req.url!, 'http://x'), auth = (req.headers.authorization ?? '').replace('Bearer ', '')
  const json = (code: number, body: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
  const wantObj = String(req.headers.accept ?? '').includes('pgrst.object')
  if (url.pathname === '/auth/v1/user') {
    const u = U[auth]; return u ? json(200, { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.name + '@x.id', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }) : json(401, { msg: 'invalid JWT' })
  }
  if (url.pathname === '/rest/v1/profiles') {
    const id = (url.searchParams.get('id') ?? '').replace('eq.', ''), u = byId(id)
    const row = u ? { display_name: u.name, role: 'penduduk', status: u.status } : null
    return json(200, wantObj ? (row ?? {}) : row ? [row] : [])
  }
  if (url.pathname === '/rest/v1/player_homes') {
    const pid = url.searchParams.get('player_id')
    if (pid) { const u = byId(pid.replace('eq.', '')); const row = u?.slot ? { slot_id: u.slot } : null; return json(200, wantObj ? (row ?? {}) : row ? [row] : []) }
    return json(200, Object.values(U).filter((u) => u.slot && u.status === 'aktif').map((u) => ({ slot_id: u.slot, color: '#e7c9a0', profiles: { display_name: u.name } })))
  }
  json(404, {})
})
await new Promise<void>((r) => fake.listen(0, r))
process.env.SUPABASE_URL = `http://localhost:${(fake.address() as { port: number }).port}`
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-palsu-untuk-tes'
process.env.ALLOW_GUESTS = 'false'

const { Client } = await import('colyseus.js')
const { startServer } = await import('../src/server')
const { PLOTS, HOUSE } = await import('../../src/core/layout')
const { spawnFor } = await import('../../src/core/homes')
const server = await startServer(2597)
const url = 'ws://localhost:2597'
const tryJoin = async (token: unknown) => { try { return { room: await new Client(url).joinOrCreate('village', { token }) } } catch (e) { return { code: (e as { code?: number }).code } } }

const bad = await tryJoin('token-salah-token-salah-token-salah')
check('token tidak valid ditolak (401)', bad.code === 401, 'kode=' + bad.code)
check('tanpa token ditolak (401)', (await tryJoin(undefined)).code === 401)
check('akun dibekukan ditolak (403)', (await tryJoin('frozen-token-bbbbbbbbbbbbbbbbbb')).code === 403)
check('akun tanpa rumah ditolak (409)', (await tryJoin('nohome-token-cccccccccccccccccc')).code === 409)
check('tamu ditolak karena ALLOW_GUESTS=false (403)', await (async () => { try { await new Client(url).joinOrCreate('village', { guest: true }); return false } catch (e) { return (e as { code?: number }).code === 403 } })())

const g = await tryJoin('good-token-aaaaaaaaaaaaaaaaaaaa')
const room = g.room!
let w: any = null, me: number[] = [], closeCode = 0; let seq = 0
room.onMessage('w', (m) => { w = m }); room.onMessage('s', (s) => { me = s.me }); room.onMessage('e', () => {}); room.onMessage('l', () => {}); room.onMessage('pong', () => {})
room.onLeave((c) => { closeCode = c }); room.onError(() => {})
await sleep(400)
const plot = PLOTS.find((p) => p.id === 'R-03')!, sp = spawnFor('R-03')!
check('nama dan identitas diambil dari database, bukan dari klien', w?.name === 'Budi_Tani')
check('spawn tepat di depan rumah sendiri (slot R-03)', Math.hypot(w.x - sp.x, w.z - sp.z) < 0.02, `(${w.x},${w.z}) vs (${sp.x},${sp.z})`)
// rumah pemain jadi solid di server: berjalan maju (ke arah rumah) harus berhenti di dinding
const end = Date.now() + 2500
while (Date.now() < end) { room.send('in', { s: ++seq, d: 0.05, x: 0, y: 1, w: 0, r: 0, j: 0 }); await sleep(50) }
await sleep(300)
const wall = plot.z + HOUSE.d / 2 + 0.4
check('server menghentikan pemain di dinding rumahnya sendiri', Math.abs(me[2] - wall) < 0.15, `z=${me[2]} dinding=${wall.toFixed(2)}`)

// Login ganda: sesi lama diganti
const second = await tryJoin('good-token-aaaaaaaaaaaaaaaaaaaa')
await sleep(500)
check('login kedua mengganti sesi pertama (kode 4001)', closeCode === 4001 && !!second.room, 'kode=' + closeCode)
if (second.room) await second.room.leave(true)
await sleep(200)
console.log('\n' + (fails.length ? 'GAGAL: ' + fails.join('; ') : 'SEMUA TES AUTH SERVER LULUS'))
await server.gracefullyShutdown(false).catch(() => {}); fake.close()
process.exit(fails.length ? 1 : 0)
