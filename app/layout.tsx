import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
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
      <head>
        <style>{`
html, body { padding: 0; margin: 0; }
*, *::before, *::after { box-sizing: border-box; }
body {
  background: #ffffff;
  color: #111111;
  font-family: Inter, Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
html { -webkit-text-size-adjust: 100%; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  )
}
