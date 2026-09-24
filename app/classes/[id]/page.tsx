import { formatDiscoveryPrice } from "@/features/classes/lib/class-discovery-results"
import Link from "next/link"
import Image from "next/image"

import { formatStoredTargetGrades } from "@/shared/constants/grade-options"
import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { getSession } from "@/features/auth/lib/session"
import { formatAdministrativeRegionLabel } from "@/features/location/lib/region-selection"
import { getPublicClassAvailableSlots } from "@/features/applications/queries/get-public-class-available-slots"
import { ClassDetailApplicationSheet } from "@/features/applications/ui/class-detail-application-sheet"
import { getPublicClassDetail } from "@/features/classes/queries/get-public-class-detail"
import { getMyChildren } from "@/features/children/queries/get-my-children"
import { BookmarkButton } from "@/features/favorites/ui/bookmark-button"
import { NaverMapByAddress } from "@/features/maps/ui/naver-map-by-address"
import { resolveStoredMapCoordinates } from "@/features/maps/lib/stored-map-coordinates"
import { resolveOrganizationAddressLines } from "@/features/organizations/lib/organization-address-contract"
import { formatClassSubjectDisplayLabel } from "@/shared/lib/subject-master"
import styles from "./page.module.css"
import { getPublicAcademyPageByHandle } from "@/features/academies/queries/get-public-academy-page"
import { getChildGradeLabel } from "@/shared/constants/education-taxonomy"
import { ImageFallback } from "@/shared/ui/image-fallback"
import { DetailDisclosure, DetailIntroduction } from "@/features/classes/ui/class-detail-disclosure"
import { formatDetailSchedule, selectEarliestDetailSlot, resolveDetailEligibility } from "@/features/classes/lib/class-detail-presentation"

type ClassDetailPageProps = {
  params: Promise<{
    id: string
  }>
  searchParams?: Promise<{
    child?: string
    sido?: string
    sigungu?: string
    bname?: string
  }>
}

const formatProgramType = (value: string) => (value === "level_test" ? "레벨테스트" : "체험수업")

