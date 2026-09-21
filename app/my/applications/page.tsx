import type { Metadata } from "next"
import Link from "next/link"
import { unstable_noStore as noStore } from "next/cache"

import { resolveApplicationStatusDisplay } from "@/features/applications/lib/application-status-display"
import {
  hasAnyApplicationStatusItem,
  selectCanceledApplications,
  selectInProgressApplications
} from "@/features/applications/lib/parent-application-split"
import { getMyApplications } from "@/features/applications/queries/get-my-applications"
import { ParentBottomNav } from "@/features/classes/ui/parent-bottom-nav"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { getExperienceTypeLabel } from "@/features/record/lib/experience-view"
import { formatScheduleDateLabel, formatScheduleTimeLabel } from "@/features/schedule/lib/parent-schedule"
import type { ParentApplicationSummary } from "@/shared/lib/db/adapter"

import styles from "./page.module.css"

/*
 * 신청 현황.
 *
 * ⚠️ 네 화면의 역할을 섞지 않는다.
 *    여기          내가 신청한 것이 지금 어떻게 진행되고 있지?
 *    /my/schedule  다음 수업이 언제지?      (확정된 미래만)
 *    /record       아이가 무엇을 경험했지?   (실제로 다녀온 것만)
 *    /notifications의 리포트 안내   내가 지금 해야 할 일은?
 *
 * ⚠️ completed 는 여기 오지 않는다. 그건 기록이다.
 *    canceled 는 여기 남는다 — 내가 취소한 신청도 다시 확인할 수 있어야 한다.
 */
export const metadata: Metadata = {
  title: "신청 현황 | 첫수업",
  description: "신청한 체험수업과 레벨테스트가 지금 어디까지 진행됐는지 확인하세요.",
  alternates: {
    canonical: "/my/applications"
  }
}

export const dynamic = "force-dynamic"
export const revalidate = 0

/** 값이 없으면 줄을 만들지 않는다. 없는 일정을 지어내지 않는다. */
const formatSlot = (value: string | null) => {
  if (!value) {
    return null
  }

  const date = formatScheduleDateLabel(value)
  const time = formatScheduleTimeLabel(value)
  return date && time ? `${date} ${time}` : null
}

const ApplicationCard = ({
  item,
  showChildName,
  muted
}: {
  item: ParentApplicationSummary
  showChildName: boolean
  muted: boolean
}) => {
  /*
   * 상태 문구는 기존 canonical helper 가 정한다.
   * 진행률 · 응답 예정시간 · 우선순위 같은 값은 만들지 않는다 — 그런 데이터가 없다.
   */
  const statusDisplay = resolveApplicationStatusDisplay({
    status: item.status,
    scheduledAt: item.confirmedSlotAt
  })
  const requestedLabel = formatSlot(item.requestedSlotAt)
  const confirmedLabel = formatSlot(item.confirmedSlotAt)

  return (
    <li>
      <Link
        href={`/record/${item.id}`}
        className={`${styles.applicationCard} ${muted ? styles.applicationCardMuted : ""}`}
      >
        <span className={styles.cardTopRow}>
          <span className={styles.typeBadge}>{getExperienceTypeLabel(item.classProgramType)}</span>
          <span className={`${styles.statusBadge} ${muted ? styles.statusBadgeMuted : ""}`}>
            {statusDisplay.label}
          </span>
        </span>

        <span className={styles.cardTitle}>{item.classTitle ?? "수업 정보 준비 중"}</span>
        {item.academyName ? <span className={styles.cardAcademy}>{item.academyName}</span> : null}
        {showChildName ? (
          <span className={styles.cardChild}>
            {item.childGrade ? `${item.childName} · ${item.childGrade}` : item.childName}
          </span>
        ) : null}

        <span className={styles.slotList}>
          {requestedLabel ? (
            <span className={styles.slotRow}>
              <span className={styles.slotLabel}>희망</span>
              <span className={styles.slotValue}>{requestedLabel}</span>
            </span>
          ) : null}
          {/* 취소된 신청의 확정 시각을 예정 일정처럼 강조하지 않는다. */}
          {confirmedLabel ? (
            <span className={styles.slotRow}>
              <span className={styles.slotLabel}>확정</span>
              <span className={muted ? styles.slotValue : styles.slotValueStrong}>{confirmedLabel}</span>
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  )
}

export default async function MyApplicationsPage() {
  noStore()
  await requireParentAccess({ returnTo: "/my/applications" })

  const applications = await getMyApplications()
  const inProgress = selectInProgressApplications(applications.data)
  const canceled = selectCanceledApplications(applications.data)
  const hasAny = hasAnyApplicationStatusItem(applications.data)
  const showChildName = new Set(applications.data.map((item) => item.childId ?? item.childName)).size > 1
  const hasConfirmed = inProgress.some((item) => item.status === "confirmed")

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/my" className={styles.backButton} aria-label="뒤로가기">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <h1 className={styles.title}>신청 현황</h1>
          <span aria-hidden="true" />
        </header>

        <div className={styles.content}>
          <p className={styles.subcopy}>신청한 수업이 지금 어디까지 왔는지 확인할 수 있어요.</p>
          {/* 조회 실패와 "신청 없음" 은 다른 것이다. */}
          {applications.error ? (
            <section className={styles.stateCard}>
              <p className={styles.stateTitle}>신청 현황을 불러오지 못했어요.</p>
              <p className={styles.stateDesc}>잠시 후 다시 시도해 주세요.</p>
              <Link href="/my/applications" className={styles.retryLink}>
                다시 불러오기
              </Link>
            </section>
          ) : !hasAny ? (
            <section className={styles.emptyState}>
              <p className={styles.emptyTitle}>진행 중인 신청이 없어요.</p>
              <p className={styles.emptyDesc}>마음에 드는 수업을 찾아 첫 체험을 신청해 보세요.</p>
              <Link href="/" className={styles.primaryButton}>
                수업 찾아보기
              </Link>
            </section>
          ) : (
            <>
              {inProgress.length > 0 ? (
                <section className={styles.group} aria-label="진행 중인 신청">
                  <div className={styles.groupHeading}>
                    <h2 className={styles.groupTitle}>진행 중 {inProgress.length}건</h2>
                    {/* 확정된 일정 전체는 일정 화면이 맡는다. */}
                    {hasConfirmed ? (
                      <Link href="/my/schedule" className={styles.groupLink}>
                        일정 보기
                      </Link>
                    ) : null}
                  </div>
                  <ul className={styles.applicationList}>
                    {inProgress.map((item) => (
                      <ApplicationCard
                        key={item.id}
                        item={item}
                        showChildName={showChildName}
                        muted={false}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}

              {canceled.length > 0 ? (
                <section className={styles.group} aria-label="취소한 신청">
                  <div className={styles.groupHeading}>
                    <h2 className={styles.groupTitle}>취소 {canceled.length}건</h2>
                  </div>
                  <ul className={styles.applicationList}>
                    {canceled.map((item) => (
                      <ApplicationCard
                        key={item.id}
                        item={item}
                        showChildName={showChildName}
                        muted
                      />
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>

      <ParentBottomNav />
    </main>
  )
}
