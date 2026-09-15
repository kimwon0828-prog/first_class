import type { ParentSmsEventType } from "@/features/notifications/sms/types"

export const PARENT_ALIMTALK_EVENT_TYPES = [
  "trial_schedule_confirmed",
  "trial_rejected",
  "trial_completed",
  "trial_reminder",
  "trial_report_published"
] as const

export type ParentAlimtalkEventType = (typeof PARENT_ALIMTALK_EVENT_TYPES)[number]

export const isParentAlimtalkEventType = (
  value: ParentSmsEventType | string
): value is ParentAlimtalkEventType =>
  PARENT_ALIMTALK_EVENT_TYPES.includes(value as ParentAlimtalkEventType)

export type ParentNotificationContext = {
  eventType: ParentAlimtalkEventType
  organizationId: string
  trialApplicationId: string
  createdBy?: string | null
  parentId: string | null
  parentPhone: string | null
  parentName: string | null
  studentName: string | null
  academyName: string | null
  classId: string | null
  classTitle: string | null
  requestedSlotAt: string | null
  confirmedSlotAt: string | null
  selectedScheduleLabel: string | null
  /** 리포트 알림에서 쓰는 절대 URL. 다른 event 에서는 null 이다. */
  reportUrl?: string | null
}

/**
 * 알림톡 버튼.
 *
 * ⚠️ 본문에 URL 을 적는 것과 다르다.
 *
 * 카카오는 승인된 template 에 정의된 버튼만 실제 버튼으로 그린다. 본문 링크는
 * 기기에 따라 잘리거나 눌리지 않아서, 부모가 "확인하기" 를 보고도 못 가는 일이
 * 생긴다. 버튼은 payload 로 따로 보낸다.
 *
 * type "WL" 은 웹 링크다. 모바일과 PC 주소를 각각 요구한다 —
 * 우리는 같은 주소를 쓴다(반응형 한 화면이다).
 */
export type AlimtalkButton = {
  type: "WL"
  name: string
  linkMobile: string
  linkPc: string
}

export type AlimtalkTemplatePayload = {
  templateCode: string
  content: string
  /**
   * 버튼이 필요한 template 만 채운다.
   *
   * 기존 4개 알림(일정 확정 · 반려 · 완료 · 리마인더)에는 없다. 없으면
   * payload 에 buttons 자체를 싣지 않는다 — 빈 배열을 보내면 template 과
   * 어긋났다고 거절하는 provider 가 있다.
   */
  buttons?: AlimtalkButton[]
}

export type AlimtalkSendResult = {
  status: "disabled" | "skipped" | "failed" | "sent"
  provider: "disabled" | "dry_run" | "ncloud"
  providerMessageId: string | null
  errorMessage: string | null
  recipientPhoneMasked: string | null
  sentAt: string | null
}

export type ParentNotificationResult = {
  channel: "alimtalk" | "sms_fallback"
  alimtalk: AlimtalkSendResult
}
