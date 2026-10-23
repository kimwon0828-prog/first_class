import { NextResponse } from "next/server"

import { runTrialNotices } from "@/features/billing/actions/run-trial-notices"
import { resolveCronAuthMode, resolveCronErrorStatus } from "@/shared/lib/cron-auth"

export const dynamic = "force-dynamic"

// 스탠다드 무료 체험 알림 문자. 갱신 크론(billing-renewals, KST 12:00) 뒤 KST 12:30 에 돈다.
// 로컬 개발 서버가 운영 DB 를 보면 작업은 blocked 로 끝난다(getLocalMutationGuard).
export async function GET(request: Request) {
  try {
    const authMode = resolveCronAuthMode(request)
    const result = await runTrialNotices()

    return NextResponse.json({ ok: true, authMode, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error"
    const status = resolveCronErrorStatus(message)

    return NextResponse.json(
      {
        ok: false,
        error: message
      },
      { status }
    )
  }
}
