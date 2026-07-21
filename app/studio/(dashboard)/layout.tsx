import type { ReactNode } from "react"

import { getStudioOrganizationName } from "@/features/studio/lib/get-studio-organization-name"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { StudioShell } from "@/features/studio/ui/studio-shell"

export default async function StudioDashboardLayout({ children }: { children: ReactNode }) {
  const teacher = await requireTeacherStudioAccess()
  const organizationName = await getStudioOrganizationName(teacher.organizationId)

  return <StudioShell organizationName={organizationName}>{children}</StudioShell>
}
