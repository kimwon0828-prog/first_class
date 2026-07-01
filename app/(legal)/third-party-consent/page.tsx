import type { Metadata } from "next"

import { LegalPageLayout } from "../legal-page-layout"

export const metadata: Metadata = {
  title: "개인정보 제3자 제공 동의",
  description: "첫수업 MVP 개인정보 제3자 제공 동의 초안"
}

export default function ThirdPartyConsentPage() {
  return (
    <LegalPageLayout
      eyebrow="동의 문서"
      title="개인정보 제3자 제공 동의"
      description="이 문서는 첫수업 MVP 단계에서 체험수업 신청 시 필요한 개인정보 제3자 제공 동의 초안입니다. 첫수업은 학부모가 입력한 신청 정보를 전체 학원에 일괄 제공하지 않으며, 해당 신청을 실제로 처리하는 학원 및 담당 선생님에게만 필요한 범위에서 전달합니다."
      notice="법률 최종 검토 전 초안이며, 실제 동의 체크박스 연결과 문구 확정은 후속 단계에서 반영됩니다."
      sections={[
        {
          title: "제공받는 자",
          body: (
            <>
              <p>체험수업을 운영하는 해당 학원 및 담당 선생님</p>
              <p>
                신청 정보는 전체 학원 또는 불특정 다수에게 제공되지 않으며, 해당 신청 건을
                확인하고 처리하는 운영 주체에게만 전달됩니다.
              </p>
            </>
          )
        },
        {
          title: "제공 목적",
          body: (
            <ul>
              <li>체험수업 신청 확인</li>
              <li>상담 진행 및 연락</li>
              <li>일정 조율 및 예약 안내</li>
              <li>수업 준비</li>
              <li>신청 상태 안내</li>
            </ul>
          )
        },
        {
          title: "제공 항목",
          body: (
            <ul>
              <li>학부모 이름</li>
              <li>연락처</li>
              <li>학생 이름</li>
              <li>학년</li>
              <li>신청 수업</li>
              <li>희망 일정</li>
              <li>요청사항</li>
            </ul>
          )
        },
        {
          title: "보유 및 이용 기간",
          body: (
            <>
              <p>
                제공받는 학원 및 담당 선생님은 체험수업 신청 처리, 상담, 일정 조율 목적이
                달성될 때까지 개인정보를 이용할 수 있습니다.
              </p>
              <p>
                다만 분쟁 대응 또는 관련 법령 준수를 위해 필요한 경우에는 일정 기간 보관할 수
                있습니다.
              </p>
            </>
          )
        },
        {
          title: "동의 거부 권리 및 불이익",
          body: (
            <>
              <p>
                이용자는 개인정보 제3자 제공에 대한 동의를 거부할 권리가 있습니다.
              </p>
              <p>
                다만 본 동의가 없으면 해당 학원 및 담당 선생님이 신청 내용을 확인하고 연락할 수
                없어 체험수업 신청이 제한될 수 있습니다.
              </p>
            </>
          )
        }
      ]}
    />
  )
}
