import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

// Nama di atas karakter: sprite dengan tekstur kanvas (selalu menghadap kamera, tanpa font eksternal).
export default function NameTag({ text, y = 2.55 }: { text: string; y?: number }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64
    const g = c.getContext('2d')!
    g.fillStyle = 'rgba(15,25,35,0.6)'; g.beginPath(); g.roundRect(4, 8, 248, 48, 14); g.fill()
    g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(text, 128, 33, 232)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [text])
  useEffect(() => () => tex.dispose(), [tex])
  return <sprite position={[0, y, 0]} scale={[2.4, 0.6, 1]}><spriteMaterial map={tex} transparent depthWrite={false} /></sprite>
}
