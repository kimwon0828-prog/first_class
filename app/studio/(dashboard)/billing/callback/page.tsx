import { redirect } from "next/navigation"

import { completeStandardCheckout } from "@/features/billing/actions/complete-standard-checkout"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"

export const dynamic = "force-dynamic"

// Toss 결제창이 카드 인증 후 브라우저를 여기로 돌려보낸다.
//
// query 로 오는 authKey · customerKey 는 그대로 믿지 않는다. 로그인 세션에서 조직을 구해
// 시작 시 저장해 둔 checkout 의도와 맞춰 본 뒤에만 결제를 진행한다.

export default async function StudioBillingCallbackRoute({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const access = await requireTeacherStudioAccess()
  const params = await searchParams

  const customerKey = typeof params.customerKey === "string" ? params.customerKey : ""
  const authKey = typeof params.authKey === "string" ? params.authKey : ""

  const result = await completeStandardCheckout({
    actorOrganizationId: access.organizationId,
    customerKey,
    authKey
  })

  const outcome =
    result.status === "activated" ? "activated" : result.status === "pending" ? "pending" : "failed"

  redirect(`/studio/billing?billing=${outcome}`)
}
