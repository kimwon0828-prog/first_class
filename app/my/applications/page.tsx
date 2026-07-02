import { unstable_noStore as noStore } from "next/cache"

import { getMyApplications } from "@/features/applications/queries/get-my-applications"
import { MyApplicationsClient } from "@/features/applications/ui/my-applications-client"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function MyApplicationsPage() {
  noStore()
  await requireParentAccess({ returnTo: "/my/applications" })
  const result = await getMyApplications()

  return <MyApplicationsClient initialItems={result.data} initialError={result.error} />
}
