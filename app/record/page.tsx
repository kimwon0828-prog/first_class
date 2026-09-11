import Link from "next/link"
import { unstable_noStore as noStore } from "next/cache"

import { getMyApplications } from "@/features/applications/queries/get-my-applications"
import { getMyChildren } from "@/features/children/queries/get-my-children"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { RecordTimeline } from "@/features/record/ui/record-timeline"
import { RecordBottomNav } from "@/features/record/ui/record-bottom-nav"
import styles from "./page.module.css"

// 아이의 교육 기록.
//
// EducationRecord table 은 아직 없다. 기존 trial_applications 를 학부모 관점으로
// 다시 읽는 projection 이며, application id 를 그대로 경험 identity 로 쓴다.
//
// 자녀 전환은 이번 단계에서 query parameter 하나로만 둔다. Global Child Context 가
// 생기면 이 ?child= 를 그대로 대체할 수 있다.

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function RecordPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  noStore()
  await requireParentAccess({ returnTo: "/record" })

  const [applications, children] = await Promise.all([getMyApplications(), getMyChildren()])
  const params = await searchParams
  const requestedChildId = typeof params.child === "string" ? params.child : null
  // 내 자녀 목록에 없는 id 는 무시한다. URL 로 남의 아이를 지목할 수 없게 한다.
  const selectedChildId =
    requestedChildId && children.data.some((child) => child.id === requestedChildId)
      ? requestedChildId
      : null

  const experiences = selectedChildId
    ? // 특정 아이를 고르면 그 아이로 연결된 경험만 본다. child_id 가 없는 legacy 신청을
      // 이름이 같다는 이유로 끼워 넣지 않는다 — 기록에서 추측은 오류보다 나쁘다.
      applications.data.filter((item) => item.childId === selectedChildId)
    : applications.data

  const selectedChild = children.data.find((child) => child.id === selectedChildId) ?? null
  const hasMultipleChildren = children.data.length > 1
  const onlyChild = children.data.length === 1 ? children.data[0] : null

  const emptyTitle = selectedChild
    ? `${selectedChild.name}의 첫수업 기록이 아직 없어요.`
    : "아직 첫수업 기록이 없어요."

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>기록</h1>
          <p className={styles.subcopy}>아이의 첫수업 경험을 모아볼 수 있어요.</p>
        </header>

        {hasMultipleChildren ? (
          <nav className={styles.childBar} aria-label="자녀 선택">
            <Link
              href="/record"
              className={`${styles.childChip} ${selectedChildId ? "" : styles.childChipActive}`}
              aria-current={selectedChildId ? undefined : "true"}
            >
              전체
            </Link>
            {children.data.map((child) => (
              <Link
                key={child.id}
                href={`/record?child=${child.id}`}
                className={`${styles.childChip} ${
                  selectedChildId === child.id ? styles.childChipActive : ""
                }`}
                aria-current={selectedChildId === child.id ? "true" : undefined}
              >
                {child.name}
              </Link>
            ))}
          </nav>
        ) : onlyChild ? (
          <p className={styles.childSingle}>
            {onlyChild.name} · {onlyChild.grade}
          </p>
        ) : null}

        <div className={styles.content}>
          {applications.error ? (
            <section className={`${styles.card} ${styles.dangerCard}`}>
              <p className={styles.dangerText}>{applications.error}</p>
              <Link href="/classes" className={styles.link}>
                수업 둘러보기
              </Link>
            </section>
          ) : null}

          {!applications.error && experiences.length === 0 ? (
            <section className={styles.emptyState}>
              <div className={styles.emptyInner}>
                <h2 className={styles.emptyTitle}>{emptyTitle}</h2>
                <p className={styles.emptyDesc}>
                  아이에게 맞는 수업을 찾아 첫 경험을 시작해보세요.
                </p>
                <Link href="/classes" className={styles.primaryButton}>
                  수업 찾기
                </Link>
              </div>
            </section>
          ) : null}

          {!applications.error && experiences.length > 0 ? (
            <RecordTimeline experiences={experiences} showChildName={!selectedChildId} />
          ) : null}
        </div>
      </div>

      <RecordBottomNav />
    </main>
  )
}
