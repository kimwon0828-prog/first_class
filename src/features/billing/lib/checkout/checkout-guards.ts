// 결제창 callback 검증 규칙.
//
// successUrl 로 돌아오는 값은 authKey · customerKey 뿐이다. 이 둘은 브라우저를 거쳐 오므로
// 그대로 믿지 않는다. 시작할 때 저장해 둔 checkout 의도와 맞춰 본 뒤에만 진행한다.
//
// 순수 함수로 둔다 — verifier 가 DB 없이 전 분기를 돌린다.

export type CheckoutSessionSnapshot = {
  id: string
  organizationId: string
  customerKey: string
  planCode: string
  amount: number
  orderId: string
  paymentIdempotencyKey: string
  billingKeyIssueIdempotencyKey: string
  status: string
  expiresAt: string
}

export type CheckoutCallbackInput = {
  /** 로그인한 사용자의 조직. callback 을 받은 요청에서 서버가 직접 구한 값이다. */
  actorOrganizationId: string
  customerKey: string
  authKey: string
}

export type CheckoutCallbackCheck =
  | { ok: true; session: CheckoutSessionSnapshot }
  | { ok: false; code: CheckoutRejectCode; message: string }

export type CheckoutRejectCode =
  | "missing_parameters"
  | "session_not_found"
  | "organization_mismatch"
  | "already_processed"
  | "session_expired"

const REJECT_MESSAGE: Record<CheckoutRejectCode, string> = {
  missing_parameters: "결제 인증 정보가 올바르지 않습니다.",
  session_not_found: "결제 요청을 찾을 수 없습니다. 처음부터 다시 시도해 주세요.",
  organization_mismatch: "결제 요청을 찾을 수 없습니다. 처음부터 다시 시도해 주세요.",
  already_processed: "이미 처리된 결제 요청입니다.",
  session_expired: "결제 요청이 만료되었습니다. 처음부터 다시 시도해 주세요."
}

/**
 * callback 을 진행해도 되는가.
 *
 * ⚠️ organization_mismatch 와 session_not_found 는 사용자에게 같은 문구를 준다.
 *    "그 customerKey 는 존재하지만 남의 것" 이라는 사실을 알려 주지 않는다.
 */
export const checkCheckoutCallback = (
  session: CheckoutSessionSnapshot | null,
  input: CheckoutCallbackInput,
  now: Date = new Date()
): CheckoutCallbackCheck => {
  if (!input.customerKey || !input.authKey) {
    return { ok: false, code: "missing_parameters", message: REJECT_MESSAGE.missing_parameters }
  }

  if (!session) {
    return { ok: false, code: "session_not_found", message: REJECT_MESSAGE.session_not_found }
  }

  // 남의 조직 callback 을 내 조직 결제로 반영하지 않는다.
  if (session.organizationId !== input.actorOrganizationId) {
    return {
      ok: false,
      code: "organization_mismatch",
      message: REJECT_MESSAGE.organization_mismatch
    }
  }

  // 조회 자체를 customerKey 로 하지만, 한 번 더 확인한다.
  if (session.customerKey !== input.customerKey) {
    return { ok: false, code: "session_not_found", message: REJECT_MESSAGE.session_not_found }
  }

  // pending/authorized는 crash 후 재개할 수 있다. 동시 실행은 DB lease가 막는다.
  if (!new Set(["pending", "authorized", "completed"]).has(session.status)) {
    return { ok: false, code: "already_processed", message: REJECT_MESSAGE.already_processed }
  }

  const expiresAt = new Date(session.expiresAt).getTime()
  // 인증 전에 만료된 pending만 거부한다. 이미 authorized인 작업은 만료 뒤에도 복구해야 한다.
  if (session.status === "pending" && (!Number.isFinite(expiresAt) || expiresAt <= now.getTime())) {
    return { ok: false, code: "session_expired", message: REJECT_MESSAGE.session_expired }
  }

  return { ok: true, session }
}

/** 결제창을 띄운 뒤 이 시간 안에 돌아오지 않으면 무효로 본다. */
export const CHECKOUT_SESSION_TTL_MS = 30 * 60 * 1000
