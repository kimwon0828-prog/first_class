import { BillingPage } from "@/features/billing/ui/billing-page"
import { getStudioEntitlementsForDisplay } from "@/features/billing/queries/get-organization-entitlements"
import { getTossRuntime } from "@/features/billing/lib/toss/server"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"

export const dynamic = "force-dynamic"

const NOTICE: Record<string, string> = {
  activated: "스탠다드 결제가 완료되었습니다.",
  pending: "결제 결과를 확인하고 있습니다. 잠시 후 다시 확인해 주세요.",
  failed: "결제를 완료하지 못했습니다. 다시 시도해 주세요."
}

export default async function StudioBillingRoute({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const access = await requireTeacherStudioAccess()
  const resolved = await getStudioEntitlementsForDisplay(access.organizationId)
  const runtime = getTossRuntime()

  const params = await searchParams
  const billingParam = typeof params.billing === "string" ? params.billing : null

  return (
    <BillingPage
      resolved={resolved}
      tossReady={runtime.status === "ready"}
      notice={billingParam ? (NOTICE[billingParam] ?? null) : null}
    />
  )
}
