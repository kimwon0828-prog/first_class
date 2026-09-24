/** Only known same-product list routes can become a detail return destination. */
const RETURN_PARAMS: Record<string, readonly string[]> = {
  "/studio": ["preset", "startDate", "endDate"],
  "/studio/cases": ["view", "filter", "q", "page"],
  "/studio/schedule": ["view", "date", "teacherId", "classId", "status"],
  "/studio/applications": ["teacherId", "startDate", "endDate"]
}
export function resolveStudioDetailReturn(value: unknown): { pathname: string; search: string; label: string } {
  const fallback = { pathname: "/studio/cases", search: "", label: "상담·등록으로 돌아가기" }
  if (typeof value !== "string" || !value.startsWith("/studio") || /[\\\u0000-\u0020]/.test(value)) return fallback
  try {
    const url = new URL(value, "https://studio.invalid")
    const keys = RETURN_PARAMS[url.pathname]
    if (url.origin !== "https://studio.invalid" || !keys) return fallback
    const params = new URLSearchParams()
    for (const key of keys) {
      const entry = url.searchParams.get(key)
      if (entry && entry.length <= 300) params.set(key, entry)
    }
    const query = params.toString()
    return { pathname: url.pathname, search: query ? `?${query}` : "", label: url.pathname === "/studio" ? "대시보드로 돌아가기" : url.pathname === "/studio/schedule" ? "일정 관리로 돌아가기" : url.pathname === "/studio/applications" ? "신청 관리로 돌아가기" : fallback.label }
  } catch { return fallback }
}
