import type { Metadata } from "next"
import { LEGAL_DOCUMENTS } from "@/shared/content/legal-documents"

import { LegalPageLayout } from "../legal-page-layout"

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "첫수업 MVP 개인정보처리방침 초안"
}

export default function PrivacyPage() {
  return (
    <LegalPageLayout {...LEGAL_DOCUMENTS["privacy"]} />
  )
}
