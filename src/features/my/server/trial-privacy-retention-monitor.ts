import "server-only"
import nodemailer from "nodemailer"
import type { TrialPrivacyRetentionResult } from "./trial-privacy-retention"

export type RetentionRunReport = ReturnType<typeof retentionRunReport>
export function retentionRunReport(runId: string, startedAt: number, result: TrialPrivacyRetentionResult | null, endedAt = Date.now()) {
  // Explicit fields only: never log RPC objects, exception messages, IDs or file paths.
  const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0
  const reasons: string[] = []
  if (!result) reasons.push("unavailable")
  else if (result.enabled) {
    if (!result.scopes) reasons.push("no_scopes")
    if (result.errors) reasons.push("execution_error")
    if (result.blocked) reasons.push("blocked")
    if (result.needsReview) reasons.push("manual_review")
    if (result.busyScopes) reasons.push("busy")
    if (result.deadlineReached) reasons.push("deadline")
    if (result.capacityReached) reasons.push("capacity")
  }
  return {
    runId, startedAt: new Date(startedAt).toISOString(), durationMs: Math.max(0, endedAt - startedAt),
    status: !result ? "attention" : !result.enabled ? "disabled" : reasons.length ? "attention" : "ok",
    reasons, scopes: count(result?.scopes), prepared: count(result?.prepared), blocked: count(result?.blocked),
    needsReview: count(result?.needsReview), filesRemoved: count(result?.filesRemoved), jobsCompleted: count(result?.jobsCompleted),
    errors: count(result?.errors), busyScopes: count(result?.busyScopes)
  }
}

type Mail = { from: string; to: string; subject: string; text: string }
type Env = Record<string, string | undefined>
export async function sendRetentionAttention(report: RetentionRunReport, options: {
  env?: Env; send?: (mail: Mail) => Promise<void>
} = {}): Promise<"not_needed" | "disabled" | "not_configured" | "sent" | "failed"> {
  if (report.status !== "attention") return "not_needed"
  const env = options.env ?? process.env
  if (env.TRIAL_PRIVACY_ALERT_ENABLED !== "true") return "disabled"
  const host = env.ZOHO_SMTP_HOST?.trim(), user = env.ZOHO_SMTP_USER?.trim(), password = env.ZOHO_SMTP_PASSWORD
  const to = env.TRIAL_PRIVACY_ALERT_TO?.trim(), port = Number(env.ZOHO_SMTP_PORT)
  const address = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/
  if (!host || /[\r\n]/.test(host) || !user || !password || !to || !address.test(to) || !address.test(user)
    || ![465, 587].includes(port)) return "not_configured"
  const mail: Mail = {
    from: user, to, subject: "[첫수업 운영] 개인정보 정리 확인 필요",
    text: ["개인정보 정기 정리에서 확인할 항목이 있습니다.", `실행: ${report.runId}`, `시작(UTC): ${report.startedAt}`,
      `상태: ${report.reasons.join(", ")}`, `처리 범위: ${report.scopes}개`, `오류: ${report.errors}건`,
      `보류: ${report.blocked}건`, `수동 확인: ${report.needsReview}건`,
      "Vercel의 trial_privacy_retention_finished 로그에서 같은 실행 번호를 확인해 주세요.",
      "원인을 확인하기 전 완료 처리하거나 고객 기록의 종료 시각을 추정하지 마세요. 고객 이름·연락처·사진은 이 메일에 포함되지 않습니다."
    ].join("\n")
  }
  let transport: ReturnType<typeof nodemailer.createTransport> | undefined
  try {
    if (options.send) await options.send(mail)
    else {
      transport = nodemailer.createTransport({ host, port, secure: port === 465, requireTLS: port === 587,
        auth: { user, pass: password }, connectionTimeout: 2000, greetingTimeout: 2000, socketTimeout: 3000 })
      const sent = await transport.sendMail(mail)
      if (!sent.accepted?.length || sent.rejected?.length) return "failed"
    }
    return "sent"
  } catch { return "failed" }
  finally { transport?.close() }
}
