import type { Metadata } from "next"
import { LEGAL_DOCUMENTS } from "@/shared/content/legal-documents"


import { LegalPageLayout } from "../legal-page-layout"

export const metadata: Metadata = {
  title: "이용약관",
  description: "첫수업의 회원가입, 체험 신청, 리포트, 계정 관리와 서비스 이용 조건을 안내합니다."
}

export default function TermsPage() {
  return (
    <LegalPageLayout {...LEGAL_DOCUMENTS["terms"]} />
  )
}
