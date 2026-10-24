// 080 무료수신거부 매일 동기화 + 안내 문자 결과 확인 검증 — 가짜 NCP · DB · 문자, 네트워크 · DB 없음.
//
//   npx tsx scripts/verify-marketing-opt-out-sync.ts
//
//   1. NCP 설정 없음 · 목록 빈 값 → 오류 없이 지나간다
//   2. 수신 거부 목록 → 080 번호 표(같은 번호 하나 · M = admin) → 계정 번호 학부모에게 알림 번호마다 한 번
//      (이미 보낸 번호는 다시 안 보냄 · 실패는 다음 실행에 다시)
//   3. 결과 확인: 실패 + 080 → opted_out · 그 밖의 실패 → failed · 성공 → 확인만 · 처리 중 → 다음에 · 오류는 그 건만
//   4. 기간: 080 목록 최근 7일 · 결과 확인 10분 ~ 7일

import { createHash } from "node:crypto"

import {
  parseRegisterTime,
  resolveRecipientResult,
  runOptOutSync,
  type MessageResult,
  type OptOutSyncDeps,
  type RecipientResultPatch
} from "@/features/marketing-consent/lib/opt-out-sync"

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`)
}

const NOW = new Date("2026-10-25T00:00:00.000Z") // 10월 25일 09:00 KST
const hash = (phone: string) => createHash("sha256").update(phone.replace(/\D/g, "")).digest("hex")

type World = {
  optOuts: Map<string, { optedOutAt: string; source: string }>
  /** 080 알림 자리(번호 해시 → 상태). sent · skipped · claimed 는 자리를 지킨다. */
  notices: Map<string, string>
  noticeOutcome: "sent" | "failed" | "dry_run"
  sentTo: string[]
  updates: Array<{ id: string; patch: RecipientResultPatch }>
  windows: Array<{ kind: string; from: number | string; to: number | string }>
}

const world = (): World => ({ optOuts: new Map(), notices: new Map(), noticeOutcome: "sent", sentTo: [], updates: [], windows: [] })

const deps = (w: World, overrides: Partial<OptOutSyncDeps> = {}): OptOutSyncDeps => ({
  now: NOW,
  hash,
  releaseStaleClaims: async () => 0,
  listUnsubscribes: async (window) => {
    w.windows.push({ kind: "unsubscribes", from: window.startTime, to: window.endTime })
    return [
      { phone: "01011112222", registerTime: "2026-10-24T20:15:00.000", registerType: "C" },
      { phone: "010-1111-2222", registerTime: "2026-10-24T20:15:00.000", registerType: "C" },
      { phone: "01033334444", registerTime: "2026-10-23T10:00:00.000", registerType: "M" },
      { phone: "01055556666", registerTime: "2026-10-22T09:00:00.000", registerType: "C" }
    ]
  },
  insertOptOuts: async (rows) => {
    for (const row of rows) if (!w.optOuts.has(row.phoneHash)) w.optOuts.set(row.phoneHash, { optedOutAt: row.optedOutAt, source: row.source })
  },
  // 01011112222 · 01033334444 는 계정 번호인 학부모가 있다. 01055556666 은 없다.
  findParents: async (hashes) => [
    { phoneHash: hash("01011112222"), parentId: "parent-a" },
    { phoneHash: hash("01011112222"), parentId: "parent-a2" },
    { phoneHash: hash("01033334444"), parentId: "parent-b" }
  ].filter((row) => hashes.includes(row.phoneHash)),
  sendNotice: async ({ phone }) => {
    const key = hash(phone)
    const held = w.notices.get(key)
    if (held === "sent" || held === "skipped" || held === "claimed") return { status: "skipped", reason: "already_notified", claimed: false }
    w.notices.set(key, w.noticeOutcome)
    w.sentTo.push(phone)
    return { status: w.noticeOutcome, reason: w.noticeOutcome === "failed" ? "ncloud_http_500" : null, claimed: true }
  },
  listPendingResults: async (window) => {
    w.windows.push({ kind: "results", from: window.from, to: window.to })
    return [
      { id: "r-opt", phoneHash: hash("01011112222"), requestId: "req-1" },
      { id: "r-fail", phoneHash: hash("01077778888"), requestId: "req-2" },
      { id: "r-ok", phoneHash: hash("01099990000"), requestId: "req-3" },
      { id: "r-wait", phoneHash: hash("01099990001"), requestId: "req-4" },
      { id: "r-err", phoneHash: hash("01099990002"), requestId: "req-5" }
    ]
  },
  getMessageResult: async (requestId) => {
    const results: Record<string, MessageResult | null> = {
      "req-1": { status: "COMPLETED", statusName: "fail", statusCode: "E917" },
      "req-2": { status: "COMPLETED", statusName: "fail", statusCode: "3012" },
      "req-3": { status: "COMPLETED", statusName: "success", statusCode: "0" },
      "req-4": { status: "PROCESSING", statusName: "", statusCode: null }
    }
    if (requestId === "req-5") throw new Error("ncloud_http_500")
    return results[requestId] ?? null
  },
  listOptedOutHashes: async (hashes) => new Set(hashes.filter((item) => w.optOuts.has(item))),
  updateRecipient: async (id, patch) => { w.updates.push({ id, patch }) },
  ...overrides
})

void (async () => {
  // ── 1. 설정 없음 · 빈 목록 ──
  {
    const w = world()
    const summary = await runOptOutSync(deps(w, { listUnsubscribes: null, getMessageResult: null }))
    check("NCP 설정이 없으면 오류 없이 지나간다(080 · 결과 확인 모두 건너뜀)",
      summary.ncloud === "not_configured" && summary.unsubscribes === 0 && w.optOuts.size === 0 && w.updates.length === 0)
    const empty = world()
    let inserted = false
    const s2 = await runOptOutSync(deps(empty, { listUnsubscribes: async () => [], insertOptOuts: async () => { inserted = true } }))
    check("080 목록이 비어 있으면(번호 미신청) 오류 없이 지나간다", s2.unsubscribes === 0 && !inserted && s2.noticeTargets === 0)
  }

  // ── 2. 080 목록 → 번호 표 → 알림 ──
  {
    const w = world()
    const first = await runOptOutSync(deps(w))
    check("같은 번호(형식만 다름)는 하나로 센다(3개)", first.unsubscribes === 3 && w.optOuts.size === 3, String(first.unsubscribes))
    check("080 ARS(C)는 opt_out_080, 콘솔 직접(M)은 admin",
      w.optOuts.get(hash("01011112222"))?.source === "opt_out_080" && w.optOuts.get(hash("01033334444"))?.source === "admin")
    check("거부 시각은 NCP 등록 시각(KST)", w.optOuts.get(hash("01011112222"))?.optedOutAt === "2026-10-24T11:15:00.000Z", w.optOuts.get(hash("01011112222"))?.optedOutAt)
    check("계정 번호 학부모가 있는 번호에만 알림(2통, 학부모 없는 번호는 안 보냄)",
      first.noticeTargets === 2 && first.notices.sent === 2 && w.sentTo.sort().join() === "01011112222,01033334444", w.sentTo.join())
    check("한 번호에 학부모가 여럿이어도 알림은 한 통", w.sentTo.filter((phone) => phone === "01011112222").length === 1)

    const second = await runOptOutSync(deps(w))
    check("다음 날 같은 목록이 와도 이미 보낸 번호는 다시 안 보냄", second.notices.alreadyNotified === 2 && second.notices.sent === 0 && w.sentTo.length === 2)
    check("080 번호 표도 그대로(새 번호만 넣는다)", w.optOuts.size === 3)
  }
  {
    const w = world()
    w.noticeOutcome = "failed"
    const failed = await runOptOutSync(deps(w))
    check("알림 실패는 실패로 센다", failed.notices.failed === 2)
    w.noticeOutcome = "sent"
    // 가짜 자리 규칙: failed 는 자리를 비운다(DB partial unique 와 같다)
    for (const [key, value] of w.notices) if (value === "failed") w.notices.delete(key)
    const retry = await runOptOutSync(deps(w))
    check("실패한 알림은 다음 실행에 다시 보낸다", retry.notices.sent === 2)
  }

  // ── 3. 결과 확인 ──
  {
    const w = world()
    const summary = await runOptOutSync(deps(w))
    const byId = new Map(w.updates.map((item) => [item.id, item.patch]))
    check("실패 + 080 거부 번호 → opted_out(수신거부로 발송 안 됨)", byId.get("r-opt")?.status === "opted_out" && byId.get("r-opt")?.providerResultCode === "E917")
    check("080 이 아닌 실패 → failed(결과 코드 남김)", byId.get("r-fail")?.status === "failed" && byId.get("r-fail")?.errorCode === "ncloud_result_3012")
    check("성공 → sent 그대로(확인 시각만)", byId.get("r-ok")?.status === "sent")
    check("처리 중이면 손대지 않고 다음에 본다", !byId.has("r-wait") && summary.results.pending === 1)
    check("한 건 조회 오류는 그 건만(나머지는 계속)", !byId.has("r-err") && summary.results.errors === 1 && summary.results.checked === 3)
    check("080 목록을 먼저 넣고 결과를 본다(오늘 새로 들어온 번호도 opted_out)", summary.results.optedOut === 1)
  }

  // ── 4. 기간 ──
  {
    const w = world()
    await runOptOutSync(deps(w))
    const unsub = w.windows.find((item) => item.kind === "unsubscribes")!
    const results = w.windows.find((item) => item.kind === "results")!
    check("080 목록은 최근 7일 등록분", unsub.to === NOW.getTime() && unsub.from === NOW.getTime() - 7 * 86_400_000)
    check("결과 확인은 보낸 지 10분 ~ 7일", results.to === "2026-10-24T23:50:00.000Z" && results.from === "2026-10-18T00:00:00.000Z", `${results.from} ~ ${results.to}`)
  }

  check("등록 시각 형식이 이상하면 지금 시각", parseRegisterTime("", NOW).getTime() === NOW.getTime())
  check("결과 없음(null)은 처리 중으로 본다", resolveRecipientResult(null, true) === null)

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`)
  process.exit(failures === 0 ? 0 : 1)
})()
