import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { setPanel, snapshot, subscribe, ui } from '../core/interaction'
import { HALF_W, LAPANGAN, PADDIES, PASAR, PLOTS, ROADS, TYPE_LABEL, riverZ } from '../core/layout'
import { saved } from '../core/playerState'
import { rp } from '../economy/format'
import { wallet, walletSubscribe, walletVersion } from '../economy/wallet'
import { Land, buyLand, lands, landsSubscribe, landsVersion, sellToVillage, setListing } from '../land/lands'

const S = 1.5, W = 200 * S
const COLOR: Record<string, string> = { milik_saya: '#43a047', desa: '#ffe082', dijual: '#ff9800', dimiliki: '#b0bec5', tidak_dijual: '#e0e0e0' }
const STATUS_TEXT = (l: Land) => l.status === 'milik_saya' ? 'Milikmu' : l.status === 'desa' ? 'Milik desa, tersedia dibeli' : l.status === 'dijual' ? `Dijual oleh ${l.owner_name} seharga ${rp(l.listed_price ?? 0)}`
  : l.status === 'dimiliki' ? `Dimiliki ${l.owner_name ?? 'pemain lain'}, tidak dijual` : 'Tidak dijual (milik desa / penggunaan dibatasi)'
const RULES: Record<string, string> = {
  rumah: 'Lahan hunian. Penggunaan dibatasi: tidak boleh dijual atau dialihfungsikan.',
  perdagangan: 'Untuk toko, warung, atau kios. Pembangunan usaha tersedia di fase berikutnya.',
  usaha: 'Untuk bengkel, tempat pengolahan, atau usaha lain. Pembangunan tersedia di fase berikutnya.',
  pertanian: 'Untuk sawah dan ladang. Aktivitas bertani tersedia di fase pekerjaan.',
  perkebunan: 'Untuk kebun. Aktivitas berkebun tersedia di fase pekerjaan.',
  peternakan: 'Untuk kandang dan ternak. Aktivitas beternak tersedia di fase pekerjaan.',
  kosong: 'Lahan kosong tanpa peruntukan khusus.'
}
const box: React.CSSProperties = { background: 'rgba(25,35,48,.97)', color: '#fff', borderRadius: 14, padding: 16, width: 'min(680px,96vw)', maxHeight: '92vh', overflow: 'auto', fontFamily: 'system-ui,sans-serif' }
const btn: React.CSSProperties = { padding: '10px 14px', fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer' }
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 14, borderRadius: 8, border: '1px solid #556', margin: '4px 0 8px', background: '#fff', color: '#111' }

