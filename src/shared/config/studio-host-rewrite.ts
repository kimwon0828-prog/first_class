/**
 * Which requests the Studio host serves from the internal /studio routes (Phase S3B).
 *
 * Kept free of `next/*` so the decision is a plain function of hostname and
 * pathname — middleware reads those two values off the request and does
 * nothing else to reach a verdict.
 *
 * The path mapping itself is not repeated here; it comes from the S3A
 * contract in `./studio-routes`.
 */

import { isStudioHost } from "./site-origins"
import { isStudioInternalPath, toStudioInternalPath } from "./studio-routes"

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
   * ⚠️ S3C 전까지 코드에는 href="/studio/..." · redirect("/studio") 가 그대로
   *    남아 있다. 여기서 prefix 를 또 붙이면 /studio/studio/... 가 된다.
   *    그래서 Studio host 의 기존 internal URL 은 호환 경로로 그냥 통과시킨다.
   *    canonical 정리는 나중 단계다.
   */
  if (isStudioInternalPath(pathname)) {
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
