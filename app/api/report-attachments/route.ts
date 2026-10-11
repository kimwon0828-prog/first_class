import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { requireStudioEntitlement } from "@/features/billing/lib/require-entitlement"
import { validateReportPhoto } from "@/features/reports/server/validate-report-photo"
import { REPORT_PHOTO_BUCKET, REPORT_PHOTO_BYTES, isAttachmentId } from "@/features/reports/lib/report-attachments"
export const runtime = "nodejs"
export const maxDuration = 60
const failure = (message: string, status: number) => NextResponse.json({ error: message }, { status })
export async function POST(request: Request) {
  // Cookie-authenticated mutation: reject cross-origin form submissions.
  if (request.headers.get("origin") !== new URL(request.url).origin) return failure("허용되지 않은 요청입니다.", 403)
  if (Number(request.headers.get("content-length")) > REPORT_PHOTO_BYTES + 65536) return failure("사진은 4MiB 이하로 선택해 주세요.", 413)
  const db = await getSupabaseServerClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return failure("로그인 후 다시 시도해 주세요.", 401)
  const { data: profile } = await db.from("profiles").select("role, organization_id").eq("id", user.id).maybeSingle()
  if (!profile?.organization_id || !["academy", "admin"].includes(profile.role)) return failure("사진 관리 권한이 없습니다.", 403)
  const entitlement = await requireStudioEntitlement(profile.organization_id, "canWriteTrialResults")
  if (!entitlement.allowed) return failure(entitlement.message, 403)
  let id: string | null = null
  try {
    const reader = request.body?.getReader()
    if (!reader) return failure("사진을 선택해 주세요.", 400)
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > REPORT_PHOTO_BYTES + 65536) { await reader.cancel(); return failure("사진은 4MiB 이하로 선택해 주세요.", 413) }
      chunks.push(value)
    }
    const form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData()
    const file = form.get("file"), applicationId = form.get("applicationId")
    if (!(file instanceof File) || !isAttachmentId(applicationId)) return failure("사진과 신청을 확인해 주세요.", 400)
    const photo = await validateReportPhoto(Buffer.from(await file.arrayBuffer()), file.type)
    const { data: reserved, error } = await db.rpc("reserve_report_attachment", { p_application_id: applicationId })
    if (error || !reserved) return failure(error?.message.includes("report_content_locked") ? "보낸 리포트에는 사진을 추가할 수 없어요." : "사진 업로드를 시작하지 못했어요. 권한과 서버 준비 상태를 확인한 뒤 다시 시도해 주세요.", 409)
    id = reserved.id
    const service = getSupabaseServiceRoleClient()
    const { error: uploadError } = await service.storage.from(REPORT_PHOTO_BUCKET).upload(reserved.object_path, photo.data, { contentType: photo.mimeType, upsert: false, cacheControl: "0" })
    if (uploadError) throw new Error("사진 업로드에 실패했어요. 입력 내용은 유지돼요. 다시 시도해 주세요.")
    const { data, error: finishError } = await service.rpc("finish_report_attachment", { p_id: id, p_width: photo.width, p_height: photo.height, p_mime: photo.mimeType, p_bytes: photo.data.length })
    if (finishError || !data) throw new Error("사진 업로드를 완료하지 못했어요. 다시 시도해 주세요.")
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    if (id) await getSupabaseServiceRoleClient().rpc("fail_report_attachment", { p_id: id })
    const message = error instanceof Error && /[가-힣]/.test(error.message) ? error.message : "이미지를 처리하지 못했어요. 파일 형식·용량을 확인하고 다시 시도해 주세요."
    return failure(message, 422)
  }
}
