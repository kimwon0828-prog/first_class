import { getSupabaseServerClient } from "@/integrations/supabase/server"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { isAttachmentId, REPORT_PHOTO_BUCKET } from "@/features/reports/lib/report-attachments"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const denied = () => new Response("사진을 볼 수 없습니다.", { status: 404, headers: { "Cache-Control": "private, no-store" } })
  if (!isAttachmentId(id)) return denied()
  const db = await getSupabaseServerClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return denied()
  // Caller identity goes through authenticated SQL. Never accept a client object path.
  const { data: file, error } = await db.rpc("read_report_attachment", { p_id: id })
  if (error || !file) return denied()
  const { data, error: downloadError } = await getSupabaseServiceRoleClient().storage.from(REPORT_PHOTO_BUCKET).download(file.object_path)
  if (downloadError || !data) return denied()
  return new Response(data, { headers: { "Content-Type": file.mime_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline", "Cross-Origin-Resource-Policy": "same-origin" } })
}
