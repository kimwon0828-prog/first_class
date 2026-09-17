/**
 * 수업찾기(/classes) 주소를 만드는 유일한 자리.
 *
 * Home(/) 과 Search(/classes) 가 서로 다른 route 가 되면서, 홈에서 검색으로
 * 넘기는 링크와 검색 안에서 필터를 바꾸는 링크가 같은 규칙을 써야 한다.
 *
 * ⚠️ query 이름을 여기서 바꾸지 않는다. q · subjectCategory · subject ·
 *    radius · sido · sigungu · bname 은 이미 밖에 나가 있는 계약이다.
 */
export type ClassesHrefParams = {
  subjectCategory?: string | null
  subject?: string | null
  q?: string | null
  radius?: string | null
  sido?: string | null
  sigungu?: string | null
  bname?: string | null
}

/*
 * query 값은 전부 percent-encoding 한다.
 *
 * ⚠️ 한글을 그대로 두면 redirect() 의 Location 헤더가 깨진다
 *    (TypeError: Invalid character in header content ["location"]).
 *    헤더는 ASCII 만 담을 수 있다. 화면 링크로만 쓰일 때는 브라우저가
 *    알아서 처리해 주지만, 같은 주소가 redirect 로도 쓰이므로 여기서 끝낸다.
 */
const escapeQueryValue = (value: string) => encodeURIComponent(value)

export const buildClassesHref = (params: ClassesHrefParams = {}) => {
  const parts: string[] = []
  if (params.subjectCategory) {
    parts.push(`subjectCategory=${escapeQueryValue(params.subjectCategory)}`)
  }
  if (params.subject) parts.push(`subject=${escapeQueryValue(params.subject)}`)
  if (params.q) parts.push(`q=${escapeQueryValue(params.q)}`)
  if (params.radius) parts.push(`radius=${escapeQueryValue(params.radius)}`)
  if (params.sido) parts.push(`sido=${escapeQueryValue(params.sido)}`)
  if (params.sigungu) parts.push(`sigungu=${escapeQueryValue(params.sigungu)}`)
  if (params.bname) parts.push(`bname=${escapeQueryValue(params.bname)}`)
  return parts.length ? `/classes?${parts.join("&")}` : "/classes"
}

export const decodeQueryValue = (value: string | null | undefined) => {
  if (!value) {
    return ""
  }

  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
