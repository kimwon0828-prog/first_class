import type { Metadata } from "next"
import Link from "next/link"
import { unstable_noStore as noStore } from "next/cache"

import { getMyApplications } from "@/features/applications/queries/get-my-applications"
import { getMyChildren } from "@/features/children/queries/get-my-children"
import { ParentBottomNav } from "@/features/classes/ui/parent-bottom-nav"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { getExperienceTypeLabel } from "@/features/record/lib/experience-view"
import {
  formatScheduleChildLabel,
  formatScheduleTimeLabel,
  groupParentScheduleByDay,
  selectUpcomingConfirmedExperiences,
  toParentScheduleItems
} from "@/features/schedule/lib/parent-schedule"

import styles from "./page.module.css"

/*
 * 학부모 일정.
 *
 * ⚠️ 신청 목록이 아니다. "우리 아이가 다음에 언제 어디로 가야 하지?" 하나에만
 *    답한다. 그래서 학원이 확정한 앞으로의 일정만 올라온다 —
 *    확인 중인 신청도, 이미 다녀온 것도, 취소한 것도 여기 없다.
 *
 * 신청 전체를 보는 화면은 /my/applications 가 그대로 한다.
 */
export const metadata: Metadata = {
  title: "일정 | 첫수업",
  description: "확정된 체험수업과 레벨테스트 일정을 날짜 순으로 확인하세요.",
  alternates: {
    canonical: "/my/schedule"
  }
}

export const dynamic = "force-dynamic"
export const revalidate = 0

type SchedulePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function ParentSchedulePage({ searchParams }: SchedulePageProps) {
  noStore()
  // 기존 학부모 route 와 같은 정책이다. 비로그인은 sign-in 으로, returnTo 를 달고 돌아온다.
  await requireParentAccess({ returnTo: "/my/schedule" })

  const [applications, children] = await Promise.all([getMyApplications(), getMyChildren()])
  const params = await searchParams
  const requestedChildId = typeof params?.child === "string" ? params.child : null
  /*
   * 내 자녀 목록에 없는 id 는 무시한다. URL 로 남의 아이를 지목할 수 없게 한다.
   * (/record 가 쓰는 규칙과 같다.)
   */
  const selectedChildId =
    requestedChildId && children.data.some((child) => child.id === requestedChildId)
      ? requestedChildId
      : null

  const now = new Date()
  const upcoming = selectUpcomingConfirmedExperiences(applications.data, now.getTime())
  const scopedUpcoming = selectedChildId
    ? // 아이를 고르면 그 아이로 연결된 일정만 본다. 이름이 같다는 이유로 끼워 넣지 않는다.
      upcoming.filter((item) => item.childId === selectedChildId)
    : upcoming
  const dayGroups = groupParentScheduleByDay(toParentScheduleItems(scopedUpcoming), now)

  const hasMultipleChildren = children.data.length > 1
  const showChildName = hasMultipleChildren && !selectedChildId
  const selectedChild = children.data.find((child) => child.id === selectedChildId) ?? null
  const totalCount = dayGroups.reduce((sum, group) => sum + group.items.length, 0)

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>일정</h1>
          <p className={styles.subcopy}>학원이 확정한 다음 일정이에요.</p>
        </header>

        {/* 아이가 하나뿐이면 고를 것이 없다. 필터를 만들지 않는다. */}
        {hasMultipleChildren ? (
          <nav className={styles.childBar} aria-label="자녀 선택">
            <Link
              href="/my/schedule"
              className={`${styles.childChip} ${selectedChildId ? "" : styles.childChipActive}`}
              aria-current={selectedChildId ? undefined : "page"}
            >
              전체
            </Link>
            {children.data.map((child) => (
              <Link
                key={child.id}
                href={`/my/schedule?child=${child.id}`}
                className={`${styles.childChip} ${
                  selectedChildId === child.id ? styles.childChipActive : ""
                }`}
                aria-current={selectedChildId === child.id ? "page" : undefined}
              >
                {child.name}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className={styles.content}>
          {/* 조회 실패와 "일정 없음" 은 다른 것이다. 실패를 없음으로 접지 않는다. */}
          {applications.error ? (
            <section className={styles.stateCard}>
              <p className={styles.stateTitle}>일정을 불러오지 못했어요.</p>
              <p className={styles.stateDesc}>다시 시도해 주세요.</p>
              <Link href="/my/schedule" className={styles.retryLink}>
                다시 불러오기
              </Link>
            </section>
          ) : totalCount === 0 ? (
            <section className={styles.emptyState}>
              <p className={styles.emptyTitle}>
                {selectedChild ? `${selectedChild.name}의 예정된 첫수업이 없어요.` : "예정된 첫수업이 없어요."}
              </p>
              <p className={styles.emptyDesc}>홈에서 아이에게 맞는 체험수업을 찾아보세요.</p>
              <Link href="/" className={styles.primaryButton}>
                수업 찾아보기
              </Link>
            </section>
          ) : (
            <>
              <p className={styles.resultMeta}>예정된 일정 {totalCount}개</p>
              {dayGroups.map((group) => (
                <section key={group.dateKey} className={styles.dayGroup} aria-label={group.dateLabel}>
                  <h2 className={styles.dayHeading}>
                    {group.relativeLabel ? (
                      <span className={styles.dayRelative}>{group.relativeLabel}</span>
                    ) : null}
                    <span className={styles.dayDate}>{group.dateLabel}</span>
                  </h2>

                  <ul className={styles.scheduleList}>
                    {group.items.map((item) => {
                      const timeLabel = formatScheduleTimeLabel(item.startAt)

                      return (
                        <li key={item.experienceId}>
                          <Link href={item.href} className={styles.scheduleCard}>
                            <span className={styles.scheduleTime}>{timeLabel}</span>
                            <span className={styles.scheduleBody}>
                              <span className={styles.scheduleTopRow}>
                                <span className={styles.typeBadge}>
                                  {getExperienceTypeLabel(item.programType)}
                                </span>
                                <span className={styles.statusBadge}>확정됨</span>
                              </span>
                              <span className={styles.scheduleTitle}>
                                {item.classTitle ?? "수업 정보 준비 중"}
                              </span>
                              {item.academyName ? (
                                <span className={styles.scheduleAcademy}>{item.academyName}</span>
                              ) : null}
                              {/* 아이가 여럿일 때만 누구의 일정인지 밝힌다. */}
                              {showChildName ? (
                                <span className={styles.scheduleChild}>
                                  {item.childGrade ? `${item.childName} · ${item.childGrade}` : item.childName}
                                </span>
                              ) : null}
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}

              {hasMultipleChildren && selectedChild ? (
                <p className={styles.footNote}>{formatScheduleChildLabel(selectedChild)}의 일정만 보고 있어요.</p>
              ) : null}
            </>
          )}
        </div>
      </div>

      <ParentBottomNav />
    </main>
  )
}
