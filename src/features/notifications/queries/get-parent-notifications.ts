import "server-only"

import { getMyApplications } from "@/features/applications/queries/get-my-applications"
import {
  selectParentNotifications,
  type ParentApplicationStatusEvent,
  type ParentNotification,
  type ParentPublishedReportEvent
} from "@/features/notifications/lib/parent-notifications"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import type { ApplicationStatus } from "@/shared/lib/db/adapter"

/**
 * 알림함이 읽는 것.
 *
 * ⚠️ 새 table · migration · RLS · RPC 를 만들지 않는다. 이미 있는 두 자리에서만 읽는다.
 *      application_logs   — 상태가 실제로 바뀐 사건과 그 시각(created_at)
 *      experience_reports — 발행된 리포트와 그 시각(published_at)
 *    둘 다 학부모 본인 것만 보이도록 RLS 가 이미 좁혀 준다
 *    (application_logs_parent_select_self · experience_reports_parent_read_published).
 *
 * ⚠️ sms_logs 는 쓰지 않는다. RLS 가 teacher/operator 에게만 열려 있고,
 *    전화번호 · provider 응답 · template key 처럼 학부모가 볼 것이 아닌 값이 같이 있다.
 *    그 source 를 쓰려면 새 RLS 가 필요하므로 V1 에서는 쓰지 않는다.
 *
 * ⚠️ note 와 actor 이름을 select 하지 않는다. actor 는 "내가 한 일인가" 를
 *    가리는 데만 쓰고 화면으로 내보내지 않는다.
 *
 * ⚠️ 조회 실패를 "알림 없음" 으로 접지 않는다.
 */
export type ParentNotificationsResult = {
  notifications: ParentNotification[]
  error: string | null
}

const READ_FAILED = "알림을 불러오지 못했어요."

export const getParentNotifications = async (
  parentProfileId: string
): Promise<ParentNotificationsResult> => {
  const applications = await getMyApplications()

  if (applications.error) {
    return { notifications: [], error: READ_FAILED }
  }

  const applicationIds = applications.data.map((item) => item.id)
  if (applicationIds.length === 0) {
    return { notifications: [], error: null }
  }

  try {
    const supabase = await getSupabaseServerClient()

    const [logResult, reportResult] = await Promise.all([
      supabase
        .from("application_logs")
        .select("id, application_id, from_status, to_status, actor_id, created_at")
        .in("application_id", applicationIds),
      supabase
        .from("experience_reports")
        .select("id, application_id, published_at")
        .in("application_id", applicationIds)
        .eq("status", "published")
    ])

    if (logResult.error || reportResult.error) {
      return { notifications: [], error: READ_FAILED }
    }

    const statusEvents: ParentApplicationStatusEvent[] = (logResult.data ?? []).map((row) => ({
      id: row.id as string,
      applicationId: row.application_id as string,
      fromStatus: (row.from_status ?? null) as ApplicationStatus | null,
      toStatus: row.to_status as ApplicationStatus,
      actorId: row.actor_id as string,
      createdAt: row.created_at as string
    }))

    /* published_at 이 비어 있는 행은 "언제" 를 모른다. 알림으로 만들지 않는다. */
    const publishedReports: ParentPublishedReportEvent[] = (reportResult.data ?? [])
      .filter((row) => Boolean(row.published_at))
      .map((row) => ({
        reportId: row.id as string,
        applicationId: row.application_id as string,
        publishedAt: row.published_at as string
      }))

    return {
      notifications: selectParentNotifications({
        applications: applications.data,
        statusEvents,
        publishedReports,
        parentProfileId
      }),
      error: null
    }
  } catch {
    return { notifications: [], error: READ_FAILED }
  }
}
