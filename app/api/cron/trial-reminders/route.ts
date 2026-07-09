import { NextResponse } from "next/server"

import { runTrialReminders } from "@/features/notifications/reminders/run-trial-reminders"

export const dynamic = "force-dynamic"

const resolveCronAuthMode = (request: Request): "public_dev" | "shared_secret" => {
  const cronSecret = process.env.CRON_SECRET?.trim() ?? ""
  const authorization = request.headers.get("authorization")?.trim() ?? ""

  if (process.env.NODE_ENV === "production") {
    if (!cronSecret) {
      throw new Error("missing_cron_secret_in_production")
    }

    if (authorization !== `Bearer ${cronSecret}`) {
      throw new Error("unauthorized_cron_request")
    }

    return "shared_secret"
  }

  if (!cronSecret) {
    return "public_dev"
  }

  if (authorization !== `Bearer ${cronSecret}`) {
    throw new Error("unauthorized_cron_request")
  }

  return "shared_secret"
}

export async function GET(request: Request) {
  try {
    const authMode = resolveCronAuthMode(request)
    const result = await runTrialReminders(authMode)

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error"
    const status =
      message === "unauthorized_cron_request"
        ? 401
        : message === "missing_cron_secret_in_production"
          ? 503
          : 500

    return NextResponse.json(
      {
        ok: false,
        error: message
      },
      { status }
    )
  }
}
