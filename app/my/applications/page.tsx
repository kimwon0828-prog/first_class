import type { Metadata } from "next"
import { Suspense } from "react"
import { unstable_noStore as noStore } from "next/cache"
import { getMyApplications } from "@/features/applications/queries/get-my-applications"
import { selectCanceledApplications, selectInProgressApplications } from "@/features/applications/lib/parent-application-split"
import { getPublicClassImagesByIds } from "@/features/classes/queries/public-class-safe-projection"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { ApplicationsFrame, ApplicationsSkeleton } from "./applications-frame"
import { ApplicationsList, ApplicationsFailure } from "./applications-list"

export const metadata: Metadata = { title: "신청 현황 | 첫수업", alternates: { canonical: "/my/applications" } }
export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function MyApplicationsPage() {
  noStore()
  await requireParentAccess({ returnTo: "/my/applications" })
  return <ApplicationsFrame><Suspense fallback={<ApplicationsSkeleton />}><ApplicationsContent /></Suspense></ApplicationsFrame>
}

async function ApplicationsContent() {
  const applications = await getMyApplications()
  if (applications.error) return <ApplicationsFailure />
  const inProgress = selectInProgressApplications(applications.data)
  const canceled = selectCanceledApplications(applications.data)
  let images = new Map<string, string | null>()
  try {
    images = await getPublicClassImagesByIds([...inProgress, ...canceled].map(item => item.classId))
  } catch (error) {
    console.error("[parent-applications] public class image lookup failed", error)
  }
  return <ApplicationsList inProgress={inProgress} canceled={canceled} images={Object.fromEntries(images)} />
}
