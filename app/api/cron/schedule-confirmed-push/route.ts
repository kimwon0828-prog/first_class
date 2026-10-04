import { NextResponse } from "next/server"
import { runConfirmedPushWork } from "@/features/notifications/push/confirmed-delivery"
export const dynamic = "force-dynamic"
export const maxDuration = 60
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  try {
    const result = await runConfirmedPushWork()
    return NextResponse.json(result, { status: result.errors ? 503 : 200, headers: { "Cache-Control": "no-store" } })
  } catch { return NextResponse.json({ error: "confirmed_push_worker_failed" }, { status: 503 }) }
}
