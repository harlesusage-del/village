import { ServerError } from 'colyseus'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export interface AuthData { userId: string; name: string; slot: string | null; role: string; guest: boolean }
let admin: SupabaseClient | null | undefined
// Service role key HANYA ada di environment server ini. Tidak pernah dikirim ke browser.
export function getAdmin(): SupabaseClient | null {
  if (admin === undefined) {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
    admin = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null
  }
  return admin
}
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/

export async function authenticate(options: { token?: unknown; guest?: unknown; name?: unknown }): Promise<AuthData> {
  if (options?.guest === true) {
    if (process.env.ALLOW_GUESTS !== 'true') throw new ServerError(403, 'GUEST_DITOLAK')
    const n = typeof options.name === 'string' && NAME_RE.test(options.name) ? options.name : 'Tamu' + Math.floor(1000 + Math.random() * 9000)
    return { userId: 'guest:' + Math.random().toString(36).slice(2), name: n, slot: null, role: 'penduduk', guest: true }
  }
  const sb = getAdmin()
  if (!sb) throw new ServerError(503, 'SERVER_BELUM_DIKONFIGURASI')
  if (typeof options?.token !== 'string' || options.token.length < 20 || options.token.length > 4096) throw new ServerError(401, 'TOKEN_TIDAK_VALID')
  const { data: u, error } = await sb.auth.getUser(options.token)
  if (error || !u.user) throw new ServerError(401, 'TOKEN_TIDAK_VALID')
  const { data: prof } = await sb.from('profiles').select('display_name,role,status').eq('id', u.user.id).maybeSingle()
  if (!prof || prof.status !== 'aktif') throw new ServerError(403, 'AKUN_TIDAK_AKTIF')
  const { data: home } = await sb.from('player_homes').select('slot_id').eq('player_id', u.user.id).maybeSingle()
  if (!home) throw new ServerError(409, 'BELUM_PUNYA_RUMAH')
  return { userId: u.user.id, name: prof.display_name, slot: home.slot_id, role: prof.role, guest: false }
}