function DetailIcon({ kind }: { kind: "calendar" | "program" | "format" | "user" | "check" }) {
  const paths = {
    calendar: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
    program: "M4 4h16v16H4zM8 8h8M8 12h8M8 16h4",
    format: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m14-13a4 4 0 0 1 0 8m5 5v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
    user: "M20 21v-2a7 7 0 0 0-14 0v2M17 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
    check: "m8 12 3 3 5-6M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z"
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d={paths[kind]} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

export default async function ClassDetailPage({ params, searchParams }: ClassDetailPageProps) {
  const resolvedParams = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  // legacy academy-area query 는 받지 않는다. 실제 행정지역 값이 명시적으로 있을 때만 canonical query 를 만든다.
  const regionQuery = new URLSearchParams()
  for (const key of ["sido", "sigungu", "bname", "child"] as const) {
    const value = resolvedSearchParams?.[key]
    if (typeof value === "string" && value.trim().length > 0) {
      regionQuery.set(key, value.trim())
    }
  }
  const classesHref = regionQuery.size ? `/classes?${regionQuery.toString()}` : "/classes"
  const { data: classItem, error } = await getPublicClassDetail(resolvedParams.id)
  const session = await getSession()
  const profile = session ? await getMyProfile() : null
  const isParentUser = profile?.role === "parent"
  const favoritesEnabled = !session || profile?.role === "parent"
  const detailHref = regionQuery.size
    ? `/classes/${resolvedParams.id}?${regionQuery.toString()}`
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
  const targetGradeLabel = formatStoredTargetGrades(classItem?.targetAge)
  // 지역 표시는 organization 행정지역 metadata 로만 만든다. legacy classes.region 은 쓰지 않는다.
  const administrativeRegionLabel = organization
    ? formatAdministrativeRegionLabel(organization)
    : null
  const classSubjectLabel = classItem
    ? formatClassSubjectDisplayLabel(classItem) || "과목 정보 준비 중"
    : null
  const academy = organization?.id
    ? await getPublicAcademyPageByHandle(organization.id).catch(() => null) : null
  const academyHref = organization?.id ? `/academy/${academy?.slug ?? organization.id}` : null
  const academyImage = academy?.logoImageUrl ?? academy?.coverImageUrl
  const eligibility = isParentUser && !childrenError && classItem
    ? resolveDetailEligibility(children, resolvedSearchParams?.child, classItem.targetAge)
    : { kind: "hidden" as const }
  const childLabel = (child: { name: string; grade: string }) =>
    [child.name, getChildGradeLabel(child.grade) ?? child.grade].filter(Boolean).join(" · ")
  const eligibilityPositive = eligibility.kind === "multiple" || (eligibility.kind === "single" && eligibility.eligible)
  const earliestSlot = selectEarliestDetailSlot(slots, Date.now())
  const earliestTiming = formatDetailSchedule(earliestSlot)
  return (
    <main className={styles.page} data-parent-design="v1" data-parent-class-detail>
      <div className={styles.shell}>
        <header className={styles.topBar}>
          <Link href={classesHref} className={styles.iconButton} aria-label="뒤로가기">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <p className={styles.headerTitle}>수업 상세</p>
          {classItem && favoritesEnabled ? <BookmarkButton classId={classItem.id}
            className={styles.iconButton} activeClassName={styles.favoriteActive} iconSize={20} variant="heart" />
            : <span className={styles.headerSpacer} aria-hidden="true" />}
        </header>

        {error ? (
          <section className={styles.sectionState} role="alert">
            <h1 className={styles.sectionTitle}>수업 정보를 불러오지 못했어요.</h1>
            <p className={styles.mutedText}>잠시 후 다시 시도해 주세요.</p>
            <Link href={detailHref} className={styles.secondaryButton}>다시 불러오기</Link>
            <Link href={classesHref} className={styles.textLink}>목록으로 돌아가기</Link>
          </section>
        ) : null}
        {!error && !classItem ? (
          <section className={styles.sectionState}>
            <h1 className={styles.sectionTitle}>수업 정보를 찾을 수 없어요</h1>
            <p className={styles.mutedText}>링크가 바뀌었거나 공개가 종료된 수업일 수 있습니다.</p>
            <Link href={classesHref} className={styles.textLink}>목록으로 돌아가기</Link>
          </section>
        ) : null}

        {!error && classItem ? (
          <>
            <section className={styles.heroSection}>
              <div className={styles.imageFrame}>
                {classItem.coverImageUrl ? <Image src={classItem.coverImageUrl} alt={`${classItem.title} 대표 이미지`}
                  fill sizes="(max-width: 480px) calc(100vw - 40px), 440px" style={{ objectFit: "cover" }} unoptimized priority />
                  : <ImageFallback label="수업 이미지 없음" />}
              </div>
              <div className={styles.titleBlock}>
                <div className={styles.badges}>
                  {classSubjectLabel ? <span className={styles.badge}>{classSubjectLabel}</span> : null}
                  {classItem.targetAge?.trim() ? <span className={styles.badge}>{targetGradeLabel}</span> : null}
                </div>
                <h1 className={styles.title}>{classItem.title}</h1>
                <p className={styles.price}>{formatDiscoveryPrice(classItem)}</p>
                {academyHref ? <Link href={academyHref} className={styles.academyEntry}>
                  <span className={styles.academyImage}>
                    {academyImage ? <Image src={academyImage} alt="" fill sizes="64px" style={{ objectFit: "cover" }} unoptimized />
                      : <ImageFallback label="학원 이미지 없음" />}
                  </span>
                  <span className={styles.academySummary}>
                    <span className={styles.noticeTitle}>{organizationLabel || "학원 정보 준비 중"}</span>
                    {administrativeRegionLabel ? <span className={styles.mutedText}>{administrativeRegionLabel}</span> : null}
                  </span>
                  <span aria-hidden="true">›</span>
                </Link> : null}
              </div>
            </section>

            {eligibility.kind !== "hidden" ? <aside className={`${styles.childNotice} ${eligibilityPositive ? styles.childEligible : ""}`} aria-label="등록 자녀 신청 대상 안내">
              <span className={styles.childAvatar}><DetailIcon kind="user" /></span>
              <div className={styles.childCopy}>
                {eligibility.kind === "single" ? <>
                  <p className={styles.noticeTitle}>{childLabel(eligibility.child)}</p>
                  <p className={styles.bodyText}>{eligibility.eligible
                    ? "이 수업의 신청 대상에 포함돼요." : "현재 설정된 대상 범위와 달라요."}</p>
                </> : eligibility.kind === "multiple" ? <>
                  <p className={styles.noticeTitle}>신청 가능한 자녀 {eligibility.children.length}명</p>
                  <p className={styles.bodyText}>{eligibility.children.map(childLabel).join(", ")}</p>
                  <p className={styles.mutedText}>신청할 자녀는 체험수업 신청 화면에서 선택해주세요.</p>
                </> : <p className={styles.bodyText}>등록된 자녀 중 현재 신청 대상에 포함되는 자녀가 없어요.</p>}
              </div>
              {eligibilityPositive ? <span className={styles.successIcon}><DetailIcon kind="check" /></span> : null}
            </aside> : null}
            {childrenError ?
              <p className={styles.childNotice}>자녀 정보를 불러오지 못했어요. 신청 화면에서 다시 확인해 주세요.</p> : null}

            <div className={styles.sections}>
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>수업 정보</h2>
                <dl className={styles.infoGrid}>
                  <div className={styles.infoRow}><dt><DetailIcon kind="program" />프로그램</dt><dd>{formatProgramType(classItem.programType)}</dd></div>
                  {classItem.classFormat?.trim() ? <div className={styles.infoRow}><dt><DetailIcon kind="format" />수업 방식</dt><dd>{classItem.classFormat}</dd></div> : null}
                  {classItem.assignmentMode !== "preassigned" ? <div className={styles.infoRow}>
                    <dt><DetailIcon kind="user" />담당 배정</dt><dd>담당 선생님은 신청 후 학원에서 배정됩니다.</dd>
                  </div> : null}
                </dl>
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>가장 빠른 체험 일정</h2>
                {slotsError ? (
                  <p className={styles.mutedText}>예약 가능 시간대를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
                ) : !earliestTiming ? (
                  <p className={styles.mutedText}>현재 예약 가능한 일정이 없어요.</p>
                ) : (
                  <>
                    <p className={styles.mutedText}>지금 예약 가능한 가장 빠른 일정이에요.</p>
                    <div className={styles.slotItem}>
                      <span className={styles.scheduleIcon}><DetailIcon kind="calendar" /></span>
                      <div className={styles.slotContent}>
                        <p className={styles.slotDate}>{earliestTiming.dateLabel}</p>
                        <p className={styles.mutedText}>{earliestTiming.timeLabel}</p>
                      </div>
                    </div>
                  </>
                )}
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>수업 소개</h2>
                {classItem.description?.trim() ? <DetailIntroduction text={classItem.description} />
                  : <p className={styles.mutedText}>수업 소개가 준비 중입니다.</p>}
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>수업을 더 알아보세요</h2>
                <div className={styles.accordions}>
                  <DetailDisclosure title="이런 아이에게 추천해요">
                    <p className={styles.bodyText}>{classItem.recommendedFor?.trim() ? classItem.recommendedFor : "추천 대상 정보가 준비 중입니다."}</p>
                  </DetailDisclosure>
                  <DetailDisclosure title="이 수업에서 경험하는 것">
                    <p className={styles.bodyText}>{classItem.experiencePoints?.trim() ? classItem.experiencePoints : "수업 경험 정보가 준비 중입니다."}</p>
                  </DetailDisclosure>
                  <DetailDisclosure title="커리큘럼">
                    <p className={styles.bodyText}>{classItem.curriculum?.trim() ? classItem.curriculum : "커리큘럼 정보가 준비 중입니다."}</p>
                  </DetailDisclosure>
                </div>
              </section>

              {hasLocation ? <section className={styles.section}>
                <h2 className={styles.sectionTitle}>위치</h2>
                <div className={styles.locationStack}>
                  <p className={styles.noticeTitle}>{organizationLabel || "학원 위치"}</p>
                  <p className={styles.bodyText}>{fullAddress || "주소 정보 준비 중"}</p>
                  <div className={styles.mapFrame}>
                    <NaverMapByAddress address={addressLines.line1 ?? ""} addressDetail={addressLines.line2}
                      latitude={organization?.latitude} longitude={organization?.longitude}
                      markerLabel={organizationLabel || classItem.title} height={240} />
                  </div>
                  <a href={naverMapUrl} target="_blank" rel="noreferrer" className={styles.secondaryButton}
                    aria-label="네이버 지도에서 보기 (새 창)">네이버 지도에서 보기</a>
                </div>
              </section> : null}
            </div>
          </>
        ) : null}
      </div>
      {!error && classItem ? <ClassDetailApplicationSheet
        classId={classItem.id} classTitle={classItem.title} classTargetAge={classItem.targetAge}
        availableSlots={slots} slotsError={slotsError} childProfiles={children} childProfilesError={childrenError}
        parentName={profile?.name ?? ""} parentPhone={profile?.phone ?? null}
        academyName={organizationLabel || null} trialPriceLabel={formatDiscoveryPrice(classItem)}
        hasSession={Boolean(session)} isParentUser={isParentUser} signInHref={signInHref}
        fixedCtaClassName={styles.fixedCta} ctaButtonClassName={styles.ctaButton} /> : null}
    </main>
  )
}
