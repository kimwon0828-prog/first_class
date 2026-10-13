import { NextResponse } from "next/server"
import { runConfirmedPushWork } from "@/features/notifications/push/confirmed-delivery"
import { runParentEventPushWork } from "@/features/notifications/push/event-delivery"
export const dynamic = "force-dynamic"
export const maxDuration = 180
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  try {
    const outcomes = await Promise.allSettled([runConfirmedPushWork(), runParentEventPushWork()])
    const confirmed = outcomes[0].status === "fulfilled" ? outcomes[0].value : { errors: 1 }
    const events = outcomes[1].status === "fulfilled" ? outcomes[1].value : { errors: 1 }
    const result = { confirmed, events, errors: (confirmed.errors ?? 0) + events.errors }
    return NextResponse.json(result, { status: result.errors ? 503 : 200, headers: { "Cache-Control": "no-store" } })
  } catch { return NextResponse.json({ error: "confirmed_push_worker_failed" }, { status: 503 }) }
}
