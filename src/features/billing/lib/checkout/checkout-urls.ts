import "server-only"

import { headers } from "next/headers"

import { resolveStudioBillingCallbackUrl } from "@/features/billing/lib/callback-url"
import { getRequestHostname } from "@/shared/lib/request-host"

// 결제창 successUrl · failUrl. 최초 결제(스탠다드 시작)와 체험 중 카드 등록이 같은 callback 을 쓴다.
//
// ⚠️ Studio host 에서 /studio/... 를 그대로 넘기면 결제 복귀가 canonical redirect 를 한 번 더 탄다.
//    결제사에 넘기는 주소는 처음부터 이 host 의 주소여야 한다.

const CALLBACK_PATH = "/studio/billing/callback"
const FAIL_PATH = "/studio/billing"

const resolveOrigin = async (): Promise<string> => {
  const headerList = await headers()
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host")
  if (!host) {
    throw new Error("missing_request_host")
  }

  const protocol =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")

  return `${protocol}://${host}`
}

export const buildCheckoutReturnUrls = async (): Promise<{ successUrl: string; failUrl: string }> => {
  const origin = await resolveOrigin()
  const hostname = await getRequestHostname()
  const toCallbackUrl = (internalPath: string) =>
    resolveStudioBillingCallbackUrl({ internalPath, hostname, origin })

  return {
    successUrl: toCallbackUrl(CALLBACK_PATH),
    /* 실패 query 이름·값은 결제사와의 기존 계약이다. 그대로 둔다. */
    failUrl: `${toCallbackUrl(FAIL_PATH)}?billing=failed`
  }
}
