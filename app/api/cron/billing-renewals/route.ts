import { NextResponse } from "next/server"

import { runBillingRenewals } from "@/features/billing/actions/run-billing-renewals"
import { resolveCronAuthMode, resolveCronErrorStatus } from "@/shared/lib/cron-auth"

export const dynamic = "force-dynamic"
// 자동결제 승인은 오래 걸릴 수 있다. 한 번에 여러 건을 처리하므로 넉넉히 잡는다.
export const maxDuration = 300

// 갱신 결제 Cron.
//
// Toss 는 구독 스케줄을 대신 돌려 주지 않으므로 우리가 매시간 확인한다.
// 매시간인 이유: 이용기간 종료 시각은 학원마다 다르다. 하루 한 번이면 최대 24시간까지
// 늦게 결제된다.
//
// 같은 (조직, 기간, 차수)는 같은 주문번호를 쓰므로 중복 실행이 이중 결제로 이어지지 않는다.

export async function GET(request: Request) {
  try {
    resolveCronAuthMode(request)
    const summary = await runBillingRenewals()

    return NextResponse.json({ ok: true, ...summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error"

    return NextResponse.json({ ok: false, error: message }, { status: resolveCronErrorStatus(message) })
  }
}
