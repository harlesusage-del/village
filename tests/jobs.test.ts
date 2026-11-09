;(globalThis as any).window = globalThis
import { jobs, refreshJobs, startJobs, stopJobs, chooseJob, plantCrop, carePlanting, harvestCrop, sellItem, buyItem, acceptWork, abandonWork, completeWork, secondsLeft, setJobsClientForTests } from '../src/jobs/jobs'
import { setWalletClientForTests } from '../src/economy/wallet'
import { mapEconomyError } from '../src/economy/format'
import { PLOTS } from '../src/core/layout'

const bad: string[] = [], t = (n: string, ok: boolean, i = '') => { if (!ok) bad.push(n); console.log((ok ? 'OK    ' : 'GAGAL ') + n + (i ? '  ' + i : '')) }
const calls: { fn: string; args: any }[] = []
let mode: 'ok' | 'net' | 'err' = 'ok', myJob: string | null = 'petani', gate: Promise<void> | null = null
const fake: any = { rpc: async (fn: string, args: any) => {
  calls.push({ fn, args })
  switch (fn) {
    case 'get_my_job': return { data: [{ job_id: myJob, changed_at: new Date().toISOString(), can_change_at: new Date(Date.now() + 120000).toISOString() }], error: null }
    case 'get_inventory': return { data: [{ item_id: 'sayuran', name: 'Sayuran', qty: '12' }], error: null }
    case 'get_plantings': return { data: [{ land_id: 'P-01', cell: 0, crop_id: 'sayuran', is_mine: true, progress: 0.5, ready: false, care_due: true, cares: 0, care_slots: 2, remaining_s: 90 }], error: null }
    case 'get_market': return { data: [{ item_id: 'padi', name: 'Padi', base_price: '1250', price: '1300', next_price: '1400', held: '3' }], error: null }
    case 'get_job_limits': return { data: [{ market_sold_24h: '1000', market_cap: '500000', wage_24h: '0', wage_cap: '300000', stock_cap: '200', inv_cap: '500' }], error: null }
    case 'get_crops': return { data: [{ id: 'sayuran', item_id: 'sayuran', name: 'Sayuran', seed_cost: '6000', grow_s: 180, care_slots: 2, base_yield: 10 }], error: null }
    case 'get_work_orders': return { data: [{ id: 'o1', title: 'Perbaikan jalan desa', site_x: 0, site_z: 20, duration_s: 60, wage: '25000', status: 'terbuka', is_mine: false, remaining_s: 60 }], error: null }
    case 'get_wallet': return { data: 1000000, error: null }
    case 'get_transactions': return { data: [], error: null }
    case 'harvest_crop': return { data: [{ item_id: 'sayuran', qty: 8 }], error: null }
  }
  if (gate) await gate
  if (mode === 'net') throw new Error('fetch failed')
  if (mode === 'err') return { data: null, error: { message: 'WRONG_JOB' } }
  return { data: 'ok', error: null }
} }
setJobsClientForTests(fake); setWalletClientForTests(fake)
await startJobs()
t('data pekerjaan dimuat dan angka bigint jadi number', jobs.job === 'petani' && jobs.market[0].price === 1300 && jobs.inventory[0].qty === 12 && jobs.limits!.market_cap === 500000 && jobs.crops[0].seed_cost === 6000)
t('daftar proyek hanya dimuat bila pekerja bangunan', !calls.some((c) => c.fn === 'get_work_orders'))
myJob = 'pekerja_bangunan'; await refreshJobs()
t('pekerja bangunan: proyek dimuat', jobs.orders.length === 1 && jobs.orders[0].wage === 25000)
myJob = 'petani'; await refreshJobs(); t('berganti ke petani mengosongkan daftar proyek', jobs.orders.length === 0)

const keysOf = (fn: string) => JSON.stringify(Object.keys(calls.filter((c) => c.fn === fn).pop()!.args))
await chooseJob('pedagang'); t('choose_job: parameter sesuai SQL', keysOf('choose_job') === '["p_job_id"]')
await plantCrop('P-01', 3, 'sayuran'); t('plant_crop: parameter sesuai SQL', keysOf('plant_crop') === '["p_land_id","p_cell","p_crop_id","p_key"]')
await carePlanting('P-01', 3); t('care_planting: parameter sesuai SQL', keysOf('care_planting') === '["p_land_id","p_cell"]')
const h = await harvestCrop('P-01', 3); t('harvest_crop: parameter sesuai SQL dan hasil panen ditampilkan', keysOf('harvest_crop') === '["p_land_id","p_cell"]' && h.ok && h.message.includes('8 sayuran'))
await sellItem('padi', 5, 1300); t('sell_item_to_market: parameter sesuai SQL', keysOf('sell_item_to_market') === '["p_item_id","p_qty","p_expected_unit","p_key"]')
await buyItem('padi', 5, 1300); t('buy_item_from_market: parameter sesuai SQL', keysOf('buy_item_from_market') === '["p_item_id","p_qty","p_expected_unit","p_key"]')
await acceptWork('o1'); t('accept_work: parameter sesuai SQL', keysOf('accept_work') === '["p_order_id"]')
await completeWork('o1'); t('complete_work: parameter sesuai SQL', keysOf('complete_work') === '["p_order_id","p_key"]')
await abandonWork('o1'); t('abandon_work: parameter sesuai SQL', keysOf('abandon_work') === '["p_order_id"]')

