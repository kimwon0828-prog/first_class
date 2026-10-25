// 학원 소식 보내기를 막는 이유와 문구. 화면(보내기 패널)과 서버 액션이 같은 판정을 쓴다.
// 서버 확인 순서(AGENTS.md "학생 · 학원 소식 문자"): 학원 계정 → 요금제 → 로컬 가드 → 080 번호 → 시간 → 고른 학생 → 한도.
// 보내는 주체는 첫수업이라 학원 대표번호는 보지 않는다(첫 줄은 첫수업 고객센터 번호).
// 한도 · 동의 · 같은 번호 · 중복 클릭은 DB(reserve_recontact_batch)가 마지막으로 다시 본다.

import { isValidOptOutNumber, isWithinRecontactHours, RECONTACT_PER_BATCH } from "./recontact-message"

export type RecontactBlock =
  | "plan"
  | "local_guard"
  | "opt_out_number"
  | "quiet_hours"
  | "no_recipient"
  | "too_many"
  | "limit"

export type RecontactBlockNotice = {
  message: string
  /** 다음에 할 일로 가는 링크(내부 경로). */
  action: { label: string; href: string } | null
}

export const getRecontactBlockNotice = (block: RecontactBlock, remaining: number): RecontactBlockNotice => {
  switch (block) {
    case "plan":
      return { message: "학원 소식 보내기는 스탠다드 플랜에서 쓸 수 있어요.", action: { label: "플랜·결제 보기", href: "/studio/billing" } }
    case "local_guard":
      return { message: "개발 환경에서는 운영 데이터로 문자를 보내지 않아요.", action: null }
    case "opt_out_number":
      return { message: "무료수신거부 번호를 준비하고 있어요. 준비되면 바로 보낼 수 있어요.", action: null }
    case "quiet_hours":
      return { message: "광고 문자는 밤 9시부터 아침 8시까지 보낼 수 없어요. 아침 8시 이후에 보내 주세요.", action: null }
    case "no_recipient":
      return { message: "목록에서 학원 소식을 받을 학생을 골라 주세요.", action: null }
    case "too_many":
      return { message: `한 번에 ${RECONTACT_PER_BATCH}명까지 보낼 수 있어요. 나눠서 보내 주세요.`, action: null }
    case "limit":
      return remaining > 0
        ? { message: `이번 달 남은 발송은 ${remaining}건이에요. 받는 사람을 줄여 주세요.`, action: null }
        : { message: "이번 달 보낼 수 있는 학원 소식을 모두 썼어요. 다음 달 1일에 다시 200건이 돼요.", action: null }
  }
}

export type RecontactGateInput = {
  entitled: boolean
  localGuardAllowed: boolean
  optOutNumber: string | null
  now: Date
  selectedCount: number
  remaining: number
}

/** 첫 번째로 막는 이유. 없으면 null(보낼 수 있다). */
export const resolveRecontactBlock = (input: RecontactGateInput): RecontactBlock | null => {
  if (!input.entitled) return "plan"
  if (!input.localGuardAllowed) return "local_guard"
  if (!isValidOptOutNumber(input.optOutNumber)) return "opt_out_number"
  if (!isWithinRecontactHours(input.now)) return "quiet_hours"
  if (input.selectedCount <= 0) return "no_recipient"
  if (input.selectedCount > RECONTACT_PER_BATCH) return "too_many"
  if (input.selectedCount > input.remaining) return "limit"
  return null
}

/** 보내기 패널이 받는 서버 값(§5.27). 080 번호는 모든 문자 끝에 찍히는 공개 번호라 화면에 넘겨도 된다. */
export type RecontactPanelContext = {
  entitled: boolean
  localGuardAllowed: boolean
  /** 둘째 줄 "[학원명]". */
  academyName: string
  optOutNumber: string | null
  /** 조회 실패면 null(버튼은 열어 두고 DB 가 한도를 다시 센다). */
  usage: { used: number; limit: number } | null
  /** 함께 보낼 수업: 이 학원의 공개 수업. */
  classes: Array<{ id: string; title: string }>
  /** 수업 링크 앞부분 "https://firstsuup.com/classes/". */
  classLinkBase: string
  /** 서버가 값을 읽은 시각. 화면은 이 시각으로 시작해 1분마다 시간 제한을 다시 본다(서버 · 브라우저 렌더가 같게). */
  checkedAt: string
}
