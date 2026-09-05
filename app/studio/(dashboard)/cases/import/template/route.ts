import { buildReservationImportTemplate } from "@/features/reservation-import/lib/build-reservation-template"
import { getReservationImportOrganizationContext } from "@/features/reservation-import/queries/get-reservation-import-context"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioSettingsOrganization } from "@/features/studio/queries/get-studio-settings-organization"

// 학원별 양식을 그때그때 만든다.
//
// 수업·선생님 목록이 바뀌면 새로 받은 양식에 반영된다. 오래된 양식으로 올려도
// 서버가 업로드 시점의 DB 로 다시 검증하므로 잘못 들어가지 않는다.

const FILE_NAME = "첫수업_체험예약_가져오기_양식.xlsx"

export async function GET() {
  const access = await requireTeacherStudioAccess()
  const { classes, teachers } = await getReservationImportOrganizationContext(
    access.organizationId
  )

  let academyName = "우리 학원"
  try {
    const organization = await getStudioSettingsOrganization(access)
    academyName = organization?.name?.trim() || academyName
  } catch {
    // 학원 이름은 안내 문구일 뿐이다. 못 읽어도 양식은 내려간다.
  }

  const workbook = await buildReservationImportTemplate({
    academyName,
    classes: classes.map((item) => ({ label: item.label })),
    teachers: teachers.map((item) => ({ label: item.label }))
  })

  return new Response(workbook, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(FILE_NAME)}`,
      "Cache-Control": "no-store"
    }
  })
}
