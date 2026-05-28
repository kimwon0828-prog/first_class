import { dataAdapter } from "@/shared/lib/db"
import type { StudioTeacherSeatSummary, StudioTeacherSummary } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

type StudioTeachersPageData = {
  teachers: StudioTeacherSummary[]
  seatSummary: StudioTeacherSeatSummary
}

const createFallbackSeatSummary = (organizationId: string): StudioTeacherSeatSummary => ({
  organizationId,
  teacherSeatLimit: 3,
  activeTeacherCount: 0,
  remainingTeacherSeats: 3
})

export const getStudioTeachers = async (
  organizationId: string
): Promise<QueryResult<StudioTeachersPageData>> => {
  try {
    const [teachers, seatSummary] = await Promise.all([
      dataAdapter.listStudioTeachers(organizationId),
      dataAdapter.getStudioTeacherSeatSummary(organizationId)
    ])

    return {
      data: {
        teachers,
        seatSummary
      },
      error: null
    }
  } catch {
    return {
      data: {
        teachers: [],
        seatSummary: createFallbackSeatSummary(organizationId)
      },
      error: "선생님 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
