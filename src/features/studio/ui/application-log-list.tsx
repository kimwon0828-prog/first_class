import type { ApplicationLogEntry } from "@/shared/lib/db/adapter"

import styles from "./application-log-list.module.css"

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value))

const STATUS_LABELS = {
  new: "신규",
  reviewing: "검토 중",
  confirmed: "확정",
  completed: "완료",
  canceled: "취소"
}

const getLogTitle = (item: ApplicationLogEntry) => {
  if (item.fromStatus === item.toStatus) {
    return "운영 기록 저장"
  }

  return `${item.fromStatus ? STATUS_LABELS[item.fromStatus] : "생성"} -> ${STATUS_LABELS[item.toStatus]}`
}

type ApplicationLogListProps = {
  items: ApplicationLogEntry[]
}

export const ApplicationLogList = ({ items }: ApplicationLogListProps) => {
  return (
    <section className={styles.card} aria-label="처리 이력">
      <header className={styles.header}>
        <h2 className={styles.title}>처리 이력</h2>
        <p className={styles.description}>상태 변경과 운영 기록 저장 이력을 확인해요.</p>
      </header>

      {items.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>아직 기록된 처리 이력이 없어요.</p>
          <p className={styles.emptyDescription}>상태 변경 또는 운영 기록 저장 시 이곳에 기록됩니다.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {items.map((item) => (
            <article key={item.id} className={styles.logCard}>
              <div className={styles.logTop}>
                <p className={styles.meta}>{formatDateTime(item.createdAt)}</p>
                <span className={styles.logTitle}>{getLogTitle(item)}</span>
              </div>
              <p className={styles.body}>{item.note ?? "상태 변경 기록"}</p>
              {item.actorName ? <p className={styles.subtle}>{item.actorName}</p> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
