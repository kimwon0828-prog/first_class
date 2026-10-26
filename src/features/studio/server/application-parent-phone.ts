import "server-only"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

/**
 * 학부모에게 보내는 알림(확정 · 완료 · 취소 · 리포트 · 등록)에 쓸 신청서 번호.
 *
 * 학원 세션의 studio_trial_applications 는 등록 학생 · 엑셀 신청이 아니면 parent_phone 을 비워 준다
 * (20261026130000). 보내는 주체는 첫수업이므로 service role 로 읽되, 신청이 이 학원 수업인지 먼저 맞춘다.
 *
 * ⚠️ 발송에만 쓴다. action 결과 · props 로 클라이언트에 돌려주지 않는다.
 * 읽기에 실패해도 throw 하지 않는다 — 상태 변경은 이미 끝났고, 번호가 없으면 발송 쪽이 실패로 기록한다.
 */
export async function readApplicationParentPhoneForSend(
  applicationId: string,
  organizationId: string
): Promise<string | null> {
  try {
    const { data, error } = await getSupabaseServiceRoleClient()
      .from("trial_applications")
      .select("parent_phone, classes!inner(organization_id)")
      .eq("id", applicationId)
      .eq("classes.organization_id", organizationId)
      .maybeSingle()

    if (error) throw error
    return (data as { parent_phone: string | null } | null)?.parent_phone ?? null
  } catch {
    console.warn("[application-parent-phone] lookup failed; parent notification will record a missing phone")
    return null
  }
}
