import type { ReactNode } from "react"

import { getStudioOrganizationName } from "@/features/studio/lib/get-studio-organization-name"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioAcademyPublicProfile } from "@/features/studio/queries/get-studio-academy-public-profile"
import { getStudioSidebarPlan } from "@/features/studio/queries/get-studio-sidebar-plan"
import { StudioShell } from "@/features/studio/ui/studio-shell"
import { StudioWorkspaceFooter } from "@/features/studio/ui/studio-workspace-footer"

export default async function StudioDashboardLayout({ children }: { children: ReactNode }) {
  const teacher = await requireTeacherStudioAccess()
  const [organizationName, publicProfile, plan] = await Promise.all([
    getStudioOrganizationName(teacher.organizationId),
    getStudioAcademyPublicProfile(teacher.organizationId),
    getStudioSidebarPlan(teacher.organizationId)
  ])

  return (
    <StudioShell
      organizationName={organizationName}
      logoImagePath={publicProfile?.logoImagePath ?? null}
      plan={plan}
      footer={<StudioWorkspaceFooter />}
    >
      {children}
    </StudioShell>
  )
}
