import type { SupabaseClient } from '@supabase/supabase-js'
import { ALL_SOLIDS, HOUSE, INTERACTABLES, Interactable, PLOTS, SOLIDS } from './layout'

// Data rumah pemain dari database (RPC). Rumah menjadi objek 3D dan collision hanya jika slotnya dimiliki seseorang.
export interface Home { slot_id: string; owner_name: string; color: string; is_mine: boolean }
type St = 'idle' | 'loading' | 'ready' | 'error'
export const homes = { v: 0, list: [] as Home[], status: 'idle' as St, error: null as string | null }
const ls = new Set<() => void>()
const emit = () => { homes.v++; ls.forEach((l) => l()) }
export const homeSubscribe = (l: () => void) => { ls.add(l); return () => { ls.delete(l) } }
export const homeVersion = () => homes.v
export const homeStatus = () => homes.status

export function setHomes(list: Home[]) {
  const valid = list.filter((h) => PLOTS.some((p) => p.id === h.slot_id && p.type === 'rumah'))
  if (JSON.stringify(valid) === JSON.stringify(homes.list)) return
  homes.list = valid
  ALL_SOLIDS.length = SOLIDS.length
  for (const h of valid) { const p = PLOTS.find((q) => q.id === h.slot_id)!; ALL_SOLIDS.push({ x: p.x, z: p.z, w: HOUSE.w, d: HOUSE.d, h: HOUSE.h }) }
  emit()
}
export function resetHomes() {
  if (homes.status === 'idle' && homes.list.length === 0) return
  homes.list = []; homes.status = 'idle'; homes.error = null; ALL_SOLIDS.length = SOLIDS.length; emit()
}
export const mineHome = () => homes.list.find((h) => h.is_mine) ?? null
// Titik spawn: di depan pintu rumah (rumah menghadap +z), jauh dari dinding dan bebas collision.
export function spawnFor(slotId: string): { x: number; z: number } | null {
  const p = PLOTS.find((q) => q.id === slotId)
  return p ? { x: p.x, z: p.z + 4 } : null
}

const plotOf = (it: Interactable) => PLOTS.find((p) => p.id === it.id)
const ownerOf = (it: Interactable) => homes.list.find((h) => h.slot_id === it.id)
export function nameOf(it: Interactable): string {
  if (plotOf(it)?.type !== 'rumah') return it.name
  const h = ownerOf(it)
  return h ? (h.is_mine ? 'Rumahmu' : 'Rumah ' + h.owner_name) : it.id + ' (rumah tersedia)'
}
export function msgOf(it: Interactable): string {
  if (plotOf(it)?.type !== 'rumah') return it.msg
  const h = ownerOf(it)
  if (!h) return it.id + ': slot rumah kosong, akan dihuni pemain baru.'
  return (h.is_mine ? 'Ini rumahmu (' : 'Rumah milik ' + h.owner_name + ' (') + it.id + ').'
}
void INTERACTABLES

function fail(msg: string): null { homes.status = 'error'; homes.error = msg; emit(); return null }

// Idempotent: claim_home memberi rumah jika belum punya, atau mengembalikan rumah yang sudah ada.
export async function loadHome(sb: SupabaseClient): Promise<{ x: number; z: number } | null> {
  homes.status = 'loading'; homes.error = null; emit()
  try {
    const c = await sb.rpc('claim_home')
    if (c.error) return fail(c.error.message.includes('VILLAGE_FULL')
      ? 'Desa sudah penuh: belum ada rumah kosong. Hubungi Pak Lurah.'
      : 'Gagal menyiapkan rumah. Pastikan SQL migrasi 002 sudah dijalankan. (' + c.error.message + ')')
    const g = await sb.rpc('get_homes')
    if (g.error) return fail('Gagal memuat data rumah: ' + g.error.message)
    setHomes(g.data as Home[])
    const mine = mineHome()
    const sp = mine ? spawnFor(mine.slot_id) : null
    if (!sp) return fail('Rumahmu tidak ditemukan di peta desa.')
    homes.status = 'ready'; emit()
    return sp
  } catch (e) { return fail('Tidak bisa terhubung ke server: ' + (e instanceof Error ? e.message : String(e))) }
}
export async function refreshHomes(sb: SupabaseClient) {
  try { const g = await sb.rpc('get_homes'); if (!g.error && g.data) setHomes(g.data as Home[]) } catch { /* coba lagi pada interval berikut */ }
}
