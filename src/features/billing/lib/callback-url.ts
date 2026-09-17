import { getStudioNavigationPath } from "@/shared/config/studio-navigation"

/**
 * 결제창이 돌아올 절대 주소.
 *
 * Toss 에 넘기는 값이라 절대 주소여야 한다. 그런데 내부 route 는 여전히
 * `/studio/billing/callback` 이고, Studio host 의 바깥 주소는 `/billing/callback`
 * 이다. 둘을 잇는 규칙은 S3D contract 하나뿐이다 — 여기서 다시 만들지 않는다.
 *
 *   production Studio  /studio/billing/callback
 *     → https://studio.firstsuup.com/billing/callback
 *   localhost          /studio/billing/callback
 *     → http://localhost:3000/studio/billing/callback
 *
 * ⚠️ origin 은 지금 들어온 요청의 것을 그대로 쓴다. production origin 을 박아
 *    넣으면 로컬에서 시작한 결제가 운영으로 돌아온다.
 *
 * ⚠️ query 는 붙이지 않는다. 실패 주소의 `?billing=failed` 같은 값은 호출부가
 *    기존 그대로 붙인다 — 이름과 값이 결제사와의 계약이라 여기서 만지지 않는다.
 */
export const resolveStudioBillingCallbackUrl = ({
  internalPath,
  hostname,
  origin
}: {
  /** 지금 코드에 있는 내부 route. 예: `/studio/billing/callback` */
  internalPath: string
  /** 요청이 들어온 host. 어느 제품의 주소를 만들지만 정한다. */
  hostname: string
  /** 요청이 들어온 origin. 프로토콜과 포트를 그대로 지킨다. */
  origin: string
}): string => `${origin}${getStudioNavigationPath({ internalPath, hostname })}`
