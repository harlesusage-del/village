import { useEffect, useState, useSyncExternalStore } from 'react'
import { setPanel } from '../core/interaction'
import { PLOTS } from '../core/layout'
import { rp } from '../economy/format'
import { lands, landsSubscribe, landsVersion } from '../land/lands'
import { JOBS, abandonWork, acceptWork, buyItem, carePlanting, chooseJob, completeWork, harvestCrop, jobs, jobsSubscribe, jobsVersion, plantCrop, secondsLeft, sellItem } from '../jobs/jobs'
import { wallet, walletSubscribe, walletVersion } from '../economy/wallet'

const box: React.CSSProperties = { background: 'rgba(25,35,48,.97)', color: '#fff', borderRadius: 14, padding: 16, width: 'min(700px,96vw)', maxHeight: '92vh', overflow: 'auto', fontFamily: 'system-ui,sans-serif' }
const btn: React.CSSProperties = { padding: '8px 12px', fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer' }
const card: React.CSSProperties = { background: 'rgba(255,255,255,.07)', borderRadius: 10, padding: 10, margin: '8px 0' }
type Tab = 'job' | 'pasar' | 'tani' | 'bangun'
const fmtT = (s: number) => (s >= 60 ? Math.floor(s / 60) + ' mnt ' + (s % 60) + ' dtk' : s + ' dtk')

export default function JobPanel() {
  useSyncExternalStore(jobsSubscribe, jobsVersion); useSyncExternalStore(landsSubscribe, landsVersion); useSyncExternalStore(walletSubscribe, walletVersion)
  const [tick, setTick] = useState(0)
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t) }, [])
  void tick
  const [tab, setTab] = useState<Tab>('job')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [qty, setQty] = useState('1')
  const [landSel, setLandSel] = useState<string | null>(null)
  const [cellSel, setCellSel] = useState<number | null>(null)
  const run = async (f: () => Promise<{ ok: boolean; message: string }>) => { const r = await f(); setMsg({ ok: r.ok, text: r.message }); setConfirm(null) }
  const myJob = JOBS.find((j) => j.id === jobs.job)
  const wait = Math.max(0, Math.ceil((jobs.canChangeAt - Date.now()) / 1000))
  const q = Math.max(1, Math.min(1000, Math.floor(Number(qty) || 1)))
  const tabs: [Tab, string][] = [['job', 'Pekerjaan'], ['pasar', 'Pasar & Inventaris']]
  if (jobs.job === 'petani') tabs.push(['tani', 'Pertanian'])
  if (jobs.job === 'pekerja_bangunan') tabs.push(['bangun', 'Konstruksi'])

  const farms = lands.list.filter((l) => l.is_mine && l.type === 'pertanian')
  const farm = farms.find((l) => l.id === landSel) ?? farms[0]
  const cols = farm ? Math.floor(farm.w / 4) : 0, rows = farm ? Math.floor(farm.d / 4) : 0
  const plantAt = (c: number) => jobs.plantings.find((p) => farm && p.land_id === farm.id && p.cell === c)
  const sel = cellSel !== null ? plantAt(cellSel) : undefined

  return (
    <div onPointerDown={(e) => e.stopPropagation()} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center' }}>
      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Pekerjaan {myJob ? <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.8 }}>• {myJob.name}</span> : null}</h3>
          <span style={{ fontSize: 13 }}>{wallet.balance !== null && <>Saldo: <b>{rp(wallet.balance)}</b></>} <button style={{ ...btn, padding: '4px 10px', background: '#445', color: '#fff', marginLeft: 8 }} onClick={() => setPanel(null)}>Tutup</button></span>
        </div>
        <div style={{ display: 'flex', gap: 6, margin: '10px 0', flexWrap: 'wrap' }}>
          {tabs.map(([t, l]) => <button key={t} style={{ ...btn, background: tab === t ? '#2f7d4f' : '#334', color: '#fff' }} onClick={() => { setTab(t); setMsg(null); setConfirm(null) }}>{l}</button>)}
        </div>
        {!jobs.loaded && <div style={{ fontSize: 13, color: '#ffd9a0' }}>{jobs.error ?? 'Sistem pekerjaan hanya tersedia untuk pemain yang login.'}</div>}

        {tab === 'job' && JOBS.map((j) => (
          <div key={j.id} style={card}>
            <b>{j.name}</b>{jobs.job === j.id && <span style={{ color: '#9be3b0', marginLeft: 8, fontSize: 12 }}>pekerjaan saat ini</span>}
            <div style={{ fontSize: 13, opacity: 0.85, margin: '4px 0 8px' }}>{j.desc}</div>
            {confirm === j.id ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13 }}>Pilih {j.name}? Kamu baru bisa ganti lagi setelah jeda.</span>
                <button style={{ ...btn, background: '#667', color: '#fff' }} onClick={() => setConfirm(null)}>Batal</button>
                <button style={{ ...btn, background: '#2f7d4f', color: '#fff' }} disabled={jobs.busy} onClick={() => void run(() => chooseJob(j.id))}>Ya, pilih</button>
              </div>
            ) : <button style={{ ...btn, background: '#2f7d4f', color: '#fff', opacity: jobs.job === j.id || (jobs.job && wait > 0) ? 0.5 : 1 }} disabled={jobs.busy || jobs.job === j.id} onClick={() => { setMsg(null); setConfirm(j.id) }}>{jobs.job === j.id ? 'Dipilih' : 'Pilih'}</button>}
          </div>
        ))}
        {tab === 'job' && jobs.job && wait > 0 && <div style={{ fontSize: 12, opacity: 0.75 }}>Ganti pekerjaan bisa lagi dalam {fmtT(wait)}.</div>}

        {tab === 'pasar' && (
          <>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Harga pasar naik-turun menurut waktu (dihitung server). {jobs.limits && <>Terjual 24 jam: <b>{rp(jobs.limits.market_sold_24h)}</b> / {rp(jobs.limits.market_cap)}.</>}</div>
            <label style={{ fontSize: 13 }}>Jumlah <input style={{ width: 70, padding: 4, borderRadius: 6, border: '1px solid #556' }} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
            {jobs.market.map((m) => {
              const trend = m.next_price > m.price ? '▲' : m.next_price < m.price ? '▼' : '='
              return (
                <div key={m.item_id} style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div><b>{m.name}</b> <span style={{ fontSize: 12, opacity: 0.75 }}>stok kamu: {m.held}</span><br /><span style={{ fontSize: 13 }}>{rp(m.price)} <span style={{ color: trend === '▲' ? '#9be3b0' : trend === '▼' ? '#ffb4ab' : '#ccc' }}>{trend} {rp(m.next_price)} (10 mnt lagi)</span></span></div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={{ ...btn, background: '#7a5c2f', color: '#fff' }} disabled={jobs.busy || m.held < q} onClick={() => void run(() => sellItem(m.item_id, q, m.price))}>Jual {q}</button>
                    {jobs.job === 'pedagang' && <button style={{ ...btn, background: '#2f6d9b', color: '#fff' }} disabled={jobs.busy} onClick={() => void run(() => buyItem(m.item_id, q, m.price))}>Beli {q}</button>}
                  </div>
                </div>
              )
            })}
            {jobs.job === 'pedagang' && jobs.limits && <div style={{ fontSize: 12, opacity: 0.75 }}>Batas stok per barang: {jobs.limits.stock_cap}. Beli saat harga turun, jual saat naik.</div>}
            {jobs.job !== 'pedagang' && <div style={{ fontSize: 12, opacity: 0.75 }}>Pembelian grosir khusus pedagang.</div>}
          </>
        )}

        {tab === 'tani' && (farms.length === 0 ? <div style={{ fontSize: 14 }}>Kamu belum punya lahan pertanian. Beli di Peta lahan (jenis pertanian).</div> : (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>{farms.map((f) => <button key={f.id} style={{ ...btn, padding: '4px 10px', background: farm?.id === f.id ? '#2f7d4f' : '#334', color: '#fff' }} onClick={() => { setLandSel(f.id); setCellSel(null) }}>{f.id}</button>)}</div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 70px)`, gap: 6, marginBottom: 8 }}>
              {Array.from({ length: cols * rows }, (_, c) => {
                const p = plantAt(c), crop = p && jobs.crops.find((x) => x.id === p.crop_id)
                return <button key={c} onClick={() => { setCellSel(c); setMsg(null) }} style={{ height: 62, borderRadius: 8, border: cellSel === c ? '2px solid #fff' : '1px solid #556', background: p ? (p.ready ? '#c9a227' : '#2f7d4f') : '#3b4252', color: '#fff', fontSize: 11, cursor: 'pointer' }}>
                  {p ? <>{crop?.name}<br />{p.ready ? 'SIAP' : Math.round(p.progress * 100) + '%'}{p.care_due ? ' 💧' : ''}</> : 'kosong'}</button>
              })}
            </div>
            {cellSel !== null && farm && (sel ? (
              <div style={card}>
                <b>Petak {cellSel + 1}</b>: {jobs.crops.find((x) => x.id === sel.crop_id)?.name}, {sel.ready ? 'siap dipanen' : 'tumbuh ' + Math.round(sel.progress * 100) + '% (sisa ' + fmtT(secondsLeft(sel.remaining_s)) + ')'}<br />
                <span style={{ fontSize: 12, opacity: 0.8 }}>Perawatan: {sel.cares}/{sel.care_slots}. Makin banyak tahap terawat, makin besar panen (50%-100%).</span>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button style={{ ...btn, background: '#2f6d9b', color: '#fff', opacity: sel.care_due ? 1 : 0.5 }} disabled={jobs.busy || !sel.care_due || sel.ready} onClick={() => void run(() => carePlanting(farm.id, cellSel))}>Rawat / siram</button>
                  <button style={{ ...btn, background: '#c9a227', color: '#111', opacity: sel.ready ? 1 : 0.5 }} disabled={jobs.busy || !sel.ready} onClick={() => void run(() => harvestCrop(farm.id, cellSel))}>Panen</button>
                </div>
              </div>
            ) : (
              <div style={card}><b>Petak {cellSel + 1} kosong</b>. Pilih tanaman:
                {jobs.crops.map((c) => <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid #2a3445', fontSize: 13 }}>
                  <span><b>{c.name}</b>: bibit {rp(c.seed_cost)}, tumbuh {fmtT(c.grow_s)}, panen s.d. {c.base_yield} unit</span>
                  <button style={{ ...btn, background: '#2f7d4f', color: '#fff' }} disabled={jobs.busy} onClick={() => void run(() => plantCrop(farm.id, cellSel, c.id))}>Tanam</button></div>)}
              </div>
            ))}
          </>
        ))}

        {tab === 'bangun' && (
          <>
            {jobs.limits && <div style={{ fontSize: 12, opacity: 0.8 }}>Upah 24 jam: <b>{rp(jobs.limits.wage_24h)}</b> / {rp(jobs.limits.wage_cap)}</div>}
            {jobs.orders.length === 0 && <div style={{ fontSize: 13, opacity: 0.75, padding: '8px 0' }}>Belum ada proyek.</div>}
            {jobs.orders.map((o) => {
              const left = o.is_mine ? secondsLeft(o.remaining_s) : o.duration_s
              return (
                <div key={o.id} style={{ ...card, border: o.is_mine ? '1px solid #9be3b0' : 'none' }}>
                  <b>{o.title}</b> <span style={{ fontSize: 12, opacity: 0.75 }}>lokasi ({Math.round(o.site_x)}, {Math.round(o.site_z)}) • {fmtT(o.duration_s)} • upah {rp(o.wage)}</span>
                  <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                    {o.is_mine ? <>
                      <span style={{ fontSize: 13 }}>{left > 0 ? 'Sedang dikerjakan, sisa ' + fmtT(left) : 'Siap diselesaikan'}</span>
                      <button style={{ ...btn, background: '#c9a227', color: '#111', opacity: left > 0 ? 0.5 : 1 }} disabled={jobs.busy || left > 0} onClick={() => void run(() => completeWork(o.id))}>Selesaikan</button>
                      <button style={{ ...btn, background: '#667', color: '#fff' }} disabled={jobs.busy} onClick={() => void run(() => abandonWork(o.id))}>Tinggalkan</button></>
                      : <button style={{ ...btn, background: '#2f7d4f', color: '#fff' }} disabled={jobs.busy} onClick={() => void run(() => acceptWork(o.id))}>Terima proyek</button>}
                  </div>
                </div>
              )
            })}
          </>
        )}
        {msg && <p style={{ color: msg.ok ? '#9be3b0' : '#ffb4ab', fontSize: 13, margin: '10px 0 0' }}>{msg.text}</p>}
        <div style={{ fontSize: 11, opacity: 0.55, marginTop: 10 }}>Catatan: aksi pekerjaan belum mewajibkan berada di lokasi (batasan waktu, kepemilikan, dan batas harian sudah dijaga server).</div>
      </div>
    </div>
  )
}
