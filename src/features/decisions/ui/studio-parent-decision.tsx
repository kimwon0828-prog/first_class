import {
  getParentDecisionLabel,
  type ParentDecisionSummary
} from "@/features/decisions/lib/parent-decision"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

import styles from "./studio-parent-decision.module.css"

/**
 * 학부모가 남긴 현재 생각 — 읽기 전용.
 *
 * ⚠️ 학원이 고칠 수 없다. 수정 버튼을 두지 않는다.
 *    이건 학원이 판단해 적는 registration_status 가 아니라 학부모 본인의 말이다.
 *    학원이 대신 고칠 수 있게 되는 순간 두 값의 구분이 무너진다.
 */
type StudioParentDecisionProps = {
  decision: ParentDecisionSummary | null
  loadError: string | null
}

const formatDecisionDate = (value: string) => {
  const parts = getSeoulDateTimeParts(value)
  if (!parts) {
    return null
  }

  const month = `${parts.month}`.padStart(2, "0")
  const day = `${parts.day}`.padStart(2, "0")
  return `${parts.year}.${month}.${day}`
}

export const StudioParentDecision = ({ decision, loadError }: StudioParentDecisionProps) => {
  const writtenAt = decision ? formatDecisionDate(decision.createdAt) : null

  return (
    <section className={`${styles.card} ${styles.sectionCard}`} aria-labelledby="parent-decision-title">
      <div className={styles.sectionHead}>
        <h2 id="parent-decision-title" className={styles.sectionTitle}>
          학부모 현재 생각
        </h2>
      </div>

      {loadError ? (
        <p className={styles.muted}>{loadError}</p>
      ) : decision ? (
        <>
          <p className={styles.value}>&ldquo;{getParentDecisionLabel(decision.decision)}&rdquo;</p>
          {writtenAt ? <p className={styles.meta}>{writtenAt} 작성</p> : null}
        </>
      ) : (
        // 아직 고르지 않은 것도 상태다. 재촉하는 문구를 쓰지 않는다.
        <p className={styles.muted}>아직 학부모가 선택을 남기지 않았습니다.</p>
      )}

      <p className={styles.footnote}>
        학부모가 직접 남긴 내용이라 학원에서 수정할 수 없습니다. 등록 결과와는 별개입니다.
      </p>
    </section>
  )
}
