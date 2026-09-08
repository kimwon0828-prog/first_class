"use server"

import { revalidatePath } from "next/cache"

import { applyVerifiedBillingEvent } from "@/features/billing/actions/apply-billing-event"
import { getStudioBillingOverview } from "@/features/billing/queries/get-studio-billing-overview"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import type { ActionResult } from "@/shared/actions"

// 원장이 직접 하는 구독 변경.
//
// 조직은 언제나 서버 세션에서 다시 구한다. client 가 보낸 organization_id 는 받지 않는다
// (인자 자체가 없다) — cross-org 변경 경로를 만들지 않기 위해서다.
//
// 상태 전이는 applyVerifiedBillingEvent 하나로만 한다. 구독 테이블을 직접 고치지 않는다.
//
// 해지는 즉시 종료가 아니다. cancel_at_period_end 로 표시하고 기간까지는 그대로 쓴다.
// 기간이 끝나면 lifecycle 정규화가 무료로 내린다. 데이터는 지우지 않는다.

const GENERIC_FAILURE = "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."

const FAILURE_MESSAGE: Record<string, string> = {
  billing_subscription_not_found: "해지할 구독이 없어요.",
  billing_period_already_ended: "이용 기간이 이미 끝나 해지를 취소할 수 없어요."
}

const toMessage = (error: unknown) => {
  const code = error instanceof Error ? error.message : ""
  return FAILURE_MESSAGE[code] ?? GENERIC_FAILURE
}

export const cancelStandardSubscription = async (): Promise<ActionResult<{ message: string }>> => {
  const access = await requireTeacherStudioAccess()

  let overview
  try {
    overview = await getStudioBillingOverview(access.organizationId)
  } catch {
    return { ok: false, message: GENERIC_FAILURE }
  }

  // 화면이 해지 버튼을 숨기더라도 서버에서 다시 판정한다.
  if (!overview.presentation.canCancel) {
    return { ok: false, message: "지금은 해지할 수 있는 상태가 아니에요." }
  }

  try {
    await applyVerifiedBillingEvent({
      organizationId: access.organizationId,
      occurredAt: new Date().toISOString(),
      provider: "toss",
      type: "cancel_scheduled"
    })
  } catch (error) {
    return { ok: false, message: toMessage(error) }
  }

  revalidatePath("/studio/billing")
  return { ok: true, data: { message: "해지가 예약되었어요." } }
}

export const resumeStandardSubscription = async (): Promise<ActionResult<{ message: string }>> => {
  const access = await requireTeacherStudioAccess()

  let overview
  try {
    overview = await getStudioBillingOverview(access.organizationId)
  } catch {
    return { ok: false, message: GENERIC_FAILURE }
  }

  if (!overview.presentation.canResume) {
    return { ok: false, message: "지금은 해지를 취소할 수 있는 상태가 아니에요." }
  }

  try {
    await applyVerifiedBillingEvent({
      organizationId: access.organizationId,
      occurredAt: new Date().toISOString(),
      provider: "toss",
      type: "cancel_schedule_reverted"
    })
  } catch (error) {
    return { ok: false, message: toMessage(error) }
  }

  revalidatePath("/studio/billing")
  return { ok: true, data: { message: "해지가 취소되었어요. 다음 결제가 다시 예약돼요." } }
}
