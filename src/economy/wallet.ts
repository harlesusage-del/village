import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from '../auth/client'
import { showToast } from '../core/interaction'
import { mapEconomyError, rp, validateTransfer } from './format'

export interface Tx { id: string; kind: string; direction: 'masuk' | 'keluar'; amount: number; counterparty: string; memo: string; created_at: string }
export const wallet = {
  v: 0, balance: null as number | null, history: [] as Tx[], hasMore: true, loading: false, sending: false,
  error: null as string | null, cfg: { min: 1, max: 5000000 }, pending: null as null | { key: string; name: string; amount: number; memo: string }
}
const ls = new Set<() => void>()
const emit = () => { wallet.v++; ls.forEach((l) => l()) }
export const walletSubscribe = (l: () => void) => { ls.add(l); return () => { ls.delete(l) } }
export const walletVersion = () => wallet.v

let override: SupabaseClient | null = null
export const setWalletClientForTests = (c: SupabaseClient | null) => { override = c }
const client = () => override ?? getSupabase()
const PAGE = 30
let timer: ReturnType<typeof setInterval> | undefined, seen = new Set<string>(), firstLoad = true

function merge(list: Tx[]) {
  const m = new Map<string, Tx>(wallet.history.map((t) => [t.id, t]))
  for (const t of list) m.set(t.id, t)
  wallet.history = [...m.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? 1 : -1))
}

// Saldo dan riwayat selalu dari server (database). Klien tidak pernah menghitung atau menyimpan saldo sendiri.
export async function refreshWallet(): Promise<void> {
  const sb = client(); if (!sb) return
  try {
    const [b, h] = await Promise.all([sb.rpc('get_wallet'), sb.rpc('get_transactions', { p_limit: PAGE })])
    if (b.error) { wallet.error = mapEconomyError(b.error.message).message; emit(); return }
    wallet.balance = Number(b.data); wallet.error = null
    const rows = ((h.data ?? []) as Tx[]).map((t) => ({ ...t, amount: Number(t.amount) }))
    if (!h.error) {
      for (const t of rows) {
        if (!seen.has(t.id)) {
          seen.add(t.id)
          if (!firstLoad && t.direction === 'masuk') showToast('Kamu menerima ' + rp(t.amount) + ' dari ' + t.counterparty + (t.memo ? ' (' + t.memo + ')' : '') + '.')
        }
      }
      firstLoad = false
      merge(rows)
      if (wallet.history.length <= PAGE) wallet.hasMore = rows.length >= PAGE
    }
    emit()
  } catch { wallet.error = 'Tidak bisa memuat dompet (koneksi).'; emit() }
}
export async function loadMoreHistory(): Promise<void> {
  const sb = client(); const last = wallet.history[wallet.history.length - 1]
  if (!sb || !last || wallet.loading || !wallet.hasMore) return
  wallet.loading = true; emit()
  try {
    const r = await sb.rpc('get_transactions', { p_limit: PAGE, p_before: last.created_at })
    if (!r.error) { const rows = ((r.data ?? []) as Tx[]).map((t) => ({ ...t, amount: Number(t.amount) })); rows.forEach((t) => seen.add(t.id)); merge(rows); wallet.hasMore = rows.length >= PAGE }
  } finally { wallet.loading = false; emit() }
}
export async function startWallet() {
  const sb = client(); if (!sb) return
  seen = new Set(); firstLoad = true; wallet.history = []; wallet.balance = null; wallet.hasMore = true
  const c = await sb.rpc('get_economy_config')
  if (!c.error && c.data) {
    const m = new Map((c.data as { key: string; value: number }[]).map((r) => [r.key, Number(r.value)]))
    wallet.cfg = { min: m.get('min_transfer') ?? 1, max: m.get('max_transfer') ?? 5000000 }
  }
  await refreshWallet()
  clearInterval(timer); timer = setInterval(() => { void refreshWallet() }, 10000)
}
export function stopWallet() {
  clearInterval(timer); wallet.balance = null; wallet.history = []; wallet.pending = null; wallet.sending = false; emit()
}

export interface SendResult { ok: boolean; message: string }
// Kunci idempotensi dipertahankan selama hasil sebelumnya tidak pasti, sehingga "Coba lagi" tidak bisa mengirim dua kali.
export async function sendMoney(nameIn: string, amountIn: string, memoIn: string): Promise<SendResult> {
  const sb = client()
  if (!sb) return { ok: false, message: 'Dompet butuh akun.' }
  if (wallet.sending) return { ok: false, message: 'Pembayaran sebelumnya masih diproses.' }
  const c = validateTransfer(nameIn, amountIn, memoIn, wallet.cfg)
  if (c.error) return { ok: false, message: c.error }
  const p = wallet.pending
  const same = p && p.name === c.name && p.amount === c.amount && p.memo === c.memo
  const key = same ? p!.key : crypto.randomUUID()
  wallet.pending = { key, name: c.name!, amount: c.amount!, memo: c.memo! }
  wallet.sending = true; emit()
  try {
    const r = await sb.rpc('transfer_money', { p_to_name: c.name, p_amount: c.amount, p_memo: c.memo, p_key: key })
    if (r.error) {
      const e = mapEconomyError(r.error.message)
      if (e.definite) wallet.pending = null
      return { ok: false, message: e.message }
    }
    wallet.pending = null
    return { ok: true, message: 'Berhasil mengirim ' + rp(c.amount!) + ' ke ' + c.name + '.' }
  } catch (err) {
    return { ok: false, message: mapEconomyError(err instanceof Error ? err.message : String(err)).message }
  } finally {
    wallet.sending = false; emit(); void refreshWallet()
  }
}
