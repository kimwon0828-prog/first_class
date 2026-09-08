import { BillingPage } from "@/features/billing/ui/billing-page"
import { getStudioBillingOverview } from "@/features/billing/queries/get-studio-billing-overview"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"

export const dynamic = "force-dynamic"

const NOTICE: Record<string, string> = {
  activated: "스탠다드가 시작되었어요.",
  pending: "결제 결과를 확인하고 있어요. 잠시 후 다시 확인해 주세요.",
  failed: "결제를 완료하지 못했어요. 잠시 후 다시 시도해 주세요."
}

export default async function StudioBillingRoute({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const access = await requireTeacherStudioAccess()
  const overview = await getStudioBillingOverview(access.organizationId)

  const params = await searchParams
  const billingParam = typeof params.billing === "string" ? params.billing : null

  return (
    <BillingPage overview={overview} notice={billingParam ? (NOTICE[billingParam] ?? null) : null} />
  )
}
