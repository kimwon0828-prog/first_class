import type { ReactNode } from "react"

import { getStudioOrganizationName } from "@/features/studio/lib/get-studio-organization-name"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioAcademyPublicProfile } from "@/features/studio/queries/get-studio-academy-public-profile"
import { countStudioCases } from "@/features/studio/queries/get-studio-cases"
import { getStudioSidebarPlan } from "@/features/studio/queries/get-studio-sidebar-plan"
import { StudioShell } from "@/features/studio/ui/studio-shell"
import { StudioWorkspaceFooter } from "@/features/studio/ui/studio-workspace-footer"

export default async function StudioDashboardLayout({ children }: { children: ReactNode }) {
  const teacher = await requireTeacherStudioAccess()
  const [organizationName, publicProfile, plan, scheduleNeededCount] = await Promise.all([
    getStudioOrganizationName(teacher.organizationId),
    getStudioAcademyPublicProfile(teacher.organizationId),
    getStudioSidebarPlan(teacher.organizationId),
    // 사이드바 "신청" 건수 = 신청 화면의 "신규 신청"(일정 확정 필요) 칩과 같은 조건 · 같은 조회.
    // 읽기 전용 count 이고, 실패하면 null 이라 배지를 그리지 않는다.
    countStudioCases(teacher.organizationId, { view: "active", filter: "schedule_needed", query: null })
  ])

  return (
    <StudioShell
      organizationName={organizationName}
      logoImagePath={publicProfile?.logoImagePath ?? null}
      plan={plan}
      navCounts={{ cases: scheduleNeededCount }}
      footer={<StudioWorkspaceFooter />}
    >
      {children}
    </StudioShell>
  )
}
