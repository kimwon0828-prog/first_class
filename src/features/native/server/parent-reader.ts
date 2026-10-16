import { nativeAccount } from "./account"
import { readNativeNotifications, writeNativeNotificationRead } from "./notifications"
import type { SupabaseClient } from "@supabase/supabase-js"
import { decodeExperienceReportSnapshot } from "@/features/reports/lib/experience-report-snapshot"
import { isAttachmentId, REPORT_PHOTO_BUCKET } from "@/features/reports/lib/report-attachments"

// Every query uses the verified caller's JWT. The privileged storage reader is
// obtained only after the existing attachment RPC has authorized this caller.
export type NativeReaderDependencies = {
  pushDevice?: (request: Request, db: SupabaseClient) => Promise<Response>
  responses?: (request: Request, path: string[], db: SupabaseClient, userId: string) => Promise<Response>
  deletion?: (request: Request, db: SupabaseClient) => Promise<Response>
  application?: (request: Request, path: string[], db: SupabaseClient, userId: string) => Promise<Response>
  client: (token: string) => SupabaseClient
  storage: () => SupabaseClient
  presentation?: (rows: { id: string; class_id: string | null; class_organization_id: string | null }[]) => Promise<Record<string, NativePresentation>>
}
// 신청·리포트 응답에 덧붙이는 학원·수업 표시 정보(읽기 전용, 추가 필드만).
export type NativePresentation = {
  academy_name: string | null; address: string | null; cover_image_url: string | null
  organization_id: string | null; academy_logo_url: string | null; academy_handle: string | null; academy_phone: string | null
  // 예약 종료 시각과 길이. 근거가 없거나 조회하지 못하면 null 이고, 예전 앱은 이 필드를 쓰지 않는다.
  slot_end_at?: string | null; duration_minutes?: number | null
}
class ReadError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code) }
}
const fail = (status: number, code: string): never => { throw new ReadError(status, code) }
const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "private, no-store", "Vary": "Authorization" }
})
const APPLICATION_FIELDS = "id, class_id, class_organization_id, child_id, child_name, child_grade, class_title, class_program_type, selected_schedule_label, requested_slot_at, confirmed_slot_at, completed_at, canceled_at, status, created_at, can_cancel"

