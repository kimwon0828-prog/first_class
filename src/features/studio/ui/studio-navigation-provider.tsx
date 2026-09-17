"use client"

import { usePathname } from "next/navigation"
import { createContext, useContext, useMemo, type ReactNode } from "react"

import { getStudioNavigationPath, toStudioInternalNavigationPath } from "@/shared/config/studio-navigation"

/*
 * Studio navigation 이 쓸 hostname 하나만 나른다.
 *
 * ⚠️ 이 값은 "어느 제품의 주소를 만들까" 를 정하는 데만 쓴다. 누가 접속했는지,
 *    무엇을 할 수 있는지는 여기서 판단하지 않는다 — 역할 · 세션 · cookie 는
 *    그대로 profile · RLS · 기존 guard 의 몫이다.
 *
 * ⚠️ 서버가 요청당 한 번 읽어 내려준다. client 가 render 중에
 *    window.location.hostname 을 읽지 않는 이유가 이것이다 — 서버가 처음
 *    내려주는 HTML 부터 최종 href 가 나와야 hydration 이 어긋나지 않고,
 *    href 가 나중에 바뀌면서 prefetch 를 두 번 하지도 않는다.
 */
const StudioNavigationHostContext = createContext<string>("")

type StudioNavigationProviderProps = {
  hostname: string
  children: ReactNode
}

export const StudioNavigationProvider = ({ hostname, children }: StudioNavigationProviderProps) => (
  <StudioNavigationHostContext.Provider value={hostname}>{children}</StudioNavigationHostContext.Provider>
)

/**
 * 이 요청이 들어온 host. provider 밖에서는 빈 문자열이다.
 *
 * 빈 문자열은 Studio host 가 아니므로 navigation 은 기존 내부 경로로 남는다 —
 * provider 를 깜빡해도 링크가 깨지지 않고 예전 동작으로 돌아갈 뿐이다.
 */
export const useStudioNavigationHostname = () => useContext(StudioNavigationHostContext)

/**
 * 내부 Studio path → 이 host 에서 쓸 path.
 *
 * 경로 규칙은 S3D 의 pure helper 하나만 쓴다. client 마다 다시 만들지 않는다.
 */
export const useStudioNavigationPath = (internalPath: string): string => {
  const hostname = useStudioNavigationHostname()

  return useMemo(() => getStudioNavigationPath({ internalPath, hostname }), [internalPath, hostname])
}

/**
 * 여러 경로를 한 번에 옮길 때. 목록 안에서 훅을 반복 호출하지 않게 한다.
 */
export const useStudioNavigationPathFactory = (): ((internalPath: string) => string) => {
  const hostname = useStudioNavigationHostname()

  return useMemo(
    () => (internalPath: string) => getStudioNavigationPath({ internalPath, hostname }),
    [hostname]
  )
}

/**
 * 지금 위치를 내부 경로로 읽는다. 메뉴의 현재 항목 표시에 쓴다.
 *
 * ⚠️ 주소창 경로와 내부 route 가 host 마다 다르므로 비교는 한 공간에서 한다.
 *    양쪽 render 가 같은 값을 얻어 active 표시가 hydration 에서 흔들리지 않는다.
 */
export const useStudioInternalPathname = (): string => {
  const pathname = usePathname() ?? ""

  return useMemo(() => toStudioInternalNavigationPath(pathname), [pathname])
}
