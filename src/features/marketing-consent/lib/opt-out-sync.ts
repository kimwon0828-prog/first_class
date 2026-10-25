// 080 무료수신거부 매일 동기화 + 안내 문자 결과 확인(크론 /api/cron/marketing-opt-out-sync).
//
// 순서
//   1. 오래 남은 080 알림 자리(claimed 1시간 넘음)를 failed 로 내린다(작업 중 끊긴 것 — 다음에 다시 보낸다).
//   2. NCP 수신 거부 목록(최근 7일 등록분)을 받아 marketing_opt_out_phones 에 넣는다(이미 있는 번호는 그대로).
//      → 모든 학원 소식에서 빠진다. 080 번호를 아직 신청하지 않았거나 목록이 비어 있으면 그냥 지나간다.
//   3. 그 번호가 계정 번호인 학부모를 찾으면 학원 소식 수신 동의를 철회로 바꾸고(source opt_out_080, 모두),
//      080 처리 결과 알림을 번호마다 한 번 보낸다(claimed 자리 잡기).
//      7일 창 안에서는 매일 다시 보므로 실패 · dry_run 은 다음 날 다시 시도된다.
//   4. 학원 소식 문자 결과 확인: 보낸 지 10분 ~ 7일 된 sent 를 NCP 메시지 결과로 확인한다.
//      실패 + 080 거부 번호 → opted_out("수신거부로 발송 안 됨"), 그 밖의 실패 → failed, 성공 → 확인 시각만.
//      둘 다 한도에서 빠진다. 아직 처리 중(READY · PROCESSING)이면 다음 실행에 다시 본다.
//
// 이 파일은 순수 로직이다. NCP · DB · 문자는 deps 로 받는다(검증: scripts/verify-marketing-opt-out-sync.ts).

const DAY_MS = 24 * 60 * 60 * 1000
export const OPT_OUT_WINDOW_DAYS = 7
export const RESULT_CHECK_MIN_AGE_MS = 10 * 60 * 1000
export const RESULT_CHECK_MAX_AGE_DAYS = 7

export type OptOutEntry = { phone: string; registerTime: string; registerType: string }
export type MessageResult = { status: string; statusName: string; statusCode: string | null }
export type PendingRecipient = { id: string; phoneHash: string; requestId: string }
export type RecipientResultPatch =
  | { status: "opted_out" | "failed"; providerResultCode: string | null; errorCode: string }
  | { status: "sent"; providerResultCode: string | null; errorCode: null }

export type OptOutSyncDeps = {
  now: Date
  hash: (phone: string) => string
  releaseStaleClaims: () => Promise<number>
  /** NCP 설정이 없으면 null(동기화 · 결과 확인을 건너뛴다). */
  listUnsubscribes: ((window: { startTime: number; endTime: number }) => Promise<OptOutEntry[]>) | null
  insertOptOuts: (rows: Array<{ phoneHash: string; optedOutAt: string; source: "opt_out_080" | "admin" }>) => Promise<void>
  findParents: (hashes: string[]) => Promise<Array<{ phoneHash: string; parentId: string }>>
  /** 학원 소식 수신 동의 철회(RPC withdraw_academy_news_consent_by_opt_out). changed = 동의 중이던 것을 바꿨다. */
  withdrawConsent: (input: { parentId: string; at: Date }) => Promise<{ changed: boolean }>
  sendNotice: (input: { parentId: string; phone: string; at: Date }) => Promise<{ status: string; reason: string | null; claimed: boolean }>
  listPendingResults: (window: { from: string; to: string }) => Promise<PendingRecipient[]>
  getMessageResult: ((requestId: string) => Promise<MessageResult | null>) | null
  listOptedOutHashes: (hashes: string[]) => Promise<Set<string>>
  updateRecipient: (id: string, patch: RecipientResultPatch, checkedAt: string) => Promise<void>
}

export type OptOutSyncSummary = {
  staleClaimsReleased: number
  ncloud: "ok" | "not_configured"
  unsubscribes: number
  noticeTargets: number
  /** 동의 중이다가 080 으로 철회된 학부모 수 · 철회에 실패한 수(다음 동기화에서 다시 본다). */
  consentsWithdrawn: number
  consentWithdrawErrors: number
  notices: { sent: number; dryRun: number; skipped: number; failed: number; alreadyNotified: number }
  results: { checked: number; delivered: number; optedOut: number; failed: number; pending: number; errors: number }
}

/** NCP registerTime("YYYY-MM-DDTHH:mm:ss.sss", KST) → Date. 읽지 못하면 now. */
export const parseRegisterTime = (value: string, now: Date) => {
  const parsed = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? new Date(`${value}+09:00`) : null
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : now
}

