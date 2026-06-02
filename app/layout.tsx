import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  title: "첫수업 MVP",
  description: "첫수업 MVP"
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
