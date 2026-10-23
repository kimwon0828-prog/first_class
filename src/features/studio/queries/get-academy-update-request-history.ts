import "server-only"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

/** 학원 정보 화면의 "요청 이력". 상태 · 날짜 · 운영자 메모만 읽는다(요청 내용 스냅샷은 읽지 않는다). */
export type AcademyUpdateRequestHistoryItem = {
  id: string
  status: "pending" | "approved" | "rejected"
  createdAt: string
  reviewedAt: string | null
  adminNote: string | null
}

const HISTORY_LIMIT = 5

/**
 * 정보수정 요청 이력(최근 5건). 읽기 전용.
 * 검토 중 요청 조회(get-pending-academy-update-request)와 같은 방식이다 — 지금 로그인한 학원만 읽는다.
 */
export const getAcademyUpdateRequestHistory = async (
  organizationId: string
): Promise<AcademyUpdateRequestHistoryItem[]> => {
  const access = await requireTeacherStudioAccess()
  if (organizationId !== access.organizationId) {
    throw new Error("forbidden_studio_organization")
  }

  const { data, error } = await getSupabaseServiceRoleClient()
    .from("academy_update_requests")
    .select("id, status, created_at, reviewed_at, admin_note")
    .eq("organization_id", access.organizationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT)

  if (error) {
    throw new Error("failed_to_fetch_academy_update_request_history")
  }

  return (data ?? [])
    .filter((row): row is typeof row & { status: AcademyUpdateRequestHistoryItem["status"] } =>
      row.status === "pending" || row.status === "approved" || row.status === "rejected")
    .map((row) => ({
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at ?? null,
      adminNote: row.admin_note?.trim() || null
    }))
}
