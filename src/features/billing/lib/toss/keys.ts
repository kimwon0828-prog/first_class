// Toss 연동 키 규칙.
//
// 자동결제(빌링)는 결제위젯 키가 아니라 "API 개별 연동 키" 를 쓴다.
//   개별 연동 키   test_ck_ / live_ck_ (client) · test_sk_ / live_sk_ (secret)
//   결제위젯 키    test_gck_ / test_gsk_          ← 자동결제에 쓰면 안 된다
//
// 이 모듈은 process.env 를 읽지 않는다. 순수 판정만 담아 verifier 가 그대로 쓴다.

export type TossKeyEnvironment = "test" | "live"

export type TossKeyKind = "client" | "secret"

const KEY_PATTERN = /^(test|live)_(g?)(ck|sk)_[A-Za-z0-9]+$/

export type TossKeyInspection =
  | { valid: true; environment: TossKeyEnvironment; kind: TossKeyKind; widget: boolean }
  | { valid: false; reason: string }

/** 키 값 자체는 절대 돌려주지 않는다. 판정 결과만 만든다. */
export const inspectTossKey = (value: string | null | undefined): TossKeyInspection => {
  const key = value?.trim() ?? ""
  if (!key) {
    return { valid: false, reason: "missing" }
  }

  const matched = KEY_PATTERN.exec(key)
  if (!matched) {
    return { valid: false, reason: "malformed" }
  }

  const [, environment, widgetMarker, kindMarker] = matched
  return {
    valid: true,
    environment: environment as TossKeyEnvironment,
    kind: kindMarker === "ck" ? "client" : "secret",
    widget: widgetMarker === "g"
  }
}

export type TossKeyPairCheck =
  | { ok: true; environment: TossKeyEnvironment }
  | { ok: false; code: string; message: string }

/**
 * client / secret 키 쌍 검증. fail fast 로 쓴다.
 *
 * 막는 것.
 *   - 결제위젯 키(gck/gsk) 사용 — 자동결제 MID 가 다르다
 *   - client 자리에 secret, secret 자리에 client
 *   - test 와 live 를 섞어 쓰는 것
 *   - live 키 사용 (BILLING-3B 는 TEST 전용이다)
 */
export const checkTossKeyPair = (
  clientKey: string | null | undefined,
  secretKey: string | null | undefined,
  options: { allowLive?: boolean } = {}
): TossKeyPairCheck => {
  const client = inspectTossKey(clientKey)
  const secret = inspectTossKey(secretKey)

  if (!client.valid) {
    return { ok: false, code: `client_key_${client.reason}`, message: "Toss client key 가 올바르지 않다" }
  }
  if (!secret.valid) {
    return { ok: false, code: `secret_key_${secret.reason}`, message: "Toss secret key 가 올바르지 않다" }
  }

  if (client.kind !== "client") {
    return { ok: false, code: "client_key_is_secret", message: "client key 자리에 secret key 가 들어 있다" }
  }
  if (secret.kind !== "secret") {
    return { ok: false, code: "secret_key_is_client", message: "secret key 자리에 client key 가 들어 있다" }
  }

  if (client.widget || secret.widget) {
    return {
      ok: false,
      code: "widget_key_not_supported",
      message: "자동결제는 결제위젯 키(gck/gsk)가 아니라 API 개별 연동 키(ck/sk)를 쓴다"
    }
  }

  if (client.environment !== secret.environment) {
    return {
      ok: false,
      code: "key_environment_mismatch",
      message: "client key 와 secret key 의 환경(test/live)이 다르다"
    }
  }

  if (client.environment === "live" && !options.allowLive) {
    return {
      ok: false,
      code: "live_key_not_allowed",
      message: "이 단계는 TEST 전용이다. live 키로는 실행하지 않는다"
    }
  }

  return { ok: true, environment: client.environment }
}

/** Authorization: Basic base64(`${secretKey}:`). 콜론이 빠지면 인증이 실패한다. */
export const buildTossBasicAuthHeader = (secretKey: string) =>
  `Basic ${Buffer.from(`${secretKey}:`, "utf8").toString("base64")}`

// ─────────────────────────────────────────────────────────────
// 배포 환경별 결제 허용 규칙
//
// 사고 시나리오: production 에 test 키가 꽂힌 채 결제 코드가 배포되면,
// 실제 사용자가 Toss sandbox 결제창으로 결제를 "성공" 시켜 production 구독을
// active 로 만들 수 있다. 돈은 오가지 않는데 유료 기능이 열린다.
//
// 그래서 production 에서는 test 키를 fail-closed 로 막는다. 키가 잘못 꽂힌 것을
// 조용히 넘기지 않고 결제 진입 자체를 닫는다.
//
// 실제 결제는 live 키 + 명시적 allowLive 두 조건을 모두 만족할 때만 열린다.
// ─────────────────────────────────────────────────────────────

/** Vercel 이 주는 배포 환경. 값이 없으면 로컬로 본다. */
export type TossDeploymentEnvironment = "production" | "preview" | "development"

export const normalizeDeploymentEnvironment = (
  value: string | null | undefined
): TossDeploymentEnvironment => {
  const normalized = value?.trim().toLowerCase()
  if (normalized === "production") {
    return "production"
  }
  if (normalized === "preview") {
    return "preview"
  }
  return "development"
}

export type TossBillingMode =
  | { allowed: true; deployment: TossDeploymentEnvironment; keyEnvironment: TossKeyEnvironment }
  | { allowed: false; code: TossBillingBlockCode }

export type TossBillingBlockCode =
  /** production 인데 test 키가 꽂혀 있다. sandbox 결제로 유료가 열리면 안 된다. */
  | "test_key_in_production"
  /** live 키가 있지만 명시적으로 켜지 않았다. */
  | "live_billing_not_enabled"

/**
 * 이 배포에서 provider 결제를 실행해도 되는가.
 *
 * checkout 시작 · 갱신 승인 · 대사의 provider mutation 이 전부 이 판정을 따른다.
 * 판정 결과에는 키 값도, 어떤 키가 꽂혔는지도 담지 않는다.
 */
export const resolveTossBillingMode = (input: {
  deployment: TossDeploymentEnvironment
  keyEnvironment: TossKeyEnvironment
  allowLive: boolean
}): TossBillingMode => {
  if (input.keyEnvironment === "live" && !input.allowLive) {
    return { allowed: false, code: "live_billing_not_enabled" }
  }

  if (input.deployment === "production" && input.keyEnvironment === "test") {
    return { allowed: false, code: "test_key_in_production" }
  }

  return {
    allowed: true,
    deployment: input.deployment,
    keyEnvironment: input.keyEnvironment
  }
}
