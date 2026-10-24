/*
 * Studio 메뉴 구조의 단일 출처(STUDIO_DESIGN_SYSTEM.md §4).
 *
 * 사이드바와 설정 탭이 같은 표를 본다. 메뉴는 묶음만 바꾸고 URL 은 바꾸지 않는다 —
 * 각 항목이 "어느 내부 경로들을 자기 자리로 볼지"를 matchPrefixes 로 적는다.
 * redirect 는 하지 않는다. 직접 URL 로 들어와도 메뉴가 현재 위치를 잃지 않게 하는 용도다.
 *
 * 경로는 모두 내부 경로(/studio/...)다. host 에 맞춘 주소 변환은 호출하는 쪽이
 * studio-navigation 으로 한다.
 */

export type StudioNavKey = "home" | "cases" | "students" | "classes" | "analytics" | "settings"

export type StudioNavEntry = {
  key: StudioNavKey
  label: string
  /** 메뉴를 눌렀을 때 가는 곳. */
  href: string
  /** 이 메뉴를 활성으로 볼 경로들. "/studio" 만 정확히 일치로 본다. */
  matchPrefixes: readonly string[]
}

/** 위쪽 메뉴. */
export const STUDIO_PRIMARY_NAV: readonly StudioNavEntry[] = [
  { key: "home", label: "홈", href: "/studio", matchPrefixes: ["/studio"] },
  {
    key: "cases",
    label: "신청",
    href: "/studio/cases",
    // /studio/applications(구 신청 관리 표)와 /studio/unregistered(구 상담 파이프라인)는
    // 메뉴에서 감춘 legacy 경로다. 롤백/비교용으로 살아 있어 여기서 신청으로 접는다.
    // /studio/applications/[id](신청 상세)도 prefix 로 함께 잡힌다.
    matchPrefixes: ["/studio/cases", "/studio/applications", "/studio/unregistered"]
  },
  // 학생(2차-3, Figma 2148:5869): 체험 온 학생을 등록하지 않아도 남겨 두고 다시 연락하는 곳.
  { key: "students", label: "학생", href: "/studio/students", matchPrefixes: ["/studio/students"] },
  {
    key: "classes",
    label: "수업·일정",
    href: "/studio/classes",
    matchPrefixes: ["/studio/classes", "/studio/schedule"]
  },
  // 분석: 홈에 있던 성과 분석(흐름 · 도넛 · 미등록 사유 · 인포그래픽 · 최근 등록 결과)을 옮긴 화면.
  { key: "analytics", label: "분석", href: "/studio/analytics", matchPrefixes: ["/studio/analytics"] }
]

export type StudioSettingsTabKey = "academy" | "hours" | "teachers" | "billing" | "account"

export type StudioSettingsTab = {
  key: StudioSettingsTabKey
  label: string
  href: string
  matchPrefixes: readonly string[]
}

/**
 * 설정 탭. 기존 페이지를 그대로 묶기만 한다.
 *
 * - 학원 정보: 공개 프로필(/studio/mypage/profile)과 공식정보 수정 요청(/studio/settings) 두 화면.
 *   프로필 화면 안에 공식정보로 가는 링크가 이미 있다.
 * - 내 계정: 기존 마이페이지(/studio/mypage). 하위 경로는 학원 정보 쪽이라 정확히 일치로만 본다.
 * - "운영 시간" 탭은 학원 정보 화면의 방문 정보(#visit-info)로 연결만 한다(운영 시간 전용 화면은 2차).
 */
export const STUDIO_SETTINGS_TABS: readonly StudioSettingsTab[] = [
  {
    key: "academy",
    label: "학원 정보",
    href: "/studio/mypage/profile",
    matchPrefixes: ["/studio/mypage/profile", "/studio/settings"]
  },
  // 운영 시간: 별도 화면이 없다(2차). 학원 정보 화면의 "방문 정보"(운영 요일 · 시간)로 연결만 한다.
  { key: "hours", label: "운영 시간", href: "/studio/mypage/profile#visit-info", matchPrefixes: [] },
  { key: "teachers", label: "선생님", href: "/studio/teachers", matchPrefixes: ["/studio/teachers"] },
  { key: "billing", label: "플랜·결제", href: "/studio/billing", matchPrefixes: ["/studio/billing"] },
  { key: "account", label: "내 계정", href: "/studio/mypage", matchPrefixes: ["/studio/mypage"] }
]

/** 아래쪽 "설정" 메뉴. 설정 탭 중 어느 하나라도 활성이면 활성이다. */
export const STUDIO_SETTINGS_NAV: StudioNavEntry = {
  key: "settings",
  label: "설정",
  href: STUDIO_SETTINGS_TABS[0].href,
  matchPrefixes: STUDIO_SETTINGS_TABS.flatMap((tab) => tab.matchPrefixes)
}

const matchesPrefix = (pathname: string, prefix: string) => {
  if (prefix === "/studio") {
    return pathname === "/studio"
  }

  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export const isStudioNavActive = (pathname: string, entry: Pick<StudioNavEntry, "matchPrefixes">) =>
  entry.matchPrefixes.some((prefix) => matchesPrefix(pathname, prefix))

/**
 * 지금 경로가 속한 설정 탭.
 *
 * "/studio/mypage/profile" 은 학원 정보와 내 계정(/studio/mypage) 둘 다의 prefix 에 걸리므로
 * 더 긴(구체적인) prefix 를 가진 탭이 이긴다.
 */
export const getActiveStudioSettingsTab = (pathname: string): StudioSettingsTabKey | null => {
  let best: { key: StudioSettingsTabKey; length: number } | null = null

  for (const tab of STUDIO_SETTINGS_TABS) {
    for (const prefix of tab.matchPrefixes) {
      if (matchesPrefix(pathname, prefix) && (!best || prefix.length > best.length)) {
        best = { key: tab.key, length: prefix.length }
      }
    }
  }

  return best?.key ?? null
}
