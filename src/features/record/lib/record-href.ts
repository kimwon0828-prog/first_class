/** Preserve the existing child query on canonical Record links; callers validate ownership. */
export function withRecordChild(href: string, childId: string | null) {
  if (!childId) return href
  const [path, query = ""] = href.split("?")
  const params = new URLSearchParams(query)
  params.set("child", childId)
  return `${path}?${params.toString()}`
}
