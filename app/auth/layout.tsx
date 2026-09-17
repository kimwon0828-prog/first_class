import type { ReactNode } from "react"

import { StudioNavigationProvider } from "@/features/studio/ui/studio-navigation-provider"
import { getRequestHostname } from "@/shared/lib/request-host"

/*
 * /auth 아래 화면의 공통 껍데기.
 *
 * 비밀번호 찾기 · 재설정 같은 화면은 학부모와 학원이 같이 쓴다. 그래서 "로그인으로
 * 돌아가기" 가 어디를 가리킬지는 host 에 따라 다르다 — Studio host 에서는 Studio
 * 로그인이, 거기서 학부모를 고르면 Parent origin 이 답이다.
 *
 * 그 판단에 필요한 host 를 요청당 한 번 읽어 내려준다. 여기서 정하지 않으면
 * client 가 render 중에 window 를 읽어야 하고, 그러면 서버가 내려준 HTML 과
 * 어긋난다.
 *
 * ⚠️ 권한은 판단하지 않는다. 이 값을 쓰지 않는 Parent 화면은 아무것도 달라지지 않는다.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  return <StudioNavigationProvider hostname={await getRequestHostname()}>{children}</StudioNavigationProvider>
}
