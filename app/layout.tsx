import { ParentPushBridge } from "@/features/notifications/ui/parent-push-bridge"
import { FavoriteAccountBoundary } from "@/features/favorites/ui/favorite-account-boundary"
import { PARENT_ORIGIN } from "@/shared/config/site-origins"

import type { Metadata } from "next"
import type { ReactNode } from "react"

import "./globals.css"

export const metadata: Metadata = {
  metadataBase: new URL(PARENT_ORIGIN),
  title: {
    default: "첫수업",
    template: "%s | 첫수업"
  },
  description:
    "우리 아이에게 맞는 학원 체험수업과 레벨테스트를 한곳에서 비교하고 예약하세요. 첫수업은 학부모와 학원을 연결하는 체험수업 플랫폼입니다.",
  applicationName: "첫수업",
  // 페이지가 openGraph 를 따로 주지 않을 때의 기본 공유 미리보기.
  openGraph: {
    type: "website",
    siteName: "첫수업",
    locale: "ko_KR",
    images: [{ url: "/images/first-class-logo.png" }]
  },
  twitter: {
    card: "summary"
  }
}

type RootLayoutProps = {
  children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ko">
      <head />
      <body><FavoriteAccountBoundary /><ParentPushBridge />{children}</body>
    </html>
  )
}
