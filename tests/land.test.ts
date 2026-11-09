;(globalThis as any).window = globalThis
import { lands, refreshLands, startLands, stopLands, buyLand, sellToVillage, setListing, setLandsClientForTests } from '../src/land/lands'
import { setWalletClientForTests } from '../src/economy/wallet'

const bad: string[] = [], t = (n: string, ok: boolean, i = '') => { if (!ok) bad.push(n); console.log((ok ? 'OK    ' : 'GAGAL ') + n + (i ? '  ' + i : '')) }
const calls: { fn: string; args: any }[] = []
let mode: 'ok' | 'net' | 'changed' = 'ok', gate: Promise<void> | null = null
const row = (o: object) => ({ id: 'P-01', type: 'pertanian', x: 44, z: 28, w: 12, d: 12, base_price: '720000', owner_name: null, is_mine: false, listed_price: null, status: 'desa', restricted: false, disputed: false, build_obligation: false, buy_price: '720000', sell_price: null, ...o })
const fake: any = { rpc: async (fn: string, args: any) => {
  calls.push({ fn, args })
  if (fn === 'get_lands') return { data: [row({}), row({ id: 'P-02', owner_name: 'Aku', is_mine: true, status: 'milik_saya', buy_price: null, sell_price: '504000', listed_price: '800000' })], error: null }
  if (fn === 'get_economy_config') return { data: [{ key: 'village_buyback_pct', value: 70 }, { key: 'max_lands_per_player', value: 10 }, { key: 'max_listing_multiplier', value: 10 }], error: null }
  if (fn === 'get_wallet') return { data: 1000000, error: null }
  if (fn === 'get_transactions') return { data: [], error: null }
  if (gate) await gate
  if (mode === 'net') throw new Error('fetch failed')
  if (mode === 'changed') return { data: null, error: { message: 'PRICE_CHANGED' } }
  return { data: 'tx', error: null }
} }
setLandsClientForTests(fake); setWalletClientForTests(fake)
await startLands()
t('peta dimuat dan angka bigint diubah jadi number', lands.list.length === 2 && lands.byId.get('P-01')!.base_price === 720000 && lands.byId.get('P-01')!.buy_price === 720000 && lands.byId.get('P-02')!.listed_price === 800000)
t('parameter ekonomi dibaca dari server (buyback 70%, maks 10 lahan)', lands.cfg.buybackPct === 70 && lands.cfg.maxLands === 10 && lands.cfg.maxMult === 10)

let r = await buyLand('P-01', 720000)
const bc = calls.find((c) => c.fn === 'buy_land')!
t('nama parameter buy_land sesuai SQL', JSON.stringify(Object.keys(bc.args)) === '["p_land_id","p_expected_price","p_key"]' && bc.args.p_expected_price === 720000)
t('beli sukses: pesan jelas dan kunci dibuang', r.ok && r.message.includes('P-01') && lands.pending === null)
calls.length = 0; await sellToVillage('P-02')
t('nama parameter sell_land_to_village sesuai SQL', JSON.stringify(Object.keys(calls.find((c) => c.fn === 'sell_land_to_village')!.args)) === '["p_land_id","p_key"]')
calls.length = 0; await setListing('P-02', 900000)
t('nama parameter set_land_listing sesuai SQL', JSON.stringify(calls.find((c) => c.fn === 'set_land_listing')!.args) === '{"p_land_id":"P-02","p_price":900000}')
calls.length = 0; await setListing('P-02', null)
t('batalkan listing mengirim p_price null', calls.find((c) => c.fn === 'set_land_listing')!.args.p_price === null)
for (const bad2 of [0, -5, 1.5, 7200001]) { calls.length = 0; const x = await setListing('P-01', bad2); t(`listing ${bad2} ditolak di klien tanpa memanggil server`, !x.ok && !calls.some((c) => c.fn === 'set_land_listing')) }

// Koneksi putus: hasil tidak pasti -> kunci sama dipakai saat coba lagi
mode = 'net'; calls.length = 0
const r1 = await buyLand('P-01', 720000); const k1 = calls.find((c) => c.fn === 'buy_land')!.args.p_key
t('koneksi putus: kunci disimpan, pesan "aman, tidak terkirim dua kali"', !r1.ok && r1.message.includes('tidak akan terkirim dua kali') && lands.pending?.key === k1)
mode = 'ok'; calls.length = 0; await buyLand('P-01', 720000)
t('coba lagi memakai kunci yang SAMA', calls.find((c) => c.fn === 'buy_land')!.args.p_key === k1)
mode = 'net'; await buyLand('P-01', 720000); mode = 'ok'; calls.length = 0
const k3 = lands.pending!.key; await buyLand('P-01', 730000)
t('harga yang dilihat berbeda -> kunci baru', calls.find((c) => c.fn === 'buy_land')!.args.p_key !== k3)
mode = 'changed'; const r2 = await buyLand('P-01', 720000)
t('server menolak PRICE_CHANGED: pesan jelas, kunci dibuang', !r2.ok && r2.message.includes('Harga berubah') && lands.pending === null)

// Klik ganda
mode = 'ok'; calls.length = 0; let release!: () => void; gate = new Promise<void>((res) => { release = res })
const p1 = buyLand('P-01', 720000), p2 = buyLand('P-01', 720000); const second = await p2; release(); await p1; gate = null
t('klik ganda: panggilan kedua ditolak lokal, hanya 1 RPC beli', !second.ok && calls.filter((c) => c.fn === 'buy_land').length === 1)
t('setelah aksi uang, peta dan dompet disegarkan dari server', calls.some((c) => c.fn === 'get_lands') && calls.some((c) => c.fn === 'get_wallet'))
stopLands(); setLandsClientForTests(null); setWalletClientForTests(null)
const none = await buyLand('P-01', 1)
t('tanpa klien/akun: ditolak dengan pesan', !none.ok && none.message.includes('akun'))
console.log('\n' + (bad.length ? 'GAGAL: ' + bad.join('; ') : 'SEMUA TES LAHAN KLIEN LULUS'))
process.exit(bad.length ? 1 : 0)