export function createNativeParentReader(deps: NativeReaderDependencies) {
  return async (request: Request, path: string[]): Promise<Response> => {
    try {
      const token = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(request.headers.get("authorization") ?? "")?.[1]
      if (!token || token.length > 8192) return json({ error: "login_required" }, 401)
      const db = deps.client(token)
      const { data: { user }, error: authError } = await db.auth.getUser(token)
      if (authError || !user) return json({ error: "login_required" }, 401)
      if (deps.deletion && path.length === 1 && path[0] === "account-deletion") return await deps.deletion(request, db)
      const [profile, deletion, phone] = await Promise.all([
        db.from("profiles").select("id, role, name").eq("id", user.id).maybeSingle(),
        db.rpc("get_my_parent_account_deletion_status"),
        db.rpc("get_my_parent_phone_status")
      ])
      if (profile.error || deletion.error || phone.error) fail(503, "account_unavailable")
      if (!profile.data || profile.data.role !== "parent") fail(403, "parent_required")
      if (deletion.data === true) fail(403, "account_deletion_pending")
      if (!phone.data || typeof phone.data.required !== "boolean" ||
          !(phone.data.phoneVerifiedAt === null || typeof phone.data.phoneVerifiedAt === "string")) fail(503, "account_unavailable")
      if (!phone.data.excluded && phone.data.required && phone.data.phoneVerifiedAt === null) fail(403, "phone_verification_required")
      if (path.length === 2 && path[0] === "notifications" && path[1] === "read") return await writeNativeNotificationRead(request, db, user.id)
      if (deps.pushDevice && path.length === 1 && path[0] === "push-devices") return await deps.pushDevice(request, db)
      if (deps.responses && path[0] === "applications" && path.length === 3 && ["cancel", "feedback"].includes(path[2])) return await deps.responses(request, path, db, user.id)
      if (deps.application && ((path[0] === "application-context" && path.length === 2 && request.method === "GET") || (path[0] === "applications" && path.length === 1 && request.method === "POST"))) return await deps.application(request, path, db, user.id)
      if (path[0] === "profile" || path[0] === "children") return await nativeAccount(request, path, db, user, Boolean(phone.data.phoneVerifiedAt))
      if (request.method !== "GET") return json({ error: "not_found" }, 404)
      if (path.length === 1 && path[0] === "session") return json({ id: user.id, name: profile.data!.name })
      if (path.length === 1 && path[0] === "notifications") return json(await readNativeNotifications(db, user.id))
      if (path[0] === "applications" && path.length === 1) {
        const rawPage = new URL(request.url).searchParams.get("page") ?? "0"
        if (!/^\d{1,5}$/.test(rawPage)) fail(400, "invalid_page")
        const page = Number(rawPage)
        const { data, error } = await db.from("my_trial_applications").select(APPLICATION_FIELDS)
          .eq("parent_id", user.id).order("created_at", { ascending: false }).order("id", { ascending: false })
          .range(page * 30, page * 30 + 30)
        if (error) fail(503, "applications_unavailable")
        const items = (data ?? []).slice(0, 30)
        const reports = items.length ? await db.from("experience_reports")
          .select("application_id").in("application_id", items.map(item => item.id)).eq("status", "published")
          : { data: [], error: null }
        if (reports.error) fail(503, "report_unavailable")
        const reportedIds = new Set((reports.data ?? []).map(report => report.application_id))
        const presentation = deps.presentation ? await deps.presentation(items) : {}
        return json({ items: items.map(item => ({ ...item, ...presentation[item.id], has_published_report: reportedIds.has(item.id) })), nextPage: (data?.length ?? 0) > 30 ? page + 1 : null })
      }
      if (path[0] === "applications" && (path.length === 2 || (path.length === 3 && path[2] === "report"))) {
        if (!isAttachmentId(path[1])) fail(404, "not_found")
        const own = await db.from("my_trial_applications").select(APPLICATION_FIELDS)
          .eq("parent_id", user.id).eq("id", path[1]).maybeSingle()
        if (own.error) fail(503, "application_unavailable")
        if (!own.data) fail(404, "not_found")
        if (path.length === 2) {
          const presentation = deps.presentation ? await deps.presentation([own.data!]) : {}
          return json({ ...own.data, ...presentation[own.data!.id] })
        }
        const report = await db.from("experience_reports")
          .select("id, content_version, content, published_at").eq("application_id", path[1]).eq("status", "published").maybeSingle()
        if (report.error) fail(503, "report_unavailable")
        if (!report.data) return json({ report: null })
        const content = decodeExperienceReportSnapshot(report.data.content_version, report.data.content)
        if (!content) fail(422, "report_format_unsupported")
        // 위에서 본인 신청으로 확인된 행(own)의 학원만 덧붙인다. 학원 정보를 못 불러와도 리포트는 그대로 보여 준다.
        let academy = {}
        if (deps.presentation) {
          try {
            const shown = (await deps.presentation([own.data!]))[own.data!.id]
            if (shown) academy = { organization_id: shown.organization_id, academy_name: shown.academy_name, academy_logo_url: shown.academy_logo_url, academy_handle: shown.academy_handle, academy_phone: shown.academy_phone }
          } catch { /* Report stays available without academy display fields. */ }
        }
        return json({ report: { id: report.data.id, contentVersion: report.data.content_version, publishedAt: report.data.published_at, content }, ...academy })
      }
      if (path[0] === "photos" && path.length === 2 && isAttachmentId(path[1])) {
        const { data: file, error } = await db.rpc("read_report_attachment", { p_id: path[1] })
        if (error || !file) fail(404, "not_found")
        const { data, error: readError } = await deps.storage().storage.from(REPORT_PHOTO_BUCKET).download(file.object_path)
        if (readError || !data) fail(503, "photo_unavailable")
        return new Response(data, { headers: {
          "Content-Type": file.mime_type, "Cache-Control": "private, no-store", "Vary": "Authorization",
          "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline"
        } })
      }
      return json({ error: "not_found" }, 404)
    } catch (error) {
      return error instanceof ReadError ? json({ error: error.code }, error.status) : json({ error: "temporarily_unavailable" }, 503)
    }
  }
}
