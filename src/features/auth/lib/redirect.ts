export type ProfileRole = "parent" | "academy" | "admin"

/**
 * 로그인 직후 돌아갈 기본 자리.
 *
 * ⚠️ returnTo 가 있으면 언제나 그쪽이 우선이다. 이 값은 갈 곳이 지정되지
 *    않았을 때만 쓰인다.
 *
 * 학부모의 집은 / 다. /classes 는 검색 결과 화면이지 Home 이 아니다.
 * (Studio 는 그대로 /studio 다.)
 */
export const resolvePostAuthRedirect = (role: ProfileRole): string => {
  if (role === "parent") {
    return "/"
  }

  return "/studio"
}
