import { NextResponse, type NextRequest } from "next/server"

import { getSupabaseMiddlewareClient } from "@/integrations/supabase/middleware"
import { resolveStudioRewritePathname } from "@/shared/config/studio-host-rewrite"

/*
 * 요청이 어느 host 로 들어왔나.
 *
 * ⚠️ host 는 오직 어떤 제품의 화면을 보여줄지 정하는 데만 쓴다. 권한 판정에는
 *    쓰지 않는다. 역할 판정은 그대로 profile · RLS · requireTeacherStudioAccess
 *    의 몫이고, 이 파일은 authz 를 하지 않는다.
 *
 *    matcher 쪽 host 조건은 Next 가 Host 헤더로 본다. proxy 뒤에서 둘이 어긋나면
 *    어느 쪽도 Studio 로 보지 않는 쪽으로 닫힌다 — rewrite 가 생기지 않는다.
 */
const resolveRequestHostname = (request: NextRequest) =>
  request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? ""

export async function middleware(request: NextRequest) {
  const studioRewritePathname = resolveStudioRewritePathname(
    resolveRequestHostname(request),
    request.nextUrl.pathname
  )

  if (process.env.NEXT_PUBLIC_DEBUG_AUTH === "1") {
    console.log("[middleware]", {
      pathname: request.nextUrl.pathname,
      hostname: resolveRequestHostname(request),
      studioRewritePathname,
      hasCookie: Boolean(request.headers.get("cookie"))
    })
  }

  const { supabase, takePendingCookies } = getSupabaseMiddlewareClient(request)

  try {
    // getUser() 와 같은 목적(JWT 검증 + 필요 시 refresh + 갱신 cookie 전파)이지만,
    // asymmetric signing key 프로젝트에서는 JWKS 로 로컬 검증하므로 Auth 서버 왕복이 없다.
    // 여기서는 authz 판단을 하지 않는다. 세션 갱신만 담당하는 기존 의미를 그대로 둔다.
    await supabase.auth.getClaims()
  } catch {}

  /*
   * 최종 response 는 여기서 딱 한 번 만든다.
   *
   * ⚠️ 순서가 계약이다.
   *    - refresh 가 끝난 뒤에 만들어야 갱신된 request cookie 가 downstream 으로
   *      그대로 넘어간다.
   *    - 한 번만 만들어야 rewrite 가 유실되지 않는다.
   *    아래에서 response 를 다시 만들거나 교체하지 않는다.
   */
  const response = studioRewritePathname
    ? /* clone() 이라 query · hash · protocol · host 는 그대로 남는다. pathname 만 바꾼다. */
      NextResponse.rewrite(withPathname(request, studioRewritePathname), { request })
    : NextResponse.next({ request })

  for (const cookie of takePendingCookies()) {
    response.cookies.set(cookie.name, cookie.value, cookie.options)
  }

  return response
}

const withPathname = (request: NextRequest, pathname: string) => {
  const url = request.nextUrl.clone()
  url.pathname = pathname

  return url
}

/*
 * matcher.
 *
 * Parent 항목은 그대로 둔다 — S3B 때문에 Parent 의 공개 화면(/ · /classes ·
 * /academy/*)까지 middleware 를 타게 만들지 않는다.
 *
 * Studio 항목은 host 조건부다. Next 의 matcher 는 `has: [{ type: "host" }]` 를
 * 지원하고(runtime 에서 getMiddlewareRouteMatcher → matchHas 가 Host 헤더를
 * 포트 제거 · 소문자화해 비교한다), 그래서 studio.firstsuup.com 요청에만 넓은
 * 경로가 열린다. _next · api · 확장자 있는 정적 파일은 source 에서 빠진다.
 *
 * ⚠️ Next 는 이 config 를 정적으로 읽는다(식별자 참조는 거부된다). 그래서 host 를
 *    상수에서 가져오지 못하고 literal 로 적어야 한다. verify-studio-host-rewrite
 *    가 이 literal 이 STUDIO_ORIGIN 의 hostname 과 같은지 확인한다.
 */
export const config = {
  matcher: [
    "/my/:path*",
    "/applications/:path*",
    "/studio/:path*",
    "/classes/:id/apply",
    { source: "/", has: [{ type: "host", value: "studio.firstsuup.com" }] },
    { source: "/((?!_next/|api/|.*\\.).*)", has: [{ type: "host", value: "studio.firstsuup.com" }] }
  ]
}
