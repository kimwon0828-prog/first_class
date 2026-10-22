import type { Metadata } from "next"
import { LEGAL_DOCUMENTS } from "@/shared/content/legal-documents"

import { LegalPageLayout } from "../legal-page-layout"

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "첫수업이 처리하는 개인정보의 항목, 목적, 제공·위탁, 보유·삭제와 이용자 권리를 안내합니다."
}

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      {...LEGAL_DOCUMENTS["privacy"]}
      links={[{ href: "/account-deletion", label: "계정·개인정보 삭제 요청" }]}
    />
  )
}
