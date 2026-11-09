import { useState, useSyncExternalStore } from 'react'
import { setPanel } from '../core/interaction'
import { rp, validateTransfer } from '../economy/format'
import { loadMoreHistory, sendMoney, wallet, walletSubscribe, walletVersion } from '../economy/wallet'

const box: React.CSSProperties = { background: 'rgba(25,35,48,.97)', color: '#fff', borderRadius: 14, padding: 18, width: 'min(440px,94vw)', maxHeight: '90vh', overflow: 'auto', fontFamily: 'system-ui,sans-serif' }
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 10px', fontSize: 15, borderRadius: 8, border: '1px solid #556', margin: '4px 0 10px', background: '#fff', color: '#111' }
const btn: React.CSSProperties = { padding: '10px 14px', fontSize: 15, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer' }

export default function WalletPanel() {
  useSyncExternalStore(walletSubscribe, walletVersion)
  const [name, setName] = useState(''), [amount, setAmount] = useState(''), [memo, setMemo] = useState('')
  const [step, setStep] = useState<'form' | 'confirm'>('form')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const checked = validateTransfer(name, amount, memo, wallet.cfg)

  const toConfirm = () => { if (checked.error) setMsg({ ok: false, text: checked.error }); else { setMsg(null); setStep('confirm') } }
  const doSend = async () => {
    const r = await sendMoney(name, amount, memo)
    setMsg({ ok: r.ok, text: r.message }); setStep('form')
    if (r.ok) { setAmount(''); setMemo('') }
  }
  return (
    <div onPointerDown={(e) => e.stopPropagation()} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center' }}>
      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Dompet</h3>
          <button style={{ ...btn, padding: '4px 10px', background: '#445', color: '#fff' }} onClick={() => setPanel(null)}>Tutup</button>
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, margin: '10px 0 2px' }}>{wallet.balance === null ? '...' : rp(wallet.balance)}</div>
        {wallet.error && <div style={{ color: '#ffb4ab', fontSize: 13 }}>{wallet.error}</div>}
        <hr style={{ border: 'none', borderTop: '1px solid #334', margin: '12px 0' }} />
        {step === 'form' ? (
          <>
            <b style={{ fontSize: 14 }}>Kirim uang</b>
            <input style={inp} placeholder="Nama pemain penerima" value={name} onChange={(e) => setName(e.target.value)} maxLength={16} />
            <input style={inp} placeholder={'Jumlah (maks ' + rp(wallet.cfg.max) + ')'} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <input style={inp} placeholder="Catatan (opsional)" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={100} />
            <button style={{ ...btn, background: '#2f7d4f', color: '#fff', width: '100%' }} disabled={wallet.sending} onClick={toConfirm}>Lanjut</button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 15, margin: '0 0 12px' }}>Kirim <b>{rp(checked.amount ?? 0)}</b> ke <b>{checked.name}</b>?{checked.memo ? ' Catatan: ' + checked.memo : ''}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...btn, background: '#667', color: '#fff', flex: 1 }} disabled={wallet.sending} onClick={() => setStep('form')}>Batal</button>
              <button style={{ ...btn, background: '#2f7d4f', color: '#fff', flex: 1 }} disabled={wallet.sending} onClick={() => void doSend()}>{wallet.sending ? 'Mengirim...' : wallet.pending ? 'Kirim (coba lagi aman)' : 'Kirim'}</button>
            </div>
          </>
        )}
        {msg && <p style={{ color: msg.ok ? '#9be3b0' : '#ffb4ab', fontSize: 13, margin: '10px 0 0' }}>{msg.text}</p>}
        <hr style={{ border: 'none', borderTop: '1px solid #334', margin: '14px 0 8px' }} />
        <b style={{ fontSize: 14 }}>Riwayat transaksi</b>
        {wallet.history.length === 0 && <div style={{ fontSize: 13, opacity: 0.7, padding: '8px 0' }}>Belum ada transaksi.</div>}
        {wallet.history.map((t) => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderTop: '1px solid #2a3445', fontSize: 13 }}>
            <div><div>{t.kind === 'saldo_awal' ? 'Saldo awal' : (t.direction === 'masuk' ? 'Dari ' : 'Ke ') + t.counterparty}</div>
              <div style={{ opacity: 0.6, fontSize: 11 }}>{new Date(t.created_at).toLocaleString('id-ID')}{t.memo && t.kind !== 'saldo_awal' ? ' • ' + t.memo : ''}</div></div>
            <div style={{ color: t.direction === 'masuk' ? '#9be3b0' : '#ffb4ab', fontWeight: 600, whiteSpace: 'nowrap' }}>{t.direction === 'masuk' ? '+' : '-'}{rp(t.amount)}</div>
          </div>
        ))}
        {wallet.hasMore && wallet.history.length > 0 && <button style={{ ...btn, marginTop: 8, width: '100%', background: '#334', color: '#fff' }} disabled={wallet.loading} onClick={() => void loadMoreHistory()}>{wallet.loading ? 'Memuat...' : 'Muat lebih lama'}</button>}
      </div>
    </div>
  )
}
