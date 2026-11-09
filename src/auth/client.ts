import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { validateConfig } from './validation'

// Hanya anon/publishable key yang boleh ada di sini. Token sesi login disimpan otomatis oleh Supabase.
const STORE = 'village-life:supabase-config'
interface Cfg { url: string; key: string }
function load(): Cfg | null {
  const env = import.meta.env ?? {}
  const u = env.VITE_SUPABASE_URL as string | undefined, k = env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (u && k && !validateConfig(u, k)) return { url: u.trim(), key: k.trim() }
  try {
    const raw = localStorage.getItem(STORE)
    if (raw) { const c = JSON.parse(raw) as Cfg; if (!validateConfig(c.url, c.key)) return c }
  } catch { /* abaikan */ }
  return null
}
let client: SupabaseClient | null | undefined
export function getSupabase(): SupabaseClient | null {
  if (client === undefined) { const c = load(); client = c ? createClient(c.url, c.key) : null }
  return client
}
export function saveConfig(url: string, key: string): string | null {
  const err = validateConfig(url, key)
  if (err) return err
  localStorage.setItem(STORE, JSON.stringify({ url: url.trim(), key: key.trim() }))
  return null
}
export function clearConfig() { localStorage.removeItem(STORE) }
