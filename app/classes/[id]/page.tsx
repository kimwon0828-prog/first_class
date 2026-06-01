import Link from "next/link"
import Image from "next/image"

import { getSession } from "@/features/auth/lib/session"
import { getPublicClassDetail } from "@/features/classes/queries/get-public-class-detail"
import { BookmarkButton } from "@/features/favorites/ui/bookmark-button"
import { normalizeAcademyArea } from "@/shared/config/academy-areas"
import styles from "./page.module.css"

type ClassDetailPageProps = {
  params: Promise<{
    id: string
  }>
  searchParams?: Promise<{
    region?: string
  }>
}

const formatPrice = (price: number) => {
  if (price <= 0) {
    return "무료"
  }

  return `${price.toLocaleString("ko-KR")}원`
}

const formatProgramType = (value: string) => (value === "level_test" ? "레벨테스트" : "체험수업")

export default async function ClassDetailPage({ params, searchParams }: ClassDetailPageProps) {
  const resolvedParams = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const rawRegionParam =
    typeof resolvedSearchParams?.region === "string" ? resolvedSearchParams.region : null
  const decodedRegion = (() => {
    if (!rawRegionParam) return null
    try {
      return decodeURIComponent(rawRegionParam)
    } catch {
      return rawRegionParam
    }
  })()
  const selectedRegion = normalizeAcademyArea(decodedRegion)
  const classesHref = `/classes?region=${encodeURIComponent(selectedRegion)}`
  const { data: classItem, error } = await getPublicClassDetail(resolvedParams.id)
  const session = await getSession()
  const applyHref = `/classes/${resolvedParams.id}/apply`
  const applyEntryHref = session
    ? applyHref
    : `/auth/sign-in?${new URLSearchParams({ returnTo: applyHref }).toString()}`

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topBar}>
          <Link href={classesHref} className={styles.iconButton} aria-label="뒤로가기">
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

          {classItem ? (
            <BookmarkButton
              classId={classItem.id}
              className={styles.iconButton}
              activeClassName={styles.iconButton}
              iconSize={18}
            />
          ) : (
            <div style={{ width: 32, height: 32 }} />
          )}
        </div>

        {error ? (
          <section className={styles.section}>
            <p className={styles.sectionTitle}>{error}</p>
            <p className={styles.mutedText}>잠시 후 다시 시도해 주세요.</p>
            <div style={{ height: 12 }} />
            <Link href={classesHref} className={styles.ctaButton}>
              목록으로 돌아가기
            </Link>
          </section>
        ) : null}

        {!error && !classItem ? (
          <section className={styles.section}>
            <h1 className={styles.sectionTitle}>수업 정보를 찾을 수 없어요</h1>
            <p className={styles.mutedText}>
              링크가 바뀌었거나 공개가 종료된 수업일 수 있습니다.
            </p>
          </section>
        ) : null}

        {!error && classItem ? (
          <>
            <section className={styles.imageCard}>
              <div className={styles.imageFrame}>
                {classItem.coverImageUrl ? (
                  <Image
                    src={classItem.coverImageUrl}
                    alt={`${classItem.title} 대표 이미지`}
                    fill
                    sizes="(max-width: 430px) 100vw, 430px"
                    style={{ objectFit: "cover" }}
                    unoptimized
                    priority
                  />
                ) : (
                  <div
                    className={styles.imagePlaceholder}
                    role="img"
                    aria-label="첫수업 준비 중인 수업 이미지입니다."
                  >
                    첫수업 준비 중인 수업 이미지입니다.
                  </div>
                )}
              </div>
            </section>

            <div className={styles.titleBlock}>
              <div className={styles.badges}>
                <span className={styles.badge}>{formatProgramType(classItem.programType)}</span>
                <span className={styles.badge}>{classItem.subject}</span>
                <span className={styles.badge}>{classItem.region}</span>
                <span className={styles.badge}>{classItem.targetAge}</span>
              </div>

              <h1 className={styles.title}>{classItem.title}</h1>
              <p className={styles.price}>{formatPrice(classItem.trialPrice)}</p>
            </div>

            <div className={styles.sections}>
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>핵심 정보</h2>
                <div className={styles.infoGrid}>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>학원/선생님</span>
                    <span className={styles.infoValue}>
                      {classItem.teacherDisplayName ?? classItem.teacherName ?? "정보 준비 중"}
                    </span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>지역</span>
                    <span className={styles.infoValue}>{classItem.region}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>과목</span>
                    <span className={styles.infoValue}>{classItem.subject}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>대상 학년</span>
                    <span className={styles.infoValue}>{classItem.targetAge}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>수업 방식</span>
                    <span className={styles.infoValue}>정보 준비 중</span>
                  </div>
                </div>
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>수업 소개</h2>
                {classItem.description?.trim() ? (
                  <p className={styles.bodyText}>{classItem.description}</p>
                ) : (
                  <p className={styles.mutedText}>수업 소개가 준비 중입니다.</p>
                )}
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>이런 아이에게 추천해요</h2>
                <p className={styles.mutedText}>추천 대상 정보가 준비 중입니다.</p>
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>이 수업에서 경험하는 것</h2>
                <p className={styles.mutedText}>수업 경험 정보가 준비 중입니다.</p>
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>일정</h2>
                <p className={styles.mutedText}>일정 선택은 신청 단계에서 진행돼요.</p>
              </section>

              {classItem.teacherProfile ? (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>선생님 소개</h2>
                  <p className={styles.bodyText}>
                    {classItem.teacherProfile.intro?.trim()
                      ? classItem.teacherProfile.intro
                      : "선생님 소개가 준비 중입니다."}
                  </p>
                </section>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {!error && classItem ? (
        <div className={styles.fixedCta}>
          <Link href={applyEntryHref} className={styles.ctaButton}>
            {session ? "첫수업 신청하기" : "로그인하고 신청하기"}
          </Link>
        </div>
      ) : null}
    </main>
  )
}
