import "server-only"

import { cache } from "react"
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
 *
 * cache() 로 감싸 요청당 한 번만 읽는다. layout 과 개별 server component 가
 * 각자 불러도 실제 읽기는 한 번이고, 한 요청 안에서 답이 갈리지 않는다.
 */
export const getRequestHostname = cache(async (): Promise<string> => {
  const requestHeaders = await headers()

  return requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? ""
})
