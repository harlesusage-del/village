import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getSupabase } from './client'
import { mapAuthError } from './validation'

export interface Profile { id: string; display_name: string; role: 'penduduk' | 'kepala_desa'; created_at: string }
export type Status = 'loading' | 'signedOut' | 'signedIn' | 'recovery' | 'guest'
export interface Result { ok: boolean; message?: string }
interface Ctx {
  status: Status; profile: Profile | null; profileError: string | null; configured: boolean
  signUp(name: string, email: string, password: string): Promise<Result>
  signIn(email: string, password: string): Promise<Result>
  signOut(): Promise<void>
  sendReset(email: string): Promise<Result>
  updatePassword(password: string): Promise<Result>
  resend(email: string): Promise<Result>
  playAsGuest(): void
}
const AuthCtx = createContext<Ctx | null>(null)
export const useAuth = () => { const c = useContext(AuthCtx); if (!c) throw new Error('AuthProvider tidak ditemukan'); return c }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const sb = getSupabase()
  const [status, setStatus] = useState<Status>(sb ? 'loading' : 'signedOut')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)

  const loadProfile = useCallback(async (uid: string) => {
    if (!sb) return
    const { data, error } = await sb.from('profiles').select('id,display_name,role,created_at').eq('id', uid).maybeSingle()
    if (error) { setProfileError('Gagal memuat profil: ' + error.message); setProfile(null) }
    else if (!data) { setProfileError('Profil tidak ditemukan. Pastikan SQL migrasi sudah dijalankan.'); setProfile(null) }
    else { setProfile(data as Profile); setProfileError(null) }
  }, [sb])

  useEffect(() => {
    if (!sb) return
    let alive = true
    sb.auth.getSession().then(({ data }) => {
      if (!alive) return
      if (data.session) { setStatus((s) => (s === 'recovery' ? s : 'signedIn')); void loadProfile(data.session.user.id) }
      else setStatus((s) => (s === 'recovery' ? s : 'signedOut'))
    })
    // Jangan memanggil Supabase langsung di dalam callback ini (bisa deadlock), maka pakai setTimeout.
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { setStatus('recovery'); return }
      if (session) { setStatus((s) => (s === 'recovery' ? s : 'signedIn')); setTimeout(() => { if (alive) void loadProfile(session.user.id) }, 0) }
      else { setStatus('signedOut'); setProfile(null); setProfileError(null) }
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [sb, loadProfile])

  const api = useMemo<Ctx>(() => {
    const need = (): Result | null => (sb ? null : { ok: false, message: 'Supabase belum dikonfigurasi.' })
    const wrap = async (fn: () => Promise<Result>): Promise<Result> => {
      try { return await fn() } catch (e) { return { ok: false, message: mapAuthError(e instanceof Error ? e.message : String(e)) } }
    }
    return {
      status, profile, profileError, configured: !!sb,
      signUp: (name, email, password) => wrap(async () => {
        const n = need(); if (n) return n
        const avail = await sb!.rpc('is_display_name_available', { p_name: name })
        if (avail.error) return { ok: false, message: 'Database belum siap. Jalankan SQL migrasi di Supabase terlebih dahulu.' }
        if (avail.data === false) return { ok: false, message: 'Nama pemain sudah dipakai.' }
        const { data, error } = await sb!.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: window.location.origin + window.location.pathname } })
        if (error) return { ok: false, message: mapAuthError(error.message) }
        if (data.user && data.user.identities && data.user.identities.length === 0) return { ok: false, message: 'Email ini sudah terdaftar. Silakan masuk atau reset password.' }
        if (!data.session) return { ok: true, message: 'Pendaftaran berhasil. Kami mengirim link verifikasi ke ' + email + '. Klik link itu, lalu masuk.' }
        return { ok: true }
      }),
      signIn: (email, password) => wrap(async () => {
        const n = need(); if (n) return n
        const { error } = await sb!.auth.signInWithPassword({ email, password })
        return error ? { ok: false, message: mapAuthError(error.message) } : { ok: true }
      }),
      signOut: async () => { if (sb) await sb.auth.signOut(); setProfile(null); setStatus('signedOut') },
      sendReset: (email) => wrap(async () => {
        const n = need(); if (n) return n
        const { error } = await sb!.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname })
        return error ? { ok: false, message: mapAuthError(error.message) } : { ok: true, message: 'Jika email terdaftar, link reset password sudah dikirim.' }
      }),
      updatePassword: (password) => wrap(async () => {
        const n = need(); if (n) return n
        const { error } = await sb!.auth.updateUser({ password })
        if (error) return { ok: false, message: mapAuthError(error.message) }
        setStatus('signedIn')
        return { ok: true, message: 'Password berhasil diganti.' }
      }),
      resend: (email) => wrap(async () => {
        const n = need(); if (n) return n
        const { error } = await sb!.auth.resend({ type: 'signup', email })
        return error ? { ok: false, message: mapAuthError(error.message) } : { ok: true, message: 'Email verifikasi dikirim ulang.' }
      }),
      playAsGuest: () => { if (!sb) setStatus('guest') }
    }
  }, [sb, status, profile, profileError])

  return <AuthCtx.Provider value={api}>{children}</AuthCtx.Provider>
}
