import {
  TRIAL_RESULT_OBSERVATION_OPTIONS,
  type TrialResultObservationCode
} from "@/features/studio/lib/trial-result-options"
import type { ExperienceReportSnapshotV1 } from "@/features/reports/lib/experience-report-snapshot"

/**
 * 교육 프로필 — 여러 체험에서 부모에게 실제로 발행된 관찰을 아이 단위로 다시 모은 것.
 *
 * ⚠️ 검사도, 진단도, 성향 판정도 아니다.
 *
 * 여기서 만드는 문장은 하나도 없다. 화면에 나오는 관찰 문구는 전부 그때 발행된
 * 리포트에 실제로 들어 있던 문장이다. 새 해석("집중력이 좋아요")을 얹지 않고,
 * 점수·백분율·순위·강점/약점으로 바꾸지 않는다.
 *
 * 관찰이 아닌 판단을 만들기 시작하면, 부모가 보는 것은 아이가 그날 한 일이
 * 아니라 우리가 아이를 어떻게 규정했는지가 된다.
 */

/**
 * 프로필이 세는 단위는 "부모에게 공개된 체험" 이다.
 *
 * ⚠️ trial_results 를 읽지 않는다. 그건 학원 내부의 평가 초안이고, 부모에게
 *    한 번도 보여 준 적 없는 관찰이 들어 있을 수 있다. 프로필의 근거는
 *    지금 살아 있는 발행본(published) 하나뿐이다 —
 *    superseded 된 옛 버전도, withdrawn 된 것도 세지 않는다.
 */
export type EducationProfileSourceReport = {
  /** Current public class media; never part of the observation snapshot. */
  thumbnailUrl?: string | null
  /** 이 관찰이 나온 체험. /record/[experienceId] 로 돌아갈 열쇠다. */
  experienceId: string
  reportId: string
  reportVersion: number
  /** 발행 당시 얼린 스냅샷. 문구도 날짜도 여기서만 읽는다. */
  content: ExperienceReportSnapshotV1
  /**
   * 그 체험이 실제로 일어난 날.
   *
   * Record 화면과 같은 resolver 가 낸 값을 호출부가 넣어 준다 — 프로필이
   * 날짜 규칙을 새로 만들지 않는다.
   */
  experienceDate: string
}

/** 관찰 하나가 어느 체험에서 나왔는지. 근거 없는 요약을 만들지 않기 위한 연결이다. */
export type EducationProfileObservationSource = {
  experienceId: string
  reportId: string
  reportVersion: number
  academyName: string
  classTitle: string
  experienceDate: string
  /**
   * 그 리포트에 적혀 있던 문장 그대로.
   *
   * 같은 code 라도 발행 시점에 따라 문구가 다를 수 있다. 근거 화면에서는
   * 부모가 그때 실제로 읽은 문장을 보여 준다 — 지금 문구로 덮어쓰지 않는다.
   */
  label: string
}

export type EducationProfileObservation = {
  code: TrialResultObservationCode
  /**
   * 대표 문구.
   *
   * 가장 최근 발행본에 적혀 있던 문장을 쓴다. canonical 표를 다시 뒤지지 않는
   * 이유는, 나중에 문구를 다듬으면 부모가 본 적 없는 문장이 프로필에 뜨기
   * 때문이다. 프로필도 리포트와 같은 말을 해야 한다.
   */
  label: string
  /**
   * 이 관찰이 나온 서로 다른 체험의 수.
   *
   * ⚠️ 점수가 아니다. 강도도, 확률도, 능력치도 아니다.
   *    "3번의 체험에서 관찰됐어요" 까지가 이 숫자가 말할 수 있는 전부다.
   *
   * 한 리포트 안에 같은 code 가 여러 번 있어도 그 체험은 1로 센다.
   */
  evidenceCount: number
  /** 가장 최근에 관찰된 날. 정렬에만 쓴다. */
  latestObservedAt: string
  sources: EducationProfileObservationSource[]
}

export type EducationProfileExperience = {
  thumbnailUrl: string | null
  experienceId: string
  reportId: string
  reportVersion: number
  experienceDate: string
  classTitle: string
  academyName: string
  type: string
  observations: { code: string; label: string }[]
}

export type EducationProfile = {
  childId: string
  childName: string
  /** 발행된 리포트가 있는 체험의 수. 신청 수가 아니다. */
  publishedExperienceCount: number
  experiences: EducationProfileExperience[]
  observations: EducationProfileObservation[]
}

/** canonical code 의 선언 순서. 같은 날짜일 때의 정렬 기준으로만 쓴다. */
const CANONICAL_ORDER = new Map<string, number>(
  TRIAL_RESULT_OBSERVATION_OPTIONS.map((option, index) => [option.value, index])
)

export const isCanonicalObservationCode = (
  value: unknown
): value is TrialResultObservationCode =>
  typeof value === "string" && CANONICAL_ORDER.has(value)

