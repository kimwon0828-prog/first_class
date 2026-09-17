import "server-only"

import { headers } from "next/headers"

/**
 * The host this request came in on.
 *
 * Read in the same order middleware uses — `x-forwarded-host` first, then
 * `host` — so a page and the middleware in front of it never disagree about
 * which product they are serving.
 *
 * ⚠️ navigation 용이다. 어떤 제품의 주소를 만들지 정하는 데만 쓴다. 누가
 *    접속했는지는 이 값으로 판단하지 않는다 — 역할은 profile · RLS · 기존
 *    guard 의 몫이다. Host 헤더는 클라이언트가 보내는 값이라 신뢰 경계가
 *    아니다.
 */
export const getRequestHostname = async (): Promise<string> => {
  const requestHeaders = await headers()

  return requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? ""
}
