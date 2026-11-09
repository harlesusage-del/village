// Protokol klien <-> game server. Dipakai bersama oleh klien dan server.
export const ROOM_NAME = 'village'
export const TICK_HZ = 15           // frekuensi siaran snapshot dari server
export const VIS_ENTER = 50         // pemain lain terlihat jika lebih dekat dari ini (meter)
export const VIS_EXIT = 58          // hilang jika lebih jauh dari ini (histeresis agar tidak berkedip)
export const SEND_DT = 0.05         // klien mengirim input tiap 50 ms (20 Hz)
export const MAX_DT = 0.1           // server menolak langkah simulasi lebih besar dari ini per paket
export const RECONNECT_SECONDS = 30
export const CLOSE_REPLACED = 4001  // akun masuk dari tempat lain
export const CLOSE_FLOOD = 4002     // terlalu banyak pesan
export const ACTIONS = ['none', 'greeting', 'interacting', 'working'] as const
export const EXPRESSIONS = ['normal', 'senang', 'sedih', 'bingung', 'marah'] as const
export const SHIRTS = ['#3f7fbf', '#c0504d', '#4f9d5d', '#e0a030', '#8e5bb5', '#2fa4a9', '#d06a9a', '#6b7a8f']

// Pesan klien -> server: 'in' (input gerak), 'emote', 'ping'
export interface InMsg { s: number; d: number; x: number; y: number; w: number; r: 0 | 1; j: 0 | 1 }
export interface EmoteMsg { a: number; e: number }
// Pesan server -> klien: 'w' (welcome), 'e' (pemain masuk area), 'l' (pemain keluar area), 's' (snapshot), 'pong'
export interface Welcome { pid: number; name: string; shirt: string; x: number; y: number; z: number; f: number }
export interface EnterEntry { pid: number; name: string; shirt: string; st: EncState }
// Status ter-encode: [pid, x, y, z, facing, speed, flags]
export type EncState = [number, number, number, number, number, number, number]
export interface Snap { n: number; a: number; me: [number, number, number, number]; p: EncState[] }

export const packFlags = (grounded: boolean, action: number, expr: number, disc: boolean) =>
  (grounded ? 1 : 0) | (action << 1) | (expr << 3) | (disc ? 64 : 0)
export const unpackFlags = (f: number) => ({ grounded: !!(f & 1), action: (f >> 1) & 3, expr: (f >> 3) & 7, disc: !!(f & 64) })
export const r2 = (v: number) => Math.round(v * 100) / 100
