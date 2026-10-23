import type { ReactNode } from "react"

import { getStudioOrganizationName } from "@/features/studio/lib/get-studio-organization-name"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { buildStudioDashboardView } from "@/features/studio/lib/studio-dashboard-view"
import { getStudioApplicationsForDashboard } from "@/features/studio/queries/get-studio-applications"
import { getStudioAcademyPublicProfile } from "@/features/studio/queries/get-studio-academy-public-profile"
import { countStudioCases } from "@/features/studio/queries/get-studio-cases"
import { getStudioSidebarPlan } from "@/features/studio/queries/get-studio-sidebar-plan"
import { StudioShell } from "@/features/studio/ui/studio-shell"
import { StudioWorkspaceFooter } from "@/features/studio/ui/studio-workspace-footer"

export default async function StudioDashboardLayout({ children }: { children: ReactNode }) {
  const teacher = await requireTeacherStudioAccess()
  const [organizationName, publicProfile, plan, scheduleNeededCount, dashboardApplications] = await Promise.all([
    getStudioOrganizationName(teacher.organizationId),
    getStudioAcademyPublicProfile(teacher.organizationId),
    getStudioSidebarPlan(teacher.organizationId),
    // 사이드바 "신청" 건수 = 신청 화면의 "신규 신청"(일정 확정 필요) 칩과 같은 조건 · 같은 조회.
    // 읽기 전용 count 이고, 실패하면 null 이라 배지를 그리지 않는다.
    countStudioCases(teacher.organizationId, { view: "active", filter: "schedule_needed", query: null }),
    // 사이드바 "홈" 건수 = 홈 "오늘 할 일" 수. 홈 화면과 같은 조회(요청 단위 cache)와 같은 판정을 쓴다.
    getStudioApplicationsForDashboard(teacher.organizationId)
  ])
  const todayTaskCount = dashboardApplications.error ? null : buildStudioDashboardView(dashboardApplications.data).actionTotalCount

  return (
    <StudioShell
      organizationName={organizationName}
      logoImagePath={publicProfile?.logoImagePath ?? null}
      plan={plan}
      navCounts={{ home: todayTaskCount, cases: scheduleNeededCount }}
      footer={<StudioWorkspaceFooter />}
    >
      {children}
    </StudioShell>
  )
}
