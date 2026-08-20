import { dataAdapter } from "@/shared/lib/db"
import type {
  StudioConsultationPipelineApplicationItem,
  StudioConsultationPipelineGroup
} from "@/shared/lib/db/adapter"
import { sortConsultationPipelineItems } from "@/shared/lib/consultation-pipeline"
import type { QueryResult } from "@/shared/queries"

export type StudioConsultationPipelineSummary = {
  totalCount: number
  activeCount: number
  todayContactCount: number
  needsConsultationCount: number
  noNextContactCount: number
  upcomingContactCount: number
  closedCount: number
}

export type StudioConsultationPipelineQueryData = {
  items: StudioConsultationPipelineApplicationItem[]
  summary: StudioConsultationPipelineSummary
}

const createEmptySummary = (): StudioConsultationPipelineSummary => ({
  totalCount: 0,
  activeCount: 0,
  todayContactCount: 0,
  needsConsultationCount: 0,
  noNextContactCount: 0,
  upcomingContactCount: 0,
  closedCount: 0
})

const countByGroup = (
  items: StudioConsultationPipelineApplicationItem[],
  group: StudioConsultationPipelineGroup
) => {
  return items.filter((item) => item.pipelineGroup === group).length
}

const buildSummary = (
  items: StudioConsultationPipelineApplicationItem[]
): StudioConsultationPipelineSummary => {
  const todayContactCount = countByGroup(items, "TODAY_CONTACT")
  const needsConsultationCount = countByGroup(items, "NEEDS_CONSULTATION")
  const noNextContactCount = countByGroup(items, "NO_NEXT_CONTACT")
  const upcomingContactCount = countByGroup(items, "UPCOMING_CONTACT")
  const closedCount = countByGroup(items, "CLOSED")

  return {
    totalCount: items.length,
    activeCount:
      todayContactCount + needsConsultationCount + noNextContactCount + upcomingContactCount,
    todayContactCount,
    needsConsultationCount,
    noNextContactCount,
    upcomingContactCount,
    closedCount
  }
}

export const getConsultationPipelineApplications = async (
  organizationId: string
): Promise<QueryResult<StudioConsultationPipelineQueryData>> => {
  try {
    const items = sortConsultationPipelineItems(
      await dataAdapter.listStudioConsultationPipelineApplications(organizationId)
    )

    return {
      data: {
        items,
        summary: buildSummary(items)
      },
      error: null
    }
  } catch {
    return {
      data: {
        items: [],
        summary: createEmptySummary()
      },
      error: "상담 관리 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}

export const getConsultationPipelineActiveCount = async (organizationId: string): Promise<number> => {
  try {
    return await dataAdapter.getStudioConsultationPipelineActiveCount(organizationId)
  } catch {
    return 0
  }
}
