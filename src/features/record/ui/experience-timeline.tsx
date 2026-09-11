import {
  buildExperienceTimeline,
  buildExperienceTimelineLabels,
  type ParentExperience
} from "@/features/record/lib/experience-view"
import styles from "./experience-timeline.module.css"

// 한 경험에서 실제로 일어난 일.
//
// Audit log 가 아니다. new → reviewing 같은 내부 workflow 전이나 등록 상태는
// 넣지 않는다. 학부모에게 사건인 것만 남긴다.
//
// 앞으로 여기에 "선생님이 관찰했어요" · "상담했어요" · "리포트가 도착했어요" ·
// "부모님의 생각" 이 같은 축으로 붙는다. 그래서 event 목록을 밖에서 받는 모양으로 둔다.

type ExperienceTimelineProps = {
  experience: ParentExperience
}

const formatDay = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const weekdays = ["일", "월", "화", "수", "목", "금", "토"]
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${weekdays[date.getDay()]})`
}

export const ExperienceTimeline = ({ experience }: ExperienceTimelineProps) => {
  const steps = buildExperienceTimeline(experience)
  const labels = buildExperienceTimelineLabels(experience.classProgramType)

  if (steps.length === 0) {
    return null
  }

  return (
    <ol className={styles.timeline}>
      {steps.map((step, index) => (
        <li key={step.key} className={styles.item}>
          <span className={styles.rail} aria-hidden="true">
            <span className={styles.dot} />
            {index < steps.length - 1 ? <span className={styles.line} /> : null}
          </span>
          <span className={styles.body}>
            <span className={styles.label}>{labels[step.key]}</span>
            <span className={styles.date}>{formatDay(step.occurredAt) ?? ""}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}
