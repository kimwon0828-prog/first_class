import type { Metadata } from "next"

import { LegalPageLayout } from "../legal-page-layout"
import { BILLING_GRACE_PERIOD_DAYS, BILLING_PLANS } from "@/features/billing/lib/plan-catalog"
import { STANDARD_TRIAL_DAYS, TRIAL_CARD_WINDOW_DAYS } from "@/features/billing/lib/standard-trial"
import { COMPANY_INFO } from "@/shared/config/company-info"

// 환불 및 해지 정책.
//
// 이 문서는 결제 심사용 공개 페이지다. 로그인 없이 읽을 수 있어야 하고,
// 내용이 실제 billing 동작과 어긋나면 안 된다.
//
// 금액은 plan-catalog.ts 에서 읽는다 — 판매가의 주인은 그 파일 하나다.
// 해지 문구는 cancelStandardSubscription 의 계약(cancel_at_period_end = true,
// 현재 기간 종료까지 이용 가능)을 그대로 서술한 것이다. 둘 중 하나가 바뀌면
// 다른 하나도 같이 바꿔야 한다.
//
// 백엔드가 보장하지 못하는 환불 조건(일할 계산·무조건 전액 등)은 적지 않는다.
//
// 제3조(무료 체험)는 standard-trial.ts · run-billing-renewals.ts · trial-notices.ts 의 동작을
// 그대로 서술한다(90일 · 종료 30일 전부터 카드 등록 · 마지막 체험일 첫 결제 · 3일 유예).
// 일수는 같은 상수에서 읽는다. 동작이 바뀌면 이 조항도 같이 바꾼다.

const STANDARD = BILLING_PLANS.standard

const standardPriceText = `월 ${STANDARD.amount.toLocaleString("ko-KR")}원`

export const metadata: Metadata = {
  title: "환불 및 해지 정책",
  description:
    "첫수업 Standard 정기결제의 이용기간, 자동결제, 해지 및 환불 기준을 안내합니다."
}

