import type { ReactNode } from "react"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { StudioShell } from "@/features/studio/ui/studio-shell"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

export default async function StudioDashboardLayout({ children }: { children: ReactNode }) {
  const teacher = await requireTeacherStudioAccess()
  let organizationName: string | null = null

  try {
    const supabase = await getSupabaseServerClient()
    const { data } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", teacher.organizationId)
      .maybeSingle()

    organizationName = data?.name?.trim() || null
  } catch {
    organizationName = null
  }

  return <StudioShell organizationName={organizationName}>{children}</StudioShell>
}
