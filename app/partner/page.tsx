import type { Metadata } from "next"

import PartnerLanding from "./PartnerLanding"

export const metadata: Metadata = {
  title: "첫수업 파트너 - 체험수업 운영·전환 관리 SaaS",
  description:
    "체험수업 신청부터 등록 전환까지, 첫수업 파트너 센터에서 학원 운영 흐름을 한 화면으로 관리해보세요."
}

export default function PartnerPage() {
  return <PartnerLanding />
}
