import {
  CASE_STAGE_LABELS,
  getCaseClosedAt,
  isCaseClosedStage,
  type StudioCaseListItem
} from "./case-view-model"
import { formatSeoulDateKey, getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

// 목록의 문구와 시각 표현만 담당한다. workflow / attention / stage 판정은 바꾸지 않는다.
export const getCaseListActionLabel = (item: Pick<StudioCaseListItem, "nextAction" | "status">): string => {
  switch (item.nextAction.key) {
    case "UNASSIGNED": return "담당자 배정"
    case "REVIEW_NEW": return "신청 확인"
    case "CONFIRM_SCHEDULE": return "일정 확정"
    case "NEEDS_TRIAL_RESULT":
      return item.status === "confirmed" ? "체험 완료·결과 기록" : "체험 결과 기록"
    case "NEEDS_CONSULTATION": return "첫 상담 기록"
    case "NO_NEXT_CONTACT": return "다음 연락 확인"
    case "OVERDUE_CONTACT":
    case "TODAY_CONTACT":
    case "UPCOMING_CONTACT": return "후속 연락"
    default: return ""
  }
}

export type CaseContactPresentation = {
  label: string
  tone: "danger" | "warning" | "default"
}

export const getCaseContactPresentation = (
  item: Pick<StudioCaseListItem, "stage" | "status" | "nextContactAt">,
  now: Date
): CaseContactPresentation | null => {
  if (isCaseClosedStage(item.stage)) return null
  if (!item.nextContactAt) {
    return item.status === "completed" ? { label: "다음 연락 미정", tone: "default" } : null
  }
  const parts = getSeoulDateTimeParts(item.nextContactAt)
  const day = formatSeoulDateKey(item.nextContactAt)
  const today = formatSeoulDateKey(now)
  if (!parts || !day || !today) return null

  const time = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`
  const dateTime = `${parts.month}/${parts.day} ${time}`
  if (day < today) return { label: `연락 지연 · ${dateTime}`, tone: "danger" }
  if (day === today) {
    const elapsed = new Date(item.nextContactAt).getTime() < now.getTime() ? " 경과" : ""
    return { label: `오늘 연락 · ${time}${elapsed}`, tone: "warning" }
  }
  return { label: `연락 예정 · ${dateTime}`, tone: "default" }
}

export const formatCaseRecordDate = (value: string) => {
  const parts = getSeoulDateTimeParts(value)
  return parts ? `${parts.month}월 ${parts.day}일` : null
}

export const getCaseTrialScheduleLabel = (item: StudioCaseListItem) => {
  const value = item.confirmedSlotAt ?? item.requestedSlotAt
  const parts = getSeoulDateTimeParts(value)
  if (!parts) return null
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][parts.weekday]
  const time = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`
  return `${parts.month}/${parts.day} (${weekday}) ${time} · ${item.confirmedSlotAt ? "확정" : "희망"}`
}

// 기존 목록에서 제공하던 기록 후보만 사용한다. 전체 시스템 활동으로 확장하지 않는다.
export const getCaseLatestRecord = (item: StudioCaseListItem) => {
  const candidates = [
    { at: getCaseClosedAt(item), label: CASE_STAGE_LABELS[item.stage] },
    { at: item.latestConsultation?.occurredAt ?? null, label: "상담 기록" },
    { at: item.completedAt, label: "체험 완료" },
    { at: item.createdAt, label: "신청 접수" }
  ]
  const latest = candidates
    .filter((record): record is { at: string; label: string } => Boolean(record.at))
    .filter((record) => Number.isFinite(new Date(record.at).getTime()))
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())[0]
  return latest ? { ...latest, dateLabel: formatCaseRecordDate(latest.at) } : null
}
