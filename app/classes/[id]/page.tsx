import Link from "next/link"
import Image from "next/image"

import { formatStoredTargetGrades } from "@/shared/constants/grade-options"
import { getSubjectLabel } from "@/shared/constants/education-taxonomy"
import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { getSession } from "@/features/auth/lib/session"
import { getPublicClassAvailableSlots } from "@/features/applications/queries/get-public-class-available-slots"
import { ClassDetailApplicationSheet } from "@/features/applications/ui/class-detail-application-sheet"
import { getPublicClassDetail } from "@/features/classes/queries/get-public-class-detail"
import { getMyChildren } from "@/features/children/queries/get-my-children"
import { BookmarkButton } from "@/features/favorites/ui/bookmark-button"
import { NaverMapByAddress } from "@/features/maps/ui/naver-map-by-address"
import { resolveStoredMapCoordinates } from "@/features/maps/lib/stored-map-coordinates"
import { resolveOrganizationAddressLines } from "@/features/organizations/lib/organization-address-contract"
import { normalizeAcademyArea } from "@/shared/config/academy-areas"
import { formatClassSubjectDisplayLabel } from "@/shared/lib/subject-master"
import styles from "./page.module.css"

type ClassDetailPageProps = {
  params: Promise<{
    id: string
  }>
  searchParams?: Promise<{
    region?: string
  }>
}

