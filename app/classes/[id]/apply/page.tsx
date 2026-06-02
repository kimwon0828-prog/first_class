import Link from "next/link"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { requireSession } from "@/features/auth/lib/session"
import { getClassAvailableSlots } from "@/features/applications/queries/get-class-available-slots"
import { getPublicClassDetail } from "@/features/classes/queries/get-public-class-detail"
import { getMyChildren } from "@/features/children/queries/get-my-children"
import { ApplyForm } from "@/features/applications/ui/apply-form"
import styles from "./page.module.css"

type ApplyPageProps = {
  params: Promise<{
    id: string
  }>
}

const formatPrice = (price: number) => {
  if (price <= 0) {
    return "무료"
  }

  return `${price.toLocaleString("ko-KR")}원`
}

export default async function ClassApplyPage({ params }: ApplyPageProps) {
  const resolvedParams = await params
  const returnTo = `/classes/${resolvedParams.id}/apply`
  await requireSession(`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`)
  const profile = await getMyProfile()
  const [{ data: classItem, error }, { data: slots, error: slotsError }, { data: children, error: childrenError }] =
    await Promise.all([
      getPublicClassDetail(resolvedParams.id),
      getClassAvailableSlots(resolvedParams.id),
      profile?.role === "parent"
        ? getMyChildren()
        : Promise.resolve({ data: [], error: null })
    ])

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topBar}>
          <Link
            href={`/classes/${resolvedParams.id}`}
            className={styles.iconButton}
            aria-label="뒤로가기"
          >
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
          <h1 className={styles.pageTitle}>첫수업 신청</h1>
        </header>

        <div className={styles.stack}>
          {error ? (
            <section className={`${styles.card} ${styles.dangerCard}`}>
              <p className={styles.dangerText}>{error}</p>
              <Link href="/classes" className={styles.link}>
                수업 목록으로 이동
              </Link>
            </section>
          ) : null}

          {!error && !classItem ? (
            <section className={styles.card}>
              <p className={styles.summaryMeta}>신청할 수업 정보를 찾을 수 없습니다.</p>
            </section>
          ) : null}

          {!error && classItem ? (
            <>
              {!profile || profile.role !== "parent" ? (
                <section className={`${styles.card} ${styles.dangerCard}`}>
                  <p className={styles.dangerText}>학부모(parent) 계정만 신청할 수 있습니다.</p>
                  <Link href={`/classes/${resolvedParams.id}`} className={styles.link}>
                    수업 상세로 돌아가기
                  </Link>
                </section>
              ) : null}

              <section className={styles.card}>
                <h2 className={styles.cardTitle}>신청할 수업</h2>
                <p className={styles.summaryName}>{classItem.title}</p>
                <p className={styles.summaryMeta}>
                  {classItem.teacherDisplayName ?? classItem.teacherName ?? "정보 준비 중"} ·{" "}
                  {classItem.region}
                </p>
                <p className={styles.summaryMeta}>{classItem.subject}</p>
                <p className={styles.summaryPrice}>{formatPrice(classItem.trialPrice)}</p>
              </section>

              {profile?.role === "parent" ? (
                <ApplyForm
                  classId={classItem.id}
                  availableSlots={slots}
                  slotsError={slotsError}
                  childProfiles={children}
                  childProfilesError={childrenError}
                  parentNameDefault={profile.name}
                  parentPhoneDefault={profile.phone}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </main>
  )
}
