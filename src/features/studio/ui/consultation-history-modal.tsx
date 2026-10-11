import { getConsultationChannelLabel, getConsultationSentimentLabel } from "@/features/studio/lib/consultation-log-options"
import { formatSeoulDateTime } from "@/features/studio/lib/seoul-datetime"
import { STUDIO_REGISTRATION_STATUS_LABELS } from "@/features/studio/lib/application-status-labels"
import { getTrialResultUnregisteredReasonLabel } from "@/features/studio/lib/trial-result-options"
import { formatRegularSchedulePreference, parseRegularSchedulePreference } from "@/features/studio/lib/regular-schedule-preference"
import type { StudioConsultationLog } from "@/shared/lib/db/adapter"
import styles from "./application-trial-result-workflow.module.css"

const isEditedLog = (item: StudioConsultationLog) => {
  return new Date(item.updatedAt).getTime() > new Date(item.createdAt).getTime()
}

const getConsultationMeta = (item: StudioConsultationLog) => {
  if (item.activityType === "LEGACY_IMPORT") {
    return ["이전 연락 기록", formatSeoulDateTime(item.occurredAt || item.createdAt)].filter(Boolean).join(" · ")
  }

  const occurredAt = formatSeoulDateTime(item.occurredAt)
  const channelLabel = getConsultationChannelLabel(item.channel)

  return [occurredAt, channelLabel].filter((value): value is string => Boolean(value)).join(" · ")
}

/** Historical records only. Never edits, creates or merges legacy consultation data. */
export function PreviousConsultationRecords({ logs }: { logs: StudioConsultationLog[] }) {
  if (!logs.length) return null
  return <details className={styles.systemDisclosure} aria-label="이전 상담 기록">
    <summary className={styles.disclosureSummary}>이전 상담 기록 · {logs.length}건</summary>
    <div className={styles.consultationHistoryList}>
              {logs.map((item) => (
                <article
                  key={item.id}
                  className={`${styles.consultationHistoryItem} ${
                    item.activityType === "LEGACY_IMPORT" ? styles.consultationHistoryItemLegacy : ""
                  }`}
                >
                  <div className={styles.consultationHistoryHeader}>
                    <div>
                      <p className={styles.consultationHistoryMeta}>{getConsultationMeta(item)}</p>
                      {isEditedLog(item) ? (
                        <span className={styles.consultationHistoryEditedBadge}>수정됨</span>
                      ) : null}
                    </div>

                  </div>

                  {item.activityType === "CONSULTATION" && item.sentiment ? (
                    <span className={styles.consultationSentimentBadge}>
                      {getConsultationSentimentLabel(item.sentiment)}
                    </span>
                  ) : null}

                  <p className={styles.consultationHistoryNote}>
                    {item.note ??
                      (item.activityType === "LEGACY_IMPORT"
                        ? "과거 방식에서 이관된 상담 내용"
                        : "기록 없음")}
                  </p>

                  {/*
                    그 상담 시점의 등록 상태. Case 의 현재 상태가 아니라 이 상담이 남긴 스냅샷이다.
                    상담 4건이면 4건이 각자 다른 값을 보여야 한다.
                    legacy 기록은 null 일 수 있는데, 미등록 사유가 있다고 해서 미등록이라고
                    추론하지 않는다 — 값이 없으면 줄을 만들지 않는다.
                  */}
                  {item.registrationStatusSnapshot ? (
                    <div className={styles.consultationNextContact}>
                      <span className={styles.consultationNextContactLabel}>등록 상태</span>
                      <span className={styles.consultationNextContactValue}>
                        {STUDIO_REGISTRATION_STATUS_LABELS[item.registrationStatusSnapshot]}
                      </span>
                    </div>
                  ) : null}

                  {/*
                    그 상담 시점의 미등록 사유. Case 의 현재 사유와 달리 상담 재개로 지워지지 않는다.
                    사유 없이 미등록으로 남은 legacy 기록에는 이 줄을 만들지 않는다.
                  */}
                  {(() => {
                    const reasonLabel = getTrialResultUnregisteredReasonLabel(
                      item.unregisteredReasonSnapshot
                    )

                    if (!reasonLabel) {
                      return null
                    }

                    return (
                      <div className={styles.consultationNextContact}>
                        <span className={styles.consultationNextContactLabel}>등록하지 않은 사유</span>
                        <span className={styles.consultationNextContactValue}>
                          {[
                            reasonLabel,
                            item.unregisteredReasonSnapshot === "other"
                              ? item.unregisteredReasonNoteSnapshot
                              : null
                          ]
                            .filter((value): value is string => Boolean(value))
                            .join(" · ")}
                        </span>
                      </div>
                    )
                  })()}

                  {/*
                    그 상담 시점의 희망 일정. 읽을 수 없는 값이어도 화면을 죽이지 않고
                    "표시할 수 없음" 으로 알린다 — 원본은 그대로 둔다.
                  */}
                  {(() => {
                    const parsed = parseRegularSchedulePreference(
                      item.regularSchedulePreferenceSnapshot
                    )

                    if (parsed.status === "empty") {
                      return null
                    }

                    return (
                      <div className={styles.consultationNextContact}>
                        <span className={styles.consultationNextContactLabel}>희망 일정</span>
                        <span className={styles.consultationNextContactValue}>
                          {parsed.status === "valid"
                            ? formatRegularSchedulePreference(parsed.value)
                            : "표시할 수 없는 기록"}
                          {parsed.status === "valid" && item.regularSchedulePreferenceNoteSnapshot
                            ? ` · ${item.regularSchedulePreferenceNoteSnapshot}`
                            : ""}
                        </span>
                      </div>
                    )
                  })()}

                  {item.timeFlexibility ? <p className={styles.fieldHint}>시간 유연성 · {({exact: "해당 시간만 가능", plus_minus_30: "±30분 가능", same_day_flexible: "같은 요일이면 시간 조정 가능", flexible: "요일·시간 협의 가능"} as Record<string, string>)[item.timeFlexibility]}</p> : null}
                  {item.nextContactAt ? (
                    <div className={styles.consultationNextContact}>
                      <span className={styles.consultationNextContactLabel}>다음 연락</span>
                      <span className={styles.consultationNextContactValue}>
                        {formatSeoulDateTime(item.nextContactAt)}
                      </span>
                    </div>
                  ) : null}
                </article>
              ))}
    </div>
  </details>
}
