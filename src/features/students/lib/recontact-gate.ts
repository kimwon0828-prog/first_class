// 안내 보내기를 막는 이유와 문구. 화면(보내기 패널)과 서버 액션이 같은 판정을 쓴다.
// 서버 확인 순서(AGENTS.md "학생 · 안내 문자"): 학원 계정 → 요금제 → 로컬 가드 → 080 번호 → 학원 대표번호 → 시간 → 고른 학생 → 한도.
// 한도 · 동의 · 같은 번호 · 중복 클릭은 DB(reserve_recontact_batch)가 마지막으로 다시 본다.

import { isValidOptOutNumber, isWithinRecontactHours, RECONTACT_PER_BATCH } from "./recontact-message"

export type RecontactBlock =
  | "plan"
  | "local_guard"
  | "opt_out_number"
  | "sender_phone"
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
      return { message: "안내 보내기는 스탠다드 플랜에서 쓸 수 있어요.", action: { label: "플랜·결제 보기", href: "/studio/billing" } }
    case "local_guard":
      return { message: "개발 환경에서는 운영 데이터로 문자를 보내지 않아요.", action: null }
    case "opt_out_number":
      return { message: "무료수신거부 번호를 준비하고 있어요. 준비되면 바로 보낼 수 있어요.", action: null }
    case "sender_phone":
      return { message: "학원 대표번호를 설정해야 안내를 보낼 수 있어요.", action: { label: "학원 정보 보기", href: "/studio/settings" } }
    case "quiet_hours":
      return { message: "광고 문자는 밤 9시부터 아침 8시까지 보낼 수 없어요. 아침 8시 이후에 보내 주세요.", action: null }
    case "no_recipient":
      return { message: "목록에서 안내를 받을 학생을 골라 주세요.", action: null }
    case "too_many":
      return { message: `한 번에 ${RECONTACT_PER_BATCH}명까지 보낼 수 있어요. 나눠서 보내 주세요.`, action: null }
    case "limit":
      return remaining > 0
        ? { message: `이번 달 남은 발송은 ${remaining}건이에요. 받는 사람을 줄여 주세요.`, action: null }
        : { message: "이번 달 보낼 수 있는 안내를 모두 썼어요. 다음 달 1일에 다시 200건이 돼요.", action: null }
  }
}

export type RecontactGateInput = {
  entitled: boolean
  localGuardAllowed: boolean
  optOutNumber: string | null
  senderPhone: string | null
  now: Date
  selectedCount: number
  remaining: number
}

/** 첫 번째로 막는 이유. 없으면 null(보낼 수 있다). */
export const resolveRecontactBlock = (input: RecontactGateInput): RecontactBlock | null => {
  if (!input.entitled) return "plan"
  if (!input.localGuardAllowed) return "local_guard"
  if (!isValidOptOutNumber(input.optOutNumber)) return "opt_out_number"
  if (!input.senderPhone?.replace(/\D/g, "")) return "sender_phone"
  if (!isWithinRecontactHours(input.now)) return "quiet_hours"
  if (input.selectedCount <= 0) return "no_recipient"
  if (input.selectedCount > RECONTACT_PER_BATCH) return "too_many"
  if (input.selectedCount > input.remaining) return "limit"
  return null
}
