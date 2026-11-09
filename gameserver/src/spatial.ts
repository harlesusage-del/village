// Spatial partitioning: grid sel sederhana untuk interest management (siapa melihat siapa).
export class SpatialGrid {
  private cells = new Map<number, number[]>()
  constructor(private cell = 25) {}
  private key(cx: number, cz: number) { return (cx + 500) * 1000 + (cz + 500) }
  clear() { this.cells.clear() }
  insert(id: number, x: number, z: number) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))
    const l = this.cells.get(k)
    if (l) l.push(id); else this.cells.set(k, [id])
  }
  // Kandidat dari semua sel yang menyentuh lingkaran radius r (hasil perlu dicek jarak persisnya oleh pemanggil).
  query(x: number, z: number, r: number): number[] {
    const out: number[] = []
    const x0 = Math.floor((x - r) / this.cell), x1 = Math.floor((x + r) / this.cell)
    const z0 = Math.floor((z - r) / this.cell), z1 = Math.floor((z + r) / this.cell)
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const l = this.cells.get(this.key(cx, cz))
      if (l) for (const id of l) out.push(id)
    }
    return out
  }
}
