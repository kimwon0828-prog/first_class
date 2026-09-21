import type { ApplicationStatus, ParentApplicationSummary } from "@/shared/lib/db/adapter"
import { formatSeoulDateKey, getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

/**
 * 알림함이 말할 수 있는 것.
 *
 * ⚠️ /my/actions 와 같은 모델이 아니다.
 *    Action 은 "지금 해야 하는 일" 이라 끝나면 사라지고,
 *    Notification 은 "그때 일어난 일" 이라 남는다.
 *    두 화면이 같은 사실(발행된 리포트)을 참고할 수는 있지만
 *    Action selector 의 결과를 그대로 알림 목록으로 쓰지 않는다.
 *
 * ⚠️ 읽음/안읽음이 없다. schema 에 read_at · is_read 가 없으므로
 *    "안 읽은 N개" · 빨간 점 · 배지를 만들지 않는다. 지금 만들면
 *    그것은 데이터가 아니라 화면이 지어낸 상태다.
 *
 * ⚠️ 추천 수업 · 관심수업 가격 · 인기 학원 같은 마케팅 알림은 없다.
 *    그런 event 를 적어 두는 자리가 schema 에 없다.
 */
export type ParentNotificationKind =
  | "report_published"
  | "schedule_confirmed"
  | "application_reviewing"
  | "application_canceled"
  | "experience_completed"

export type ParentNotification = {
  id: string
  kind: ParentNotificationKind
  /** 그 일이 실제로 일어난 시각. 추정하지 않는다. */
  occurredAt: string
  title: string
  /** 어느 아이의 일인가. 모르면 null 이고, 지어내지 않는다. */
  childName: string | null
  /** 수업명 · 학원명. 있는 것만 잇는다. */
  contextLabel: string | null
  classTitle?: string | null
  academyName?: string | null
  href: string
}

/**
 * application_logs 한 줄을 그대로 받는 모양.
 *
 * ⚠️ note 가 없다. 학원이 적는 자유 문구라 학부모 화면으로 넘기지 않는다.
 *    필요 없는 값은 애초에 select 하지 않는 편이 경계가 분명하다.
 */
export type ParentApplicationStatusEvent = {
  id: string
  applicationId: string
  fromStatus: ApplicationStatus | null
  toStatus: ApplicationStatus
  actorId: string
  createdAt: string
}

export type ParentPublishedReportEvent = {
  reportId: string
  applicationId: string
  publishedAt: string
}

/** 상태 전이 중 알림으로 말이 되는 것. new 는 학부모 자신이 낸 신청이라 뺀다. */
const NOTIFIABLE_STATUSES: Record<string, ParentNotificationKind | undefined> = {
  reviewing: "application_reviewing",
  confirmed: "schedule_confirmed",
  canceled: "application_canceled",
  completed: "experience_completed"
}

const STATUS_TITLES: Record<ParentNotificationKind, string> = {
  report_published: "체험 리포트가 도착했어요.",
  schedule_confirmed: "체험 일정이 확정됐어요.",
  application_reviewing: "학원이 신청을 확인하고 있어요.",
  application_canceled: "신청이 취소됐어요.",
  experience_completed: "체험을 다녀왔어요."
}

const hasRealTimestamp = (value: string | null | undefined): value is string =>
  Boolean(value) && getSeoulDateTimeParts(value as string) !== null

/**
 * 이 로그 줄을 알림으로 만들어도 되는가.
 *
 * ⚠️ 세 가지를 막는다.
 *    1. from === to 인 줄. 등록 결과를 저장할 때 같이 남는 부가 로그라
 *       상태가 바뀐 적이 없다. "변경됐어요" 라고 말하면 거짓말이 된다.
 *    2. 학부모 자신이 만든 줄. 내가 낸 신청 · 내가 한 취소를
 *       "첫수업에서 온 알림" 처럼 되돌려 주지 않는다.
 *    3. 시각이 없는 줄. 언제인지 모르는 일은 이력이 아니다.
 */
export const isNotifiableStatusEvent = (
  event: ParentApplicationStatusEvent,
  parentProfileId: string
): boolean => {
  if (event.actorId === parentProfileId) return false
  if (event.fromStatus === event.toStatus) return false
  if (!hasRealTimestamp(event.createdAt)) return false
  return Boolean(NOTIFIABLE_STATUSES[event.toStatus])
}

const buildContextLabel = (application: ParentApplicationSummary): string | null => {
  const parts = [application.classTitle, application.academyName].filter(
    (value): value is string => Boolean(value && value.trim())
  )
  return parts.length > 0 ? parts.join(" · ") : null
}

/** 아이 이름은 신청에 실제로 적혀 있을 때만 쓴다. 비어 있으면 null 이다. */
const resolveChildName = (application: ParentApplicationSummary): string | null => {
  const name = application.childName?.trim()
  return name ? name : null
}

/**
 * 알림 목록을 만든다.
 *
 * ⚠️ 실제 timestamp 가 있는 event 만 들어온다. 없는 것은 위에서 걸러진다.
 * ⚠️ 리포트 알림의 근거는 "발행됐다" 는 domain fact 다.
 *    알림톡이 실제로 전송됐는지 여부와 묶지 않는다 — 발송 실패가
 *    리포트가 없는 것으로 읽히면 안 된다.
 */
export const selectParentNotifications = (input: {
  applications: readonly ParentApplicationSummary[]
  statusEvents: readonly ParentApplicationStatusEvent[]
  publishedReports: readonly ParentPublishedReportEvent[]
  parentProfileId: string
}): ParentNotification[] => {
  const applicationById = new Map(input.applications.map((item) => [item.id, item]))
  const items: ParentNotification[] = []

  for (const report of input.publishedReports) {
    const application = applicationById.get(report.applicationId)
    if (!application) continue
    if (!hasRealTimestamp(report.publishedAt)) continue

    items.push({
      id: `report_published:${report.reportId}`,
      kind: "report_published",
      occurredAt: report.publishedAt,
      title: STATUS_TITLES.report_published,
      childName: resolveChildName(application),
      contextLabel: buildContextLabel(application),
      classTitle: application.classTitle,
      academyName: application.academyName,
      href: `/record/${application.id}/report`
    })
  }

  for (const event of input.statusEvents) {
    const application = applicationById.get(event.applicationId)
    if (!application) continue
    if (!isNotifiableStatusEvent(event, input.parentProfileId)) continue

    const kind = NOTIFIABLE_STATUSES[event.toStatus]
    if (!kind) continue

    items.push({
      id: `status:${event.id}`,
      kind,
      occurredAt: event.createdAt,
      title: STATUS_TITLES[kind],
      childName: resolveChildName(application),
      contextLabel: buildContextLabel(application),
      classTitle: application.classTitle,
      academyName: application.academyName,
      href: resolveNotificationHref(kind, application.id)
    })
  }

  return items.sort(
    (left, right) =>
      Date.parse(right.occurredAt) - Date.parse(left.occurredAt) ||
      right.id.localeCompare(left.id)
  )
}

/**
 * 그 알림이 실제로 데려갈 자리.
 *
 * 리포트는 리포트 본문으로, 일정 확정은 일정으로, 나머지 신청 변화는
 * 신청 현황으로 간다. 완료된 체험은 기록 상세가 그 경험의 집이다.
 */
export const resolveNotificationHref = (
  kind: ParentNotificationKind,
  experienceId: string
): string => {
  if (kind === "report_published") return `/record/${experienceId}/report`
  if (kind === "schedule_confirmed") return "/my/schedule"
  if (kind === "experience_completed") return `/record/${experienceId}`
  return "/my/applications"
}

export type ParentNotificationDayGroup = {
  /** YYYY-MM-DD (KST). UTC 문자열을 자르지 않는다. */
  dateKey: string
  dateLabel: string
  items: ParentNotification[]
}

/** 날짜는 한국 기준으로 묶는다. 서버가 UTC 여도 학부모가 보는 날짜는 KST 다. */
export const groupNotificationsBySeoulDate = (
  notifications: readonly ParentNotification[],
  now = new Date().toISOString()
): ParentNotificationDayGroup[] => {
  const groups = new Map<string, ParentNotification[]>()

  for (const item of notifications) {
    const dateKey = formatSeoulDateKey(item.occurredAt)
    if (!dateKey) continue
    const bucket = groups.get(dateKey)
    if (bucket) bucket.push(item)
    else groups.set(dateKey, [item])
  }

  return Array.from(groups.entries())
    .sort((left, right) => (left[0] < right[0] ? 1 : left[0] > right[0] ? -1 : 0))
    .map(([dateKey, items]) => ({
      dateKey,
      dateLabel: formatNotificationDateLabel(items[0].occurredAt, now),
      items
    }))
}

export const formatNotificationDateLabel = (value: string, now = new Date().toISOString()): string => {
  const parts = getSeoulDateTimeParts(value)
  const current = getSeoulDateTimeParts(now)
  if (!parts) return ""
  if (formatSeoulDateKey(value) === formatSeoulDateKey(now)) return "오늘"
  return `${parts.year === current?.year ? "" : `${parts.year}년 `}${parts.month}월 ${parts.day}일 (${"일월화수목금토"[parts.weekday]})`
}
export const formatNotificationTime = (value: string): string => {
  const parts = getSeoulDateTimeParts(value)
  return parts ? `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}` : ""
}
