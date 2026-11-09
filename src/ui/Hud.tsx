import { useSyncExternalStore } from 'react'
import { setMenu, setPanel, snapshot, subscribe, ui } from '../core/interaction'
import WalletPanel from './WalletPanel'
import LandPanel from './LandPanel'
import JobPanel from './JobPanel'
import { JOBS, jobs, jobsSubscribe, jobsVersion } from '../jobs/jobs'
import { rp } from '../economy/format'
import { wallet, walletSubscribe, walletVersion } from '../economy/wallet'
import { input } from '../input/input'
import { useAuth } from '../auth/AuthContext'
import { mineHome } from '../core/homes'
import { net, netSubscribe, netVersion } from '../net/network'

type Quality = 'low' | 'medium' | 'high'
const glass: React.CSSProperties = { background: 'rgba(20,30,40,.55)', color: '#fff', borderRadius: 10, padding: '8px 12px', backdropFilter: 'blur(4px)' }
const FUTURE: [string, string][] = [['Bisnis', 'Phase 9'], ['Pengajuan', 'Phase 10'], ['Peta', 'belum dijadwalkan']]

export default function Hud({ quality, setQuality, touch }: { quality: Quality; setQuality: (q: Quality) => void; touch: boolean }) {
  useSyncExternalStore(subscribe, snapshot)
  useSyncExternalStore(netSubscribe, netVersion)
  useSyncExternalStore(walletSubscribe, walletVersion)
  useSyncExternalStore(jobsSubscribe, jobsVersion)
  const auth = useAuth()
  const p = auth.profile
  return (
    <>
      <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pointerEvents: 'none', fontFamily: 'system-ui,sans-serif' }}>
        <div style={{ ...glass, fontSize: 14 }}><b>{p ? p.display_name : 'Tamu'}</b> <span style={{ opacity: 0.7 }}>{p ? (p.role === 'kepala_desa' ? '• Kepala Desa' : '• Penduduk') : '• mode lokal, tanpa akun'}</span>{wallet.balance !== null && <div style={{ fontSize: 13, marginTop: 2 }}>Saldo: <b>{rp(wallet.balance)}</b>{jobs.job && <span style={{ opacity: 0.8 }}> • {JOBS.find((j) => j.id === jobs.job)?.name}</span>}</div>}<div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{net.status === 'online' ? `Online • ${net.count} pemain • ${net.ping || '-'} ms` : net.status === 'connecting' ? 'Menyambung ke server...' : net.status === 'reconnecting' ? 'Terputus, menyambung ulang...' : net.status === 'error' ? (net.error ?? 'Kesalahan koneksi') : 'Solo • ' + (net.error ?? 'server tidak terhubung')}</div></div>
        <button onPointerDown={() => setMenu(!ui.menu)} style={{ ...glass, border: 'none', fontSize: 18, pointerEvents: 'auto', cursor: 'pointer' }}>Menu</button>
      </div>
      {ui.toast && <div style={{ ...glass, position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', maxWidth: '80%', textAlign: 'center', fontSize: 14, fontFamily: 'system-ui,sans-serif' }}>{ui.toast}</div>}
      {ui.prompt && !ui.menu && <div style={{ ...glass, position: 'absolute', bottom: touch ? 180 : 60, left: '50%', transform: 'translateX(-50%)', fontSize: 15, fontFamily: 'system-ui,sans-serif' }}>{touch ? 'Ketuk Aksi' : 'Tekan E'}: {ui.prompt}</div>}
      {!touch && <div style={{ position: 'absolute', bottom: 12, left: 12, color: '#fff', textShadow: '0 1px 3px #0008', fontSize: 12, fontFamily: 'system-ui,sans-serif' }}>WASD jalan, Shift lari, Spasi lompat, E interaksi, G sapa, H kerja, 1-5 ekspresi, Esc menu</div>}
      {ui.panel === 'wallet' && <WalletPanel />}
      {ui.panel === 'land' && <LandPanel />}
      {ui.panel === 'job' && <JobPanel />}
      {ui.menu && (
        <div onPointerDown={(e) => e.stopPropagation()} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', fontFamily: 'system-ui,sans-serif' }}>
          <div style={{ ...glass, background: 'rgba(25,35,48,.95)', width: 'min(420px,92vw)', maxHeight: '88vh', overflow: 'auto', padding: 20 }}>
            <h3 style={{ margin: '0 0 12px' }}>Village Life (Phase 8)</h3>
            <label style={{ fontSize: 14 }}>Kualitas grafis{' '}
              <select value={quality} onChange={(e) => { setQuality(e.target.value as Quality); input.keys.clear() }}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
            </label>
            {p && <div style={{ fontSize: 14, margin: '14px 0 0', lineHeight: 1.6 }}>Profil: <b>{p.display_name}</b>, {p.role === 'kepala_desa' ? 'Kepala Desa' : 'Penduduk'}<br />Terdaftar sejak {new Date(p.created_at).toLocaleDateString('id-ID')}{mineHome() && <><br />Rumah: {mineHome()!.slot_id}</>}<br /><button onClick={() => { setMenu(false); void auth.signOut() }} style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer' }}>Keluar</button></div>}
            {!p && <button onClick={() => { setMenu(false); void auth.signOut() }} style={{ marginTop: 12, padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer' }}>Kembali ke layar masuk</button>}
            <button disabled={!p} onClick={() => setPanel('wallet')} style={{ marginTop: 12, width: '100%', padding: 10, fontSize: 15, borderRadius: 8, border: 'none', cursor: p ? 'pointer' : 'not-allowed', opacity: p ? 1 : 0.5 }}>{p ? 'Dompet' : 'Dompet (butuh akun)'}</button>
            <button disabled={!p} onClick={() => setPanel('job')} style={{ marginTop: 8, width: '100%', padding: 10, fontSize: 15, borderRadius: 8, border: 'none', cursor: p ? 'pointer' : 'not-allowed', opacity: p ? 1 : 0.5 }}>{p ? 'Pekerjaan' : 'Pekerjaan (butuh akun)'}</button>
            <button onClick={() => setPanel('land')} style={{ marginTop: 8, width: '100%', padding: 10, fontSize: 15, borderRadius: 8, border: 'none', cursor: 'pointer' }}>Peta lahan</button>
            <p style={{ fontSize: 13, opacity: 0.8, margin: '14px 0 6px' }}>Fitur berikut belum tersedia dan akan dibuat pada fase yang tertera:</p>
            {FUTURE.map(([n, ph]) => <div key={n} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '5px 0', borderTop: '1px solid rgba(255,255,255,.1)', opacity: 0.6 }}><span>{n}</span><span>{ph}</span></div>)}
            <button onClick={() => setMenu(false)} style={{ marginTop: 14, width: '100%', padding: 10, fontSize: 15, borderRadius: 8, border: 'none', cursor: 'pointer' }}>Lanjutkan</button>
          </div>
        </div>
      )}
    </>
  )
}
