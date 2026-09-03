// 회사 / 고객센터 정보의 단일 출처.
//
// 이 값들은 사업자 정보라 화면마다 다시 적으면 안 된다.
// 실제로 노출되는 곳(정책 문서 footer, 학부모 footer, 파트너 랜딩, Studio footer)이
// 전부 이 파일 하나만 본다.
//
// ⚠️ 추측해서 채우지 않는다. 통신판매업신고번호처럼 확인되지 않은 항목은 아예 두지 않는다.

export const COMPANY_INFO = {
  name: "첫수업",
  representative: "김원식",
  businessRegistrationNumber: "775-07-03279",
  /** 도로명 주소. */
  addressLine1: "경기도 고양시 일산동구 무궁화로 20-38, 5층 500-17호",
  /** 법정동 + 건물명. */
  addressLine2: "(장항동, 경기창업혁신공간)",
  /** 정책 문서에 표기하는 대표 이메일. 고객센터 이메일과 별개다. */
  representativeEmail: "kimwon0828@naver.com",
  customerCenterPhone: "010-8384-0825",
  customerCenterEmail: "hello@firstsuup.com",
  customerCenterHours: "평일 09:00–18:00",
  customerCenterClosed: "주말·공휴일 휴무"
} as const

/** 한 줄로 표기할 때 쓰는 전체 주소. */
export const COMPANY_ADDRESS = `${COMPANY_INFO.addressLine1} ${COMPANY_INFO.addressLine2}`

/** tel: 은 하이픈 없이 넘긴다. */
export const COMPANY_PHONE_HREF = `tel:${COMPANY_INFO.customerCenterPhone.replace(/-/g, "")}`

export const COMPANY_EMAIL_HREF = `mailto:${COMPANY_INFO.customerCenterEmail}`
