import {
  TRIAL_RESULT_OBSERVATION_OPTIONS,
  type TrialResultObservationCode,
  isLegacyTrialResultObservation,
  normalizeTrialResultObservation
} from "@/features/studio/lib/trial-result-options"

/**
 * 발행된 체험 리포트의 상태.
 *
 * draft 가 없다. trial_results 가 이미 draft 다 — 이 표에는 실제로 발행된 적이
 * 있는 것만 들어온다. "발행 준비 중" 을 여기 만들면 부모에게 보여 준 적 없는
 * row 가 발행 이력에 섞인다.
 */
export type ExperienceReportStatus = "published" | "superseded" | "withdrawn"

export const EXPERIENCE_REPORT_STATUSES: readonly ExperienceReportStatus[] = [
  "published",
  "superseded",
  "withdrawn"
]

/**
 * 관찰 한 줄.
 *
 * ⚠️ code 와 label 을 둘 다 얼린다.
 *
 * code 만 저장하면 문구를 다듬는 순간 이미 발행된 리포트의 표시 내용이 조용히
 * 바뀐다 — 부모가 본 문장과 지금 보이는 문장이 달라지는데 version 은 그대로다.
 * label 은 그때의 문장, code 는 집계용 열쇠다.
 */
export type ExperienceReportObservationSnapshot = {
  code: TrialResultObservationCode
  label: string
}

/**
 * 발행본의 현재 모양.
 *
 * V1 과 다른 점은 summary 하나다. 그래도 타입을 나눈다 — 과거 발행본에
 * 없던 칸을 optional 로 끼워 넣으면, 읽는 쪽이 "없는 것" 과 "V1 이라 애초에
 * 개념이 없던 것" 을 구분하지 못한다.
 */
export type ExperienceReportSnapshotV2 = ExperienceReportSnapshotV1 & {
  /** 선생님 총평. 공백만 있으면 발행 단계에서 null 로 눕는다. */
  summary: string | null
}

/** 화면이 받는 모양. V1 은 summary 가 없는 것으로 읽힌다. */
export type ExperienceReportSnapshot = ExperienceReportSnapshotV1 | ExperienceReportSnapshotV2

/** 지금 발행하면 찍히는 version. */
export const EXPERIENCE_REPORT_CONTENT_VERSION = 2

export const getExperienceReportSummary = (
  snapshot: ExperienceReportSnapshot
): string | null => ("summary" in snapshot ? snapshot.summary : null)

export type ExperienceReportSnapshotV1 = {
  experience: {
    type: string
    /**
     * 체험 날짜. 필수다.
     *
     * 날짜 없는 리포트는 부모에게 "언제 있었던 일인지" 를 말해 주지 못한다.
     * 발행 단계에서 막고, 여기서도 optional 로 두지 않는다 — type 이 nullable 이면
     * 화면마다 빈 칸 처리를 다시 고민하게 되고 언젠가 하나가 새어 나간다.
     */
    date: string
    child: { displayName: string; grade: string }
    academy: { name: string }
    class: { title: string }
  }
  observations: ExperienceReportObservationSnapshot[]
  recommendation: {
    course: string | null
    level: string | null
    schedule: string | null
  }
}

export type ExperienceReportRecord = {
  id: string
  applicationId: string
  version: number
  status: ExperienceReportStatus
  contentVersion: number
  content: ExperienceReportSnapshotV1
  publishedAt: string
  supersededAt: string | null
  withdrawnAt: string | null
}

/**
 * 스냅샷에 들어가는 최상위 key.
 *
 * 이 목록 밖의 것은 넣지 않는다. parent_reaction · next_action · note ·
 * created_by · updated_by · registration_status 는 학원 내부 정보다.
 */
export const EXPERIENCE_REPORT_SNAPSHOT_TOP_LEVEL_KEYS = [
  "experience",
  "observations",
  "recommendation",
  // V2 에서 추가됐다. V1 스냅샷에는 이 key 가 아예 없다.
  "summary"
] as const

/**
 * 학부모에게 나가면 안 되는 field 이름.
 *
 * decode 가 이 이름을 발견하면 스냅샷을 거절한다. 스냅샷은 DB 함수가 만들지만,
 * 앞으로 다른 경로가 생겨도 읽는 쪽에서 한 번 더 막는다.
 */
