import type { ReactNode } from "react"

import { getStudioOrganizationName } from "@/features/studio/lib/get-studio-organization-name"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getConsultationPipelineActiveCount } from "@/features/studio/queries/get-consultation-pipeline-applications"
import { StudioShell } from "@/features/studio/ui/studio-shell"

export default async function StudioDashboardLayout({ children }: { children: ReactNode }) {
  const teacher = await requireTeacherStudioAccess()
  const organizationName = await getStudioOrganizationName(teacher.organizationId)
  const consultationLeadCount = await getConsultationPipelineActiveCount(teacher.organizationId)

  return (
    <StudioShell
      organizationName={organizationName}
      consultationLeadCount={consultationLeadCount}
    >
      {children}
    </StudioShell>
  )
}
