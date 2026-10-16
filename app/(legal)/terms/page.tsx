import type { Metadata } from "next"
import { LEGAL_DOCUMENTS } from "@/shared/content/legal-documents"


import { LegalPageLayout } from "../legal-page-layout"

export const metadata: Metadata = {
  title: "이용약관",
  description: "첫수업 MVP 이용약관 초안"
}

export default function TermsPage() {
  return (
    <LegalPageLayout {...LEGAL_DOCUMENTS["terms"]} />
  )
}
