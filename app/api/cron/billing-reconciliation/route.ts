import { NextResponse } from "next/server"

import { runBillingReconciliation } from "@/features/billing/actions/run-billing-reconciliation"
import { resolveCronAuthMode, resolveCronErrorStatus } from "@/shared/lib/cron-auth"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// 결제 대사 Cron. webhook 이 오지 않거나 응답을 못 받은 결제를 하루 한 번 맞춘다.

export async function GET(request: Request) {
  try {
    resolveCronAuthMode(request)
    const summary = await runBillingReconciliation()

    return NextResponse.json({ ok: true, ...summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error"

    return NextResponse.json({ ok: false, error: message }, { status: resolveCronErrorStatus(message) })
  }
}
