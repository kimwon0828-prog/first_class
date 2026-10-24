// 학원 안내 문자 수신 동의 API(2차-3) 검증 — 가짜 Supabase client, 네트워크 · DB 없음.
//
//   npx tsx scripts/verify-marketing-consent-api.ts
//
// GET · POST /api/native/me/marketing-consents 의 입구 확인(로그인 · 학부모 · 탈퇴 · 휴대폰)과
// 본문 검사 · RPC 오류 → 상태 코드 매핑을 확인한다(docs/academy-marketing-consent-api.md).

import type { SupabaseClient } from "@supabase/supabase-js"

import { parseMarketingConsentInput } from "@/features/marketing-consent/lib/marketing-consent"
import { createNativeMarketingConsentHandler } from "@/features/marketing-consent/server/native-handler"

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`)
}

const ORG = "d1000000-0000-4000-8000-000000000001"
type Fake = { role?: string | null; deletion?: boolean; phoneVerified?: boolean; rpcError?: string | null; calls: Array<{ name: string; args: unknown }> }

const fakeClient = (fake: Fake) => ({
  auth: { getUser: async (token: string) => ({ data: { user: token === "good" ? { id: "parent-1" } : null }, error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: fake.role === null ? null : { id: "parent-1", role: fake.role ?? "parent" }, error: null }) }) }) }),
  rpc: async (name: string, args?: unknown) => {
    fake.calls.push({ name, args })
    if (name === "get_my_parent_account_deletion_status") return { data: fake.deletion ?? false, error: null }
    if (name === "get_my_parent_phone_status") return { data: { required: true, excluded: false, phoneVerifiedAt: fake.phoneVerified === false ? null : "2026-10-01T00:00:00Z" }, error: null }
    if (fake.rpcError) return { data: null, error: { message: fake.rpcError } }
    if (name === "list_my_academy_marketing_consents") {
      return { data: [{ organization_id: ORG, organization_name: "중계 코딩랩", consented: true, consented_at: "2026-10-24T05:12:00Z", withdrawn_at: null }], error: null }
    }
    const input = args as { p_organization_id: string; p_consented: boolean }
    return { data: { organizationId: input.p_organization_id, consented: input.p_consented, consentedAt: "2026-10-24T05:12:00Z", withdrawnAt: input.p_consented ? null : "2026-10-24T06:00:00Z" }, error: null }
  }
}) as unknown as SupabaseClient

const call = async (fake: Fake, init: { method?: string; token?: string | null; body?: unknown }) => {
  const handler = createNativeMarketingConsentHandler({ client: () => fakeClient(fake) })
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

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`)
  process.exit(failures === 0 ? 0 : 1)
})()
