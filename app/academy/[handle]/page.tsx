import { getPublicAcademyFeedback } from "@/features/feedback/queries/get-public-feedback"
import { PublicFeedback } from "@/features/feedback/ui/public-feedback"
import { PARENT_ORIGIN } from "@/shared/config/site-origins"

import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { getPublicAcademyClasses, type PublicAcademyClassCardItem } from "@/features/academies/queries/get-public-academy-classes"
import { getPublicAcademyPageByHandle } from "@/features/academies/queries/get-public-academy-page"
import { isCardBookable, loadAcademyCardDetails, type AcademyCardDetail, type CardSlot } from "@/features/native/server/academy-cards"
import { loadCardSlots, slotDurationMinutes } from "@/features/native/server/catalog-slots"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { appDateLabel, appDurationLabel, appPriceInfo, appShortSlot, appSubjectCode, appTimeLabel } from "@/features/classes/lib/app-presentation"
import { AppIcon } from "@/features/classes/ui/app-icon"
import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentBackLink } from "@/features/classes/ui/parent-back-link"
import { ParentDetailLink } from "@/features/classes/ui/parent-detail-link"
import { AcademyLogo, AppButtonLink, AppEmpty, AppSection, Band, ClassThumb, Hero, IconRow, PriceText, StatusBadge, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import { AcademyInquiry, AnchorTabs, ShareButton, StickyDetailHeader } from "@/features/classes/ui/parent-app-ui-client"

import styles from "./page.module.css"

type AcademyPageProps = {
  params: Promise<{
    handle: string
  }>
}

const toNullableText = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

const buildAcademyDisplayName = (name: string, branchName: string | null) =>
  branchName ? `${name} ${branchName}` : name

const getDescriptionPreview = (shortDescription: string | null, description: string | null) => {
  const shortText = toNullableText(shortDescription)
  if (shortText) {
    return shortText
  }

  const detailText = toNullableText(description)?.replace(/\s+/g, " ")
  if (!detailText) {
    return "학원 소개를 확인해 보세요."
  }

  return detailText.slice(0, 120)
}

const resolveOpenGraphImage = (coverImageUrl: string | null, logoImageUrl: string | null) =>
  coverImageUrl ?? logoImageUrl ?? new URL("/images/first-class-logo.png", PARENT_ORIGIN).toString()

export async function generateMetadata({ params }: AcademyPageProps): Promise<Metadata> {
  const resolvedParams = await params
  const academy = await getPublicAcademyPageByHandle(resolvedParams.handle)

  if (!academy) {
    return {
      title: "학원을 찾을 수 없습니다"
    }
  }

  // 문서 제목은 root template("%s | 첫수업")이 붙인다. 공유 미리보기(OG)는 template 을 거치지 않아 직접 붙인다.
  const title = academy.name
  const description = getDescriptionPreview(academy.shortDescription, academy.description)
  const canonicalHandle = academy.slug ?? academy.organizationId
  const ogImageUrl = resolveOpenGraphImage(academy.coverImageUrl, academy.logoImageUrl)

  return {
    title,
    description,
    alternates: {
      canonical: `/academy/${canonicalHandle}`
    },
    openGraph: {
      type: "website",
      url: `/academy/${canonicalHandle}`,
      siteName: "첫수업",
      title: `${academy.name} | 첫수업`,
      description,
      images: [
        {
          url: ogImageUrl
        }
      ]
    }
  }
}

const HERO = 220
const WEEK = 7 * 24 * 60 * 60 * 1000
type AcademyClass = PublicAcademyClassCardItem & { detail: AcademyCardDetail | null; slots: CardSlot[]; slotsError: string | null }

// 앱 학원 상세와 같은 값: 수업 상세의 가격·이미지·방식과 카드가 쓰는 일정만 한 번에 읽는다(앱 API academyClassCards 와 같은 조합).
// 값이 없으면 비워 둔다(가격·소요 시간을 지어내지 않는다).
async function withCardDetails(cards: PublicAcademyClassCardItem[], now: number): Promise<AcademyClass[]> {
  const ids = cards.map(card => card.id)
  const [details, slots] = await Promise.all([
    loadAcademyCardDetails(getSupabaseServiceRoleClient(), ids).catch(() => null),
    loadCardSlots(ids, now).catch(() => null)
  ])
  return cards.map(card => {
    const detail = details?.get(card.id) ?? null
    const result = slots?.get(card.id)
    return { ...card, detail, slots: detail ? result?.slots ?? [] : [], slotsError: details === null || slots === null ? "class_detail_unavailable" : result?.slotsError ?? null }
  })
}
const openSlots = (item: AcademyClass, now: number) => item.slots.filter(slot => isCardBookable(slot, now)).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
const classHref = (id: string, slot?: string) => slot ? `/classes/${id}?${new URLSearchParams({ slot })}` : `/classes/${id}`

function ClassCard({ item, now }: { item: AcademyClass; now: number }) {
  const open = openSlots(item, now), soon = open.filter(slot => Date.parse(slot.startAt) < now + WEEK), shown = soon.slice(0, 2)
  const minutes = slotDurationMinutes(item.slots)
  const duration = minutes ? `${minutes}분` : appDurationLabel(open[0] ?? item.slots[0])
  const meta = (item.detail ? [item.targetAgeLabel, duration, item.detail.classFormat] : [item.targetAgeLabel, item.scheduleLabel === "요일·시간 확인 필요" ? null : item.scheduleLabel, item.programTypeLabel]).filter(Boolean).join(" · ")
  const price = item.detail ? appPriceInfo(item.detail.programType, item.detail.trialPrice, item.detail.trialPriceConfirmed) : null
  const note = item.slotsError ? "일정을 불러오지 못했어요" : shown.length ? null
    : open[0] ? `다음 예약 가능 · ${appDateLabel(open[0].startAt)} ${appTimeLabel(open[0].startAt)}` : item.detail ? "지금 예약 가능한 일정이 없어요" : null
  return <li className={ui.card}>
    <ParentDetailLink href={classHref(item.id)} className={styles.classLink} aria-label={`${item.title} 상세 보기`}>
      <span className={styles.classRow}>
        <ClassThumb src={item.detail?.coverImageUrl} subjectCode={appSubjectCode(item.subjectLabel)} />
        <span className={styles.classText}>
          <span className={`${ui.subtitle} ${ui.oneLine}`}>{item.title}</span>
          {meta ? <span className={`${ui.caption} ${ui.oneLine}`}>{meta}</span> : null}
          {price ? <PriceText price={price} /> : null}
        </span>
        <AppIcon name="chevron-right" size={18} />
      </span>
      {!shown.length && note ? <span className={ui.caption}>{note}</span> : null}
    </ParentDetailLink>
    {shown.length ? <div className={ui.chipRow}>
      {shown.map(slot => <Link key={slot.optionId} href={classHref(item.id, slot.optionId)} className={ui.timeChip} data-size="small">{appShortSlot(slot.startAt)}</Link>)}
      {soon.length > 2 ? <Link href={classHref(item.id)} className={ui.timeChip} data-size="small" aria-label={`일정 ${soon.length - 2}개 더 보기`}>+{soon.length - 2}</Link> : null}
    </div> : null}
  </li>
}

export default async function AcademyPage({ params }: AcademyPageProps) {
  const { handle } = await params
  const academy = await getPublicAcademyPageByHandle(handle)
  if (!academy) notFound()
  const now = Date.now()
  const [cards, feedbackSummary] = await Promise.all([getPublicAcademyClasses(academy.organizationId), getPublicAcademyFeedback(academy.organizationId)])
  const classes = await withCardDetails(cards, now)
  const name = buildAcademyDisplayName(academy.name, academy.branchName)
  const subjects = [...new Set(classes.map(item => item.subjectLabel.split(/\s+·\s+/)[0]).filter(Boolean))]
  const targets = [...new Set(classes.map(item => item.targetAgeLabel).filter(Boolean))]
  const target = targets.length && targets.length <= 2 ? targets.join(", ") : null
  const subjectCode = appSubjectCode(classes[0]?.subjectLabel)
  const earliest = classes.flatMap(item => openSlots(item, now).slice(0, 1).map(slot => ({ id: item.id, slot }))).sort((a, b) => Date.parse(a.slot.startAt) - Date.parse(b.slot.startAt))[0]
  const intro = toNullableText(academy.description) ?? toNullableText(academy.shortDescription)
  const academyPath = `/academy/${academy.slug ?? academy.organizationId}`
  const share = (className: string) => <ShareButton message={name} path={academyPath} className={className} />
  return <ParentAppShell navigation={false} className={ui.page} data-parent-design="v1">
    <div className={ui.column}>
      <StickyDetailHeader title={name} backHref="/academies" threshold={HERO}>{share(ui.headerButton)}</StickyDetailHeader>
      <div className={`${ui.content} ${classes.length ? ui.withFooter : ""}`} data-flush>
        <Hero kind="academy" src={academy.coverImageUrl} alt={`${name} 대표 이미지`} subjectCode={subjectCode}>
          <div className={ui.heroButtons}>
            <ParentBackLink href="/academies" preferHistory label="뒤로가기" className={ui.circle}><AppIcon name="chevron-left" size={22} /></ParentBackLink>
            {share(ui.circle)}
          </div>
        </Hero>
        <section className={styles.identity} aria-label="학원 정보">
          <div className={styles.identityRow}>
            <AcademyLogo size={56} src={academy.logoImageUrl} subjectCode={subjectCode} />
            <div className={styles.identityText}>
              {subjects.length ? <p className={`${ui.caption} ${ui.oneLine}`}>{subjects.join(" · ")}</p> : null}
              <h1 className={ui.display}>{name}</h1>
            </div>
          </div>
          {academy.regionLabel || target ? <p className={`${ui.caption} ${styles.region}`}><AppIcon name="map-pin" size={14} />{[academy.regionLabel, target].filter(Boolean).join(" · ")}</p> : null}
        </section>
        <AnchorTabs tabs={[["classes", "체험수업"], ["intro", "학원 소개"], ["location", "위치"]]} />
        <div id="classes" className={`${ui.anchor} ${styles.classes}`}>
          {classes.length ? <ul className={styles.classList}>{classes.map(item => <ClassCard key={item.id} item={item} now={now} />)}</ul>
            : <AppEmpty>현재 공개된 수업이 없습니다.</AppEmpty>}
        </div>
        <Band />
        <AppSection id="intro" title="학원 소개">
          {intro ? <p className={ui.body}>{intro}</p> : null}
          {subjects.length ? <div className={ui.badgeRow}>{subjects.map(tag => <StatusBadge key={tag} label={tag} />)}</div> : null}
          {targets.length || academy.operatingHours ? <div className={styles.rows}>
            {targets.length ? <IconRow icon="user" label="대상">{targets.join(", ")}</IconRow> : null}
            {academy.operatingHours ? <IconRow icon="clock" label="운영 시간">{academy.operatingHours}</IconRow> : null}
          </div> : null}
          {!intro && !subjects.length && !targets.length && !academy.operatingHours ? <p className={ui.bodyMuted}>등록된 학원 소개가 없어요.</p> : null}
        </AppSection>
        {feedbackSummary.chips.length ? <><Band /><PublicFeedback summary={feedbackSummary} scope="ACADEMY" className={ui.section} /></> : null}
        <Band />
        <AppSection id="location" title="위치 및 방문 안내">
          {academy.address ? <IconRow icon="map-pin">{academy.address}</IconRow> : null}
          {academy.parkingInfo ? <IconRow icon="truck" label="주차">{academy.parkingInfo}</IconRow> : null}
          {academy.directions ? <IconRow icon="navigation" label="찾아오는 길">{academy.directions}</IconRow> : null}
          {academy.address ? <a href={`https://map.naver.com/p/search/${encodeURIComponent(academy.address)}`} target="_blank" rel="noreferrer" className={ui.button} data-variant="secondary" aria-label="지도 앱에서 보기 (새 창)">지도 앱에서 보기</a>
            : <p className={ui.bodyMuted}>등록된 위치 정보가 없어요.</p>}
        </AppSection>
        {/* 이 화면이 곧 학원 소개라, 전화번호가 없으면 문의 행을 두지 않는다. */}
        {academy.phone ? <AcademyInquiry phone={academy.phone} academyHref={null} /> : null}
      </div>
    </div>
    {classes.length ? <div className={ui.footer}>
      <AppButtonLink href={earliest ? classHref(earliest.id, earliest.slot.optionId) : "#classes"}
        caption={earliest ? `가장 빠른 시간 · ${appDateLabel(earliest.slot.startAt)} ${appTimeLabel(earliest.slot.startAt)}` : null}>체험 신청하기</AppButtonLink>
    </div> : null}
  </ParentAppShell>
}
