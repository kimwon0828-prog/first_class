/**
 * 학부모 하단 탭의 판정 규칙.
 *
 * 컴포넌트가 아니라 여기 둔다 — 순수 함수라서 화면 없이 그대로 검증할 수 있다.
 */
export type ParentNavTab = "home" | "schedule" | "record" | "my"

const startsWithSegment = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`)

/**
 * 지금 어느 탭인가.
 *
 * ⚠️ 순서가 규칙이다. /my/schedule 은 /my 보다 먼저 판정해야 한다 —
 *    나중에 보면 일정 화면에서 마이페이지가 같이 켜진다.
 *
 * 하나의 pathname 은 최대 하나의 탭으로만 해석된다. 아무 데도 속하지 않는
 * 화면(예: 신청 flow, 로그인)은 null 이고, 그때는 어느 탭도 켜지지 않는다.
 */
export const resolveParentNavTab = (pathname: string): ParentNavTab | null => {
  if (startsWithSegment(pathname, "/my/schedule")) {
    return "schedule"
  }

  if (startsWithSegment(pathname, "/record")) {
    return "record"
  }

  /*
   * /my/actions 는 마이페이지 하위가 아니다.
   *
   * Home 의 "지금 확인해야 할 것" 을 펼친 상세 화면이라 홈 흐름에 속한다.
   * /my 보다 먼저 판정해야 마이페이지가 같이 켜지지 않는다.
   */
  if (startsWithSegment(pathname, "/my/actions")) {
    return "home"
  }

  // 관심수업은 IA 상 마이페이지 아래다. 탭에는 없지만 여기서 마이페이지로 읽는다.
  if (startsWithSegment(pathname, "/my") || startsWithSegment(pathname, "/favorites")) {
    return "my"
  }

  // 수업찾기 · 학원찾기는 Home 에서 시작하는 발견 흐름이다. 독립 탭이 아니다.
  // 알림함도 같다 — Home 상단 종에서 펼치는 상세 화면이라 /my/actions 와 같은 자리다.
  if (
    pathname === "/" ||
    startsWithSegment(pathname, "/classes") ||
    startsWithSegment(pathname, "/academies") ||
    startsWithSegment(pathname, "/academy") ||
    startsWithSegment(pathname, "/notifications")
  ) {
    return "home"
  }

  return null
}