export const EXPERIENCE_REPORT_FORBIDDEN_FIELDS = [
  "parentReaction",
  "parent_reaction",
  "nextAction",
  "next_action",
  "note",
  "createdBy",
  "created_by",
  "updatedBy",
  "updated_by",
  "registrationStatus",
  "registration_status",
  "teacherDisplayName",
  "assignedTeacherId",
  "unregisteredReason"
] as const

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const asOptionalText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * 발행 가능한 관찰인가.
 *
 * R0.1 계약 그대로다. 옛 문구는 자동으로 발행하지 않는다 — 문구를 code 로
 * 짐작해 바꾸면 과거에 없던 행동을 주장하게 된다. 사람이 현재 기준으로 다시
 * 고른 뒤에 발행할 수 있다.
 */
export type ObservationPublicationEligibility =
  | { status: "eligible"; codes: TrialResultObservationCode[] }
  | { status: "legacy_requires_review"; legacyValues: string[] }
  | { status: "unknown_values"; unknownValues: string[] }

export const checkObservationPublicationEligibility = (
  observations: readonly string[]
): ObservationPublicationEligibility => {
  const legacyValues: string[] = []
  const unknownValues: string[] = []
  const codes: TrialResultObservationCode[] = []

  for (const value of observations) {
    const code = normalizeTrialResultObservation(value)
    if (code) {
      codes.push(code)
      continue
    }

    if (isLegacyTrialResultObservation(value)) {
      legacyValues.push(value)
      continue
    }

    unknownValues.push(value)
  }

  // 옛 문구가 하나라도 있으면 나머지가 canonical 이어도 발행하지 않는다.
  // 절반만 발행하면 부모는 그것이 관찰의 일부라는 사실을 알 수 없다.
  if (legacyValues.length > 0) {
    return { status: "legacy_requires_review", legacyValues }
  }

  if (unknownValues.length > 0) {
    return { status: "unknown_values", unknownValues }
  }

  return { status: "eligible", codes }
}

/** 스냅샷을 만들 수 없는 이유. 발행 거절 사유와 1:1 이다. */
export type ExperienceReportSnapshotRejection =
  | { status: "legacy_requires_review"; legacyValues: string[] }
  | { status: "unknown_values"; unknownValues: string[] }
  | { status: "experience_date_missing" }

export const EXPERIENCE_REPORT_LEGACY_REVIEW_MESSAGE =
  "기존 기준의 관찰 기록은 현재 공개 기준으로 다시 확인한 뒤 발행할 수 있습니다."

/**
 * 스냅샷을 만든다.
 *
 * ⚠️ source row 를 펼치지 않는다(`{ ...trialResult }` 금지). 공개 가능한 field 만
 *    이름을 적어 넣는다. 새 field 가 source 에 생겨도 여기 적지 않는 한 부모에게
 *    가지 않는다 — 그게 이 함수가 존재하는 이유다.
 *
 * 실제 발행은 DB 함수가 같은 규칙으로 조립한다. 호출자가 content 를 만들어
 * 넘기면 무엇이든 부모에게 보여 줄 수 있게 되기 때문이다. 이 함수는 미리보기와
 * 계약 검증에서 같은 결과가 나오는지 확인하는 데 쓴다.
 */
export type ExperienceReportSnapshotSource = {
  programType: string
  confirmedSlotAt: string | null
  completedAt: string | null
  childName: string
  childGrade: string
  academyName: string
  classTitle: string
  observations: readonly string[]
  recommendedCourse: string | null
  recommendedLevel: string | null
  recommendedSchedule: string | null
  publicSummary: string | null
}

export type BuildExperienceReportSnapshotResult =
  | { status: "ok"; snapshot: ExperienceReportSnapshotV2 }
  | { status: "ineligible"; reason: ExperienceReportSnapshotRejection }

export const buildExperienceReportSnapshotV2 = (
  source: ExperienceReportSnapshotSource
): BuildExperienceReportSnapshotResult => {
  const eligibility = checkObservationPublicationEligibility(source.observations)
  if (eligibility.status !== "eligible") {
    return { status: "ineligible", reason: eligibility }
  }

  // 날짜가 없으면 스냅샷을 만들지 않는다. 빈 날짜로 발행하느니 발행하지 않는다.
  const experienceDate = source.confirmedSlotAt ?? source.completedAt ?? null
  if (!experienceDate) {
    return { status: "ineligible", reason: { status: "experience_date_missing" } }
  }

  const observations = eligibility.codes.map((code) => ({
    code,
    label:
      TRIAL_RESULT_OBSERVATION_OPTIONS.find((option) => option.value === code)?.label ?? code
  }))

  return {
    status: "ok",
    snapshot: {
      experience: {
        type: source.programType,
        date: experienceDate,
        child: { displayName: source.childName, grade: source.childGrade },
        academy: { name: source.academyName },
        class: { title: source.classTitle }
      },
      observations,
      // 공백만 있으면 null 이다. 부모 화면에 빈 카드를 만들지 않는다.
      summary: asOptionalText(source.publicSummary),
      recommendation: {
        course: asOptionalText(source.recommendedCourse),
        level: asOptionalText(source.recommendedLevel),
        schedule: asOptionalText(source.recommendedSchedule)
      }
    }
  }
}

