;(globalThis as any).window = globalThis
import { rp, validateTransfer, mapEconomyError } from '../src/economy/format'
import { wallet, sendMoney, refreshWallet, setWalletClientForTests } from '../src/economy/wallet'
import { ui } from '../src/core/interaction'

const bad: string[] = [], t = (n: string, ok: boolean, i = '') => { if (!ok) bad.push(n); console.log((ok ? 'OK    ' : 'GAGAL ') + n + (i ? '  ' + i : '')) }
const cfg = { min: 1, max: 5000000 }
t('format rupiah', rp(1000000) === 'Rp 1.000.000' && rp(0) === 'Rp 0', rp(1234567))
t('jumlah "100.000" dibaca 100000', validateTransfer('Budi_01', '100.000', '', cfg).amount === 100000)
for (const [n, a, m] of [['ab', '100', ''], ['Budi', 'abc', ''], ['Budi', '0', ''], ['Budi', '-5', ''], ['Budi', '1,5', ''], ['Budi', '5000001', ''], ['Budi', '10', 'x'.repeat(101)], ['Bu di', '10', ''], ['Budi', '1'.repeat(16), '']])
  t(`validasi menolak (${n}|${a}|${m.length})`, !!validateTransfer(n, a, m, cfg).error)
t('kode error dipetakan pasti', mapEconomyError('INSUFFICIENT_FUNDS').definite && mapEconomyError('RATE_LIMITED').message.includes('Tunggu'))
t('error jaringan = hasil tidak pasti', !mapEconomyError('fetch failed').definite)

// Supabase tiruan
interface Call { fn: string; args: any }
const calls: Call[] = []; let mode: 'ok' | 'net' | 'insufficient' = 'ok'
let txRows: any[] = [], balance = 1000000, gate: Promise<void> | null = null
const fake: any = { rpc: async (fn: string, args: any) => {
  calls.push({ fn, args })
  if (fn === 'transfer_money') {
    if (gate) await gate
    if (mode === 'net') throw new Error('fetch failed')
    if (mode === 'insufficient') return { data: null, error: { message: 'INSUFFICIENT_FUNDS' } }
    balance -= args.p_amount; return { data: 'tx-1', error: null }
  }
  if (fn === 'get_wallet') return { data: balance, error: null }
  if (fn === 'get_transactions') return { data: txRows, error: null }
  return { data: null, error: null }
} }
setWalletClientForTests(fake)
await refreshWallet()
t('saldo dibaca dari server', wallet.balance === 1000000)

let r = await sendMoney('Siti', '50000', 'beras')
await new Promise((res) => setTimeout(res, 20))   // penyegaran saldo berjalan di latar belakang
const call = calls.find((c) => c.fn === 'transfer_money')!
t('nama parameter RPC sesuai SQL (p_to_name, p_amount, p_memo, p_key)', JSON.stringify(Object.keys(call.args)) === '["p_to_name","p_amount","p_memo","p_key"]')
t('transfer sukses dan saldo disegarkan dari server', r.ok && wallet.balance === 950000 && wallet.pending === null, r.message)
t('kunci idempotensi berformat valid (8-64, huruf/angka/-/_)', /^[A-Za-z0-9_-]{8,64}$/.test(call.args.p_key))

// Jaringan putus: hasil tidak pasti -> kunci dipertahankan, Coba Lagi memakai kunci yang SAMA
mode = 'net'; calls.length = 0
const r1 = await sendMoney('Siti', '70000', ''); const k1 = calls[0].args.p_key
t('jaringan putus: pesan "hasil tidak pasti", kunci disimpan', !r1.ok && r1.message.includes('tidak akan terkirim dua kali') && wallet.pending?.key === k1)
mode = 'ok'; calls.length = 0
const r2 = await sendMoney('Siti', '70000', '')
t('coba lagi memakai kunci yang sama (server mencegah dobel)', r2.ok && calls.find((c) => c.fn === 'transfer_money')!.args.p_key === k1)
mode = 'net'; calls.length = 0; await sendMoney('Siti', '70000', ''); const k3 = calls[0].args.p_key
mode = 'ok'; calls.length = 0; await sendMoney('Siti', '71000', '')
t('jumlah diubah -> kunci baru (bukan permintaan yang sama)', calls.find((c) => c.fn === 'transfer_money')!.args.p_key !== k3)

// Penolakan pasti: kunci dibuang
mode = 'insufficient'; const r3 = await sendMoney('Siti', '999', '')
t('ditolak server (saldo kurang): pesan jelas, kunci dibuang', !r3.ok && r3.message === 'Saldo tidak cukup.' && wallet.pending === null)

// Penjagaan klik ganda: dua panggilan bersamaan -> hanya satu RPC
mode = 'ok'; calls.length = 0
let release!: () => void; gate = new Promise<void>((res) => { release = res })
const p1 = sendMoney('Siti', '1000', ''), p2 = sendMoney('Siti', '1000', '')
const second = await p2
release(); await p1; gate = null
t('klik ganda: panggilan kedua ditolak lokal, hanya 1 RPC terkirim', !second.ok && calls.filter((c) => c.fn === 'transfer_money').length === 1, second.message)

// Notifikasi uang masuk (bukan pada pemuatan pertama)
txRows = [{ id: 'a1', kind: 'transfer', direction: 'masuk', amount: 25000, counterparty: 'Andi', memo: 'gaji', created_at: '2026-01-01T10:00:00.000001+00:00' }]
ui.toast = null; await refreshWallet()
t('uang masuk yang BARU memunculkan notifikasi', (ui.toast ?? '').includes('Rp 25.000') && (ui.toast ?? '').includes('Andi'), String(ui.toast))
ui.toast = null; await refreshWallet()
t('transaksi yang sama tidak diberitahukan dua kali', ui.toast === null)

setWalletClientForTests(null)
console.log('\n' + (bad.length ? 'GAGAL: ' + bad.join('; ') : 'SEMUA TES DOMPET KLIEN LULUS'))
process.exit(bad.length ? 1 : 0)
