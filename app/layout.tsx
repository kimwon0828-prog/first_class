import type { Metadata } from "next"
import type { ReactNode } from "react"

import "./globals.css"

export const metadata: Metadata = {
  metadataBase: new URL("https://firstsuup.com"),
  title: {
    default: "첫수업",
    template: "%s | 첫수업"
  },
  description: "학부모와 학원을 연결하는 체험수업 예약 플랫폼"
}

type RootLayoutProps = {
  children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ko">
      <head />
      <body>{children}</body>
    </html>
  )
}
