import type { Metadata } from "next"
import type { ReactNode } from "react"

import { StudioNavigationProvider } from "@/features/studio/ui/studio-navigation-provider"
import { STUDIO_ORIGIN } from "@/shared/config/site-origins"
import { getRequestHostname } from "@/shared/lib/request-host"

/*
 * Studio 의 metadata 경계.
 *
 * ⚠️ 이 layout 이 없으면 Studio 화면이 root(Parent) metadata 를 그대로 쓴다 —
 *    학부모용 제목과 설명이 학원 운영 화면에 붙고, 검색엔진에도 열린다.
 *
 * 1. noindex · nofollow. 여기는 로그인해야 쓰는 운영 도구이지 공개 문서가 아니다.
 *    robots.txt 로 크롤링을 막지 않고 meta 로 색인을 막는다 — 크롤러가 읽을 수
 *    있어야 noindex 를 볼 수 있기 때문이다.
 *
 * 2. metadataBase 를 Studio origin 으로 바꾼다. 상대 주소로 적힌 metadata 가
 *    생기더라도 Parent 주소로 풀리지 않는다. Studio 는 Parent URL 을 자기
 *    canonical 이라고 주장하지 않는다.
 *
 * 3. 문구는 화면에 이미 쓰고 있는 것을 그대로 가져온다. 새 마케팅 카피를
 *    여기서 만들지 않는다.
 */
export const metadata: Metadata = {
  metadataBase: new URL(STUDIO_ORIGIN),
  /*
   * ⚠️ default 가 아니라 absolute 다. default 로 두면 root 의 "%s | 첫수업"
   *    template 이 덧씌워져 "첫수업 파트너 센터 | 첫수업" 이 된다 —
   *    Parent 브랜드가 Studio 제목에 새어 든다.
   */
  title: {
    absolute: "첫수업 파트너 센터",
    template: "%s | 첫수업 파트너 센터"
  },
  description:
    "체험수업 신청부터 등록 전환까지, 첫수업 파트너 센터에서 학원 운영 흐름을 한 화면으로 관리해보세요.",
  robots: {
    index: false,
    follow: false
  }
}

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
