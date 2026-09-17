import "server-only"

import { getStudioCrossProductHref } from "@/shared/config/cross-product-navigation"

import { getRequestHostname } from "./request-host"

/**
 * Parent 화면에서 Studio 로 나갈 주소를 서버에서 고른다.
 *
 * Production Parent host 에서는 Studio origin 의 절대 주소가, localhost 처럼
 * 한 origin 이 두 제품을 다 서빙하는 곳에서는 기존 상대 경로가 나온다.
 *
 * 링크가 여러 개인 화면은 resolver 를 한 번 받아 재사용한다 — hostname 을
 * 화면마다 다시 읽지 않고, 경로 규칙도 S3E helper 하나만 쓴다.
 *
 * ⚠️ client 는 이 함수를 쓰지 않는다. 거기서는 서버가 계산한 값을 prop 으로
 *    받거나 provider 의 훅을 쓴다 — render 중에 window 를 읽으면 서버가
 *    내려준 HTML 과 어긋난다.
 */
export const getStudioCrossProductHrefResolver = async (): Promise<(internalPath: string) => string> => {
  const hostname = await getRequestHostname()

  return (internalPath: string) => getStudioCrossProductHref({ internalPath, hostname })
}

/** 링크가 하나뿐인 자리를 위한 짧은 형태. */
export const resolveStudioCrossProductHref = async (internalPath: string): Promise<string> => {
  const resolve = await getStudioCrossProductHrefResolver()

  return resolve(internalPath)
}
