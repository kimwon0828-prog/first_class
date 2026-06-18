import type { ReactNode } from "react"

import { StudioShell } from "@/features/studio/ui/studio-shell"

export default function StudioDashboardLayout({ children }: { children: ReactNode }) {
  return <StudioShell>{children}</StudioShell>
}
