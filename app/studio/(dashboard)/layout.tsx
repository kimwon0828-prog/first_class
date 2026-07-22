import type { ReactNode } from "react"

import { getStudioOrganizationName } from "@/features/studio/lib/get-studio-organization-name"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getUnregisteredStudentsActionRequiredCount } from "@/features/studio/queries/get-unregistered-applications"
import { StudioShell } from "@/features/studio/ui/studio-shell"

export default async function StudioDashboardLayout({ children }: { children: ReactNode }) {
  const teacher = await requireTeacherStudioAccess()
  const organizationName = await getStudioOrganizationName(teacher.organizationId)
  const unregisteredLeadCount = await getUnregisteredStudentsActionRequiredCount(
    teacher.organizationId
  )

  return (
    <StudioShell
      organizationName={organizationName}
      unregisteredLeadCount={unregisteredLeadCount}
    >
      {children}
    </StudioShell>
  )
}
