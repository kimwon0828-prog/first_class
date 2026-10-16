import type { Metadata } from "next"
import { LEGAL_DOCUMENTS } from "@/shared/content/legal-documents"

import { LegalPageLayout } from "../legal-page-layout"

export const metadata: Metadata = {
  title: "개인정보 제3자 제공 동의",
  description: "첫수업 MVP 개인정보 제3자 제공 동의 초안"
}

export default function ThirdPartyConsentPage() {
  return (
    <LegalPageLayout {...LEGAL_DOCUMENTS["third-party-consent"]} />
  )
}
