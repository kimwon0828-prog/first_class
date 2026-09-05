import type { Metadata } from "next"

import { ReservationImportWorkspace } from "@/features/reservation-import/ui/reservation-import-workspace"
import { getReservationImportOrganizationContext } from "@/features/reservation-import/queries/get-reservation-import-context"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"

export const metadata: Metadata = {
  title: "기존 예약 가져오기"
}

export default async function StudioReservationImportPage() {
  const access = await requireTeacherStudioAccess()

  let classCount = 0
  let teacherCount = 0
  let contextError: string | null = null

  try {
    const context = await getReservationImportOrganizationContext(access.organizationId)
    classCount = context.classes.length
    teacherCount = context.teachers.length
  } catch {
    contextError = "수업·선생님 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
  }

  return (
    <ReservationImportWorkspace
      classCount={classCount}
      teacherCount={teacherCount}
      contextError={contextError}
    />
  )
}
