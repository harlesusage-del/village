import { useRef } from 'react'
import { input } from '../input/input'

export default function MobileControls() {
  const base = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)
  const activeId = useRef<number | null>(null)
  const R = 50
  const update = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect()
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2)
    const l = Math.hypot(dx, dy)
    if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R }
    knob.current!.style.transform = `translate(${dx}px,${dy}px)`
    input.moveX = dx / R; input.moveY = -dy / R
  }
  const reset = () => {
    activeId.current = null
    knob.current!.style.transform = 'translate(0,0)'
    input.moveX = 0; input.moveY = 0
  }
  const btn: React.CSSProperties = { width: 64, height: 64, borderRadius: 32, border: 'none', background: 'rgba(255,255,255,.55)', fontSize: 14, fontWeight: 700 }
  return (
    <>
      <div ref={base}
        onPointerDown={(e) => { activeId.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); update(e) }}
        onPointerMove={(e) => { if (activeId.current === e.pointerId) update(e) }}
        onPointerUp={reset} onPointerCancel={reset}
        style={{ position: 'absolute', left: 24, bottom: 28, width: 140, height: 140, borderRadius: 70, background: 'rgba(255,255,255,.25)', display: 'grid', placeItems: 'center', touchAction: 'none' }}>
        <div ref={knob} style={{ width: 60, height: 60, borderRadius: 30, background: 'rgba(255,255,255,.7)' }} />
      </div>
      <div style={{ position: 'absolute', right: 24, bottom: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button style={btn} onPointerDown={() => { input.interact = true }}>Aksi</button>
        <button style={btn} onPointerDown={() => { input.jump = true }}>Lompat</button>
        <button style={btn} onPointerDown={() => { input.emote = 'greeting' }}>Sapa</button>
        <button style={btn} onPointerDown={() => { input.run = !input.run }}>Lari</button>
      </div>
    </>
  )
}