export default function LandPanel() {
  useSyncExternalStore(subscribe, snapshot); useSyncExternalStore(landsSubscribe, landsVersion); useSyncExternalStore(walletSubscribe, walletVersion)
  const [sel, setSel] = useState<string | null>(ui.landSel)
  const [step, setStep] = useState<'view' | 'buy' | 'sell'>('view')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [listPrice, setListPrice] = useState('')
  const cv = useRef<HTMLCanvasElement>(null)
  const land = sel ? lands.byId.get(sel) : undefined, plot = PLOTS.find((p) => p.id === sel)

  useEffect(() => { if (ui.landSel) { setSel(ui.landSel); setStep('view'); setMsg(null) } }, [ui.landSel])
  useEffect(() => {
    const draw = () => {
      const c = cv.current?.getContext('2d'); if (!c) return
      c.fillStyle = '#8fcf6e'; c.fillRect(0, 0, W, W)
      c.strokeStyle = '#4aa3d8'; c.lineWidth = HALF_W * 2 * S; c.beginPath()
      for (let x = -100; x <= 100; x += 4) { const px = (x + 100) * S, py = (riverZ(x) + 100) * S; x === -100 ? c.moveTo(px, py) : c.lineTo(px, py) }
      c.stroke()
      const rect = (x: number, z: number, w: number, d: number, f: string) => { c.fillStyle = f; c.fillRect((x - w / 2 + 100) * S, (z - d / 2 + 100) * S, w * S, d * S) }
      PADDIES.forEach((f) => rect(f.x, f.z, f.w, f.d, '#c5d86d')); rect(LAPANGAN.x, LAPANGAN.z, LAPANGAN.w, LAPANGAN.d, '#a5d86f'); rect(PASAR.x, PASAR.z, PASAR.w, PASAR.d, '#d7c9a3')
      ROADS.forEach((r) => rect(r.x, r.z, r.w, r.d, r.stone ? '#9a9aa0' : '#c2a878')); rect(0, -52, 16, 8, '#a84a32'); rect(0, 52, 5, 12, '#a9743f')
      c.font = '7px sans-serif'; c.textAlign = 'center'
      for (const p of PLOTS) {
        const l = lands.byId.get(p.id)
        rect(p.x, p.z, p.w, p.d, l ? COLOR[l.status] : '#cfd8dc')
        c.strokeStyle = p.id === sel ? '#000' : 'rgba(0,0,0,.35)'; c.lineWidth = p.id === sel ? 2.5 : 0.8
        c.strokeRect((p.x - p.w / 2 + 100) * S, (p.z - p.d / 2 + 100) * S, p.w * S, p.d * S)
        c.fillStyle = '#222'; c.fillText(p.id, (p.x + 100) * S, (p.z + 100) * S + 2.5)
      }
      c.fillStyle = '#e53935'; c.beginPath(); c.arc((saved.sim.x + 100) * S, (saved.sim.z + 100) * S, 4, 0, 7); c.fill()
    }
    draw(); const t = setInterval(draw, 250); return () => clearInterval(t)
  }, [sel, lands.v])

  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * 200 - 100, z = ((e.clientY - r.top) / r.height) * 200 - 100
    const p = PLOTS.find((q) => Math.abs(x - q.x) <= q.w / 2 && Math.abs(z - q.z) <= q.d / 2)
    if (p) { setSel(p.id); setStep('view'); setMsg(null); setListPrice('') }
  }
  const run = async (fn: () => Promise<{ ok: boolean; message: string }>) => { const r = await fn(); setMsg({ ok: r.ok, text: r.message }); setStep('view') }
  const mine = lands.list.filter((l) => l.is_mine && l.type !== 'rumah')
  const lp = Number(listPrice.replace(/[.\s]/g, ''))

  return (
    <div onPointerDown={(e) => e.stopPropagation()} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center' }}>
      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Peta Lahan</h3>
          <span style={{ fontSize: 13 }}>{wallet.balance !== null && <>Saldo: <b>{rp(wallet.balance)}</b></>} <button style={{ ...btn, padding: '4px 10px', background: '#445', color: '#fff', marginLeft: 8 }} onClick={() => setPanel(null)}>Tutup</button></span>
        </div>
        {!lands.loaded && <div style={{ fontSize: 13, margin: '8px 0', color: '#ffd9a0' }}>{lands.error ?? 'Data kepemilikan lahan hanya tersedia untuk pemain yang login (tamu hanya melihat peta).'}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
          <div>
            <canvas ref={cv} width={W} height={W} onClick={click} style={{ width: 'min(300px,90vw)', height: 'min(300px,90vw)', borderRadius: 8, cursor: 'pointer', display: 'block' }} />
            <div style={{ fontSize: 11, marginTop: 6, lineHeight: 1.6 }}>
              {[['milik_saya', 'Milikmu'], ['desa', 'Tersedia'], ['dijual', 'Dijual pemain'], ['dimiliki', 'Dimiliki'], ['tidak_dijual', 'Tidak dijual']].map(([k, t]) => <span key={k} style={{ marginRight: 8 }}><span style={{ display: 'inline-block', width: 10, height: 10, background: COLOR[k], border: '1px solid #222', marginRight: 3 }} />{t}</span>)}
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: '#e53935', marginRight: 3 }} />Kamu</span>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            {!plot ? <div style={{ fontSize: 14, opacity: 0.8 }}>Ketuk sebuah lahan di peta untuk melihat informasinya.{mine.length > 0 && <div style={{ marginTop: 10 }}><b>Lahanmu:</b> {mine.map((l) => <button key={l.id} style={{ ...btn, padding: '3px 8px', margin: '3px 4px 0 0', background: '#2f7d4f', color: '#fff' }} onClick={() => setSel(l.id)}>{l.id}</button>)}</div>}</div> : (
              <>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{plot.id} <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.8 }}>• {TYPE_LABEL[plot.type]}</span></div>
                <div style={{ fontSize: 13, lineHeight: 1.7, margin: '6px 0' }}>
                  Luas: {plot.w * plot.d} m² ({plot.w} × {plot.d} m)<br />
                  Harga dasar: {land ? rp(land.base_price) : '...'}<br />
                  Status: {land ? STATUS_TEXT(land) : 'Memuat...'}<br />
                  Aturan: {RULES[plot.type]}
                  {land?.disputed && <><br /><b style={{ color: '#ffb4ab' }}>Sedang dalam sengketa.</b></>}
                  {land?.build_obligation && <><br /><b style={{ color: '#ffd9a0' }}>Ada kewajiban pembangunan yang belum selesai.</b></>}
                </div>
                {land && step === 'view' && (
                  <>
                    {land.buy_price !== null && <button style={{ ...btn, background: '#2f7d4f', color: '#fff', width: '100%' }} disabled={lands.busy} onClick={() => { setMsg(null); setStep('buy') }}>Beli {rp(land.buy_price)}</button>}
                    {land.is_mine && land.type !== 'rumah' && <>
                      {land.sell_price !== null && <button style={{ ...btn, background: '#7a5c2f', color: '#fff', width: '100%', marginBottom: 8 }} disabled={lands.busy} onClick={() => { setMsg(null); setStep('sell') }}>Jual ke desa ({rp(land.sell_price)})</button>}
                      {land.sell_price === null && lands.cfg.buybackPct === 0 && <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Desa sedang tidak membeli kembali lahan.</div>}
                      {!land.restricted && !land.disputed && !land.build_obligation && <>
                        <input style={inp} inputMode="numeric" placeholder={'Harga jual ke pemain (maks ' + rp(land.base_price * lands.cfg.maxMult) + ')'} value={listPrice} onChange={(e) => setListPrice(e.target.value)} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button style={{ ...btn, background: '#e07a30', color: '#fff', flex: 1 }} disabled={lands.busy} onClick={() => void run(() => setListing(land.id, lp))}>Pasang dijual</button>
                          {land.listed_price !== null && <button style={{ ...btn, background: '#667', color: '#fff', flex: 1 }} disabled={lands.busy} onClick={() => void run(() => setListing(land.id, null))}>Batalkan penjualan</button>}
                        </div></>}
                    </>}
                  </>
                )}
                {land && step === 'buy' && land.buy_price !== null && (() => {
                  const after = (wallet.balance ?? 0) - land.buy_price
                  return (<>
                    <p style={{ fontSize: 14, margin: '4px 0 10px' }}>Beli lahan <b>{land.id}</b> seharga <b>{rp(land.buy_price)}</b> dari {land.owner_name ? <b>{land.owner_name}</b> : 'desa'}?<br />Saldo setelah beli: {after >= 0 ? rp(after) : <b style={{ color: '#ffb4ab' }}>kurang {rp(-after)}</b>}</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={{ ...btn, background: '#667', color: '#fff', flex: 1 }} disabled={lands.busy} onClick={() => setStep('view')}>Batal</button>
                      <button style={{ ...btn, background: '#2f7d4f', color: '#fff', flex: 1 }} disabled={lands.busy || after < 0} onClick={() => void run(() => buyLand(land.id, land.buy_price!))}>{lands.busy ? 'Memproses...' : lands.pending ? 'Ya, beli (coba lagi aman)' : 'Ya, beli'}</button>
                    </div></>)
                })()}
                {land && step === 'sell' && land.sell_price !== null && (
                  <>
                    <p style={{ fontSize: 14, margin: '4px 0 10px' }}>Jual lahan <b>{land.id}</b> ke desa seharga <b>{rp(land.sell_price)}</b> ({lands.cfg.buybackPct}% dari harga dasar)? Lahan kembali menjadi milik desa.</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={{ ...btn, background: '#667', color: '#fff', flex: 1 }} disabled={lands.busy} onClick={() => setStep('view')}>Batal</button>
                      <button style={{ ...btn, background: '#7a5c2f', color: '#fff', flex: 1 }} disabled={lands.busy} onClick={() => void run(() => sellToVillage(land.id))}>{lands.busy ? 'Memproses...' : 'Ya, jual'}</button>
                    </div></>
                )}
              </>
            )}
            {msg && <p style={{ color: msg.ok ? '#9be3b0' : '#ffb4ab', fontSize: 13, margin: '10px 0 0' }}>{msg.text}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
