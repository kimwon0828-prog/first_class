import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { requireSession } from "@/features/auth/lib/session"
import { getClassAvailableSlots } from "@/features/applications/queries/get-class-available-slots"
import { getPublicClassDetail } from "@/features/classes/queries/get-public-class-detail"
import { getMyChildren } from "@/features/children/queries/get-my-children"
import { TrialApplicationSteps } from "@/features/applications/ui/trial-application-steps"
import { appPriceInfo } from "@/features/classes/lib/app-presentation"
import { formatAdministrativeRegionLabel } from "@/features/location/lib/region-selection"
import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import { AppButtonLink, AppNotice, PriceText, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import { resolveStudioCrossProductHref } from "@/shared/lib/cross-product-navigation-server"

type ApplyPageProps = {
  searchParams?: Promise<{ child?: string }>
  params: Promise<{
    id: string
  }>
}

/** 체험수업 / 레벨테스트. 신청 전에는 "예약" 이라고 부르지 않는다. */
const resolveApplyPageTitle = (programType: string | null | undefined) =>
  programType === "level_test" ? "레벨테스트 신청" : "체험수업 신청"

/** 앱 신청 시트와 같은 3단계를 한 페이지로(바로 들어온 주소용). 수업 상세에서는 시트로 연다. */
export default async function ClassApplyPage({ params, searchParams }: ApplyPageProps) {
  const resolvedParams = await params
  const child = (await searchParams)?.child
  const returnTo = `/classes/${resolvedParams.id}/apply${child ? `?${new URLSearchParams({ child })}` : ""}`
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
  const detailHref = `/classes/${resolvedParams.id}`
  const academyName =
    [classItem?.organization?.name?.trim() || null, classItem?.organization?.branchName?.trim() || null]
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .trim() || null
  const region = classItem?.organization ? formatAdministrativeRegionLabel(classItem.organization) : null
  const kind = classItem?.programType === "level_test" ? "레벨테스트" : "체험"
  const price = classItem ? appPriceInfo(classItem.programType, classItem.trialPrice, classItem.trialPriceConfirmed) : null

  return <ParentAppShell navigation={false} className={ui.page}>
    <div className={ui.column}>
      <ParentHeader title={resolveApplyPageTitle(classItem?.programType)} backHref={detailHref} />
      {error ? <div className={ui.content}><AppNotice message={error} retryHref={returnTo}><AppButtonLink href={detailHref} variant="secondary">수업 상세로 돌아가기</AppButtonLink></AppNotice></div>
        : !classItem ? <div className={ui.content}><AppNotice message="신청할 수업 정보를 찾을 수 없어요."><AppButtonLink href="/classes" variant="secondary">수업 찾기로 돌아가기</AppButtonLink></AppNotice></div>
        : !profile ? <div className={ui.content}><AppNotice message="신청 권한을 확인할 수 없어요. 잠시 후 다시 시도해 주세요." retryHref={returnTo} /></div>
        : profile.role !== "parent" ? <div className={ui.content}><AppNotice message="학원 계정은 체험수업을 신청할 수 없어요. 수업 관리는 스튜디오에서 진행해주세요.">
          <AppButtonLink href={await resolveStudioCrossProductHref("/studio")} variant="secondary">스튜디오로 이동</AppButtonLink>
        </AppNotice></div>
        : <TrialApplicationSteps mode="page"
          classId={classItem.id} classTargetAge={classItem.targetAge} availableSlots={slots} slotsError={slotsError}
          childProfiles={children} childProfilesError={childrenError} parentName={profile.name} parentPhone={profile.phone}
          classTitle={classItem.title} placeLabel={[academyName, region].filter(Boolean).join(" · ") || null}
          priceLabel={appPriceInfo(classItem.programType, classItem.trialPrice, classItem.trialPriceConfirmed, classItem.programType === "level_test" ? "레벨테스트" : "체험수업").label}
          submitLabel={`${price?.free ? "무료 " : ""}${kind} 신청하기`}
          hasSession isParentUser signInHref={`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`} now={Date.now()}
          summary={<div className={ui.softBox}>
            <p className={ui.subtitle}>{classItem.title}</p>
            {academyName ? <p className={ui.caption}>{academyName}</p> : null}
            {price ? <PriceText price={price} /> : null}
          </div>} />}
    </div>
  </ParentAppShell>
}
