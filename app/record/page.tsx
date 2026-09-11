import { unstable_noStore as noStore } from "next/cache"

import { getMyApplications } from "@/features/applications/queries/get-my-applications"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { RecordClient } from "@/features/record/ui/record-client"

// 아이의 교육 경험 기록.
//
// 아직 EducationRecord table 은 없다. 기존 trial_applications 를 학부모 관점으로
// 다시 읽는 projection 이다 — 신청 한 건이 곧 경험 한 건이다.

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function RecordPage() {
  noStore()
  await requireParentAccess({ returnTo: "/record" })
  const result = await getMyApplications()

  return <RecordClient initialItems={result.data} initialError={result.error} />
}
