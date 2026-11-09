import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from '../auth/client'
import { mapEconomyError, rp } from '../economy/format'
import { refreshWallet } from '../economy/wallet'

export interface Crop { id: string; item_id: string; name: string; seed_cost: number; grow_s: number; care_slots: number; base_yield: number }
export interface Planting { land_id: string; cell: number; crop_id: string; is_mine: boolean; progress: number; ready: boolean; care_due: boolean; cares: number; care_slots: number; remaining_s: number }
export interface MarketItem { item_id: string; name: string; base_price: number; price: number; next_price: number; held: number }
export interface Order { id: string; title: string; site_x: number; site_z: number; duration_s: number; wage: number; status: string; is_mine: boolean; remaining_s: number }
export interface Limits { market_sold_24h: number; market_cap: number; wage_24h: number; wage_cap: number; stock_cap: number; inv_cap: number }
export interface InvItem { item_id: string; name: string; qty: number }
export const JOBS = [
  { id: 'petani', name: 'Petani', desc: 'Menanam, merawat, dan memanen tanaman di lahan pertanian milikmu, lalu menjual hasilnya ke pasar.' },
  { id: 'pedagang', name: 'Pedagang', desc: 'Membeli barang di pasar grosir saat harga murah dan menjual saat harga tinggi.' },
  { id: 'pekerja_bangunan', name: 'Pekerja Bangunan', desc: 'Mengerjakan proyek konstruksi desa dan menerima upah setelah proyek selesai.' }
]

export const jobs = {
  v: 0, loaded: false, busy: false, error: null as string | null, fetchedAt: 0,
  job: null as string | null, canChangeAt: 0, crops: [] as Crop[], plantings: [] as Planting[], market: [] as MarketItem[],
  limits: null as Limits | null, orders: [] as Order[], inventory: [] as InvItem[], pending: null as null | { sig: string; key: string }
}
const ls = new Set<() => void>()
const emit = () => { jobs.v++; ls.forEach((l) => l()) }
export const jobsSubscribe = (l: () => void) => { ls.add(l); return () => { ls.delete(l) } }
export const jobsVersion = () => jobs.v

let override: SupabaseClient | null = null
export const setJobsClientForTests = (c: SupabaseClient | null) => { override = c }
const client = () => override ?? getSupabase()
let timer: ReturnType<typeof setInterval> | undefined
const n = (v: unknown) => Number(v)

// Semua data berasal dari server. Klien hanya menampilkan dan meminta aksi; server menentukan harga, waktu, dan hasil.
export async function refreshJobs(): Promise<void> {
  const sb = client(); if (!sb) return
  try {
    const mj = await sb.rpc('get_my_job')
    if (mj.error) { jobs.error = mapEconomyError(mj.error.message).message; emit(); return }
    const row = (mj.data as { job_id: string | null; can_change_at: string }[])[0]
    jobs.job = row?.job_id ?? null; jobs.canChangeAt = row?.can_change_at ? Date.parse(row.can_change_at) : 0
    const [inv, pl, mk, lim, cr, wo] = await Promise.all([
      sb.rpc('get_inventory'), sb.rpc('get_plantings'), sb.rpc('get_market'), sb.rpc('get_job_limits'),
      jobs.crops.length ? Promise.resolve(null) : sb.rpc('get_crops'),
      jobs.job === 'pekerja_bangunan' ? sb.rpc('get_work_orders') : Promise.resolve(null)
    ])
    if (!inv.error) jobs.inventory = (inv.data as InvItem[]).map((i) => ({ ...i, qty: n(i.qty) }))
    if (!pl.error) jobs.plantings = (pl.data as Planting[]).map((p) => ({ ...p, progress: n(p.progress) }))
    if (!mk.error) jobs.market = (mk.data as MarketItem[]).map((m) => ({ ...m, base_price: n(m.base_price), price: n(m.price), next_price: n(m.next_price), held: n(m.held) }))
    if (!lim.error && lim.data) { const r = (lim.data as Record<string, unknown>[])[0]; jobs.limits = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, n(v)])) as unknown as Limits }
    if (cr && !cr.error) jobs.crops = (cr.data as Crop[]).map((c) => ({ ...c, seed_cost: n(c.seed_cost) }))
    if (wo && !wo.error) jobs.orders = (wo.data as Order[]).map((o) => ({ ...o, wage: n(o.wage) })); else if (jobs.job !== 'pekerja_bangunan') jobs.orders = []
    jobs.loaded = true; jobs.error = null; jobs.fetchedAt = Date.now(); emit()
  } catch { jobs.error = 'Tidak bisa memuat data pekerjaan (koneksi).'; emit() }
}
export async function startJobs() {
  if (!client()) return
  jobs.crops = []; await refreshJobs()
  clearInterval(timer); timer = setInterval(() => { void refreshJobs() }, 8000)
}
export function stopJobs() {
  clearInterval(timer); Object.assign(jobs, { loaded: false, job: null, plantings: [], market: [], orders: [], inventory: [], limits: null, pending: null, busy: false, crops: [] }); emit()
}

