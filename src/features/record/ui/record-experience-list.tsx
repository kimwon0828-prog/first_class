import Link from "next/link"
import { withRecordChild } from "@/features/record/lib/record-href"

import {
  getExperienceTypeLabel,
  resolveParentExperienceDate,
  type ParentExperience
} from "@/features/record/lib/experience-view"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

import styles from "./record-experience-list.module.css"

/*
 * 기록 홈의 본문.
 *
 * ⚠️ 처리 타임라인이 아니다. 여기 오는 것은 전부 이미 다녀온 경험이라
 *    "지금 어느 단계인가" 를 말할 일이 없다. 필요한 것은 언제 무엇을 했고
 *    그때 무엇이 남았는지다.
 *
 * ⚠️ 점수 · 별점 · 순위 · 그래프를 만들지 않는다. 그런 값이 없다.
 */
type RecordExperienceListProps = {
  experiences: ParentExperience[]
  /** 자녀 필터가 "전체" 일 때만 각 항목에 아이 이름을 덧붙인다. */
  showChildName: boolean
  selectedChildId?: string | null
  /** 지금 살아 있는 발행본이 있는 경험. 조회에 실패하면 넘기지 않는다. */
  reportedExperienceIds?: ReadonlySet<string>
  /** 내 생각을 남긴 경험. 무엇을 골랐는지는 보여 주지 않는다. */
  decidedExperienceIds?: ReadonlySet<string>
}

// 목록과 상세가 같은 날짜를 말해야 한다. 기준은 언제나 한국 시간이다.
const SEOUL_WEEKDAY_SHORT = ["일", "월", "화", "수", "목", "금", "토"]

const formatMonthLabel = (value: string) => {
  const parts = getSeoulDateTimeParts(value)
  return parts ? `${parts.year}년 ${parts.month}월` : null
}

const formatDayLabel = (value: string) => {
  const parts = getSeoulDateTimeParts(value)
  return parts ? `${parts.month}월 ${parts.day}일 (${SEOUL_WEEKDAY_SHORT[parts.weekday]})` : null
}

const monthKey = (value: string) => {
  const parts = getSeoulDateTimeParts(value)
  return parts ? `${parts.year}-${String(parts.month).padStart(2, "0")}` : null
}

const toTime = (value: string) => {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

type MonthGroup = {
  key: string
  label: string
  items: Array<{ experience: ParentExperience; date: string }>
}

/** 실제 체험 날짜 기준 최신순. 날짜 판정은 기존 canonical helper 를 그대로 쓴다. */
const buildMonthGroups = (experiences: ParentExperience[]): MonthGroup[] => {
  const dated = experiences
    .map((experience) => ({ experience, date: resolveParentExperienceDate(experience) }))
    .sort(
      (left, right) =>
        toTime(right.date) - toTime(left.date) || right.experience.id.localeCompare(left.experience.id)
    )

  const groups: MonthGroup[] = []
  for (const item of dated) {
    const key = monthKey(item.date)
    const label = formatMonthLabel(item.date)
    if (!key || !label) {
      continue
    }

    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.items.push(item)
      continue
    }

    groups.push({ key, label, items: [item] })
  }

  return groups
}

export const RecordExperienceList = ({
  experiences,
  showChildName,
  selectedChildId = null,
  reportedExperienceIds,
  decidedExperienceIds
}: RecordExperienceListProps) => {
  const groups = buildMonthGroups(experiences)
  const hasReport = (experienceId: string) => Boolean(reportedExperienceIds?.has(experienceId))
  const hasDecision = (experienceId: string) => Boolean(decidedExperienceIds?.has(experienceId))

  return (
    <div className={styles.list}>
      {groups.map((group) => (
        <section key={group.key} className={styles.monthGroup} aria-label={group.label}>
          <h3 className={styles.monthLabel}>{group.label}</h3>

          <ul className={styles.cards}>
            {group.items.map(({ experience, date }) => {
              const dayLabel = formatDayLabel(date)
              const parts = getSeoulDateTimeParts(date)
              const academyName = experience.academyName?.trim() || null
              const showReport = hasReport(experience.id)

              return (
                <li key={experience.id} className={styles.card}>
                  <Link href={withRecordChild(`/record/${experience.id}`, selectedChildId)} className={styles.cardMain}>
                    <time dateTime={date} className={styles.dateBlock} aria-label={dayLabel ?? undefined}>
                      <strong>{parts?.day}</strong>
                      <span>{parts ? SEOUL_WEEKDAY_SHORT[parts.weekday] : null}</span>
                    </time>
                    <span className={styles.cardBody}>
                      <span className={styles.typeLabel}>
                        {getExperienceTypeLabel(experience.classProgramType)}
                      </span>
                      <span className={styles.cardTitle}>
                        {experience.classTitle ?? "수업 정보 준비 중"}
                      </span>
                      {academyName ? <span className={styles.cardAcademy}>{academyName}</span> : null}
                      {showChildName ? (
                        <span className={styles.cardChild}>
                          {experience.childGrade
                            ? `${experience.childName} · ${experience.childGrade}`
                            : experience.childName}
                        </span>
                      ) : null}
                    </span>
                    <span className={styles.chevron} aria-hidden="true">›</span>
                  </Link>

                  {showReport || hasDecision(experience.id) ? (
                    <div className={styles.signalRow}>
                      {showReport ? (
                        <Link href={withRecordChild(`/record/${experience.id}/report`, selectedChildId)} className={styles.reportCta}>
                          리포트 보기 <span aria-hidden="true">›</span>
                        </Link>
                      ) : null}
                      {hasDecision(experience.id) ? <span className={styles.signalMuted}>내 생각 남김</span> : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
