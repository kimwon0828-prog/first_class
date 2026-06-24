import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"

export type StudioApplicationFilterKey =
  | "all"
  | "new"
  | "reviewing"
  | "confirmed"
  | "completed"
  | "canceled"
  | "no_show"
  | "enrolled"
  | "not_enrolled"

export const STUDIO_APPLICATION_FILTERS: Array<{
  key: StudioApplicationFilterKey
  label: string
}> = [
  { key: "all", label: "전체" },
  { key: "new", label: "신규" },
  { key: "reviewing", label: "상담/확인 중" },
  { key: "confirmed", label: "일정 확정" },
  { key: "completed", label: "체험 완료" },
  { key: "canceled", label: "취소" },
  { key: "no_show", label: "노쇼" },
  { key: "enrolled", label: "등록 완료" },
  { key: "not_enrolled", label: "미등록" }
]

export const isNoShowApplication = (item: StudioApplicationSummary) =>
  item.status === "canceled" && Boolean(item.noShowAt)

export const isCanceledApplication = (item: StudioApplicationSummary) =>
  item.status === "canceled" && !item.noShowAt

export const matchesStudioApplicationFilter = (
  item: StudioApplicationSummary,
  filterKey: StudioApplicationFilterKey
) => {
  switch (filterKey) {
    case "all":
      return true
    case "new":
      return item.status === "new"
    case "reviewing":
      return item.status === "reviewing"
    case "confirmed":
      return item.status === "confirmed"
    case "completed":
      return item.status === "completed"
    case "canceled":
      return isCanceledApplication(item)
    case "no_show":
      return isNoShowApplication(item)
    case "enrolled":
      return item.registrationStatus === "enrolled"
    case "not_enrolled":
      return item.registrationStatus === "not_enrolled"
    default:
      return false
  }
}

export const getStudioApplicationFilterCount = (
  items: StudioApplicationSummary[],
  filterKey: StudioApplicationFilterKey
) => items.filter((item) => matchesStudioApplicationFilter(item, filterKey)).length
