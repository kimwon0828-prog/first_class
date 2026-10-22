import type { Metadata } from "next"
import { LEGAL_DOCUMENTS } from "@/shared/content/legal-documents"

import { LegalPageLayout } from "../legal-page-layout"

export const metadata: Metadata = {
  title: "개인정보 제3자 제공 동의",
  description: "체험 신청 시 선택한 학원에 제공하는 개인정보의 항목, 목적과 동의 거부 권리를 안내합니다."
}

export default function ThirdPartyConsentPage() {
  return (
    <LegalPageLayout {...LEGAL_DOCUMENTS["third-party-consent"]} />
  )
}
