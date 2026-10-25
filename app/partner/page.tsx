import type { Metadata } from "next"

import PartnerLanding from "./PartnerLanding"

export const metadata: Metadata = {
  title: "첫수업 파트너 - 체험수업 운영·전환 관리 SaaS",
  description:
    "전화 상담 없이, 체험 예약부터 등록까지. 학부모는 첫수업에서 체험을 직접 예약하고, 원장님은 일정·기록·리포트·등록 결과를 한 화면에서 관리해요."
}

export default function PartnerPage() {
  return <PartnerLanding />
}
