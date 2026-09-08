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
