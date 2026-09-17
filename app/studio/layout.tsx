import type { ReactNode } from "react"

import { StudioNavigationProvider } from "@/features/studio/ui/studio-navigation-provider"
import { getRequestHostname } from "@/shared/lib/request-host"

/*
 * /studio 아래 모든 화면의 공통 껍데기.
 *
 * 하는 일은 하나다 — 이 요청이 들어온 host 를 요청당 한 번 읽어 client tree 로
 * 내려준다. Studio 의 링크가 host 에 따라 /classes 와 /studio/classes 로 갈리는데,
 * 그 판단을 client 가 render 중에 하려면 window 를 읽어야 하고 그러면 서버가 내려준
 * HTML 과 어긋난다. 서버가 먼저 정해서 내려주면 첫 HTML 부터 최종 href 다.
 *
 * ⚠️ 여기서 권한을 판단하지 않는다. (dashboard) layout 의
 *    requireTeacherStudioAccess 가 그대로 그 일을 한다. sign-in · sign-up ·
 *    access · pending 은 예전처럼 가드 밖에 남는다.
 */
export default async function StudioLayout({ children }: { children: ReactNode }) {
  return <StudioNavigationProvider hostname={await getRequestHostname()}>{children}</StudioNavigationProvider>
}
