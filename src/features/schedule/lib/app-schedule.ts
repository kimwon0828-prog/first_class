import type { ParentApplicationSummary } from "@/shared/lib/db/adapter"

// 학부모 앱 schedule-screen.tsx · parent-views.ts 의 분류를 웹 신청 요약(ParentApplicationSummary)에 그대로 옮긴다.
// 화면 분류만 한다. 상태를 바꾸거나 새로 만들지 않는다.

type Row = ParentApplicationSummary
const PENDING = new Set(["new", "reviewing"])
const time = (value: string | null | undefined) => (value ? Date.parse(value) : Number.NaN)

export const slotAt = (row: Row) => row.confirmedSlotAt || row.requestedSlotAt

/** 일정 "예정": 학원 확인 전(new·reviewing)과 확정(confirmed) 중 아직 지나지 않은 신청. */
export function scheduledApplications(rows: readonly Row[], now: number) {
  return rows.filter(row => (PENDING.has(row.status) || row.status === "confirmed") && !row.canceledAt && !row.completedAt && Number.isFinite(time(slotAt(row))) && time(slotAt(row)) >= now)
    .sort((a, b) => time(slotAt(a)) - time(slotAt(b)) || a.id.localeCompare(b.id))
}

/** 확정됐고 일정이 지났지만 학원이 아직 완료 처리하지 않은 신청. 최근 것부터. */
export function awaitingCompletion(rows: readonly Row[], now: number) {
  return rows.filter(row => row.status === "confirmed" && !row.canceledAt && !row.completedAt && Number.isFinite(time(slotAt(row))) && time(slotAt(row)) < now)
    .sort((a, b) => time(slotAt(b)) - time(slotAt(a)) || a.id.localeCompare(b.id))
}

export function completedApplications(rows: readonly Row[]) {
  const at = (row: Row) => time(row.completedAt || row.confirmedSlotAt || row.requestedSlotAt)
  return rows.filter(row => row.status === "completed" && !row.canceledAt).sort((a, b) => at(b) - at(a) || a.id.localeCompare(b.id))
}

/** 지난 체험 = 완료 처리 전(확정·일정 지남) + 완료. */
export const finishedApplications = (rows: readonly Row[], now: number) => [...awaitingCompletion(rows, now), ...completedApplications(rows)]

export type AppBadgeTone = "positive" | "warning" | "neutral"
export function applicationBadge(row: Row): { label: string; tone: AppBadgeTone } | null {
  if (row.status === "confirmed") return { label: "확정됨", tone: "positive" }
  if (PENDING.has(row.status)) return { label: "학원 확인 중", tone: "warning" }
  if (row.status === "canceled" || row.canceledAt) return { label: "취소됨", tone: "neutral" }
  if (row.status === "completed") return { label: row.classProgramType === "level_test" ? "레벨테스트 완료" : "체험 완료", tone: "neutral" }
  return null
}

export const isPendingApplication = (row: Row) => PENDING.has(row.status) && !row.canceledAt
export const applicationAddress = (row: Row) => [row.organizationAddress, row.organizationAddressDetail].map(part => part?.trim()).filter(Boolean).join(" ") || null
