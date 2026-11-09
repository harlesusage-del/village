export const rp = (n: number) => 'Rp ' + Math.trunc(n).toLocaleString('id-ID')

export interface TransferCfg { min: number; max: number }
export interface Checked { error?: string; amount?: number; name?: string; memo?: string }
// Validasi di klien hanya untuk kenyamanan. Yang berwenang tetap database (semua aturan diperiksa ulang di sana).
export function validateTransfer(nameIn: string, amountIn: string, memoIn: string, cfg: TransferCfg): Checked {
  const name = nameIn.trim()
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return { error: 'Nama penerima tidak valid (3-16 huruf, angka, atau _).' }
  const digits = amountIn.replace(/[.\s]/g, '')
  if (!/^\d{1,15}$/.test(digits)) return { error: 'Jumlah harus berupa angka bulat.' }
  const amount = Number(digits)
  if (amount < cfg.min) return { error: 'Jumlah minimal ' + rp(cfg.min) + '.' }
  if (amount > cfg.max) return { error: 'Maksimal sekali kirim ' + rp(cfg.max) + '.' }
  const memo = memoIn.trim()
  if (memo.length > 100) return { error: 'Catatan maksimal 100 karakter.' }
  return { name, amount, memo }
}

const MSG: Record<string, string> = {
  INSUFFICIENT_FUNDS: 'Saldo tidak cukup.', RECIPIENT_NOT_FOUND: 'Pemain penerima tidak ditemukan.',
  SELF_TRANSFER: 'Tidak bisa mengirim uang ke diri sendiri.', AMOUNT_INVALID: 'Jumlah tidak valid.',
  AMOUNT_TOO_LARGE: 'Jumlah melebihi batas sekali kirim.', RATE_LIMITED: 'Terlalu banyak transfer. Tunggu sekitar satu menit.',
  ACCOUNT_FROZEN: 'Akunmu sedang dibekukan.', NOT_AUTHENTICATED: 'Sesi habis. Silakan masuk ulang.',
  WALLET_MISSING: 'Dompet belum siap. Coba lagi sebentar lagi.', KEY_REUSED: 'Permintaan bentrok. Ulangi pembayaran dari awal.',
  KEY_INVALID: 'Permintaan tidak valid. Ulangi pembayaran.',
  LAND_NOT_FOUND: 'Lahan tidak ditemukan.', LAND_NOT_FOR_SALE: 'Lahan ini tidak dijual.', ALREADY_OWNER: 'Lahan ini sudah milikmu.',
  PRICE_CHANGED: 'Harga berubah. Perbarui informasi lalu coba lagi untuk melihat harga terbaru.', LAND_LIMIT: 'Batas kepemilikan lahan sudah tercapai.',
  NOT_OWNER: 'Kamu bukan pemilik lahan ini.', LAND_RESTRICTED: 'Lahan ini penggunaannya dibatasi dan tidak boleh dijual.',
  LAND_DISPUTED: 'Lahan sedang dalam sengketa.', BUILD_OBLIGATION: 'Masih ada kewajiban pembangunan yang belum selesai.',
  BUYBACK_DISABLED: 'Desa sedang tidak membeli kembali lahan.', LISTING_PRICE_INVALID: 'Harga jual tidak valid.',
  WRONG_JOB: 'Aksi ini butuh pekerjaan yang sesuai. Pilih pekerjaan di menu Pekerjaan.', JOB_NOT_FOUND: 'Pekerjaan tidak dikenal.',
  NOT_FARMLAND: 'Hanya lahan pertanian yang bisa ditanami.', CELL_INVALID: 'Petak tidak valid.', CELL_OCCUPIED: 'Petak ini sudah ditanami.',
  CROP_NOT_FOUND: 'Tanaman tidak dikenal.', NO_PLANTING: 'Tidak ada tanaman di petak ini.', NOT_READY: 'Tanaman belum siap dipanen.',
  ALREADY_CARED: 'Tanaman sudah dirawat pada tahap ini. Tunggu tahap berikutnya.', ALREADY_READY: 'Tanaman sudah matang, tidak perlu dirawat lagi.',
  INVENTORY_FULL: 'Inventaris penuh untuk barang ini. Jual sebagian dulu.', NOT_ENOUGH_ITEMS: 'Stok barang tidak cukup.', QTY_INVALID: 'Jumlah tidak valid.',
  ITEM_NOT_FOUND: 'Barang tidak dikenal.', DAILY_CAP: 'Batas harian tercapai. Coba lagi besok (24 jam sejak transaksi).', STOCK_CAP: 'Melebihi batas stok pedagang.',
  ORDER_TAKEN: 'Proyek ini sudah diambil pekerja lain.', ACTIVE_WORK: 'Selesaikan atau tinggalkan proyekmu yang sedang berjalan dulu.',
  ORDER_NOT_FOUND: 'Proyek tidak ditemukan.', NOT_WORKER: 'Kamu bukan pengerja proyek ini.'
}
// definite=true: server sudah menolak dengan alasan pasti (uang tidak bergerak). false: hasil tidak diketahui (jaringan).
export function mapEconomyError(raw: string): { message: string; definite: boolean } {
  const cd = /JOB_COOLDOWN:(\d+)/.exec(raw)
  if (cd) { const n = Number(cd[1]); return { message: 'Belum bisa ganti pekerjaan. Tunggu ' + (n >= 60 ? Math.ceil(n / 60) + ' menit' : n + ' detik') + ' lagi.', definite: true } }
  const te = /TOO_EARLY:(\d+)/.exec(raw)
  if (te) return { message: 'Proyek belum selesai. Tunggu ' + te[1] + ' detik lagi.', definite: true }
  for (const code of Object.keys(MSG)) if (raw.includes(code)) return { message: MSG[code], definite: true }
  return { message: 'Hasil tidak pasti (koneksi bermasalah). Tekan Coba lagi: aman, uang tidak akan terkirim dua kali.', definite: false }
}
