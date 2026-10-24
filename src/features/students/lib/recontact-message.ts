// 안내 보내기(다시 연락 문자) 문장 규칙. 화면 미리보기와 서버 발송이 같은 함수를 쓴다.
//
//   (광고) [학원명] 학원대표번호            ← 정보통신망법 전송자 명칭 · 연락처
//   {학생} 보호자님, 지난 {체험}에 와 주셔서 감사했어요.
//
//   본문(템플릿 · 직접 쓰기)
//
//   수업 보기·체험 신청 ▶ https://firstsuup.com/classes/{id}
//   무료수신거부 080-…
//
// 저장은 치환 전 템플릿({학생} · {체험} 자리 표시)만 한다 — 학생 이름이 들어간 문장은 남기지 않는다.
// 이 파일은 클라이언트에서도 읽는다. 서버 전용 값(080 번호 등)은 인자로만 받는다.

import type { RecontactTemplateKind } from "@/shared/lib/db/adapter"

export const RECONTACT_MONTH_LIMIT = 200
export const RECONTACT_PER_BATCH = 50
export const RECONTACT_CUSTOM_MAX = 500
/** LMS 최대(EUC-KR 2,000바이트). 직접 쓰기 500자 + 머리 · 꼬리로는 넘지 않지만 서버가 한 번 더 본다. */
export const RECONTACT_LMS_MAX_BYTES = 2000
/** 보내도 되는 시각(KST): 08:00 ≤ 시각 < 21:00. */
export const RECONTACT_SEND_HOURS = { from: 8, until: 21 } as const

export const RECONTACT_TEMPLATES: Array<{ kind: RecontactTemplateKind; label: string }> = [
  { kind: "new_class", label: "새 반 개설" },
  { kind: "special", label: "특강" },
  { kind: "schedule_change", label: "시간표 변경" },
  { kind: "custom", label: "직접 쓰기" }
]

export const isRecontactTemplateKind = (value: unknown): value is RecontactTemplateKind =>
  RECONTACT_TEMPLATES.some((template) => template.kind === value)

const GREETING = "{학생} 보호자님, 지난 {체험}에 와 주셔서 감사했어요."

/**
 * 치환 전 본문. 수업 이름은 학원이 고른 공개 수업이라 개인 정보가 아니어서 여기서 넣는다.
 * 직접 쓰기는 학원이 쓴 글을 그대로 둔다(앞 인사 줄만 붙인다).
 */
export const buildRecontactBodyTemplate = (input: {
  kind: RecontactTemplateKind
  classTitle: string | null
  customText: string
}) => {
  const title = input.classTitle?.trim()
  const body = (() => {
    switch (input.kind) {
      case "new_class":
        return `${title ? `${title} 새 반이 열려요.` : "새 반이 열려요."} 체험 때 시간이 맞지 않으셨다면 이번 반을 확인해 보세요.`
      case "special":
        return `${title ? `${title} 특강을 열어요.` : "특강을 열어요."} 관심 있으시면 편하게 확인해 보세요.`
      case "schedule_change":
        return `${title ? `${title} 시간표가 바뀌었어요.` : "수업 시간표가 바뀌었어요."} 체험 때 시간이 맞지 않으셨다면 바뀐 시간을 확인해 보세요.`
      case "custom":
        return input.customText.replace(/\r\n?/g, "\n").trim()
    }
  })()
  return `${GREETING}\n\n${body}`
}

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3
const hasFinalConsonant = (character: string) => {
  const code = character.charCodeAt(0)
  return code >= HANGUL_START && code <= HANGUL_END && (code - HANGUL_START) % 28 !== 0
}
const isHangulName = (value: string) => /^[가-힣]+$/.test(value)

/** "정하람" → "하람이", "윤서아" → "서아". 세 글자 한글 이름만 성을 뗀다(두 글자는 그대로). */
export const toFriendlyStudentName = (name: string) => {
  const trimmed = name.trim()
  if (!isHangulName(trimmed)) return trimmed
  const given = trimmed.length === 3 ? trimmed.slice(1) : trimmed
  return hasFinalConsonant(given.at(-1) as string) ? `${given}이` : given
}

export const formatRecontactHeader = (academyName: string, academyPhone: string) => `(광고) [${academyName}] ${academyPhone}`

export const formatRecontactLinkLine = (linkUrl: string) => `수업 보기·체험 신청 ▶ ${linkUrl}`

export const formatRecontactOptOutLine = (optOutNumber: string) => `무료수신거부 ${optOutNumber}`

/** 받는 사람 한 명의 본문(머리 · 꼬리 제외). */
export const renderRecontactBody = (bodyTemplate: string, recipient: { studentName: string; trialLabel: string }) =>
  bodyTemplate
    .replaceAll("{학생}", toFriendlyStudentName(recipient.studentName))
    .replaceAll("{체험}", recipient.trialLabel)

/** 실제로 나가는 문자 전체. */
export const renderRecontactMessage = (input: {
  academyName: string
  academyPhone: string
  bodyTemplate: string
  studentName: string
  trialLabel: string
  linkUrl: string | null
  optOutNumber: string
}) =>
  [
    formatRecontactHeader(input.academyName, input.academyPhone),
    renderRecontactBody(input.bodyTemplate, input),
    "",
    ...(input.linkUrl ? [formatRecontactLinkLine(input.linkUrl)] : []),
    formatRecontactOptOutLine(input.optOutNumber)
  ].join("\n")

/** EUC-KR 바이트 수 근사(한글 · 기호 2, ASCII 1). 서버는 실제 인코딩(byte-utils)으로 다시 잰다. */
export const estimateSmsBytes = (value: string) =>
  Array.from(value).reduce((sum, character) => sum + (character.charCodeAt(0) < 0x80 ? 1 : 2), 0)

/** 지금 보내도 되는 시각인가(KST 08:00 ~ 21:00). */
export const isWithinRecontactHours = (now: Date) => {
  const hour = (now.getUTCHours() + 9) % 24
  return hour >= RECONTACT_SEND_HOURS.from && hour < RECONTACT_SEND_HOURS.until
}

/** 080 번호 형식(서버 설정 RECONTACT_OPT_OUT_NUMBER). */
export const isValidOptOutNumber = (value: string | null | undefined): value is string =>
  typeof value === "string" && /^080-?\d{3,4}-?\d{4}$/.test(value.trim())
