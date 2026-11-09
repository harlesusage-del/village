import type { Sim } from './movement'
// State pemain lokal yang dipakai bersama (Player 3D, peta lahan). Di luar komponen agar tidak reset saat Canvas dibuat ulang.
export const saved = { sim: { x: 0, y: 0, z: 6, vy: 0, facing: Math.PI } as Sim, camF: 1, snap: false }
