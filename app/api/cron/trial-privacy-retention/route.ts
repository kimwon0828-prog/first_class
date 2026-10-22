import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { runTrialPrivacyRetention } from "@/features/my/server/trial-privacy-retention"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  const supplied = request.headers.get("authorization") ?? ""
  const expected = secret ? `Bearer ${secret}` : ""
  if (!secret || Buffer.byteLength(supplied) !== Buffer.byteLength(expected)
    || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  try {
    const result = await runTrialPrivacyRetention()
    if (result.errors || result.blocked || result.needsReview) console.error("trial_privacy_retention_attention", { errors: result.errors, blocked: result.blocked, needsReview: result.needsReview })
    return NextResponse.json(result, { status: result.errors || result.blocked || result.needsReview ? 503 : 200, headers: { "Cache-Control": "no-store" } })
  } catch {
    console.error("trial_privacy_retention_unavailable")
    return NextResponse.json({ error: "privacy_retention_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
