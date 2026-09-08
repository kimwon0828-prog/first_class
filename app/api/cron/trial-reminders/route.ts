import { NextResponse } from "next/server"

import { runTrialReminders } from "@/features/notifications/reminders/run-trial-reminders"
import { resolveCronAuthMode, resolveCronErrorStatus } from "@/shared/lib/cron-auth"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const authMode = resolveCronAuthMode(request)
    const result = await runTrialReminders(authMode)

    return NextResponse.json(result)
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
