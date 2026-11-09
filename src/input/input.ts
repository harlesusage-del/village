// State input bersama (keyboard, joystick, drag kamera). Dibaca tiap frame, tanpa re-render React.
export const input = {
  moveX: 0, moveY: 0, // dari joystick (-1..1), moveY positif = maju
  run: false, jump: false, interact: false,
  emote: null as string | null, expr: -1,
  yaw: 0, pitch: 0.45,
  keys: new Set<string>()
}
export function axis() {
  const k = input.keys
  let x = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0)
  let y = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0)
  x += input.moveX; y += input.moveY
  const len = Math.hypot(x, y)
  if (len > 1) { x /= len; y /= len }
  return { x, y }
}
export function isRunning() { return input.run || input.keys.has('ShiftLeft') || input.keys.has('ShiftRight') }
export function wantsJump() { return input.jump || input.keys.has('Space') }
// Dipanggil sekali per frame: tap lompat hanya berlaku untuk frame itu, tidak antre sampai mendarat.
export function endFrame() { input.jump = false; input.interact = false; input.emote = null; input.expr = -1 }
export function rotateCamera(dx: number, dy: number) {
  input.yaw -= dx * 0.005
  input.pitch = Math.max(0.1, Math.min(1.2, input.pitch + dy * 0.004))
}
export function installKeyboard() {
  const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)
  const down = (e: KeyboardEvent) => {
    if (typing(e)) return
    input.keys.add(e.code)
    if (e.code === 'Space') e.preventDefault()
    if (e.repeat) return
    if (e.code === 'KeyE') input.interact = true
    else if (e.code === 'KeyG') input.emote = 'greeting'
    else if (e.code === 'KeyH') input.emote = 'working'
    else if (/^Digit[1-5]$/.test(e.code)) input.expr = Number(e.code.slice(5)) - 1
  }
  const up = (e: KeyboardEvent) => input.keys.delete(e.code)
  const blur = () => input.keys.clear()
  window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur)
  return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur) }
}
