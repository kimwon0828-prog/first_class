/**
 * Moving between Parent and Studio (Phase S3E).
 *
 * On production these are two origins, so a relative path cannot express the
 * move. Worse, it silently means the wrong thing: on the Studio host a
 * relative `/classes` is rewritten back into `/studio/classes`, so sending a
 * Parent-role user there from a Studio screen bounces them straight back into
 * Studio — a redirect loop.
 *
 * So a cross-product move resolves to an absolute URL on the other origin,
 * but only on a host where the split actually exists:
 *
 *   studio.firstsuup.com  → Parent  https://firstsuup.com/classes
 *   firstsuup.com         → Studio  https://studio.firstsuup.com/
 *   localhost / unknown            unchanged relative path
 *
 * On localhost there is one origin serving both products, so the existing
 * relative paths are still the correct answer. Returning an absolute
 * production URL there would throw developers onto the live site.
 *
 * ⚠️ Same-product navigation does not belong here. Studio's own links use
 *    `./studio-navigation`; Parent's own links stay relative.
 *
 * ⚠️ Host decides which product's URL to build. It never decides who the user
 *    is — roles stay with profile · RLS · the existing guards.
 *
 * Pure by design: no `next/*`, no `window`, no session read. The caller
 * supplies the hostname.
 */

import { isParentHost, isStudioHost, toParentUrl, toStudioUrl } from "./site-origins"
import { toStudioExternalPath } from "./studio-routes"

type ParentCrossProductInput = {
  /** Parent path to land on, e.g. `/classes`. */
  pathname: string
  /** The host the current page is served from. */
  hostname: string
}

type StudioCrossProductInput = {
  /** The internal Studio path as it exists today, e.g. `/studio`. */
  internalPath: string
  /** The host the current page is served from. */
  hostname: string
}

/**
 * Studio 화면에서 Parent 로 나갈 주소.
 *
 * Studio host 에서만 절대 주소가 된다. 그 밖의 host 에서는 받은 경로 그대로다.
 *
 * ⚠️ 절대 던지지 않는다. 이 값은 redirect 대상이라, 여기서 터지면 화면이
 *    아니라 흐름 전체가 죽는다. 이상한 입력이면 원래 경로로 되돌린다.
 */
export const getParentCrossProductHref = ({ pathname, hostname }: ParentCrossProductInput): string => {
  if (!isStudioHost(hostname)) {
    return pathname
  }

  try {
    return toParentUrl(pathname)
  } catch {
    return pathname
  }
}

/**
 * Parent 화면에서 Studio 로 나갈 주소.
 *
 * Parent host 에서만 절대 주소가 된다. 경로는 S3A contract 가 external 로
 * 옮긴다 — `/studio` → `/`, `/studio/applications` → `/applications`.
 */
export const getStudioCrossProductHref = ({ internalPath, hostname }: StudioCrossProductInput): string => {
  if (!isParentHost(hostname)) {
    return internalPath
  }

  try {
    return toStudioUrl(toStudioExternalPath(internalPath))
  } catch {
    return internalPath
  }
}
