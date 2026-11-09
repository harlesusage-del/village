import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from '../auth/client'
import { mapEconomyError, rp } from '../economy/format'
import { refreshWallet } from '../economy/wallet'

export type LandStatus = 'milik_saya' | 'dimiliki' | 'dijual' | 'desa' | 'tidak_dijual'
export interface Land {
  id: string; type: string; x: number; z: number; w: number; d: number; base_price: number; owner_name: string | null; is_mine: boolean
  listed_price: number | null; status: LandStatus; restricted: boolean; disputed: boolean; build_obligation: boolean; buy_price: number | null; sell_price: number | null
}
export const lands = {
  v: 0, list: [] as Land[], byId: new Map<string, Land>(), loaded: false, busy: false, error: null as string | null,
  cfg: { buybackPct: 0, maxLands: 10, maxMult: 10 }, pending: null as null | { sig: string; key: string }
}
const ls = new Set<() => void>()
const emit = () => { lands.v++; ls.forEach((l) => l()) }
export const landsSubscribe = (l: () => void) => { ls.add(l); return () => { ls.delete(l) } }
export const landsVersion = () => lands.v

let override: SupabaseClient | null = null
export const setLandsClientForTests = (c: SupabaseClient | null) => { override = c }
const client = () => override ?? getSupabase()
let timer: ReturnType<typeof setInterval> | undefined
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

// Kepemilikan dan harga selalu dari server. Klien hanya menampilkan dan meminta aksi.
export async function refreshLands(): Promise<void> {
  const sb = client(); if (!sb) return
  try {
    const r = await sb.rpc('get_lands')
    if (r.error) { lands.error = mapEconomyError(r.error.message).message; emit(); return }
    lands.list = (r.data as Land[]).map((l) => ({ ...l, base_price: Number(l.base_price), listed_price: num(l.listed_price), buy_price: num(l.buy_price), sell_price: num(l.sell_price) }))
    lands.byId = new Map(lands.list.map((l) => [l.id, l])); lands.loaded = true; lands.error = null; emit()
  } catch { lands.error = 'Tidak bisa memuat peta lahan (koneksi).'; emit() }
}
export async function startLands() {
  const sb = client(); if (!sb) return
  const c = await sb.rpc('get_economy_config')
  if (!c.error && c.data) {
    const m = new Map((c.data as { key: string; value: number }[]).map((r) => [r.key, Number(r.value)]))
    lands.cfg = { buybackPct: m.get('village_buyback_pct') ?? 0, maxLands: m.get('max_lands_per_player') ?? 10, maxMult: m.get('max_listing_multiplier') ?? 10 }
  }
  await refreshLands()
  clearInterval(timer); timer = setInterval(() => { void refreshLands() }, 10000)
}
export function stopLands() {
  clearInterval(timer); lands.list = []; lands.byId = new Map(); lands.loaded = false; lands.pending = null; lands.busy = false; emit()
}

export interface Result { ok: boolean; message: string }
// Aksi uang (beli/jual): kunci idempotensi dipertahankan selama hasil tidak pasti, sehingga "coba lagi" tidak bisa memproses dua kali.
async function moneyAction(sig: string, run: (sb: SupabaseClient, key: string) => PromiseLike<{ error: { message: string } | null }>, okMsg: string): Promise<Result> {
  const sb = client()
  if (!sb) return { ok: false, message: 'Sistem lahan butuh akun.' }
  if (lands.busy) return { ok: false, message: 'Transaksi sebelumnya masih diproses.' }
  const key = lands.pending && lands.pending.sig === sig ? lands.pending.key : crypto.randomUUID()
  lands.pending = { sig, key }; lands.busy = true; emit()
  try {
    const r = await run(sb, key)
    if (r.error) { const e = mapEconomyError(r.error.message); if (e.definite) lands.pending = null; return { ok: false, message: e.message } }
    lands.pending = null
    return { ok: true, message: okMsg }
  } catch (err) {
    return { ok: false, message: mapEconomyError(err instanceof Error ? err.message : String(err)).message }
  } finally { lands.busy = false; emit(); void refreshLands(); void refreshWallet() }
}
export const buyLand = (id: string, expected: number) =>
  moneyAction(`buy|${id}|${expected}`, (sb, key) => sb.rpc('buy_land', { p_land_id: id, p_expected_price: expected, p_key: key }), 'Lahan ' + id + ' sekarang milikmu (' + rp(expected) + ').')
export const sellToVillage = (id: string) =>
  moneyAction(`sell|${id}`, (sb, key) => sb.rpc('sell_land_to_village', { p_land_id: id, p_key: key }), 'Lahan ' + id + ' dijual ke desa.')

// Memasang atau membatalkan harga jual ke pemain lain (aksi ini aman diulang, tidak memindahkan uang).
export async function setListing(id: string, price: number | null): Promise<Result> {
  const sb = client(); if (!sb) return { ok: false, message: 'Sistem lahan butuh akun.' }
  const land = lands.byId.get(id)
  if (price !== null) {
    if (!Number.isInteger(price) || price < 1) return { ok: false, message: 'Harga jual harus berupa angka bulat positif.' }
    if (land && price > land.base_price * lands.cfg.maxMult) return { ok: false, message: 'Harga jual maksimal ' + rp(land.base_price * lands.cfg.maxMult) + '.' }
  }
  if (lands.busy) return { ok: false, message: 'Transaksi sebelumnya masih diproses.' }
  lands.busy = true; emit()
  try {
    const r = await sb.rpc('set_land_listing', { p_land_id: id, p_price: price })
    if (r.error) return { ok: false, message: mapEconomyError(r.error.message).message }
    return { ok: true, message: price === null ? 'Penjualan dibatalkan.' : 'Lahan ' + id + ' dijual ke pemain seharga ' + rp(price) + '.' }
  } catch (err) { return { ok: false, message: mapEconomyError(err instanceof Error ? err.message : String(err)).message } }
  finally { lands.busy = false; emit(); void refreshLands() }
}
