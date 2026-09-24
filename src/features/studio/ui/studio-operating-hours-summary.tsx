"use client"

import type { OperatingHoursSummary } from "@/features/studio/lib/studio-operating-hours"

import styles from "./studio-operating-hours-summary.module.css"

type StudioOperatingHoursSummaryProps = {
  title: string
  variant?: "card" | "inline"
  emptyDescription: string
  summary: OperatingHoursSummary
  actionLabel: string
  onOpen: () => void
}

export const StudioOperatingHoursSummary = ({
  title,
  variant = "card",
  emptyDescription,
  summary,
  actionLabel,
  onOpen
}: StudioOperatingHoursSummaryProps) => {
  return (
    <section className={`${styles.card} ${variant === "inline" ? styles.inline : ""}`}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>{title}</h3>
          {summary.hasValue ? (
            <p className={styles.period}>{summary.periodLabel}</p>
          ) : (
            <p className={styles.description}>{emptyDescription}</p>
          )}
        </div>
        <button type="button" className={styles.actionButton} onClick={onOpen}>
          {actionLabel}
        </button>
      </div>

      {summary.hasValue ? (
        <div className={styles.summaryList}>
          {variant === "card" ? <div className={styles.summaryHeading}>기본 운영시간</div> : null}
          {summary.groups.map((group) => (
            <article key={group.id} className={styles.groupCard}>
              <strong className={styles.groupWeekdays}>{group.weekdayLabel}</strong>
              <div className={styles.timeList}>
                {group.timeLabels.map((label) => (
                  <p key={`${group.id}-${label}`} className={styles.timeLabel}>
                    {label}
                  </p>
                ))}
              </div>
              <p className={styles.capacity}>{group.capacityLabel}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}
