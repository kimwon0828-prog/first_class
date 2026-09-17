/**
 * Studio navigation contract (Phase S3D).
 *
 * Studio screens still link to internal paths (`/studio/classes`). On the
 * Studio host those should read as clean URLs (`/classes`), but on localhost
 * there is no Studio host yet — `/classes` there is the Parent listing, so
 * rewriting the link would send developers to the wrong product.
 *
 * So the same internal path resolves differently per host:
 *
 *   studio.firstsuup.com   /studio/classes → /classes     (clean)
 *   localhost / unknown    /studio/classes → /studio/classes  (unchanged)
 *
 * S3D only defines this. No call site uses it yet; every existing href,
 * `router.push` and `redirect` stays exactly as it is.
 *
 * ⚠️ This is for same-product navigation inside Studio only.
 *
 *    Parent → Studio and Studio → Parent are cross-product moves. On the
 *    Studio host a relative `/classes` is rewritten back into Studio, so a
 *    relative path cannot express "go to the Parent site". Those call sites
 *    use the absolute helpers from `./site-origins` — `toStudioUrl(path)` and
 *    `toParentUrl(path)` — not this one.
 *
 * Pure by design: no `next/headers`, no `next/navigation`, no `window`, no
 * session read. The caller supplies the hostname (`headers()` on the server,
 * `window.location.hostname` in the browser).
 */

import { isStudioHost } from "./site-origins"
import { isStudioInternalPath, toStudioExternalPath, toStudioInternalPath } from "./studio-routes"

type StudioNavigationInput = {
  /** The internal path as it exists in the app today, e.g. `/studio/classes`. */
  internalPath: string
  /** The host the page is being served from. */
  hostname: string
}

/**
 * 내부 Studio path → 그 host 에서 실제로 쓸 path.
 *
 * Studio host 에서는 clean external path 로, 그 밖의 host(localhost · 아직
 * 계약이 아닌 host · Parent host)에서는 받은 그대로 돌려준다.
 *
 * ⚠️ 절대 던지지 않는다. navigation 은 화면을 그리는 도중에 계산되므로,
 *    알 수 없는 입력이 들어오면 원래 path 를 그대로 돌려주고 만다. 링크
 *    하나 때문에 화면 전체가 죽지 않게 한다.
 */
export const getStudioNavigationPath = ({ internalPath, hostname }: StudioNavigationInput): string => {
  if (!isStudioHost(hostname)) {
    return internalPath
  }

  try {
    return toStudioExternalPath(internalPath)
  } catch {
    return internalPath
  }
}

/**
 * 지금 보고 있는 주소 → 내부 경로 공간.
 *
 * Studio host 에서는 주소창이 `/cases` 이고 내부 route 는 `/studio/cases` 다.
 * 현재 위치를 메뉴 항목과 견주려면 한쪽 공간으로 모아야 한다. 어느 host 에서
 * 불러도 같은 답이 나오므로, 서버 render 와 hydration 이 갈리지 않는다.
 *
 * ⚠️ 절대 던지지 않는다. 읽을 수 없는 주소는 그대로 돌려준다.
 */
export const toStudioInternalNavigationPath = (pathname: string): string => {
  if (isStudioInternalPath(pathname)) {
    return pathname
  }

  try {
    return toStudioInternalPath(pathname)
  } catch {
    return pathname
  }
}