const splitMultilineItems = (value: string | null | undefined) =>
  (value ?? "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)

const formatPrice = (price: number) => {
  if (price <= 0) {
    return "무료"
  }

  return `${price.toLocaleString("ko-KR")}원`
}

const formatProgramType = (value: string) => (value === "level_test" ? "레벨테스트" : "체험수업")
const getTeacherSummaryLine = (subjects: string | null | undefined, targetStudents: string | null | undefined) => {
  const normalizedTargets = targetStudents?.trim() ? formatStoredTargetGrades(targetStudents) : null
  return [getSubjectLabel(subjects), normalizedTargets].filter(Boolean).join(" · ") || null
}

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
  const profile = session ? await getMyProfile() : null
  const isParentUser = profile?.role === "parent"
  const isStudioUser =
    profile?.dbRole === "teacher" || profile?.dbRole === "academy" || profile?.dbRole === "admin"
  const favoritesEnabled = !session || profile?.role === "parent"
  const detailSearchParams = new URLSearchParams()

  if (rawRegionParam) {
    detailSearchParams.set("region", rawRegionParam)
  }

  const detailHref = detailSearchParams.size
    ? `/classes/${resolvedParams.id}?${detailSearchParams.toString()}`
    : `/classes/${resolvedParams.id}`
  const signInHref = `/auth/sign-in?${new URLSearchParams({ returnTo: detailHref }).toString()}`
  const [{ data: slots, error: slotsError }, { data: children, error: childrenError }] = await Promise.all([
    getPublicClassAvailableSlots(resolvedParams.id),
    isParentUser ? getMyChildren() : Promise.resolve({ data: [], error: null })
  ])
  const organization = classItem?.organization ?? null
  const organizationLabel = organization
    ? [organization.name, organization.branchName].filter(Boolean).join(" ")
    : ""
  const addressLines = resolveOrganizationAddressLines({
    addressLine1: organization?.addressLine1,
    addressLine2: organization?.addressLine2,
    address: organization?.address,
    addressDetail: organization?.addressDetail
  })
  const fullAddress = [addressLines.line1, addressLines.line2].filter(Boolean).join(" ")
  const storedCoordinates = resolveStoredMapCoordinates(
    organization?.latitude,
    organization?.longitude
  )
  const hasLocation = Boolean(addressLines.line1 || storedCoordinates)
  const searchQuery = fullAddress || organizationLabel
  const naverMapUrl = `https://map.naver.com/p/search/${encodeURIComponent(searchQuery)}`
  const teacherProfile = classItem?.teacherProfile ?? null
  const teacherName =
    teacherProfile?.teacherName?.trim() ||
    classItem?.teacherDisplayName?.trim() ||
    classItem?.teacherName?.trim() ||
    null
  const teacherSummaryLine = getTeacherSummaryLine(teacherProfile?.subjects, teacherProfile?.targetStudents)
  const teacherIntroText = classItem?.teacherIntro?.trim() || null
  const teacherSpecialties = teacherProfile?.specialties?.trim() || null
  const teacherTeachingStyle = teacherProfile?.teachingStyle?.trim() || null
  const teacherShortIntro = teacherProfile?.shortIntro?.trim() || null
  const academyTeacherLabel = [organizationLabel || null, teacherName || null].filter(Boolean).join(" / ")
  const isPreassignedTeacherVisible = classItem?.assignmentMode === "preassigned"
  const teacherAssignmentLabel = isPreassignedTeacherVisible ? "학원/선생님" : "학원/담당 배정"
  const teacherAssignmentValue = isPreassignedTeacherVisible
    ? academyTeacherLabel || "정보 준비 중"
    : organizationLabel
      ? `${organizationLabel} / 담당 선생님은 신청 후 학원에서 배정됩니다.`
      : "담당 선생님은 신청 후 학원에서 배정됩니다."
  const targetGradeLabel = formatStoredTargetGrades(classItem?.targetAge)
  const classSubjectLabel = classItem
    ? formatClassSubjectDisplayLabel(classItem) || "과목 정보 준비 중"
    : null
  const recommendedItems = splitMultilineItems(classItem?.recommendedFor)
  const experienceItems = splitMultilineItems(classItem?.experiencePoints)
  const hasTeacherProfileContent = Boolean(
    teacherName ||
      teacherSummaryLine ||
      teacherSpecialties ||
      teacherTeachingStyle ||
      teacherShortIntro ||
      teacherIntroText ||
      teacherProfile?.intro?.trim()
  )
  const showTeacherProfileSection = isPreassignedTeacherVisible && hasTeacherProfileContent

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topBar}>
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

          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {isParentUser ? (
              <Link href="/my" className={styles.iconButton} aria-label="마이페이지">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M20 21a8 8 0 1 0-16 0"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            ) : null}

            {isStudioUser ? (
              <Link
                href="/studio"
                className={styles.iconButton}
                style={{ width: "auto", padding: "0 12px", fontSize: 13, fontWeight: 700 }}
              >
                스튜디오
              </Link>
            ) : null}

            {classItem && favoritesEnabled ? (
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
        </header>

        {error ? (
          <section className={styles.sectionState}>
            <p className={styles.sectionTitle}>{error}</p>
            <p className={styles.mutedText}>잠시 후 다시 시도해 주세요.</p>
            <div style={{ height: 12 }} />
            <Link href={classesHref} className={styles.ctaButton}>
              목록으로 돌아가기
            </Link>
          </section>
        ) : null}

        {!error && !classItem ? (
          <section className={styles.sectionState}>
            <h1 className={styles.sectionTitle}>수업 정보를 찾을 수 없어요</h1>
            <p className={styles.mutedText}>
              링크가 바뀌었거나 공개가 종료된 수업일 수 있습니다.
            </p>
          </section>
        ) : null}

        {!error && classItem ? (
          <>
            <section className={styles.heroSection}>
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

              <div className={styles.titleBlock}>
                <div className={styles.badges}>
                  <span className={`${styles.badge} ${styles.badgeOpen}`}>
                    {formatProgramType(classItem.programType)}
                  </span>
                  <span className={`${styles.badge} ${styles.badgeMuted}`}>
                    {classSubjectLabel}
                  </span>
                  <span className={`${styles.badge} ${styles.badgeMuted}`}>{classItem.region}</span>
                </div>

                <h1 className={styles.title}>{classItem.title}</h1>
                <p className={`${styles.price} ${classItem.trialPrice <= 0 ? styles.priceFree : ""}`}>
                  {formatPrice(classItem.trialPrice)}
                </p>
              </div>
            </section>

            <div className={styles.sections}>
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>수업정보</h2>
                <div className={styles.infoGrid}>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>{teacherAssignmentLabel}</span>
                    <span className={styles.infoValue}>{teacherAssignmentValue}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>지역</span>
                    <span className={styles.infoValue}>{classItem.region}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>과목</span>
                    <span className={styles.infoValue}>{classSubjectLabel}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>대상 학년</span>
                    <span className={styles.infoValue}>{targetGradeLabel}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>수업 방식</span>
                    <span className={styles.infoValue}>
                      {classItem.classFormat?.trim() ? classItem.classFormat : "정보 준비 중"}
                    </span>
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
                {recommendedItems.length > 0 ? (
                  <ul className={styles.bulletList}>
                    {recommendedItems.map((item, index) => (
                      <li key={`recommended-${index}`} className={styles.bulletItem}>
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.mutedText}>추천 대상 정보가 준비 중입니다.</p>
                )}
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>이 수업에서 경험하는 것</h2>
                {experienceItems.length > 0 ? (
                  <ul className={styles.bulletList}>
                    {experienceItems.map((item, index) => (
                      <li key={`experience-${index}`} className={styles.bulletItem}>
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.mutedText}>수업 경험 정보가 준비 중입니다.</p>
                )}
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>커리큘럼</h2>
                {classItem.curriculum?.trim() ? (
                  <p className={styles.bodyText}>{classItem.curriculum}</p>
                ) : (
                  <p className={styles.mutedText}>커리큘럼 정보가 준비 중입니다.</p>
                )}
              </section>

              {showTeacherProfileSection ? (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>선생님 소개</h2>
                  <div className={styles.teacherProfileStack}>
                    {teacherName ? <p className={styles.teacherProfileName}>{teacherName}</p> : null}
                    {teacherSummaryLine ? <p className={styles.teacherProfileSummary}>{teacherSummaryLine}</p> : null}
                    {teacherSpecialties ? (
                      <p className={styles.bodyText}>전문 영역: {teacherSpecialties}</p>
                    ) : null}
                    {teacherTeachingStyle ? (
                      <p className={styles.bodyText}>수업 스타일: {teacherTeachingStyle}</p>
                    ) : null}
                    {teacherShortIntro ? (
                      <p className={styles.bodyText}>한 줄 소개: {teacherShortIntro}</p>
                    ) : null}
                    {teacherIntroText ? (
                      <p className={styles.bodyText}>{teacherIntroText}</p>
                    ) : teacherProfile?.intro?.trim() ? (
                      <p className={styles.bodyText}>{teacherProfile.intro}</p>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {hasLocation ? (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>위치</h2>
                  <div className={styles.locationStack}>
                    <div className={styles.locationTextBlock}>
                      <p className={styles.locationName}>{organizationLabel || "학원 위치"}</p>
                      <p className={styles.bodyText}>{fullAddress || "주소 정보 준비 중"}</p>
                    </div>
                    <div className={styles.mapFrame}>
                      <NaverMapByAddress
                        address={addressLines.line1 ?? ""}
                        addressDetail={addressLines.line2}
                        latitude={organization?.latitude}
                        longitude={organization?.longitude}
                        markerLabel={organizationLabel || classItem.title}
                        height={260}
                      />
                    </div>
                    <a
                      href={naverMapUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.mapLinkButton}
                    >
                      네이버 지도에서 보기
                    </a>
                  </div>
                </section>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {!error && classItem ? (
        <ClassDetailApplicationSheet
          classId={classItem.id}
          classTitle={classItem.title}
          classTargetAge={classItem.targetAge}
          availableSlots={slots}
          slotsError={slotsError}
          childProfiles={children}
          childProfilesError={childrenError}
          parentName={profile?.name ?? ""}
          parentPhone={profile?.phone ?? null}
          academyName={organizationLabel || null}
          teacherName={teacherName}
          trialPriceLabel={formatPrice(classItem.trialPrice)}
          hasSession={Boolean(session)}
          isParentUser={isParentUser}
          signInHref={signInHref}
          fixedCtaClassName={styles.fixedCta}
          ctaButtonClassName={styles.ctaButton}
        />
      ) : null}
    </main>
  )
}
