// PoC 기본 discovery 진입 지역.
// legacy academy_area 가 아니라 실제 행정지역(sido/sigungu) 으로 표현한다.
// /classes route 자체의 기본값이 아니라, classes 바깥에서 들어오는 진입 링크에만 적용한다.
export const POC_DISCOVERY_REGION = {
  sido: "서울",
  sigungu: "노원구"
} as const

export const POC_DISCOVERY_HREF = `/classes?sido=${POC_DISCOVERY_REGION.sido}&sigungu=${POC_DISCOVERY_REGION.sigungu}`
