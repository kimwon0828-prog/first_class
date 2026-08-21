import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { getPublicAcademyClasses } from "@/features/academies/queries/get-public-academy-classes"
import { getPublicAcademyPageByHandle } from "@/features/academies/queries/get-public-academy-page"

import styles from "./page.module.css"

const SITE_ORIGIN = "https://firstsuup.com"

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
  coverImageUrl ?? logoImageUrl ?? new URL("/images/first-class-logo.png", SITE_ORIGIN).toString()

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
  const resolvedParams = await params
  const academy = await getPublicAcademyPageByHandle(resolvedParams.handle)

  if (!academy) {
    notFound()
  }

  const classes = await getPublicAcademyClasses(academy.organizationId)
  const academyDisplayName = buildAcademyDisplayName(academy.name, academy.branchName)
  const descriptionParagraphs = splitMultilineItems(academy.description)
  const operatingHourLines = splitMultilineItems(academy.operatingHours)
  const parkingInfoLines = splitMultilineItems(academy.parkingInfo)
  const directionLines = splitMultilineItems(academy.directions)
  const hasPhone = Boolean(academy.phone)
  const phoneHref = academy.phone ? `tel:${academy.phone.replace(/[^0-9+]/g, "")}` : null
  const logoInitial = academy.name.trim().charAt(0) || "학"

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topBar}>
          <Link href="/academies" className={styles.iconButton} aria-label="학원 목록으로 돌아가기">
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
          <p className={styles.topBarTitle}>학원 소개</p>
          <div className={styles.topBarSpacer} aria-hidden="true" />
        </header>

        <section className={styles.heroSection}>
          <div className={styles.coverSection} aria-label="학원 대표 이미지">
            {academy.coverImageUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={academy.coverImageUrl} alt={`${academyDisplayName} 대표 이미지`} className={styles.coverImage} />
              </>
            ) : (
              <div className={styles.coverFallback}>
                <span className={styles.coverFallbackEyebrow}>첫수업 공개 학원 페이지</span>
                <strong className={styles.coverFallbackTitle}>{academyDisplayName}</strong>
              </div>
            )}
          </div>

          <div className={styles.headerCard}>
            <div className={styles.logoFrame}>
              {academy.logoImageUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={academy.logoImageUrl} alt={`${academyDisplayName} 로고`} className={styles.logoImage} />
                </>
              ) : (
                <span className={styles.logoFallback} aria-hidden="true">
                  {logoInitial}
                </span>
              )}
            </div>
            <div className={styles.headerBody}>
              <p className={styles.eyebrow}>학원 소개</p>
              <h1 className={styles.title}>{academyDisplayName}</h1>
              <p className={styles.subtitle}>{academy.shortDescription ?? "학원 소개를 준비 중입니다."}</p>
              <div className={styles.headerMeta}>
                <span>{academy.address ?? "주소 준비 중"}</span>
                <span>{academy.phone ?? "대표 전화 준비 중"}</span>
              </div>
            </div>
          </div>
        </section>

        <div className={styles.sections}>
          <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>핵심 섹션</p>
              <h2 className={styles.sectionTitle}>진행 중인 수업</h2>
            </div>
            <p className={styles.sectionMeta}>{classes.length > 0 ? `${classes.length}개 수업` : "운영 중인 수업 준비 중"}</p>
          </div>

          {classes.length > 0 ? (
            <div className={styles.classGrid}>
              {classes.map((item) => (
                <Link key={item.id} href={`/classes/${item.id}`} className={styles.classCard}>
                  <div>
                    <p className={styles.classProgramType}>{item.programTypeLabel}</p>
                    <strong className={styles.classTitle}>{item.title}</strong>
                  </div>
                  <dl className={styles.classInfoList}>
                    <div className={styles.classInfoRow}>
                      <dt className={styles.classInfoLabel}>과목</dt>
                      <dd className={styles.classInfoValue}>{item.subjectLabel}</dd>
                    </div>
                    <div className={styles.classInfoRow}>
                      <dt className={styles.classInfoLabel}>대상 학년</dt>
                      <dd className={styles.classInfoValue}>{item.targetAgeLabel}</dd>
                    </div>
                    <div className={styles.classInfoRow}>
                      <dt className={styles.classInfoLabel}>기간</dt>
                      <dd className={styles.classInfoValue}>{item.periodLabel}</dd>
                    </div>
                    <div className={styles.classInfoRow}>
                      <dt className={styles.classInfoLabel}>요일·시간</dt>
                      <dd className={styles.classInfoValue}>{item.scheduleLabel}</dd>
                    </div>
                  </dl>
                </Link>
              ))}
            </div>
          ) : (
            <div className={styles.emptyCard}>
              <strong className={styles.emptyTitle}>현재 공개 중인 수업이 없습니다.</strong>
              <p className={styles.emptyDescription}>운영 중인 수업이 열리면 이 영역에 가장 먼저 표시됩니다.</p>
            </div>
          )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>학원 소개</p>
                <h2 className={styles.sectionTitle}>우리 학원은 이렇게 운영해요</h2>
              </div>
            </div>
            {descriptionParagraphs.length > 0 ? (
              <div className={styles.textBlock}>
                {descriptionParagraphs.map((paragraph) => (
                  <p key={paragraph} className={styles.bodyText}>
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : (
              <p className={styles.bodyTextMuted}>상세 소개를 준비 중입니다.</p>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>운영 정보</p>
                <h2 className={styles.sectionTitle}>방문 전에 확인해 주세요</h2>
              </div>
            </div>
            <div className={styles.infoGrid}>
              <article className={styles.infoItem}>
                <h3 className={styles.infoTitle}>운영시간</h3>
                {operatingHourLines.length > 0 ? (
                  operatingHourLines.map((line) => (
                    <p key={line} className={styles.infoText}>
                      {line}
                    </p>
                  ))
                ) : (
                  <p className={styles.infoTextMuted}>운영시간 정보를 준비 중입니다.</p>
                )}
              </article>
              <article className={styles.infoItem}>
                <h3 className={styles.infoTitle}>주차 안내</h3>
                {parkingInfoLines.length > 0 ? (
                  parkingInfoLines.map((line) => (
                    <p key={line} className={styles.infoText}>
                      {line}
                    </p>
                  ))
                ) : (
                  <p className={styles.infoTextMuted}>주차 안내 정보를 준비 중입니다.</p>
                )}
              </article>
              <article className={styles.infoItem}>
                <h3 className={styles.infoTitle}>오시는 길</h3>
                {directionLines.length > 0 ? (
                  directionLines.map((line) => (
                    <p key={line} className={styles.infoText}>
                      {line}
                    </p>
                  ))
                ) : (
                  <p className={styles.infoTextMuted}>오시는 길 정보를 준비 중입니다.</p>
                )}
              </article>
              <article className={styles.infoItem}>
                <h3 className={styles.infoTitle}>주소</h3>
                <p className={styles.infoText}>{academy.address ?? "주소 정보를 준비 중입니다."}</p>
              </article>
              <article className={styles.infoItem}>
                <h3 className={styles.infoTitle}>대표 전화</h3>
                <p className={styles.infoText}>{academy.phone ?? "대표 전화 정보를 준비 중입니다."}</p>
              </article>
            </div>
          </section>
        </div>
      </div>

      <div className={styles.mobileCtaBar}>
        {phoneHref ? (
          <a href={phoneHref} className={styles.mobileCtaButton}>
            대표 전화 걸기
          </a>
        ) : (
          <span className={styles.mobileCtaButtonDisabled}>대표 전화 준비 중</span>
        )}
      </div>
      {hasPhone ? <div className={styles.mobileBottomSpacing} aria-hidden="true" /> : null}
    </main>
  )
}