export default function RefundPolicyPage() {
  return (
    <LegalPageLayout
      eyebrow="법적 안내"
      title="환불 및 해지 정책"
      description="첫수업 Standard 플랜의 무료 체험, 정기결제, 이용기간, 해지 및 환불 기준을 안내합니다."
      effectiveDate="2026년 9월 9일"
      lastUpdatedDate={null}
      sections={[
        {
          title: "제1조 (적용 대상)",
          body: (
            <>
              <p>
                본 정책은 첫수업이 학원 및 교육기관 운영자에게 제공하는 유료 정기결제 플랜인
                Standard 플랜에 적용됩니다.
              </p>
              <p>
                Free 플랜은 별도의 이용료가 부과되지 않으므로 결제 환불의 대상이 아닙니다.
              </p>
            </>
          )
        },
        {
          title: "제2조 (결제 및 서비스 제공기간)",
          body: (
            <>
              <p>
                Standard 플랜은 {standardPriceText}의 월 단위 정기결제 상품입니다. 결제가 완료되면
                Standard 기능이 활성화되며, 결제일을 기준으로 1개월 동안 서비스를 이용할 수
                있습니다.
              </p>
              <p>
                별도의 해지 신청이 없는 경우 다음 결제일에 자동으로 갱신되며, 갱신 결제가 완료된
                시점부터 새로운 이용기간이 시작됩니다.
              </p>
              <p>
                Free 플랜에서 Standard 플랜으로 전환하는 경우, 유료 이용기간은 Standard 결제가
                성공한 시점부터 시작됩니다. 무료 체험 뒤 전환하는 경우는 제3조에 따릅니다.
              </p>
              <p>
                자동결제가 정상적으로 처리되지 않은 경우 서비스 이용 상태가 변경될 수 있습니다.
              </p>
            </>
          )
        },
        {
          title: "제3조 (Standard 무료 체험)",
          body: (
            <>
              <p>
                1. 첫수업 입점 승인을 받은 학원에는 승인일부터 {STANDARD_TRIAL_DAYS}일 동안 Standard
                기능을 무료로 제공합니다. 무료 체험은 사업자등록번호당 1회이며, 체험을 시작할 때
                결제수단을 등록하지 않아도 됩니다.
              </p>
              <p>
                2. 결제수단(카드)은 체험 종료 {TRIAL_CARD_WINDOW_DAYS}일 전부터 등록할 수 있습니다.
                등록 화면에서 첫 결제일, 금액({standardPriceText}), 이후 매월 자동결제된다는 사실과
                해지 방법을 안내하며, 이에 동의한 경우에만 등록됩니다. 카드를 등록해도 등록 시점에는
                결제되지 않습니다.
              </p>
              <p>
                3. 카드를 등록한 경우 체험 마지막 날에 첫 이용료가 결제되고, 체험이 끝나는 시점부터
                1개월 단위로 이용기간이 시작되며 이후 매월 자동결제됩니다.
              </p>
              <p>
                4. 체험 마지막 날의 결제 전에 해지하면 결제되지 않으며, 체험이 끝나면 Free 플랜으로
                전환됩니다. 카드를 등록하지 않은 경우에도 체험이 끝나면 자동으로 Free 플랜으로
                전환되고, 별도의 이용료는 청구되지 않습니다. 체험 중 작성한 기록과 이미 보낸
                리포트는 그대로 유지됩니다.
              </p>
              <p>
                5. 첫 결제가 이루어지지 않은 경우 {BILLING_GRACE_PERIOD_DAYS}일 동안 다시 결제를
                시도하며, 그 기간에는 Standard 기능을 계속 이용할 수 있습니다. 그때까지 결제가
                완료되지 않으면 Free 플랜으로 전환됩니다.
              </p>
              <p>
                6. 첫수업은 카드 등록이 열리는 날, 체험 마지막 날 7일 전과 전날, 그리고 체험이 끝난
                뒤 결과를 학원 담당자 연락처로 문자 안내합니다.
              </p>
            </>
          )
        },
        {
          title: "제4조 (정기결제 해지)",
          body: (
            <>
              <p>
                정기결제는 언제든 해지할 수 있습니다. 해지를 신청하더라도 이미 결제된 이용기간이
                즉시 종료되지는 않으며, 현재 결제기간 종료일까지 Standard 기능을 계속 이용할 수
                있습니다.
              </p>
              <p>해지된 구독은 다음 결제일부터 자동결제가 진행되지 않습니다.</p>
              <p>
                정기결제 해지는 향후 자동결제를 중단하는 절차이며, 이미 결제된 현재 이용기간의
                결제 취소 또는 환불을 자동으로 의미하지는 않습니다. 다만 관계 법령에 따라
                이용자에게 청약철회 또는 환불 권리가 인정되는 경우에는 제5조 제4항에 따릅니다.
              </p>
            </>
          )
        },
        {
          title: "제5조 (환불)",
          body: (
            <>
              <p>
                1. <b>중복 결제 또는 잘못된 결제</b> — 동일한 이용기간에 대하여 동일한 결제가
                중복으로 발생하거나, 첫수업의 결제 처리 오류로 잘못 청구된 사실이 확인된 경우
                해당 금액을 환불합니다.
              </p>
              <p>
                2. <b>회사 귀책으로 인한 서비스 미제공</b> — 결제가 완료되었음에도 첫수업의
                귀책사유로 Standard 서비스를 제공하지 못한 경우, 제공되지 않은 서비스에 대하여
                전액 또는 해당 범위의 금액을 환불합니다.
              </p>
              <p>
                3. <b>단순 해지</b> — 정기결제를 해지하였다는 사유만으로 현재 결제기간의 이용료가
                자동으로 환불되지는 않습니다. 현재 이용기간은 종료일까지 이용할 수 있습니다.
              </p>
              <p>
                4. <b>관계 법령에 따른 청약철회 및 환불</b> — 「전자상거래 등에서의 소비자보호에
                관한 법률」 등 관계 법령에 따라 이용자에게 청약철회 또는 환불 권리가 인정되는
                경우에는 본 정책보다 관계 법령을 우선하여 적용합니다.
              </p>
              <p>
                제공된 서비스가 표시·광고 또는 계약 내용과 다르거나, 관계 법령에서 별도의
                청약철회·환불 기준을 정하고 있는 경우에는 해당 법령에서 정한 기준에 따릅니다.
              </p>
            </>
          )
        },
        {
          title: "제6조 (환불 요청 방법)",
          body: (
            <>
              <p>
                환불 요청은 아래 고객센터로 접수해 주시기 바랍니다.
              </p>
              <ul>
                <li>이메일: {COMPANY_INFO.customerCenterEmail}</li>
                <li>전화: {COMPANY_INFO.customerCenterPhone}</li>
                <li>
                  운영시간: {COMPANY_INFO.customerCenterHours} ({COMPANY_INFO.customerCenterClosed})
                </li>
              </ul>
              <p>요청 시 아래 정보를 함께 알려주시면 확인이 빠릅니다.</p>
              <ul>
                <li>학원명</li>
                <li>결제자 또는 담당자명</li>
                <li>결제일</li>
                <li>환불 요청 사유</li>
              </ul>
              <p>
                카드번호 전체, CVC, 비밀번호 등 민감한 결제정보는 이메일이나 메신저로 보내지
                마시기 바랍니다. 첫수업은 해당 정보를 요구하지 않습니다.
              </p>
            </>
          )
        },
        {
          title: "제7조 (환불 처리)",
          body: (
            <>
              <p>
                환불이 승인된 경우 원칙적으로 결제에 사용한 수단을 통해 처리합니다. 관계 법령에서
                환급 기한을 정한 경우 해당 기한을 따릅니다.
              </p>
              <p>
                카드사 또는 결제수단의 처리 일정에 따라 실제 환급 내역이 반영되는 시점은 달라질
                수 있습니다.
              </p>
            </>
          )
        },
        {
          title: "제8조 (관계 법령의 우선 적용)",
          body: (
            <p>
              본 정책에서 정하지 않은 사항, 또는 본 정책의 내용이 관계 법령과 다른 경우에는 관계
              법령이 정하는 바에 따릅니다. 본 정책의 어떠한 내용도 관계 법령이 이용자에게 보장하는
              권리를 제한하지 않습니다.
            </p>
          )
        }
      ]}
    />
  )
}
