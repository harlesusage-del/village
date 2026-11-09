import { PLOTS } from '../src/core/layout'
const slots = PLOTS.filter((p) => p.type === 'rumah').sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z) || a.id.localeCompare(b.id))
console.log(slots.map((p, i) => `  ('${p.id}', ${i + 1}, ${p.x}, ${p.z})`).join(',\n'))