/**
 * DB 의 jsonb 를 타입으로 받아들인다.
 *
 * raw jsonb 를 애플리케이션 전체로 퍼뜨리지 않는다. 여기를 통과한 것만 화면과
 * DTO 로 간다. 모양이 어긋나면 null 이다 — 반쪽짜리를 부모에게 보여 주느니
 * 아무것도 보여 주지 않는다.
 */
/**
 * 공식 발행본으로 남길 만한 내용이 있는가.
 *
 * ⚠️ "snapshot 을 만들 수 있는가" 와 다른 질문이다.
 *
 * 관찰이 빈 배열인 snapshot 은 R1 계약상 유효하다 — 그 자체로 잘못된 데이터가
 * 아니다. 하지만 관찰도 추천도 없으면 부모가 받는 것은 이름과 날짜뿐이고,
 * 그건 리포트가 아니라 "확인했다" 는 알림에 가깝다.
 *
 * 그래서 builder 의 책임은 그대로 두고 판정만 따로 둔다.
 * 공백만 있는 추천은 내용으로 세지 않는다.
 */
export const hasPublishableReportContent = (snapshot: ExperienceReportSnapshotV1): boolean => {
  if (snapshot.observations.length > 0) {
    return true
  }

  const { course, level, schedule } = snapshot.recommendation
  return [course, level, schedule].some((value) => (value ?? "").trim().length > 0)
}

export const decodeExperienceReportSnapshot = (
  contentVersion: number,
  content: unknown
): ExperienceReportSnapshot | null => {
  // content_version 으로 분기한다. 과거 row 를 새 모양으로 변환하지 않는다 —
  // V1 은 V1 로 읽고, summary 가 없는 문서로 그대로 남는다.
  if (contentVersion !== 1 && contentVersion !== 2) {
    return null
  }

  if (!isPlainObject(content)) {
    return null
  }

  for (const key of Object.keys(content)) {
    if (!EXPERIENCE_REPORT_SNAPSHOT_TOP_LEVEL_KEYS.includes(key as never)) {
      return null
    }
  }

  // 내부 field 가 섞여 들어온 스냅샷은 통째로 거절한다.
  const serialized = JSON.stringify(content)
  if (EXPERIENCE_REPORT_FORBIDDEN_FIELDS.some((field) => serialized.includes(`"${field}"`))) {
    return null
  }

  const experience = content.experience
  const observations = content.observations
  const recommendation = content.recommendation

  if (!isPlainObject(experience) || !Array.isArray(observations) || !isPlainObject(recommendation)) {
    return null
  }

  const child = experience.child
  const academy = experience.academy
  const classInfo = experience.class

  if (!isPlainObject(child) || !isPlainObject(academy) || !isPlainObject(classInfo)) {
    return null
  }

  if (typeof experience.type !== "string" || typeof child.displayName !== "string") {
    return null
  }

  // 날짜가 비어 있는 스냅샷은 통째로 거절한다. 계약이 필수이므로 읽는 쪽도 필수다.
  if (typeof experience.date !== "string" || experience.date.trim().length === 0) {
    return null
  }

  const decodedObservations: ExperienceReportObservationSnapshot[] = []
  for (const item of observations) {
    if (!isPlainObject(item)) {
      return null
    }

    const code = normalizeTrialResultObservation(item.code)
    // label 은 저장된 값을 그대로 쓴다. 지금 문구로 바꿔 읽으면 스냅샷이 아니다.
    if (!code || typeof item.label !== "string" || item.label.trim().length === 0) {
      return null
    }

    decodedObservations.push({ code, label: item.label })
  }

  return {
    experience: {
      type: experience.type,
      date: experience.date,
      child: {
        displayName: child.displayName,
        grade: typeof child.grade === "string" ? child.grade : ""
      },
      academy: { name: typeof academy.name === "string" ? academy.name : "" },
      class: { title: typeof classInfo.title === "string" ? classInfo.title : "" }
    },
    observations: decodedObservations,
    recommendation: {
      course: asOptionalText(recommendation.course),
      level: asOptionalText(recommendation.level),
      schedule: asOptionalText(recommendation.schedule)
    },
    // V1 에는 이 개념이 없다. 없던 문서를 "총평이 비었다" 로 읽지 않도록
    // V2 일 때만 값을 담는다.
    ...(contentVersion === 2
      ? { summary: typeof content.summary === "string" && content.summary.trim() ? content.summary : null }
      : {})
  }
}
