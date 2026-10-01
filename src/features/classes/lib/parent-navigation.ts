/** Only internal Parent destinations may become a header return link. */
export function safeParentReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20]/.test(value)) return null
  try {
    const url = new URL(value, "https://parent.invalid")
    if (url.origin !== "https://parent.invalid") return null
    const path = url.pathname
    if (!(path === "/" || /^\/(classes|academies|academy|record|my|favorites|notifications)(\/|$)/.test(path))) return null
    // Do not use task/mutation routes as a list-return destination.
    if (/\/(apply|actions)(\/|$)/.test(path)) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch { return null }
}

/** Child is the shared navigation context; search/edit/filter parameters stay local. */
export function withParentChild(href: string, child: string | null): string {
  if (!child || !href.startsWith("/") || href.startsWith("//")) return href
  const url = new URL(href, "https://parent.invalid")
  if (url.pathname === "/auth/sign-in") {
    const returnTo = url.searchParams.get("returnTo")
    if (returnTo) url.searchParams.set("returnTo", withParentChild(returnTo, child))
  } else if (url.pathname === "/" || /^\/(classes|record|my|favorites)(\/|$)/.test(url.pathname)) {
    // My carries the context between tabs; data queries still validate ownership.
    if (!url.searchParams.has("child")) url.searchParams.set("child", child)
  }
  return `${url.pathname}${url.search}${url.hash}`
}

export function parentDetailHref(href: string, from: string): string {
  const destination = safeParentReturnTo(href)
  const returnTo = safeParentReturnTo(from)
  if (!destination || !returnTo) return href
  const source = new URL(returnTo, "https://parent.invalid")
  const url = new URL(withParentChild(destination, source.searchParams.get("child")), "https://parent.invalid")
  // Preserve the immediate source including its own return path (report -> detail -> list).
  url.searchParams.set("returnTo", returnTo)
  return `${url.pathname}${url.search}${url.hash}`
}

/** Preserve only navigation context when authentication interrupts a Parent route. */
export function parentEntryHref(path: string, params: Record<string, string | string[] | undefined> = {}): string {
  const url = new URL(withParentChild(path, typeof params.child === "string" ? params.child : null), "https://parent.invalid")
  const returnTo = safeParentReturnTo(typeof params.returnTo === "string" ? params.returnTo : null)
  if (returnTo) url.searchParams.set("returnTo", returnTo)
  return `${url.pathname}${url.search}`
}
