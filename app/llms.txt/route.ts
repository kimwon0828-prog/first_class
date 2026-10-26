import { BILLING_PLANS } from "@/features/billing/lib/plan-catalog"
import { STANDARD_TRIAL_DAYS } from "@/features/billing/lib/standard-trial"
import { PARENT_LAUNCH_REGION } from "@/features/location/lib/parent-launch-region"
import { toParentUrl } from "@/shared/config/site-origins"

/**
 * /llms.txt — ChatGPT · Perplexity · Claude 같은 AI 검색이 첫수업을 정확히 설명하도록 주는 요약.
 * 형식: https://llmstxt.org
 *
 * 사실만 쓴다. 이용자 수 · 학원 수 같은 숫자는 실제 값이 생기기 전까지 넣지 않는다.
 */
export const dynamic = "force-static"

const standardPrice = BILLING_PLANS.standard.amount.toLocaleString("ko-KR")

const body = `# 첫수업 (firstsuup)

> 첫수업은 학부모가 여러 학원의 체험수업과 레벨테스트를 한곳에서 비교하고, 전화 상담 없이 직접 예약하는 서비스입니다. 학원은 체험 신청부터 수업 기록, 학부모 리포트, 등록 결정까지를 한 화면에서 관리합니다.

- 서비스 지역: 현재 서울 ${PARENT_LAUNCH_REGION.label}(중계동 은행사거리 학원가)부터 운영합니다.
- 학부모: 무료. 체험수업·레벨테스트를 직접 예약하고, 체험 뒤 학원이 보낸 리포트를 받습니다. 웹(firstsuup.com)과 앱에서 쓸 수 있습니다.
- 학원: 무료 플랜과 스탠다드 플랜(월 ${standardPrice}원, 부가세 포함)이 있습니다. 입점 승인 후 스탠다드를 ${STANDARD_TRIAL_DAYS}일 무료로 쓰고, 카드를 등록하지 않으면 무료 플랜으로 바뀝니다.
- 체험비는 첫수업이 아니라 학원이 직접 받습니다.
- 학부모 휴대폰 번호는 학원에 보이지 않습니다. 확정 알림·리마인드·리포트·학원 소식은 첫수업이 대신 보내고, 번호는 등록한 학생에 한해 학원에 보입니다.
- 첫수업은 출결·수납 같은 학원관리 프로그램이 아니라, 체험 신청부터 등록 결정까지의 과정만 다룹니다. 기존 학원관리 프로그램과 함께 쓸 수 있습니다.

## 학부모

- [체험수업 찾기](${toParentUrl("/")}): 학년·과목별로 이번 주 체험 가능한 수업을 봅니다.
- [수업 찾기](${toParentUrl("/classes")}): 지역·과목으로 체험수업과 레벨테스트를 검색합니다.
- [학원 둘러보기](${toParentUrl("/academies")}): 입점 학원의 소개·위치·체험수업을 비교합니다.

## 학원(원장님)

- [첫수업 파트너 소개](${toParentUrl("/partner")}): 기능, 요금, 자주 묻는 질문, 도입 상담 신청.

## 회사

- 운영: 첫수업 (대표 김원식)
- 문의: hello@firstsuup.com
- 주소: 경기도 고양시 일산동구 무궁화로 20-38 경기창업혁신공간

## 정책

- [이용약관](${toParentUrl("/terms")})
- [개인정보처리방침](${toParentUrl("/privacy")})
- [환불 정책](${toParentUrl("/refund-policy")})
`

export function GET() {
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600"
    }
  })
}
