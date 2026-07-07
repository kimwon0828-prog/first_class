import Link from "next/link"

import { formatStoredTargetGrades } from "@/shared/constants/grade-options"
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

const resolveApplyPageTitle = (programType: string | null | undefined) => {
  if (programType === "level_test") {
    return "레벨테스트 신청"
  }

  return "체험수업 신청"
}

const normalizeTeacherName = (value: string | null | undefined) => {
  const trimmed = value?.trim() || ""
  if (!trimmed) {
    return null
  }

  return trimmed.endsWith("선생님") ? trimmed.slice(0, -4).trim() : trimmed
}

const resolveApplyCardSubtitle = (academyName: string | null, teacherName: string | null) => {
  const normalizedTeacherName = normalizeTeacherName(teacherName)

  if (academyName && normalizedTeacherName) {
    return `${academyName} · ${normalizedTeacherName} 선생님`
  }

  if (academyName) {
    return academyName
  }

  if (normalizedTeacherName) {
    return `${normalizedTeacherName} 선생님`
  }

  return "정보 준비 중"
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
  const pageTitle = resolveApplyPageTitle(classItem?.programType)
  const academyName =
    [classItem?.organization?.name?.trim() || null, classItem?.organization?.branchName?.trim() || null]
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .trim() || null
  const teacherName = classItem?.teacherDisplayName?.trim() || classItem?.teacherName?.trim() || null
  const cardSubtitle = resolveApplyCardSubtitle(academyName, teacherName)

  return (
    <main
      className={styles.page}
      style={{ background: "#ffffff", minHeight: "100dvh", width: "100%", overflowX: "hidden" }}
    >
      <div
        className={styles.shell}
        style={{
          boxSizing: "border-box",
          width: "100%",
          maxWidth: 430,
          margin: "0 auto",
          minHeight: "100dvh",
          background: "#ffffff",
          padding: "calc(14px + env(safe-area-inset-top)) 24px calc(110px + env(safe-area-inset-bottom))"
        }}
      >
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
          <h1 className={styles.pageTitle}>{pageTitle}</h1>
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
              {!profile ? (
                <section className={`${styles.card} ${styles.dangerCard}`}>
                  <p className={styles.dangerText}>신청 권한을 확인할 수 없습니다.</p>
                  <Link href={`/classes/${resolvedParams.id}`} className={styles.link}>
                    수업 상세로 돌아가기
                  </Link>
                </section>
              ) : profile.role === "academy" || profile.role === "admin" ? (
                <section className={`${styles.card} ${styles.dangerCard}`}>
                  <p className={styles.dangerText}>
                    학원 계정은 체험수업을 신청할 수 없어요. 수업 관리는 스튜디오에서 진행해주세요.
                  </p>
                  <Link href="/studio" className={styles.link}>
                    스튜디오로 이동
                  </Link>
                </section>
              ) : null}

              <section className={styles.card}>
                <h2 className={styles.cardTitle}>신청할 수업</h2>
                <p className={styles.summaryName}>{classItem.title}</p>
                <p className={styles.summaryMeta}>{cardSubtitle}</p>
                <p className={styles.summaryMeta}>{classItem.subject}</p>
                <p className={styles.summaryMeta}>대상 학년: {formatStoredTargetGrades(classItem.targetAge)}</p>
                <p className={styles.summaryPrice}>{formatPrice(classItem.trialPrice)}</p>
              </section>

              {profile?.role === "parent" ? (
                <ApplyForm
                  classId={classItem.id}
                  classTargetAge={classItem.targetAge}
                  availableSlots={slots}
                  slotsError={slotsError}
                  childProfiles={children}
                  childProfilesError={childrenError}
                  parentName={profile.name}
                  parentPhone={profile.phone}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </main>
  )
}