const toTime = (value: string): number => {
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

/**
 * 발행된 리포트들을 아이 하나의 프로필로 모은다.
 *
 * 순수 함수다. DB 도 세션도 모른다 — 소유권 판정은 호출부(query)가 이미 끝냈고,
 * 여기 들어오는 리포트는 전부 그 아이의 살아 있는 발행본이라는 전제다.
 *
 * ⚠️ 집계가 하는 일은 "같은 code 를 모으고 몇 번 나왔는지 세는 것" 뿐이다.
 *    가중치도, 정규화도, 상위 N 추출도 하지 않는다.
 */
export const buildEducationProfile = (input: {
  childId: string
  childName: string
  reports: EducationProfileSourceReport[]
}): EducationProfile => {
  // 한 체험에 발행본은 하나뿐이지만, 호출부가 실수로 같은 체험을 두 번 넣어도
  // 근거가 부풀지 않도록 여기서 한 번 더 좁힌다.
  const reportByExperience = new Map<string, EducationProfileSourceReport>()
  for (const report of input.reports) {
    const existing = reportByExperience.get(report.experienceId)
    if (!existing || existing.reportVersion < report.reportVersion) {
      reportByExperience.set(report.experienceId, report)
    }
  }

  const reports = [...reportByExperience.values()]
  const byCode = new Map<TrialResultObservationCode, EducationProfileObservationSource[]>()

  for (const report of reports) {
    // 한 리포트 안의 중복은 체험 1회로 센다. code 를 먼저 좁히고 나서 담는다.
    const seenInThisReport = new Set<string>()

    for (const observation of report.content.observations ?? []) {
      if (!isCanonicalObservationCode(observation.code)) {
        // 알 수 없는 code 는 프로필에 올리지 않는다. 뜻을 모르는 것을
        // 부모 화면에서 추측해 설명하지 않는다.
        continue
      }

      if (seenInThisReport.has(observation.code)) {
        continue
      }
      seenInThisReport.add(observation.code)

      const sources = byCode.get(observation.code) ?? []
      sources.push({
        experienceId: report.experienceId,
        reportId: report.reportId,
        reportVersion: report.reportVersion,
        academyName: report.content.experience.academy.name,
        classTitle: report.content.experience.class.title,
        experienceDate: report.experienceDate,
        label: observation.label
      })
      byCode.set(observation.code, sources)
    }
  }

  const observations: EducationProfileObservation[] = [...byCode.entries()].map(
    ([code, sources]) => {
      const ordered = [...sources].sort(
        (a, b) => toTime(b.experienceDate) - toTime(a.experienceDate)
      )

      return {
        code,
        // 가장 최근에 부모가 읽은 문장이 대표 문구다.
        label: ordered[0]?.label ?? "",
        evidenceCount: ordered.length,
        latestObservedAt: ordered[0]?.experienceDate ?? "",
        sources: ordered
      }
    }
  )

  // 최근에 관찰된 순서로 놓는다.
  //
  // ⚠️ evidenceCount 로 정렬하지 않는다. 많이 나온 것을 위에 올리면 그 자체가
  //    "이 아이의 대표 특성" 이라는 순위표가 된다. 프로필은 순위를 매기지 않는다.
  observations.sort((a, b) => {
    const diff = toTime(b.latestObservedAt) - toTime(a.latestObservedAt)
    if (diff !== 0) {
      return diff
    }
    return (CANONICAL_ORDER.get(a.code) ?? 0) - (CANONICAL_ORDER.get(b.code) ?? 0)
  })

  return {
    childId: input.childId,
    childName: input.childName,
    publishedExperienceCount: reports.length,
    experiences: reports.map(report => ({
      thumbnailUrl: report.thumbnailUrl ?? null,
      experienceId: report.experienceId,
      reportId: report.reportId,
      reportVersion: report.reportVersion,
      experienceDate: report.experienceDate,
      classTitle: report.content.experience.class.title,
      academyName: report.content.experience.academy.name,
      type: report.content.experience.type,
      observations: report.content.observations.map(item => ({ code: item.code, label: item.label }))
    })).sort((a, b) => toTime(b.experienceDate) - toTime(a.experienceDate) || a.experienceId.localeCompare(b.experienceId)),
    observations
  }
}

/**
 * "2개의 체험에서 관찰됐어요".
 *
 * ⚠️ 한 번뿐이면 아무 말도 하지 않는다.
 *
 *    "1번의 체험에서 관찰됐어요" 는 사실이지만, 옆의 2·3과 나란히 놓이는 순간
 *    가장 낮은 값이 된다. 한 번 본 것을 적게 본 것으로 읽히게 만들 이유가 없다.
 *    횟수는 여러 번 관찰됐을 때만 말할 가치가 있는 정보다.
 */
export const describeEvidenceCount = (count: number): string | null =>
  count >= 2 ? `${count}개의 체험에서 관찰됐어요` : null