export interface Result { ok: boolean; message: string }
type Rpc = PromiseLike<{ error: { message: string } | null }>
async function act(run: (sb: SupabaseClient) => Rpc, okMsg: string, money: boolean): Promise<Result> {
  const sb = client()
  if (!sb) return { ok: false, message: 'Sistem pekerjaan butuh akun.' }
  if (jobs.busy) return { ok: false, message: 'Aksi sebelumnya masih diproses.' }
  jobs.busy = true; emit()
  try {
    const r = await run(sb)
    return r.error ? { ok: false, message: mapEconomyError(r.error.message).message } : { ok: true, message: okMsg }
  } catch (e) { return { ok: false, message: mapEconomyError(e instanceof Error ? e.message : String(e)).message } }
  finally { jobs.busy = false; emit(); void refreshJobs(); if (money) void refreshWallet() }
}
// Aksi yang memindahkan uang: kunci idempotensi dipertahankan selama hasil tidak pasti, sehingga "coba lagi" tidak bisa memproses dua kali.
async function keyed(sig: string, run: (sb: SupabaseClient, key: string) => Rpc, okMsg: string): Promise<Result> {
  const key = jobs.pending && jobs.pending.sig === sig ? jobs.pending.key : crypto.randomUUID()
  jobs.pending = { sig, key }
  let definite = true
  const r = await act((sb) => run(sb, key), okMsg, true).then((x) => { if (!x.ok && x.message.includes('tidak akan terkirim dua kali')) definite = false; return x })
  if (r.ok || definite) jobs.pending = null
  return r
}

export const chooseJob = (id: string | null) => act((sb) => sb.rpc('choose_job', { p_job_id: id }), id ? 'Pekerjaan dipilih.' : 'Kamu berhenti bekerja.', false)
export const plantCrop = (landId: string, cell: number, cropId: string) =>
  keyed(`plant|${landId}|${cell}|${cropId}`, (sb, k) => sb.rpc('plant_crop', { p_land_id: landId, p_cell: cell, p_crop_id: cropId, p_key: k }), 'Bibit ditanam di ' + landId + ' petak ' + (cell + 1) + '.')
export const carePlanting = (landId: string, cell: number) => act((sb) => sb.rpc('care_planting', { p_land_id: landId, p_cell: cell }), 'Tanaman dirawat.', false)
export const harvestCrop = async (landId: string, cell: number): Promise<Result> => {
  let got = ''
  const r = await act(async (sb) => { const x = await sb.rpc('harvest_crop', { p_land_id: landId, p_cell: cell }); const row = (x.data as { item_id: string; qty: number }[] | null)?.[0]; if (row) got = row.qty + ' ' + row.item_id; return x }, '', false)
  return r.ok ? { ok: true, message: 'Panen berhasil: ' + got + ' masuk inventaris.' } : r
}
export const sellItem = (item: string, qty: number, unit: number) =>
  keyed(`sell|${item}|${qty}|${unit}`, (sb, k) => sb.rpc('sell_item_to_market', { p_item_id: item, p_qty: qty, p_expected_unit: unit, p_key: k }), 'Terjual ' + qty + ' ' + item + ' seharga ' + rp(qty * unit) + '.')
export const buyItem = (item: string, qty: number, unit: number) =>
  keyed(`buy|${item}|${qty}|${unit}`, (sb, k) => sb.rpc('buy_item_from_market', { p_item_id: item, p_qty: qty, p_expected_unit: unit, p_key: k }), 'Dibeli ' + qty + ' ' + item + ' seharga ' + rp(qty * unit) + '.')
export const acceptWork = (id: string) => act((sb) => sb.rpc('accept_work', { p_order_id: id }), 'Proyek diterima. Datangi lokasinya dan kerjakan.', false)
export const abandonWork = (id: string) => act((sb) => sb.rpc('abandon_work', { p_order_id: id }), 'Proyek ditinggalkan.', false)
export const completeWork = (id: string) => keyed(`work|${id}`, (sb, k) => sb.rpc('complete_work', { p_order_id: id, p_key: k }), 'Proyek selesai. Upah masuk ke dompet.')
// Sisa waktu (detik) yang dihitung dari data server terakhir, agar hitung mundur halus di antara pembaruan.
export const secondsLeft = (remaining: number) => Math.max(0, Math.ceil(remaining - (Date.now() - jobs.fetchedAt) / 1000))
