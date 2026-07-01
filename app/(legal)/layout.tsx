import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  title: {
    default: "법적 안내 | 첫수업",
    template: "%s | 첫수업"
  }
}

type LegalLayoutProps = {
  children: ReactNode
}

export default function LegalLayout({ children }: LegalLayoutProps) {
  return children
}