// Koneksi putus: kunci dipertahankan; berubah parameter -> kunci baru; ditolak pasti -> kunci dibuang
mode = 'net'; calls.length = 0
const r1 = await sellItem('padi', 5, 1300); const k1 = calls.find((c) => c.fn === 'sell_item_to_market')!.args.p_key
t('koneksi putus saat jual: kunci disimpan, pesan aman diulang', !r1.ok && r1.message.includes('tidak akan terkirim dua kali') && jobs.pending?.key === k1)
mode = 'ok'; calls.length = 0; await sellItem('padi', 5, 1300)
t('coba lagi memakai kunci yang SAMA', calls.find((c) => c.fn === 'sell_item_to_market')!.args.p_key === k1 && jobs.pending === null)
mode = 'net'; await sellItem('padi', 5, 1300); const k3 = jobs.pending!.key; mode = 'ok'; calls.length = 0; await sellItem('padi', 6, 1300)
t('jumlah diubah -> kunci baru', calls.find((c) => c.fn === 'sell_item_to_market')!.args.p_key !== k3)
mode = 'err'; const r2 = await plantCrop('P-01', 1, 'sayuran')
t('ditolak server (WRONG_JOB): pesan jelas, kunci dibuang', !r2.ok && r2.message.includes('pekerjaan') && jobs.pending === null)
mode = 'net'; await completeWork('o1'); const k5 = jobs.pending!.key; mode = 'ok'; calls.length = 0; await completeWork('o1')
t('selesaikan proyek: coba lagi pakai kunci sama (upah tidak bisa dobel)', calls.find((c) => c.fn === 'complete_work')!.args.p_key === k5)

// Klik ganda
mode = 'ok'; calls.length = 0; let release!: () => void; gate = new Promise<void>((res) => { release = res })
const p1 = buyItem('padi', 1, 1300), p2 = buyItem('padi', 1, 1300); const second = await p2; release(); await p1; gate = null
t('klik ganda: aksi kedua ditolak lokal, hanya 1 RPC beli', !second.ok && calls.filter((c) => c.fn === 'buy_item_from_market').length === 1)
t('setelah aksi uang, data pekerjaan dan dompet disegarkan dari server', calls.some((c) => c.fn === 'get_my_job') && calls.some((c) => c.fn === 'get_wallet'))

// Hitung mundur dan pesan error berparameter
const f0 = jobs.fetchedAt; jobs.fetchedAt = Date.now() - 10000
t('hitung mundur dari data server terakhir (90 dtk - 10 dtk)', secondsLeft(90) >= 79 && secondsLeft(90) <= 81); jobs.fetchedAt = f0
t('sisa waktu tidak pernah negatif', secondsLeft(-5) === 0)
t('pesan cooldown berisi menit', mapEconomyError('JOB_COOLDOWN:540').message.includes('9 menit'))
t('pesan terlalu cepat berisi detik', mapEconomyError('TOO_EARLY:23').message.includes('23 detik'))
for (const c of ['DAILY_CAP', 'INVENTORY_FULL', 'NOT_ENOUGH_ITEMS', 'STOCK_CAP', 'ORDER_TAKEN', 'ACTIVE_WORK', 'CELL_OCCUPIED', 'NOT_READY', 'ALREADY_CARED', 'NOT_FARMLAND']) t('kode error dipetakan pasti: ' + c, mapEconomyError('ERROR: ' + c).definite)

// Geometri petak tanaman (harus cocok dengan SQL: floor(w/4) * floor(d/4)) dan berada di dalam lahan
const farm = PLOTS.filter((p) => p.type === 'pertanian')
let geoOk = true, cellsTotal = 0
for (const p of farm) {
  const cols = Math.floor(p.w / 4), rows = Math.floor(p.d / 4); cellsTotal += cols * rows
  for (let c = 0; c < cols * rows; c++) {
    const x = p.x - (cols * 4) / 2 + 2 + (c % cols) * 4, z = p.z - (rows * 4) / 2 + 2 + Math.floor(c / cols) * 4
    if (Math.abs(x - p.x) + 1.6 > p.w / 2 + 1e-9 || Math.abs(z - p.z) + 1.6 > p.d / 2 + 1e-9) geoOk = false
  }
}
t('semua petak tanaman berada di dalam batas lahan pertanian', geoOk && farm.length === 5, farm.length + ' lahan, ' + cellsTotal + ' petak')
stopJobs(); setJobsClientForTests(null); setWalletClientForTests(null)
const none = await sellItem('padi', 1, 1); t('tanpa akun: ditolak dengan pesan', !none.ok && none.message.includes('akun'))
console.log('\n' + (bad.length ? 'GAGAL: ' + bad.join('; ') : 'SEMUA TES PEKERJAAN KLIEN LULUS'))
process.exit(bad.length ? 1 : 0)
