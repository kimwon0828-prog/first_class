import { dataAdapter } from "@/shared/lib/db"
import type { StudioUnregisteredApplicationItem } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"
import {
  getDaysSinceCompleted,
  matchesUnregisteredSearch,
  resolveUnregisteredGroupKey,
  type UnregisteredRegistrationFilterKey
} from "@/features/studio/lib/unregistered-students"

export type StudioUnregisteredSummary = {
  totalCount: number
  pendingCount: number
  undecidedCount: number
  notEnrolledCount: number
  reengageableCount: number
  averageElapsedDays: number | null
}

export type StudioUnregisteredQueryData = {
  items: StudioUnregisteredApplicationItem[]
  summary: StudioUnregisteredSummary
}

type GetUnregisteredApplicationsOptions = {
  teacherId?: string | null
  completedAtFrom?: string | null
  completedAtTo?: string | null
  query?: string | null
  registrationStatus?: UnregisteredRegistrationFilterKey
}

const createEmptySummary = (): StudioUnregisteredSummary => ({
  totalCount: 0,
  pendingCount: 0,
  undecidedCount: 0,
  notEnrolledCount: 0,
  reengageableCount: 0,
  averageElapsedDays: null
})

const buildSummary = (items: StudioUnregisteredApplicationItem[]): StudioUnregisteredSummary => {
  const pendingCount = items.filter((item) => resolveUnregisteredGroupKey(item.registrationStatus) === "pending").length
  const undecidedCount = items.filter((item) => resolveUnregisteredGroupKey(item.registrationStatus) === "undecided").length
  const notEnrolledCount = items.filter((item) => resolveUnregisteredGroupKey(item.registrationStatus) === "not_enrolled").length
  const elapsedDays = items.map((item) => getDaysSinceCompleted(item.completedAt))
  const averageElapsedDays =
    elapsedDays.length > 0
      ? Math.round(elapsedDays.reduce((sum, value) => sum + value, 0) / elapsedDays.length)
      : null

  return {
    totalCount: items.length,
    pendingCount,
    undecidedCount,
    notEnrolledCount,
    reengageableCount: pendingCount + undecidedCount,
    averageElapsedDays
  }
}

const getGroupRank = (item: StudioUnregisteredApplicationItem) => {
  const groupKey = resolveUnregisteredGroupKey(item.registrationStatus)
  if (groupKey === "pending") {
    return 1
  }

  if (groupKey === "undecided") {
    return 2
  }

  return 3
}

export const getUnregisteredApplications = async (
  organizationId: string,
  options: GetUnregisteredApplicationsOptions = {}
): Promise<QueryResult<StudioUnregisteredQueryData>> => {
  try {
    const baseItems = await dataAdapter.listStudioUnregisteredApplications(organizationId, {
      teacherId: options.teacherId,
      completedAtFrom: options.completedAtFrom,
      completedAtTo: options.completedAtTo
    })

    const searchedItems = baseItems.filter((item) => matchesUnregisteredSearch(item, options.query))
    const summary = buildSummary(searchedItems)
    const registrationStatus = options.registrationStatus ?? "all"
    const filteredItems =
      registrationStatus === "all"
        ? searchedItems
        : searchedItems.filter(
            (item) => resolveUnregisteredGroupKey(item.registrationStatus) === registrationStatus
          )

    const items = [...filteredItems].sort((a, b) => {
      const groupRankDelta = getGroupRank(a) - getGroupRank(b)
      if (groupRankDelta !== 0) {
        return groupRankDelta
      }

      return b.completedAt.localeCompare(a.completedAt)
    })

    return {
      data: {
        items,
        summary
      },
      error: null
    }
  } catch {
    return {
      data: {
        items: [],
        summary: createEmptySummary()
      },
      error: "미등록 학생 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}

export const getUnregisteredStudentsActionRequiredCount = async (
  organizationId: string
): Promise<number> => {
  try {
    return await dataAdapter.getStudioUnregisteredActionRequiredCount(organizationId)
  } catch {
    return 0
  }
}