/** NCP 메시지 결과 → 받는 사람 상태. null = 아직 처리 중(다음에 다시 본다). */
export const resolveRecipientResult = (result: MessageResult | null, optedOut: boolean): RecipientResultPatch | null => {
  if (!result || result.status !== "COMPLETED") return null
  if (result.statusName === "success") return { status: "sent", providerResultCode: result.statusCode, errorCode: null }
  if (optedOut) return { status: "opted_out", providerResultCode: result.statusCode, errorCode: "opted_out_080" }
  return { status: "failed", providerResultCode: result.statusCode, errorCode: `ncloud_result_${result.statusCode ?? "unknown"}` }
}

const runPool = async <T>(items: T[], size: number, work: (item: T) => Promise<void>) => {
  const queue = [...items]
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) await work(next)
  }))
}

export const runOptOutSync = async (deps: OptOutSyncDeps): Promise<OptOutSyncSummary> => {
  const summary: OptOutSyncSummary = {
    staleClaimsReleased: 0,
    ncloud: deps.listUnsubscribes && deps.getMessageResult ? "ok" : "not_configured",
    unsubscribes: 0,
    noticeTargets: 0,
    consentsWithdrawn: 0,
    consentWithdrawErrors: 0,
    notices: { sent: 0, dryRun: 0, skipped: 0, failed: 0, alreadyNotified: 0 },
    results: { checked: 0, delivered: 0, optedOut: 0, failed: 0, pending: 0, errors: 0 }
  }
  summary.staleClaimsReleased = await deps.releaseStaleClaims()

  // ── 2 · 3. 수신 거부 목록 → 080 번호 표 → 처리 결과 알림 ──
  if (deps.listUnsubscribes) {
    const entries = await deps.listUnsubscribes({ startTime: deps.now.getTime() - OPT_OUT_WINDOW_DAYS * DAY_MS, endTime: deps.now.getTime() })
    const byHash = new Map<string, OptOutEntry>()
    for (const entry of entries) {
      const digits = entry.phone.replace(/\D/g, "")
      if (digits) byHash.set(deps.hash(digits), { ...entry, phone: digits })
    }
    summary.unsubscribes = byHash.size
    if (byHash.size > 0) {
      await deps.insertOptOuts(Array.from(byHash, ([phoneHash, entry]) => ({
        phoneHash,
        optedOutAt: parseRegisterTime(entry.registerTime, deps.now).toISOString(),
        source: entry.registerType === "M" ? "admin" as const : "opt_out_080" as const
      })))
      // 동의 철회는 그 번호를 계정 번호로 쓰는 학부모 모두. 알림은 번호마다 한 통(여럿이면 한 명에게만).
      const parents = await deps.findParents(Array.from(byHash.keys()))
      const parentByHash = new Map<string, string>()
      for (const row of parents) {
        if (!parentByHash.has(row.phoneHash)) parentByHash.set(row.phoneHash, row.parentId)
        try {
          const withdrawn = await deps.withdrawConsent({ parentId: row.parentId, at: parseRegisterTime((byHash.get(row.phoneHash) as OptOutEntry).registerTime, deps.now) })
          if (withdrawn.changed) summary.consentsWithdrawn += 1
        } catch {
          summary.consentWithdrawErrors += 1
        }
      }
      summary.noticeTargets = parentByHash.size
      for (const [phoneHash, parentId] of parentByHash) {
        const entry = byHash.get(phoneHash) as OptOutEntry
        const result = await deps.sendNotice({ parentId, phone: entry.phone, at: parseRegisterTime(entry.registerTime, deps.now) })
        if (!result.claimed && result.reason === "already_notified") summary.notices.alreadyNotified += 1
        else if (result.status === "sent") summary.notices.sent += 1
        else if (result.status === "dry_run") summary.notices.dryRun += 1
        else if (result.status === "skipped") summary.notices.skipped += 1
        else summary.notices.failed += 1
      }
    }
  }

  // ── 4. 학원 소식 문자 결과 확인 ──
  const getMessageResult = deps.getMessageResult
  if (getMessageResult) {
    const pending = await deps.listPendingResults({
      from: new Date(deps.now.getTime() - RESULT_CHECK_MAX_AGE_DAYS * DAY_MS).toISOString(),
      to: new Date(deps.now.getTime() - RESULT_CHECK_MIN_AGE_MS).toISOString()
    })
    const optedOut = pending.length > 0 ? await deps.listOptedOutHashes(Array.from(new Set(pending.map((item) => item.phoneHash)))) : new Set<string>()
    const checkedAt = deps.now.toISOString()
    await runPool(pending, 5, async (item) => {
      try {
        const patch = resolveRecipientResult(await getMessageResult(item.requestId), optedOut.has(item.phoneHash))
        if (!patch) {
          summary.results.pending += 1
          return
        }
        await deps.updateRecipient(item.id, patch, checkedAt)
        summary.results.checked += 1
        if (patch.status === "opted_out") summary.results.optedOut += 1
        else if (patch.status === "failed") summary.results.failed += 1
        else summary.results.delivered += 1
      } catch {
        summary.results.errors += 1
      }
    })
  }

  return summary
}
