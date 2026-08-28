import { dataAdapter } from "@/shared/lib/db"
import type { StudioTeacherAssignmentSummary, StudioTeacherSummary } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

type StudioTeachersPageData = {
  teachers: StudioTeacherSummary[]
  assignmentsByTeacherId: Record<string, StudioTeacherAssignmentSummary>
}

export const getStudioTeachers = async (
  organizationId: string
): Promise<QueryResult<StudioTeachersPageData>> => {
  try {
    // 선생님 목록과 담당 수업 집계는 서로 독립이라 같은 wave 에서 시작한다.
    // 담당 정보는 선생님마다 조회하지 않고 organization 단위 1회 조회를 메모리에서 묶는다.
    const [teachers, assignments] = await Promise.all([
      dataAdapter.listStudioTeachers(organizationId),
      dataAdapter.listStudioTeacherAssignments(organizationId)
    ])

    return {
      data: {
        teachers,
        assignmentsByTeacherId: Object.fromEntries(
          assignments.map((assignment) => [assignment.teacherId, assignment])
        )
      },
      error: null
    }
  } catch {
    return {
      data: {
        teachers: [],
        assignmentsByTeacherId: {}
      },
      error: "선생님 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
