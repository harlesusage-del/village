import { PLOTS } from '../src/core/layout'
// Harga dasar per m2 (nilai awal; di database harga bisa diubah admin dengan UPDATE land_plots).
const RATE: Record<string, number> = { rumah: 4000, perdagangan: 12000, usaha: 9000, pertanian: 5000, perkebunan: 4500, peternakan: 4000, kosong: 3000 }
console.log(PLOTS.map((p) => `  ('${p.id}', '${p.type}', ${p.x}, ${p.z}, ${p.w}, ${p.d}, ${Math.round(p.w * p.d * RATE[p.type])}, ${p.type === 'rumah' || p.id === 'D-01'})`).join(',\n'))
