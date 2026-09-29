import { formatSeoulDateTime } from "@/shared/lib/seoul-datetime"
import { feedbackChipLabel, type StudioExperienceFeedback } from "../lib/experience-feedback"
import styles from "./feedback.module.css"
export function StudioFeedback({ feedback, error }: { feedback: StudioExperienceFeedback | null; error: boolean }) {
  if (error) return <p role="status" className={styles.description}>학부모 체험 피드백을 불러오지 못했어요.</p>
  if (!feedback) return null
  return <section className={styles.studio} aria-label="학부모 체험 피드백">
    <h2 className={styles.title}>학부모 체험 피드백</h2>
    <div className={styles.saved}>
      {feedback.selectedChipIds.length > 0 ? <div><p className={styles.label}>선택한 항목</p><ul className={styles.chips}>{feedback.selectedChipIds.map(id => <li className={styles.tag} key={id}>{feedbackChipLabel(id)}</li>)}</ul></div> : null}
      {feedback.privateNote ? <div><p className={styles.label}>비공개 의견</p><p className={styles.privateNote}>{feedback.privateNote}</p><p className={styles.hint}>해당 학원에만 전달된 의견입니다.</p></div> : null}
      <div><p className={styles.hint}>작성 <time dateTime={feedback.createdAt}>{formatSeoulDateTime(feedback.createdAt)}</time></p>
        <p className={styles.hint}>수정 <time dateTime={feedback.updatedAt}>{formatSeoulDateTime(feedback.updatedAt)}</time></p></div>
    </div>
  </section>
}
