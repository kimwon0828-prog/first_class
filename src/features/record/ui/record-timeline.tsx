import Link from "next/link"

import {
  getExperienceTypeLabel,
  groupExperiencesByPeriod,
  isActiveExperience,
  resolveExperienceStage,
  resolveParentExperienceDate,
  getExperienceStageLabel,
  type ParentExperience
} from "@/features/record/lib/experience-view"
import styles from "./record-timeline.module.css"

// 기록 홈의 본문. 연 → 월 → 경험 순으로 시간축을 따라 내려간다.
//
// 처리 단계(다가오는/확인 중/지난)로 나누지 않는다. 기록에서 궁금한 것은
// "지금 어느 단계인가" 가 아니라 "언제 무엇을 했는가" 다.

type RecordTimelineProps = {
  experiences: ParentExperience[]
  /** 자녀 필터가 "전체" 일 때만 각 항목에 아이 이름을 덧붙인다. */
  showChildName: boolean
}

const formatDay = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const weekdays = ["일", "월", "화", "수", "목", "금", "토"]
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${weekdays[date.getDay()]})`
}

export const RecordTimeline = ({ experiences, showChildName }: RecordTimelineProps) => {
  const years = groupExperiencesByPeriod(experiences)

  return (
    <div className={styles.timeline}>
      {years.map((year) => (
        <section key={year.year} className={styles.yearGroup} aria-labelledby={`year-${year.year}`}>
          <h2 id={`year-${year.year}`} className={styles.yearLabel}>
            {year.year}
          </h2>

          {year.months.map((month) => (
            <section key={month.key} className={styles.monthGroup} aria-labelledby={`month-${month.key}`}>
              <h3 id={`month-${month.key}`} className={styles.monthLabel}>
                {month.month}월
              </h3>

              <ul className={styles.items}>
                {month.items.map((experience) => {
                  const stage = resolveExperienceStage(experience)
                  const day = formatDay(resolveParentExperienceDate(experience))

                  return (
                    <li key={experience.id}>
                      <Link href={`/record/${experience.id}`} className={styles.item}>
                        <div className={styles.itemHead}>
                          <span className={styles.typeBadge}>
                            {getExperienceTypeLabel(experience.classProgramType)}
                          </span>
                          {showChildName ? (
                            <span className={styles.itemChild}>
                              {experience.childName} · {experience.childGrade}
                            </span>
                          ) : null}
                        </div>

                        <p className={styles.itemTitle}>{experience.classTitle ?? "수업 정보 없음"}</p>
                        <p className={styles.itemAcademy}>
                          {experience.academyName?.trim() || "정보 준비 중"}
                        </p>

                        <p className={styles.itemMeta}>
                          {day ? <span className={styles.itemDate}>{day}</span> : null}
                          {day ? <span className={styles.itemDot}>·</span> : null}
                          <span className={isActiveExperience(stage) ? styles.itemStatusActive : undefined}>
                            {getExperienceStageLabel(stage, experience.classProgramType)}
                          </span>
                        </p>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </section>
      ))}
    </div>
  )
}
