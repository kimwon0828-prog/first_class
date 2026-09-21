import { Suspense } from "react"
import { unstable_noStore as noStore } from "next/cache"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { getMyParentProfileDetail } from "@/features/my/queries/get-my-parent-profile-detail"
import { ParentProfileForm } from "@/features/my/ui/parent-profile-form"
import { ProfileFrame, ProfileSkeleton } from "./profile-frame"
import { ProfileFailure } from "./profile-failure"
export const dynamic = "force-dynamic"
export const revalidate = 0
export default async function MyProfilePage() {
  noStore()
  await requireParentAccess({ returnTo: "/my/profile" })
  return <ProfileFrame><Suspense fallback={<ProfileSkeleton />}><ProfileContent /></Suspense></ProfileFrame>
}
async function ProfileContent() {
  const { data, error } = await getMyParentProfileDetail()
  if (error || !data) return <ProfileFailure />
  return <ParentProfileForm initialName={data.name} initialPhone={data.phone} initialParentBirthDate={data.parentBirthDate} />
}
