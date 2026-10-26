import { applePhoneGateHref } from "@/features/auth/phone/gate"
import { safeParentReturnTo } from "@/features/classes/lib/parent-navigation"
import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentBackLink } from "@/features/classes/ui/parent-back-link"
import { getPublicClassFeedback } from "@/features/feedback/queries/get-public-feedback"
import { PublicFeedback } from "@/features/feedback/ui/public-feedback"
import { formatRegularPrice } from "@/shared/lib/regular-price"
import Link from "next/link"

import { formatStoredTargetGrades } from "@/shared/constants/grade-options"
import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { getSession } from "@/features/auth/lib/session"
import { formatAdministrativeRegionLabel } from "@/features/location/lib/region-selection"
import { getPublicClassAvailableSlots } from "@/features/applications/queries/get-public-class-available-slots"
import { ClassDetailApplicationSheet } from "@/features/applications/ui/class-detail-application-sheet"
import { ClassDetailBookingProvider, DetailSlotSection } from "@/features/applications/ui/class-detail-booking"
import { getPublicClassDetail } from "@/features/classes/queries/get-public-class-detail"
import { getMyChildren } from "@/features/children/queries/get-my-children"
import { BookmarkButton } from "@/features/favorites/ui/bookmark-button"
import { NaverMapByAddress } from "@/features/maps/ui/naver-map-by-address"
import { resolveStoredMapCoordinates } from "@/features/maps/lib/stored-map-coordinates"
import { resolveOrganizationAddressLines } from "@/features/organizations/lib/organization-address-contract"
import { formatClassSubjectDisplayLabel } from "@/shared/lib/subject-master"
import { getPublicAcademyPageByHandle } from "@/features/academies/queries/get-public-academy-page"
import { getChildGradeLabel } from "@/shared/constants/education-taxonomy"
import { isBookablePublicSlot } from "@/features/applications/lib/public-class-slots"
import { appDurationLabel, appPriceInfo, appSubjectCode } from "@/features/classes/lib/app-presentation"
import { resolveDetailEligibility } from "@/features/classes/lib/class-detail-presentation"
import { AppIcon } from "@/features/classes/ui/app-icon"
import { AcademyLogo, AppButtonLink, AppNotice, AppSection, Band, Disclosure, Hero, InfoRows, PriceText, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import { AcademyInquiry, ShareButton, StickyDetailHeader } from "@/features/classes/ui/parent-app-ui-client"
import styles from "./page.module.css"

type ClassDetailPageProps = {
  params: Promise<{
    id: string
  }>
  searchParams?: Promise<{
    returnTo?: string
    child?: string
    sido?: string
    sigungu?: string
    bname?: string
    slot?: string
  }>
}

const HERO = 260

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
  const [{ data: classItem, error }, { session, profile }] = await Promise.all([
    getPublicClassDetail(resolvedParams.id),
    (async () => {
      const session = await getSession()
      const profile = session ? await getMyProfile() : null
      return { session, profile }
    })()
  ])
  const organization = classItem?.organization ?? null
  const isParentUser = profile?.role === "parent"
  const [feedbackSummary, { data: slots, error: slotsError }, { data: children, error: childrenError }, academy] = await Promise.all([
    classItem ? getPublicClassFeedback(classItem.id) : Promise.resolve({ chips: [] }),
    getPublicClassAvailableSlots(resolvedParams.id),
    isParentUser ? getMyChildren() : Promise.resolve({ data: [], error: null }),
    organization?.id ? getPublicAcademyPageByHandle(organization.id).catch(() => null) : Promise.resolve(null)
  ])
  const regularPriceLabel = classItem ? formatRegularPrice({ type: classItem.regularPriceType, amount: classItem.regularPriceAmount }) : null
  const favoritesEnabled = !session || profile?.role === "parent"
  const detailQuery = new URLSearchParams(regionQuery)
  const returnTo = safeParentReturnTo(resolvedSearchParams?.returnTo)
  if (returnTo) detailQuery.set("returnTo", returnTo)
  const detailHref = detailQuery.size
    ? `/classes/${resolvedParams.id}?${detailQuery.toString()}`
    : `/classes/${resolvedParams.id}`
  const phoneGate = session ? await applePhoneGateHref(session.user, detailHref) : null
  const signInHref = phoneGate ?? `/auth/sign-in?${new URLSearchParams({ returnTo: detailHref }).toString()}`
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
  // 지역 표시는 organization 행정지역 metadata 로만 만든다. legacy classes.region 은 쓰지 않는다.
  const administrativeRegionLabel = organization
    ? formatAdministrativeRegionLabel(organization)
    : null
  const academyHref = organization?.id ? `/academy/${academy?.slug ?? organization.id}` : null
  const eligibility = isParentUser && !childrenError && classItem
    ? resolveDetailEligibility(children, resolvedSearchParams?.child, classItem.targetAge)
    : { kind: "hidden" as const }
  const childLabel = (child: { name: string; grade: string }) =>
    [child.name, getChildGradeLabel(child.grade) ?? child.grade].filter(Boolean).join(" · ")
  const now = Date.now()
  const firstSlot = [...slots].filter(slot => isBookablePublicSlot(slot, now)).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0] ?? slots[0]

  if (error || !classItem) return <ParentAppShell navigation={false} className={ui.page} data-parent-class-detail>
    <div className={ui.column}>
      <div className={styles.stateTop}><ParentBackLink href={classesHref} preferHistory label="뒤로가기" className={ui.circle}><AppIcon name="chevron-left" size={22} /></ParentBackLink></div>
      <div className={ui.content}>
        {error ? <AppNotice message="수업 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." retryHref={detailHref} />
          : <AppNotice message="찾으시는 정보를 볼 수 없어요. 링크가 바뀌었거나 공개가 종료된 수업일 수 있어요.">
            <AppButtonLink href={classesHref} variant="secondary">수업 찾기로 돌아가기</AppButtonLink>
          </AppNotice>}
      </div>
    </div>
  </ParentAppShell>

  const subjectLabel = formatClassSubjectDisplayLabel(classItem) || null
  const subjectCode = classItem.subjectCategoryCode ?? appSubjectCode(subjectLabel)
  const targetLabel = classItem.targetAge?.trim() ? formatStoredTargetGrades(classItem.targetAge) : null
  const kind = classItem.programType === "level_test" ? "레벨테스트" : "체험"
  const price = appPriceInfo(classItem.programType, classItem.trialPrice, classItem.trialPriceConfirmed)
  const duration = appDurationLabel(firstSlot)
  const eligibleChildren = eligibility.kind === "single" ? (eligibility.eligible ? [eligibility.child] : [])
    : eligibility.kind === "multiple" ? eligibility.children : []
  const childrenRow = eligibility.kind === "hidden" ? null
    : eligibleChildren.length ? eligibleChildren.map(childLabel).join(", ") : "등록된 자녀 중 신청 대상에 포함되는 자녀가 없어요."
  const shareMessage = `${[organizationLabel, classItem.title].filter(Boolean).join(" ")} 체험수업`
  const favorite = (className: string, size: number) => favoritesEnabled
    ? <BookmarkButton classId={classItem.id} className={className} activeClassName={ui.favoriteActive} iconSize={size} variant="heart" /> : null
  const share = (className: string) => <ShareButton message={shareMessage} path={`/classes/${classItem.id}`} className={className} />
  const requestedSlot = resolvedSearchParams?.slot

  return (
    <ParentAppShell navigation={false} className={ui.page} data-parent-class-detail>
      <ClassDetailBookingProvider slots={slots} now={now} initial={typeof requestedSlot === "string" ? requestedSlot : undefined}>
        <div className={ui.column}>
          <StickyDetailHeader title={classItem.title} backHref={classesHref} threshold={HERO}>{share(ui.headerButton)}{favorite(ui.headerButton, 22)}</StickyDetailHeader>
          <div className={`${ui.content} ${ui.withFooter}`} data-flush>
            <Hero src={classItem.coverImageUrl} alt={`${classItem.title} 대표 이미지`} subjectCode={subjectCode}>
              <div className={ui.heroButtons}>
                <ParentBackLink href={classesHref} preferHistory label="뒤로가기" className={ui.circle}><AppIcon name="chevron-left" size={22} /></ParentBackLink>
                <div className={ui.heroActions}>{share(ui.circle)}{favorite(ui.circle, 20)}</div>
              </div>
            </Hero>

            {childrenError ? <p className={`${ui.caption} ${styles.childError}`} role="alert">자녀 정보를 불러오지 못했어요. 신청 화면에서 다시 확인해 주세요.</p> : null}

            <section className={styles.summary} aria-label="수업 요약">
              {[subjectLabel, targetLabel].some(Boolean) ? <p className={ui.caption}>{[subjectLabel, targetLabel].filter(Boolean).join(" · ")}</p> : null}
              <h1 className={ui.display}>{classItem.title}</h1>
              <div className={styles.priceRow}>
                <PriceText price={price} size="title" />
                {[duration, classItem.classFormat].some(Boolean) ? <span className={`${ui.bodyMuted} ${ui.oneLine}`}>{[duration, classItem.classFormat].filter(Boolean).join(" · ")}</span> : null}
              </div>
              {academyHref ? <Link href={academyHref} className={`${ui.rowLink} ${ui.boxLink} ${styles.academy}`} aria-label={`${organizationLabel} 학원 소개`}>
                <AcademyLogo size={44} src={academy?.logoImageUrl} subjectCode={subjectCode} />
                <span className={ui.rowText}>
                  <span className={`${ui.subtitle} ${ui.oneLine}`}>{organizationLabel || "학원 정보 준비 중"}</span>
                  <span className={`${ui.caption} ${ui.oneLine}`}>{[administrativeRegionLabel, "학원 정보 보기"].filter(Boolean).join(" · ")}</span>
                </span>
                <AppIcon name="chevron-right" size={20} />
              </Link> : null}
            </section>

            <Band />
            <DetailSlotSection slotsError={slotsError} retryHref={detailHref} />
            <Band />

            <AppSection title="수업 정보">
              <InfoRows rows={[
                ["대상", targetLabel],
                ["수업 방식", classItem.classFormat?.trim() || null],
                ["소요 시간", duration],
                ["정규 수업료", regularPriceLabel ? [regularPriceLabel, classItem.regularPriceNote?.trim()].filter(Boolean).join("\n") : null],
                ["담당 배정", classItem.assignmentMode === "preassigned" ? null : "담당 선생님은 신청 후 학원에서 배정됩니다."],
                ["신청 가능 자녀", childrenRow]
              ]} />
              <p className={ui.body}>{classItem.description?.trim() || "등록된 수업 소개가 없어요."}</p>
              <div>
                <Disclosure title="이런 아이에게 추천해요">{classItem.recommendedFor?.trim() || "등록된 정보가 없어요."}</Disclosure>
                <Disclosure title="이 수업에서 경험하는 것">{classItem.experiencePoints?.trim() || "등록된 정보가 없어요."}</Disclosure>
                <Disclosure title="커리큘럼">{classItem.curriculum?.trim() || "등록된 정보가 없어요."}</Disclosure>
              </div>
            </AppSection>

            {feedbackSummary.chips.length ? <><Band /><PublicFeedback summary={feedbackSummary} scope="CLASS" className={ui.section} /></> : null}

            {hasLocation ? <><Band /><AppSection title="위치">
              <p className={ui.body}>{fullAddress || organizationLabel || "주소 정보 준비 중"}</p>
              <div className={styles.map}>
                <NaverMapByAddress address={addressLines.line1 ?? ""} addressDetail={addressLines.line2}
                  latitude={organization?.latitude} longitude={organization?.longitude}
                  markerLabel={organizationLabel || classItem.title} height={150} />
              </div>
              <a href={naverMapUrl} target="_blank" rel="noreferrer" className={ui.button} data-variant="secondary" aria-label="지도 앱에서 보기 (새 창)">지도 앱에서 보기</a>
            </AppSection></> : null}

            {academyHref ? <AcademyInquiry phone={academy?.phone ?? null} academyHref={academyHref} /> : null}
          </div>
        </div>
        <ClassDetailApplicationSheet
          classId={classItem.id} classTitle={classItem.title} classTargetAge={classItem.targetAge}
          availableSlots={slots} slotsError={slotsError} childProfiles={children} childProfilesError={childrenError}
          parentName={profile?.name ?? ""} parentPhone={profile?.phone ?? null}
          placeLabel={[organizationLabel, administrativeRegionLabel].filter(Boolean).join(" · ") || null}
          priceLabel={appPriceInfo(classItem.programType, classItem.trialPrice, classItem.trialPriceConfirmed, classItem.programType === "level_test" ? "레벨테스트" : "체험수업").label}
          hasSession={Boolean(session) && !phoneGate} isParentUser={isParentUser && !phoneGate} signInHref={signInHref} now={now}
          submitLabel={`${price.free ? "무료 " : ""}${kind} 신청하기`} retryHref={detailHref}
          secondaryAction={favorite(ui.squareFavorite, 22)} />
      </ClassDetailBookingProvider>
    </ParentAppShell>
  )
}
