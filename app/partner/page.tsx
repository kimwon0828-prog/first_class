import type { Metadata } from "next"

import { BILLING_PLANS } from "@/features/billing/lib/plan-catalog"
import { STANDARD_TRIAL_DAYS } from "@/features/billing/lib/standard-trial"
import { toParentUrl } from "@/shared/config/site-origins"
import {
  faqPageJsonLd,
  firstsuupOrganizationJsonLd,
  firstsuupPartnerSoftwareJsonLd,
  JsonLd
} from "@/shared/seo/json-ld"

import PartnerLanding, { faqItems } from "./PartnerLanding"

const title = "첫수업 파트너 - 체험수업 운영·전환 관리 SaaS"
const description =
  "전화 상담 없이, 체험 예약부터 등록까지. 학부모는 첫수업에서 체험을 직접 예약하고, 원장님은 일정·기록·리포트·등록 결과를 한 화면에서 관리해요."

// 스탠다드 월 요금(부가세 포함). 결제 플랜 카탈로그 값을 그대로 쓴다.
const STANDARD_MONTHLY_PRICE = BILLING_PLANS.standard.amount

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/partner"
  },
  openGraph: {
    type: "website",
    url: toParentUrl("/partner"),
    siteName: "첫수업",
    locale: "ko_KR",
    images: [{ url: "/images/first-class-logo.png", width: 1787, height: 598, alt: "첫수업" }],
    title: `${title} | 첫수업`,
    description
  }
}

export default function PartnerPage() {
  return (
    <>
      <JsonLd
        data={[
          firstsuupOrganizationJsonLd(),
          firstsuupPartnerSoftwareJsonLd({ monthlyPrice: STANDARD_MONTHLY_PRICE, trialDays: STANDARD_TRIAL_DAYS }),
          faqPageJsonLd(faqItems)
        ]}
      />
      <PartnerLanding />
    </>
  )
}
