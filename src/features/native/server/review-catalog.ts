import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { ClassDetail, AvailableScheduleSlot } from "@/shared/lib/db/adapter"
import { requireAppReviewScope, REVIEW_DEMO_ORGANIZATION } from "@/shared/lib/db/app-store-review-access"
import { projectNativeCatalogClass, projectNativeMapLocation } from "./catalog-projection"
import { publicSlotProjection, homeSection, withinWeek, slotDurationMinutes, type CardSlotsResult } from "./catalog-slots"
import { cardSlots } from "./academy-cards"
import { isChildEligibleForClass } from "@/shared/constants/grade-options"

type Dependencies = {
  client: (token: string) => SupabaseClient
  detail: (db: SupabaseClient, id: string) => Promise<ClassDetail | null>
  slots: (db: SupabaseClient, id: string) => Promise<AvailableScheduleSlot[]>
  now?: () => number
}
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: {
  "Cache-Control": "private, no-store", Vary: "Authorization", "X-Content-Type-Options": "nosniff"
} })
// A separate authenticated endpoint: no public query parameter can expose inactive classes.
export function createNativeReviewCatalog(deps: Dependencies) {
  return async (request: Request, path: string[]): Promise<Response> => {
    const token = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(request.headers.get("authorization") ?? "")?.[1]
    if (!token || token.length > 8192) return reply({ error: "login_required" }, 401)
    try {
      const db = deps.client(token), scope = await requireAppReviewScope(db), url = new URL(request.url)
      const classRequest = path.length === 2 && path[0] === "classes"
      const academyRequest = path.length === 2 && path[0] === "academies"
      if (path.length !== 1 && !classRequest && !academyRequest) return reply({ error: "not_found" }, 404)
      if (path.length === 1 && !["home", "classes", "favorites", "academies"].includes(path[0])) return reply({ error: "not_found" }, 404)
      // Check membership before any privileged detail/schedule query.
      if (classRequest && !scope.classIds.includes(path[1])) return reply({ error: "not_found" }, 404)
      if (academyRequest && path[1] !== REVIEW_DEMO_ORGANIZATION) return reply({ error: "not_found" }, 404)
      const q = url.searchParams.get("q") ?? "", category = url.searchParams.get("subjectCategory") ?? "", grade = url.searchParams.get("grade") ?? ""
      const within = url.searchParams.get("within"), view = url.searchParams.get("view")
      if (q.length > 100 || category.length > 60 || grade.length > 30 ||
          (within !== null && (within !== "7d" || path.length !== 1 || path[0] !== "classes")) ||
          (view !== null && (!classRequest || !["summary", "availability"].includes(view)))) return reply({ error: "invalid_query" }, 400)
      const ids = classRequest ? [path[1]] : scope.classIds
      const loaded = await Promise.all(ids.map(id => deps.detail(db, id)))
      const all = loaded.filter((item): item is ClassDetail => item !== null)
      if (all.some(item => !ids.includes(item.id) || item.isActive || item.archivedAt || item.organization?.id !== REVIEW_DEMO_ORGANIZATION)) throw new Error("review_projection_mismatch")
      if (classRequest && !all.length) return reply({ error: "not_found" }, 404)
      if (classRequest && view === "summary") return reply({ ...projectNativeCatalogClass(all[0]), assignmentMode: all[0].assignmentMode })
      const now = deps.now?.() ?? Date.now()
      const slotEntries = await Promise.all(all.map(async item => {
        const data = await deps.slots(db, item.id)
        return [item.id, publicSlotProjection({ data, error: null })] as const
      }))
      const fullSlots = new Map(slotEntries)
      const slotsById = new Map<string, CardSlotsResult>(slotEntries.map(([id, slots]) => [id, { slots: cardSlots(slots, now), slotsError: null }]))
      const withSlots = (item: ClassDetail) => ({ ...projectNativeCatalogClass(item), slotsError: null, slots: slotsById.get(item.id)?.slots ?? [] })
      if (classRequest) {
        const availability = { feedback: { chips: [] }, slotsError: null, slots: fullSlots.get(all[0].id) ?? [] }
        return reply(view === "availability" ? availability : { ...projectNativeCatalogClass(all[0]), assignmentMode: all[0].assignmentMode, ...availability })
      }
      const org = all[0]?.organization
      const academy = org ? { id: REVIEW_DEMO_ORGANIZATION, displayName: [org.name, org.branchName].filter(Boolean).join(" "),
        subjectTags: [...new Set(all.map(item => projectNativeCatalogClass(item).subject))], locationLabel: [org.sigungu, org.bname].filter(Boolean).join(" "), logoImageUrl: null } : null
      if (academyRequest) {
        if (!org) return reply({ error: "not_found" }, 404)
        // Never return the demo operator's real phone, staff roster, or unrelated feedback.
        return reply({ organizationId: REVIEW_DEMO_ORGANIZATION, slug: REVIEW_DEMO_ORGANIZATION, name: org.name, branchName: org.branchName,
          mapLocation: projectNativeMapLocation(org.latitude,org.longitude),
          address: [org.address, org.addressDetail].filter(Boolean).join(" "), phone: null, regionLabel: academy!.locationLabel,
          logoImageUrl: null, coverImageUrl: null, shortDescription: null, description: null, operatingHours: null, parkingInfo: null, directions: null,
          feedback: { chips: [] }, classes: all.map(item => { const projected = withSlots(item); return { ...projected,
            programTypeLabel: item.programType === "level_test" ? "레벨테스트" : "체험수업", subjectLabel: projected.subject, targetAgeLabel: projected.targetAge,
            scheduleLabel: "일정 선택에서 확인", periodLabel: "일정 선택에서 확인", periodTone: "neutral", durationMinutes: slotDurationMinutes(projected.slots) } }) })
      }
      if (path[0] === "academies") return reply({ items: academy && (!q || academy.displayName.includes(q)) ? [academy] : [] })
      if (path[0] === "favorites") return reply({ items: all.map(projectNativeCatalogClass) })
      let items = all.filter(item => (!q || `${item.title} ${item.subject} ${item.organization?.name ?? ""}`.toLowerCase().includes(q.toLowerCase())) &&
        (!category || item.subjectCategoryCode === category || item.subjectCategoryId === category) &&
        (!grade || isChildEligibleForClass(grade, item.targetAge)) && (!url.searchParams.get("organization") || item.organization?.id === url.searchParams.get("organization")))
      const home = path[0] === "home" ? homeSection(items, slotsById, now) : null
      if (home) items = home.items.slice(0, 6)
      else if (within === "7d") items = withinWeek(items, slotsById, now)
      const categories = Array.from(new Map(all.filter(item => item.subjectCategoryId && item.subjectCategoryCode).map(item => [item.subjectCategoryId!, {
        id: item.subjectCategoryId!, code: item.subjectCategoryCode!, name: item.subjectCategoryName ?? item.subjectCategoryCode!
      }])).values())
      return reply({ items: items.map(withSlots), categories, locationLabel: academy?.locationLabel ?? "", academies: academy ? [academy] : [], academiesError: false, ...(home ? { section: home.section } : {}) })
    } catch { return reply({ error: "review_catalog_unavailable" }, 503) }
  }
}
