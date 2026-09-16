import Link from "next/link"
import { unstable_noStore as noStore } from "next/cache"

import { getMyApplications } from "@/features/applications/queries/get-my-applications"
import { getMyChildren } from "@/features/children/queries/get-my-children"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { selectCompletedExperiences } from "@/features/applications/lib/parent-application-split"
import { getParentExperienceSignals } from "@/features/record/queries/get-parent-experience-signals"
import { RecordExperienceList } from "@/features/record/ui/record-experience-list"
import { ParentBottomNav } from "@/features/classes/ui/parent-bottom-nav"
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

  /*
   * 기록은 "실제로 진행된 교육 경험" 만이다.
   *
   * 확인 중 · 확정 · 취소는 신청 현황(/my/applications)의 몫이고, 확정된 미래
   * 일정은 /my/schedule 이 맡는다. 여기서 그것들을 섞으면 "무엇을 경험했는가" 라는
   * 질문에 답하지 못한다.
   *
   * ⚠️ 목록 기준일 뿐이다. /record/[experienceId] 의 접근 권한은 그대로다.
   */
  const completed = selectCompletedExperiences(applications.data)
  const experiences = selectedChildId
    ? // 특정 아이를 고르면 그 아이로 연결된 경험만 본다. child_id 가 없는 legacy 신청을
      // 이름이 같다는 이유로 끼워 넣지 않는다 — 기록에서 추측은 오류보다 나쁘다.
      completed.filter((item) => item.childId === selectedChildId)
    : completed

  /*
   * 리포트 · 내 생각이 있는지는 /my/actions 와 같은 조회로 읽는다.
   * 실패하면 배지를 그리지 않는다 — "리포트 없음" 이라고 단정하지 않는다.
   */
  const signals = await getParentExperienceSignals(experiences)

  const selectedChild = children.data.find((child) => child.id === selectedChildId) ?? null
  const hasMultipleChildren = children.data.length > 1
  const onlyChild = children.data.length === 1 ? children.data[0] : null
  // 프로필은 아이 하나를 가리켜야 열 수 있다. 고른 아이가 있으면 그 아이,
  // 아이가 하나뿐이면 그 아이다.
  const profileChild = selectedChild ?? onlyChild

  const emptyTitle = selectedChild
    ? `${selectedChild.name}의 교육 기록이 아직 없어요.`
    : "아직 쌓인 교육 기록이 없어요."

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>기록</h1>
          <p className={styles.subcopy}>우리 아이가 경험한 첫수업을 모아볼 수 있어요.</p>
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

        {/*
          교육 프로필 진입점.

          아이가 정해졌을 때만 보인다 — "전체" 로 보고 있을 때는 어느 아이의
          프로필인지 정할 수 없고, 이름만 같은 아이들의 경험을 합쳐 보여 주는
          것은 이 제품이 하지 않는 일이다.

          요약 수치를 여기 미리 그리지 않는다. 근거 없이 숫자만 먼저 보이면
          그게 점수처럼 읽힌다.
        */}
        {profileChild ? (
          <Link href={`/record/profile?child=${profileChild.id}`} className={styles.profileCta}>
            <span className={styles.profileCtaLabel}>{profileChild.name} 교육 프로필</span>
            <span className={styles.profileCtaHint}>
              발행된 리포트에 적힌 관찰을 모아서 봐요
            </span>
          </Link>
        ) : null}

        <div className={styles.content}>
          {/* 조회 실패와 "기록 없음" 은 다른 것이다. 실패를 없음으로 접지 않는다. */}
          {applications.error ? (
            <section className={styles.stateCard}>
              <p className={styles.stateTitle}>교육 기록을 불러오지 못했어요.</p>
              <p className={styles.stateDesc}>잠시 후 다시 시도해 주세요.</p>
              <Link href="/record" className={styles.retryLink}>
                다시 불러오기
              </Link>
            </section>
          ) : experiences.length === 0 ? (
            <section className={styles.emptyState}>
              <div className={styles.emptyInner}>
                <h2 className={styles.emptyTitle}>{emptyTitle}</h2>
                <p className={styles.emptyDesc}>
                  체험수업을 다녀오면 아이의 경험이 여기에 차곡차곡 쌓여요.
                </p>
                <Link href="/" className={styles.primaryButton}>
                  첫수업 찾아보기
                </Link>
              </div>
            </section>
          ) : (
            <section className={styles.historySection} aria-label="지금까지의 첫수업">
              <div className={styles.historyHeading}>
                <h2 className={styles.historyTitle}>지금까지의 첫수업</h2>
                <span className={styles.historyCount}>{experiences.length}개</span>
              </div>

              <RecordExperienceList
                experiences={experiences}
                showChildName={!selectedChildId}
                reportedExperienceIds={signals.error ? undefined : signals.reportedExperienceIds}
                decidedExperienceIds={signals.error ? undefined : signals.decidedExperienceIds}
              />
            </section>
          )}
        </div>
      </div>

      <ParentBottomNav />
    </main>
  )
}
