import { useState } from 'react'
import { useAuth } from './AuthContext'
import { saveConfig } from './client'
import { validateEmail, validateName, validatePassword } from './validation'

type Tab = 'masuk' | 'daftar' | 'reset'
const card: React.CSSProperties = { background: '#fff', color: '#1d2b36', borderRadius: 14, padding: 22, width: 'min(380px,92vw)', boxShadow: '0 10px 40px #0003', fontFamily: 'system-ui,sans-serif', maxHeight: '94vh', overflow: 'auto' }
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 15, borderRadius: 8, border: '1px solid #b8c4cc', margin: '4px 0 10px' }
const btn: React.CSSProperties = { width: '100%', padding: 11, fontSize: 15, fontWeight: 600, borderRadius: 8, border: 'none', background: '#2f7d4f', color: '#fff', cursor: 'pointer' }

function Wrap({ children }: { children: React.ReactNode }) {
  return <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(#9fd3f0,#cfe9c4)', display: 'grid', placeItems: 'center', overflow: 'auto' }}><div style={card}>{children}</div></div>
}

function Setup() {
  const [url, setUrl] = useState(''), [key, setKey] = useState(''), [err, setErr] = useState<string | null>(null)
  return (
    <>
      <p style={{ fontSize: 14, margin: '0 0 10px' }}>Supabase belum dikonfigurasi. Tempel <b>Project URL</b> dan <b>anon public key</b> dari proyek Supabase kamu. Jangan pernah memakai service_role key.</p>
      <label style={{ fontSize: 13 }}>Project URL<input style={inp} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" /></label>
      <label style={{ fontSize: 13 }}>Anon public key<input style={inp} value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJ... atau sb_publishable_..." /></label>
      {err && <p style={{ color: '#b3261e', fontSize: 13, margin: '0 0 8px' }}>{err}</p>}
      <button style={btn} onClick={() => { const e = saveConfig(url, key); if (e) setErr(e); else window.location.reload() }}>Simpan dan muat ulang</button>
    </>
  )
}

export default function AuthScreen() {
  const a = useAuth()
  const [tab, setTab] = useState<Tab>('masuk')
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [pw, setPw] = useState(''), [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [unverified, setUnverified] = useState(false)

  const run = async (check: string | null, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    if (busy) return
    if (check) { setMsg({ ok: false, text: check }); return }
    setBusy(true); setMsg(null); setUnverified(false)
    const r = await fn()
    setBusy(false)
    if (r.message) setMsg({ ok: r.ok, text: r.message })
    if (!r.ok && r.message?.includes('belum diverifikasi')) setUnverified(true)
  }

  if (a.status === 'loading') return <Wrap><p>Memuat...</p></Wrap>

  if (a.status === 'recovery') {
    return (
      <Wrap>
        <h3 style={{ margin: '0 0 10px' }}>Buat password baru</h3>
        <input style={inp} type="password" autoComplete="new-password" placeholder="Password baru" value={pw} onChange={(e) => setPw(e.target.value)} />
        <input style={inp} type="password" autoComplete="new-password" placeholder="Ulangi password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        {msg && <p style={{ color: msg.ok ? '#2f7d4f' : '#b3261e', fontSize: 13 }}>{msg.text}</p>}
        <button style={btn} disabled={busy} onClick={() => run(validatePassword(pw) ?? (pw !== pw2 ? 'Password tidak sama.' : null), () => a.updatePassword(pw))}>Simpan password</button>
      </Wrap>
    )
  }

  return (
    <Wrap>
      <h2 style={{ margin: '0 0 4px' }}>Village Life</h2>
      <p style={{ margin: '0 0 14px', fontSize: 13, opacity: 0.7 }}>Masuk untuk bermain di desa bersama.</p>
      {!a.configured ? (
        <>
          <Setup />
          <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #dde' }} />
          <button style={{ ...btn, background: '#667' }} onClick={a.playAsGuest}>Main sebagai tamu (uji coba lokal, tanpa akun)</button>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {(['masuk', 'daftar', 'reset'] as Tab[]).map((t) => (
              <button key={t} onClick={() => { setTab(t); setMsg(null); setUnverified(false) }}
                style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #b8c4cc', background: tab === t ? '#e6f2ea' : '#fff', fontWeight: tab === t ? 700 : 400, cursor: 'pointer' }}>
                {t === 'masuk' ? 'Masuk' : t === 'daftar' ? 'Daftar' : 'Lupa password'}
              </button>
            ))}
          </div>
          {tab === 'daftar' && <input style={inp} autoComplete="username" placeholder="Nama pemain (3-16, huruf/angka/_)" maxLength={16} value={name} onChange={(e) => setName(e.target.value)} />}
          <input style={inp} type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value.trim())} />
          {tab !== 'reset' && <input style={inp} type="password" autoComplete={tab === 'daftar' ? 'new-password' : 'current-password'} placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />}
          {tab === 'daftar' && <input style={inp} type="password" autoComplete="new-password" placeholder="Ulangi password" value={pw2} onChange={(e) => setPw2(e.target.value)} />}
          {msg && <p style={{ color: msg.ok ? '#2f7d4f' : '#b3261e', fontSize: 13, margin: '0 0 10px' }}>{msg.text}</p>}
          {unverified && <button style={{ ...btn, background: '#667', marginBottom: 10 }} disabled={busy} onClick={() => run(validateEmail(email), () => a.resend(email))}>Kirim ulang email verifikasi</button>}
          <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} disabled={busy}
            onClick={() => {
              if (tab === 'masuk') run(validateEmail(email) ?? (pw ? null : 'Isi password.'), () => a.signIn(email, pw))
              else if (tab === 'daftar') run(validateName(name) ?? validateEmail(email) ?? validatePassword(pw) ?? (pw !== pw2 ? 'Password tidak sama.' : null), () => a.signUp(name, email, pw))
              else run(validateEmail(email), () => a.sendReset(email))
            }}>
            {busy ? 'Memproses...' : tab === 'masuk' ? 'Masuk' : tab === 'daftar' ? 'Buat akun' : 'Kirim link reset'}
          </button>
        </>
      )}
    </Wrap>
  )
}
