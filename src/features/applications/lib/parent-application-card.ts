import type { ParentApplicationSummary } from "@/shared/lib/db/adapter"
import { getChildGradeLabel, normalizeLearnerGrade } from "@/shared/constants/education-taxonomy"
import { formatScheduleDateLabel, formatScheduleTimeLabel } from "@/features/schedule/lib/parent-schedule"
export function applicationChildLabel(item: Pick<ParentApplicationSummary, "childName" | "childGrade">) {
  const grade = normalizeLearnerGrade(item.childGrade)
  return `${item.childName} · ${grade ? getChildGradeLabel(grade) : "학년 확인 필요"}`
}
export function applicationSchedule(item: Pick<ParentApplicationSummary, "confirmedSlotAt" | "requestedSlotAt">) {
  const value = item.confirmedSlotAt || item.requestedSlotAt
  if (!value) return null
  const date = formatScheduleDateLabel(value)
  const time = formatScheduleTimeLabel(value)
  return date && time ? { value, text: `${date} ${time}`, label: item.confirmedSlotAt ? "확정 일정" : "희망 일정" } : null
}
