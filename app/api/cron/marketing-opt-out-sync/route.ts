import { NextResponse } from "next/server"

import { runMarketingOptOutSync } from "@/features/marketing-consent/server/run-opt-out-sync"
import { resolveCronAuthMode, resolveCronErrorStatus } from "@/shared/lib/cron-auth"

export const dynamic = "force-dynamic"

// 080 무료수신거부 매일 동기화 + 학원 소식 문자 결과 확인. KST 09:00(학원 소식은 08시부터 보낼 수 있어 그 전날 것까지 본다).
// 로컬 개발 서버가 운영 DB 를 보면 작업은 blocked 로 끝난다(getLocalMutationGuard).
export async function GET(request: Request) {
  try {
    const authMode = resolveCronAuthMode(request)
    const result = await runMarketingOptOutSync()

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
