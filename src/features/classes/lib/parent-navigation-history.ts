// Navigation metadata only. No page data, account data, or scroll cache is stored here.
let pending: { from: string; to: string } | null = null
const key = "firstsuupParentBack"
export function rememberParentNavigation(to: string) {
  pending = { from: location.pathname + location.search + location.hash, to }
}
export function attachParentBackEntry() {
  if (!pending) return
  const current = location.pathname + location.search + location.hash
  if (pending.to === current) {
    history.replaceState({ ...history.state, [key]: { from: pending.from, to: current } }, "", current)
    pending = null
  } else if (pending.from !== current) pending = null
}
export function canUseParentHistoryBack(destination: string) {
  const entry = history.state?.[key]
  return entry?.from === destination && entry?.to === location.pathname + location.search + location.hash
}
