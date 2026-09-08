import { NextResponse } from "next/server"

import { processTossWebhook } from "@/features/billing/actions/process-toss-webhook"

export const dynamic = "force-dynamic"

// Toss webhook 수신.
//
// 결제 webhook 에는 서명 검증이 없다(공식적으로 지급대행 이벤트에만 제공된다).
// 그래서 이 route 는 인증 장치가 아니다 — body 는 "확인해 보라" 는 신호로만 쓰고,
// 실제 판단은 결제 조회 API 재조회로 한다. 누가 아무 body 나 보내도 상태는 바뀌지 않는다.

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: true, outcome: "ignored:invalid_json" })
  }

  try {
    const result = await processTossWebhook(
      body,
      request.headers.get("tosspayments-webhook-transmission-id")
    )

    return NextResponse.json(
      { ok: result.httpStatus === 200, outcome: result.outcome },
      { status: result.httpStatus }
    )
  } catch {
    // 재전송을 받아 다시 시도한다.
    return NextResponse.json({ ok: false, outcome: "internal_error" }, { status: 500 })
  }
}
