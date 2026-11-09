export const NAME_RE = /^[A-Za-z0-9_]{3,16}$/
export const validateName = (n: string) => NAME_RE.test(n) ? null : 'Nama pemain 3-16 karakter: huruf, angka, atau garis bawah (_).'
export const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254 ? null : 'Format email tidak valid.'
export const validatePassword = (p: string) => p.length < 8 ? 'Password minimal 8 karakter.' : p.length > 72 ? 'Password maksimal 72 karakter.' : null

// Pemeriksaan konfigurasi Supabase: menolak kunci rahasia agar tidak pernah masuk ke browser.
export function validateConfig(url: string, key: string): string | null {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url.trim())) return 'Project URL harus berbentuk https://xxxx.supabase.co'
  const k = key.trim()
  if (k.startsWith('sb_secret_')) return 'Itu kunci RAHASIA. Jangan dipakai di browser. Pakai anon / publishable key.'
  if (k.startsWith('sb_publishable_')) return null
  const parts = k.split('.')
  if (parts.length !== 3) return 'Format key tidak dikenali. Pakai anon public key atau publishable key.'
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (payload.role === 'service_role') return 'Itu service_role key (RAHASIA). Jangan dipakai di browser. Pakai anon public key.'
    if (payload.role !== 'anon') return 'Key ini bukan anon key.'
  } catch { return 'Key tidak dapat dibaca. Salin ulang anon public key.' }
  return null
}

export function mapAuthError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login')) return 'Email atau password salah.'
  if (m.includes('not confirmed')) return 'Email belum diverifikasi. Cek kotak masuk kamu.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'Email ini sudah terdaftar. Silakan masuk.'
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.'
  if (m.includes('database error')) return 'Nama pemain sudah dipakai atau tidak valid.'
  if (m.includes('password') && (m.includes('weak') || m.includes('least'))) return 'Password terlalu lemah.'
  if (m.includes('fetch') || m.includes('network')) return 'Tidak bisa terhubung ke server. Cek koneksi internet.'
  return 'Terjadi kesalahan: ' + msg
}
