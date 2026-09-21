import { PARENT_ORIGIN } from "@/shared/config/site-origins"

import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { getPublicAcademyClasses } from "@/features/academies/queries/get-public-academy-classes"
import { getPublicAcademyPageByHandle } from "@/features/academies/queries/get-public-academy-page"

import { AcademyDetailFrame, AcademyIcon } from "@/features/academies/ui/academy-detail-frame"

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

const splitMultilineItems = (value: string | null | undefined) =>
  (value ?? "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)

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
      title: "학원을 찾을 수 없습니다 | 첫수업"
    }
  }

  const title = `${academy.name} | 첫수업`
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
      title,
      description,
      images: [
        {
          url: ogImageUrl
        }
      ]
    }
  }
}

export default async function AcademyPage({ params }: AcademyPageProps) {
  const { handle } = await params
  const academy = await getPublicAcademyPageByHandle(handle)
  if (!academy) notFound()
  const classes = await getPublicAcademyClasses(academy.organizationId)
  const name = buildAcademyDisplayName(academy.name, academy.branchName)
  const subjects = [...new Set(classes.map(item => item.subjectLabel).filter(Boolean))]
  const details = [
    { label: "주소", value: academy.address },
    { label: "운영시간", value: academy.operatingHours },
    { label: "주차", value: academy.parkingInfo },
    { label: "오시는 길", value: academy.directions }
  ].filter(item => item.value)
  const hasVisitInfo = details.length > 0 || Boolean(academy.phone)
  return <AcademyDetailFrame>
    <section className={styles.summary} aria-label="학원 정보">
      {academy.coverImageUrl ? <div className={styles.cover}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={academy.coverImageUrl} alt={`${name} 대표 이미지`} />
      </div> : null}
      <div className={styles.identity}>
        {academy.logoImageUrl ? <div className={styles.profileImage}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={academy.logoImageUrl} alt={`${name} 공개 프로필 이미지`} />
        </div> : !academy.coverImageUrl ? <span className={styles.fallback}><AcademyIcon /></span> : null}
        <div className={styles.identityText}><h1>{name}</h1>{academy.regionLabel ? <p className={styles.region}>{academy.regionLabel}</p> : null}</div>
      </div>
      {academy.shortDescription ? <p className={styles.description}>{academy.shortDescription}</p> : null}
      {subjects.length ? <div className={styles.tags}>{subjects.map(subject => <span key={subject}>{subject}</span>)}</div> : null}
    </section>
    <section className={styles.section}>
      <h2>공개된 수업 {classes.length}개</h2>
      {classes.length ? <ul className={styles.classList}>{classes.map(item => <li key={item.id}>
        <Link href={`/classes/${item.id}`} className={styles.classCard}>
          <div className={styles.classBody}>
            <span className={styles.type}>{item.programTypeLabel}</span>
            <h3>{item.title}</h3>
            <p>{[item.subjectLabel, item.targetAgeLabel].filter(Boolean).join(" · ")}</p>
            {item.scheduleLabel && item.scheduleLabel !== "요일·시간 확인 필요" ? <p className={styles.schedule}>{item.scheduleLabel}</p> : null}
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
      </li>)}</ul> : <p className={styles.empty}>현재 공개된 수업이 없어요.</p>}
    </section>
    {academy.description ? <section className={styles.section}><h2>학원 소개</h2><div className={styles.textBlock}>{splitMultilineItems(academy.description).map((text, index) => <p key={index}>{text}</p>)}</div></section> : null}
    {hasVisitInfo ? <section className={styles.section}><h2>위치 및 방문 안내</h2>
      <dl className={styles.visit}>{details.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
        {academy.phone ? <div><dt>전화</dt><dd><span>{academy.phone}</span><a className={styles.phone} href={`tel:${academy.phone.replace(/[^0-9+]/g, "")}`}>전화하기</a></dd></div> : null}
      </dl>
    </section> : null}
  </AcademyDetailFrame>
}
