import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  title: "첫수업 MVP",
  description: "첫수업 MVP"
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover"
}

type RootLayoutProps = {
  children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ko">
      <head>
        <style>{`
          html {
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
          }

          body {
            margin: 0;
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
            font-family: Inter, Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
            background: #ffffff;
            color: #111111;
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  )
}
