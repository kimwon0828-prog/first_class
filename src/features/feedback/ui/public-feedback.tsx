import { feedbackChipLabel, type PublicFeedbackSummary } from "../lib/experience-feedback"
import styles from "./feedback.module.css"
export function PublicFeedback({ summary, scope, className }: { summary: PublicFeedbackSummary; scope: "CLASS" | "ACADEMY"; className?: string }) {
  if (!summary.chips.length) return null
  return <section className={className} data-feedback-public={scope}>
    <h2 className={styles.title}>{scope === "CLASS" ? "체험한 학부모의 이야기" : "체험 학부모 피드백"}</h2>
    <p className={styles.description}>{scope === "CLASS" ? "실제로 체험한 학부모가 선택한 항목이에요." : "이 학원의 체험수업·레벨테스트에서 선택된 피드백이에요."}</p>
    <ul className={styles.chips}>{summary.chips.map(chip => <li key={chip.id} className={styles.tag}><span>{feedbackChipLabel(chip.id)}</span><span className={styles.tagCount}>{chip.count}</span></li>)}</ul>
    <p className={styles.hint}>체험 신청별 선택을 기준으로 집계했어요.</p>
  </section>
}
