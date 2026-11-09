// Store UI kecil (prompt interaksi, toast, menu) tanpa library tambahan.
export const ui = { v: 0, prompt: null as string | null, toast: null as string | null, menu: false, panel: null as 'wallet' | 'land' | 'job' | null, landSel: null as string | null }
const ls = new Set<() => void>()
const emit = () => { ui.v++; ls.forEach((l) => l()) }
export const subscribe = (l: () => void) => { ls.add(l); return () => { ls.delete(l) } }
export const snapshot = () => ui.v
export function setPrompt(p: string | null) { if (ui.prompt !== p) { ui.prompt = p; emit() } }
let tt: number | undefined
export function showToast(t: string) {
  ui.toast = t; emit()
  window.clearTimeout(tt)
  tt = window.setTimeout(() => { ui.toast = null; emit() }, 4000)
}
export function setMenu(o: boolean) { if (ui.menu !== o) { ui.menu = o; emit() } }
export function setPanel(p: 'wallet' | 'land' | 'job' | null, sel?: string) {
  if (ui.panel === p && (p !== 'land' || sel === undefined || ui.landSel === sel)) return
  ui.panel = p; if (p === 'land' && sel !== undefined) ui.landSel = sel
  if (p) ui.menu = false
  emit()
}
