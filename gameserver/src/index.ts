import 'dotenv/config'
import { startServer } from './server'

const port = Number(process.env.PORT || 2567)
await startServer(port)
console.log(`Village Life game server berjalan di ws://localhost:${port}`)
console.log('Supabase:', process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? 'dikonfigurasi' : 'BELUM dikonfigurasi (hanya tamu jika ALLOW_GUESTS=true)')
console.log('Tamu diizinkan:', process.env.ALLOW_GUESTS === 'true' ? 'YA (hanya untuk pengembangan)' : 'tidak')
