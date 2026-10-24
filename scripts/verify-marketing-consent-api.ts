// 학원 안내 문자 수신 동의 API(2차-3) 검증 — 가짜 Supabase client, 네트워크 · DB 없음.
//
//   npx tsx scripts/verify-marketing-consent-api.ts
//
// GET · POST /api/native/me/marketing-consents 의 입구 확인(로그인 · 학부모 · 탈퇴 · 휴대폰)과
// 본문 검사 · RPC 오류 → 상태 코드 매핑을 확인한다(docs/academy-marketing-consent-api.md).
// 처리 결과 알림(정보통신망법 제50조 제7항): 상태가 실제로 바뀐 경우만 · 실패해도 저장 응답은 그대로 · 문구.

import type { SupabaseClient } from "@supabase/supabase-js"

import { maskAccountPhone, toAccountPhone } from "@/features/marketing-consent/lib/account-phone"
import { buildMarketingConsentNotice, type MarketingConsentChange } from "@/features/marketing-consent/lib/consent-notice"
import { parseMarketingConsentInput } from "@/features/marketing-consent/lib/marketing-consent"
import { createNativeMarketingConsentHandler } from "@/features/marketing-consent/server/native-handler"
import { prepareSmsContent } from "@/features/notifications/sms/byte-utils"

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`)
}

const ORG = "d1000000-0000-4000-8000-000000000001"
type Fake = {
  role?: string | null
  deletion?: boolean
  phoneVerified?: boolean
  rpcError?: string | null
  /** 지금 저장된 동의 값(가짜 RPC 가 changed 를 판정한다). null = 행 없음, "old_rpc" = changed 를 안 돌려주는 옛 RPC */
  previous?: boolean | null | "old_rpc"
  calls: Array<{ name: string; args: unknown }>
  tables?: string[]
}

const chain = (result: () => { data: unknown; error: unknown }) => {
  const query = { eq: () => query, maybeSingle: async () => result() }
  return { select: () => query }
}

const fakeClient = (fake: Fake) => ({
  auth: { getUser: async (token: string) => ({ data: { user: token === "good" ? { id: "parent-1" } : null }, error: null }) },
  from: (table: string) => {
    fake.tables = [...(fake.tables ?? []), table]
    return chain(() => ({ data: fake.role === null ? null : { id: "parent-1", role: fake.role ?? "parent" }, error: null }))
  },
  rpc: async (name: string, args?: unknown) => {
    fake.calls.push({ name, args })
    if (name === "get_my_parent_account_deletion_status") return { data: fake.deletion ?? false, error: null }
    if (name === "get_my_parent_phone_status") return { data: { required: true, excluded: false, phoneVerifiedAt: fake.phoneVerified === false ? null : "2026-10-01T00:00:00Z" }, error: null }
    if (fake.rpcError) return { data: null, error: { message: fake.rpcError } }
    if (name === "list_my_academy_marketing_consents") {
      return { data: [{ organization_id: ORG, organization_name: "중계 코딩랩", consented: true, consented_at: "2026-10-24T05:12:00Z", withdrawn_at: null }], error: null }
    }
    const input = args as { p_organization_id: string; p_consented: boolean }
    const row = { organizationId: input.p_organization_id, consented: input.p_consented, consentedAt: "2026-10-24T05:12:00Z", withdrawnAt: input.p_consented ? null : "2026-10-24T06:00:00Z" }
    if (fake.previous === "old_rpc") return { data: row, error: null }
    return { data: { ...row, changed: (fake.previous ?? false) !== input.p_consented }, error: null }
  }
}) as unknown as SupabaseClient

const call = async (
  fake: Fake,
  init: { method?: string; token?: string | null; body?: unknown },
  onChanged?: (change: MarketingConsentChange) => void
) => {
  const handler = createNativeMarketingConsentHandler({ client: () => fakeClient(fake), onChanged })
  const headers: Record<string, string> = {}
  if (init.token !== null) headers.authorization = `Bearer ${init.token ?? "good"}`
  if (init.body !== undefined) headers["content-type"] = "application/json"
  const response = await handler(new Request("http://local/api/native/me/marketing-consents", {
    method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body)
  }))
  return { status: response.status, body: await response.json() as Record<string, unknown> }
}

const valid = { organizationId: ORG, consented: true, source: "parent_app", textVersion: "academy-marketing-2026-10" }

void (async () => {
  check("본문: 정상", parseMarketingConsentInput(valid, "parent_app").ok)
  check("본문: 웹 출처를 앱 API 에 보내면 거절", !parseMarketingConsentInput({ ...valid, source: "parent_web" }, "parent_app").ok)
  const badSource = parseMarketingConsentInput({ ...valid, source: "admin" }, "parent_app")
  check("본문: 모르는 출처는 invalid_consent_source", !badSource.ok && badSource.error === "invalid_consent_source")
  check("본문: 문구 버전 61자 거절", !parseMarketingConsentInput({ ...valid, textVersion: "x".repeat(61) }, "parent_app").ok)
  check("본문: organizationId 는 uuid", !parseMarketingConsentInput({ ...valid, organizationId: "org-1" }, "parent_app").ok)
  check("본문: consented 는 boolean", !parseMarketingConsentInput({ ...valid, consented: "true" }, "parent_app").ok)

  check("로그인 없음 401", (await call({ calls: [] }, { token: null })).status === 401)
  check("잘못된 토큰 401", (await call({ calls: [] }, { token: "bad" })).status === 401)
  const academy = await call({ role: "academy", calls: [] }, {})
  check("학원 계정 403 parent_required", academy.status === 403 && academy.body.error === "parent_required")
  check("탈퇴 진행 중 403", (await call({ deletion: true, calls: [] }, {})).status === 403)
  check("휴대폰 확인 전 403", (await call({ phoneVerified: false, calls: [] }, {})).status === 403)

  const list = await call({ calls: [] }, {})
  const items = list.body.items as Array<Record<string, unknown>>
  check("GET 내 동의 목록", list.status === 200 && items[0].organizationName === "중계 코딩랩" && items[0].consented === true)

  const fake: Fake = { calls: [] }
  const post = await call(fake, { method: "POST", body: valid })
  const rpc = fake.calls.find((item) => item.name === "set_my_academy_marketing_consent")?.args as Record<string, unknown> | undefined
  check("POST 동의 200 · 응답 계약", post.status === 200 && post.body.organizationId === ORG && post.body.consented === true && post.body.withdrawnAt === null)
  check("RPC 에 학부모 id 를 넘기지 않는다(auth.uid())", Boolean(rpc) && !Object.keys(rpc!).some((key) => key.includes("parent")) && rpc!.p_source === "parent_app")
  const withdraw = await call({ calls: [] }, { method: "POST", body: { ...valid, consented: false } })
  check("POST 철회 → withdrawnAt", withdraw.status === 200 && typeof withdraw.body.withdrawnAt === "string")
  check("POST 잘못된 본문 400", (await call({ calls: [] }, { method: "POST", body: { ...valid, consented: 1 } })).status === 400)
  check("POST 모르는 학원 404", (await call({ rpcError: "organization_not_found", calls: [] }, { method: "POST", body: valid })).status === 404)
  check("POST RPC 가 학부모 아님 403", (await call({ rpcError: "parent_required", calls: [] }, { method: "POST", body: valid })).status === 403)
  check("POST 그 밖의 오류 503(원문 숨김)", (await call({ rpcError: "boom: secret detail", calls: [] }, { method: "POST", body: valid })).body.error === "temporarily_unavailable")
  check("다른 메서드 404", (await call({ calls: [] }, { method: "DELETE" })).status === 404)

  // ── 처리 결과 알림 ──────────────────────────────────────────
  const notices = async (previous: Fake["previous"], consented: boolean, extra: Partial<Fake> = {}) => {
    const changes: MarketingConsentChange[] = []
    const response = await call({ previous, calls: [], ...extra }, { method: "POST", body: { ...valid, consented } }, (change) => changes.push(change))
    return { status: response.status, changes }
  }
  const first = await notices(null, true)
  check("처음 동의 → 알림 1통(consent · 학부모 · 학원 · 동의 시각)",
    first.status === 200 && first.changes.length === 1 && first.changes[0].action === "consent" && first.changes[0].parentId === "parent-1" &&
    first.changes[0].organizationId === ORG && first.changes[0].at.toISOString() === "2026-10-24T05:12:00.000Z")
  check("같은 값 재요청(동의 → 동의)은 알림 없음", (await notices(true, true)).changes.length === 0)
  const off = await notices(true, false)
  check("철회(동의 → 거부) → 알림 1통(withdraw · 철회 시각)",
    off.changes.length === 1 && off.changes[0].action === "withdraw" && off.changes[0].at.toISOString() === "2026-10-24T06:00:00.000Z")
  check("다시 동의(거부 → 동의) → 알림", (await notices(false, true)).changes[0]?.action === "consent")
  check("같은 값 재요청(거부 → 거부)은 알림 없음", (await notices(false, false)).changes.length === 0)
  check("처음 보낸 철회(행 없음 → 거부)는 바뀐 것이 아니다", (await notices(null, false)).changes.length === 0)
  const old = await notices("old_rpc", true)
  check("RPC 가 changed 를 안 주면(옛 RPC) 알림 없음 · 저장 응답은 200", old.status === 200 && old.changes.length === 0)
  check("저장 실패면 알림 없음", (await notices(null, true, { rpcError: "organization_not_found" })).changes.length === 0)
  const throwing = await call({ previous: null, calls: [] }, { method: "POST", body: valid }, () => { throw new Error("sms down") })
  check("알림이 실패해도 저장 응답은 200", throwing.status === 200 && throwing.body.consented === true)
  const noPreRead: Fake = { previous: null, calls: [] }
  await call(noPreRead, { method: "POST", body: valid })
  check("앱 쪽에서 동의 표를 미리 읽지 않는다(판정은 RPC changed)", !(noPreRead.tables ?? []).includes("parent_marketing_consents"), (noPreRead.tables ?? []).join())
  check("알림 출처는 앱(parent_app)", first.changes[0]?.source === "parent_app")
  check("계정 번호 규칙: 숫자만 · +82 10 → 010 · 유선 · 빈 값은 null",
    toAccountPhone("010-2000-0001") === "01020000001" && toAccountPhone("+82 10-2000-0002") === "01020000002" &&
    toAccountPhone("02-123-4567") === null && toAccountPhone(null) === null && maskAccountPhone("01020000001") === "010-****-0001")

  const at = new Date("2026-10-23T15:30:00.000Z") // 10월 24일 00:30 KST
  const consentText = buildMarketingConsentNotice({ action: "consent", academyName: "중계 코딩랩", at })
  const withdrawText = buildMarketingConsentNotice({ action: "withdraw", academyName: "중계 코딩랩", at })
  const optOutText = buildMarketingConsentNotice({ action: "withdraw", academyName: null, at })
  check("동의 문구", consentText === "[첫수업] 중계 코딩랩 안내 문자 수신에 동의했어요(2026년 10월 24일). 마이 > 학원 안내 문자에서 언제든 끌 수 있어요.", consentText)
  check("철회 문구", withdrawText === "[첫수업] 중계 코딩랩 안내 문자 수신을 거부했어요(2026년 10월 24일). 앞으로 이 학원의 안내 문자는 보내지 않아요.", withdrawText)
  check("080 철회 문구(모든 학원)", optOutText.startsWith("[첫수업] 학원 안내 문자 수신을 거부했어요(2026년 10월 24일)."), optOutText)
  check("날짜는 KST(UTC 23일 15:30 → 24일)", consentText.includes("2026년 10월 24일"))
  const prepared = [consentText, withdrawText, optOutText].map((text) => prepareSmsContent(text))
  check("문자로 그대로 보낼 수 있는 글자만(EUC-KR) · 광고 표시 없음",
    prepared.every((item) => !item.hadUnsupportedCharacters) && [consentText, withdrawText, optOutText].every((text) => !text.includes("(광고)")),
    prepared.map((item) => `${item.messageType} ${item.byteLength}B`).join(", "))

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`)
  process.exit(failures === 0 ? 0 : 1)
})()
