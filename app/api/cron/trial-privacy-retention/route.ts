import { randomUUID, timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { runTrialPrivacyRetention, type TrialPrivacyRetentionResult } from "@/features/my/server/trial-privacy-retention"
import { retentionRunReport, sendRetentionAttention } from "@/features/my/server/trial-privacy-retention-monitor"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  const supplied = request.headers.get("authorization") ?? ""
  const expected = secret ? `Bearer ${secret}` : ""
  if (!secret || Buffer.byteLength(supplied) !== Buffer.byteLength(expected)
    || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } })
  }
  const runId = randomUUID(), startedAt = Date.now()
  console.info("trial_privacy_retention_started", { runId, startedAt: new Date(startedAt).toISOString() })
  let result: TrialPrivacyRetentionResult | null = null
  try { result = await runTrialPrivacyRetention() } catch { /* report a fixed code, never provider details */ }
  const report = retentionRunReport(runId, startedAt, result)
  const alert = await sendRetentionAttention(report)
  if (report.status === "attention") console.error("trial_privacy_retention_finished", { ...report, alert })
  else console.info("trial_privacy_retention_finished", { ...report, alert })
  return NextResponse.json(result ? { ...result, runId, status: report.status, alert } : { error: "privacy_retention_unavailable", runId, alert },
    { status: report.status === "attention" ? 503 : 200, headers: { "Cache-Control": "no-store" } })
}
