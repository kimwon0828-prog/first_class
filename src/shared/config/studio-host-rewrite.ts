/**
 * Studio host routing decisions (Phase S3B–S3C).
 *
 * Two verdicts live here:
 *   - legacy `/studio/...` URLs get redirected to the canonical Studio host (S3C)
 *   - everything else on the Studio host gets rewritten to the internal routes (S3B)
 *
 * Kept free of `next/*` so the decision is a plain function of hostname and
 * pathname — middleware reads those two values off the request and does
 * nothing else to reach a verdict.
 *
 * The path mapping itself is not repeated here; it comes from the S3A
 * contract in `./studio-routes`.
 */

import { STUDIO_ORIGIN, isParentHost, isStudioHost } from "./site-origins"
import {
  isStudioInternalPath,
  isStudioSharedAuthPath,
  toStudioExternalPath,
  toStudioInternalPath
} from "./studio-routes"

/* 화면이 아닌 요청. rewrite 대상이 아니다. */
const EXCLUDED_PREFIXES = ["/_next/", "/api/"]

const isExcluded = (pathname: string) => {
  if (EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true
  }

  /* /images/logo.png · /favicon.ico 처럼 확장자가 붙은 정적 파일. */
  return pathname.slice(pathname.lastIndexOf("/") + 1).includes(".")
}

/**
 * Studio host 의 external pathname → 내부 /studio pathname.
 *
 * rewrite 하지 않을 때는 null. Parent host 는 언제나 null 이다 — Parent 요청은
 * 이 함수 때문에 달라지는 것이 하나도 없어야 한다.
 *
 * ⚠️ hostname 은 어떤 제품의 화면을 보여줄지 정하는 데만 쓴다. 권한 판정에는
 *    쓰지 않는다. Studio host 로 들어왔다고 Studio 사용자가 되지 않는다 —
 *    역할 판정은 그대로 profile · RLS · requireTeacherStudioAccess 의 몫이다.
 */
export const resolveStudioRewritePathname = (hostname: string, pathname: string): string | null => {
  if (!isStudioHost(hostname)) {
    return null
  }

  /*
   * 이미 내부 경로로 들어온 요청.
   *
   * ⚠️ 여기서 prefix 를 또 붙이면 /studio/studio/... 가 된다. S3C 부터는 이
   *    경로를 resolveStudioCanonicalRedirectUrl 이 clean URL 로 돌려보내므로
   *    middleware 는 redirect 를 먼저 보고, 여기까지 오지 않는다.
   */
  if (isStudioInternalPath(pathname)) {
    return null
  }

  /*
   * 두 제품이 같이 쓰는 auth 화면.
   *
   * ⚠️ 여기서 옮기면 /studio/auth/find-email 로 가는데 그런 route 는 없다.
   *    화면이 하나뿐이라 경로도 하나뿐이어야 한다. query(?type=academy)도
   *    손대지 않으므로 누구를 위한 화면인지는 그대로 전달된다.
   */
  if (isStudioSharedAuthPath(pathname)) {
    return null
  }

  if (isExcluded(pathname)) {
    return null
  }

  try {
    return toStudioInternalPath(pathname)
  } catch {
    /* contract 가 거절하는 pathname 은 건드리지 않고 그대로 흘려보낸다. */
    return null
  }
}

/**
 * 옛 `/studio/...` URL → canonical Studio URL (절대 주소).
 *
 *   firstsuup.com/studio                   → https://studio.firstsuup.com/
 *   firstsuup.com/studio/applications      → https://studio.firstsuup.com/applications
 *   studio.firstsuup.com/studio/classes    → https://studio.firstsuup.com/classes
 *
 * Parent host 든 Studio host 든 `/studio` prefix 는 주소창에 남지 않는다.
 * redirect 하지 않을 때는 null.
 *
 * ⚠️ 아는 host 에서만 돌려보낸다. localhost 같은 개발 host 는 아직 계약이
 *    아니므로 건드리지 않는다 — 로컬에서 /studio/... 가 그대로 열려야 한다.
 *
 * ⚠️ 이것은 routing canonicalization 이다. 권한 판단이 아니다.
 */
export const resolveStudioCanonicalRedirectUrl = (
  hostname: string,
  pathname: string,
  search = ""
): string | null => {
  if (!isStudioHost(hostname) && !isParentHost(hostname)) {
    return null
  }

  if (!isStudioInternalPath(pathname) || isExcluded(pathname)) {
    return null
  }

  try {
    /* URL 로 만들어야 query 가 그대로 붙는다. 문자열을 이어 붙이지 않는다. */
    const url = new URL(toStudioExternalPath(pathname), STUDIO_ORIGIN)
    url.search = search

    return url.toString()
  } catch {
    /* contract 가 거절하는 pathname 은 건드리지 않고 그대로 흘려보낸다. */
    return null
  }
}
