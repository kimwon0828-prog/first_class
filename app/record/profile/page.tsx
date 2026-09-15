import Link from "next/link"
import { notFound } from "next/navigation"
import { unstable_noStore as noStore } from "next/cache"

import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { describeEvidenceCount } from "@/features/profile/lib/education-profile"
import { getMyEducationProfile } from "@/features/profile/queries/get-my-education-profile"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

import styles from "./page.module.css"

// 한 아이의 교육 프로필.
//
// ⚠️ 검사 결과 화면이 아니다.
//
//    여기 나오는 문장은 전부 그때 발행된 리포트에 실제로 들어 있던 문장이다.
//    새 해석을 만들지 않고, 점수·백분율·순위·강점 TOP 으로 바꾸지 않는다.
//    radar chart 도, progress bar 도, badge 도 쓰지 않는다 — 그런 표현은
//    "관찰" 을 "판정" 으로 바꾼다.
//
// Report 와 역할이 다르다.
//   Report  — 한 번의 경험을 어떻게 이해할 수 있는가
//   Profile — 여러 경험에서 실제로 관찰된 것이 무엇이었는가

export const dynamic = "force-dynamic"
export const revalidate = 0

const SEOUL_WEEKDAY_SHORT = ["일", "월", "화", "수", "목", "금", "토"]

const formatSourceDate = (value: string) => {
  const parts = getSeoulDateTimeParts(value)
  if (!parts) {
    return null
  }

  return `${parts.year}.${String(parts.month).padStart(2, "0")}.${String(parts.day).padStart(2, "0")} (${SEOUL_WEEKDAY_SHORT[parts.weekday]})`
}

export default async function EducationProfilePage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  noStore()

  const params = await searchParams
  const childId = typeof params.child === "string" ? params.child : null

  await requireParentAccess({
    returnTo: childId ? `/record/profile?child=${childId}` : "/record"
  })

  if (!childId) {
    notFound()
  }

  const result = await getMyEducationProfile(childId)

  // 남의 아이는 없는 아이와 같게 답한다. 존재 여부를 알려 주지 않는다.
  if (result.state === "not_found") {
    notFound()
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link
            href={`/record?child=${childId}`}
            className={styles.back}
            aria-label="기록으로 돌아가기"
          >
            ←
          </Link>
          <h1 className={styles.headerTitle}>교육 프로필</h1>
        </header>

        {result.state === "error" ? (
          <section className={styles.section}>
            <p className={styles.errorText}>{result.message}</p>
          </section>
        ) : (
          <>
            <section className={styles.childHeader}>
              <p className={styles.childName}>{result.profile.childName}</p>
              <p className={styles.childMeta}>
                리포트가 발행된 체험 {result.profile.publishedExperienceCount}번
              </p>
              {/*
                무엇을 모은 기록인지 먼저 말한다. 부모가 이 화면을 검사 결과로
                읽지 않도록, 근거의 출처를 화면 맨 위에서 밝힌다.
              */}
              <p className={styles.childNote}>
                학원이 발행한 체험 리포트에 적힌 관찰을 그대로 모았어요.
              </p>
            </section>

            {result.profile.observations.length === 0 ? (
              <section className={styles.section}>
                <div className={styles.empty}>
                  <p className={styles.emptyTitle}>아직 쌓인 관찰 기록이 없어요.</p>
                  <p className={styles.emptyBody}>
                    체험 리포트가 발행되면 여기에서 아이의 경험을 함께 모아볼 수 있어요.
                  </p>
                </div>
              </section>
            ) : (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>관찰된 모습</h2>
                <ul className={styles.observationList}>
                  {result.profile.observations.map((observation) => (
                    <li key={observation.code} className={styles.observation}>
                      <p className={styles.observationLabel}>{observation.label}</p>
                      {/* 한 번뿐이면 횟수를 말하지 않는다. 근거 목록은 그대로 남는다. */}
                      {describeEvidenceCount(observation.evidenceCount) ? (
                        <p className={styles.evidenceCount}>
                          {describeEvidenceCount(observation.evidenceCount)}
                        </p>
                      ) : null}

                      <ul className={styles.sourceList}>
                        {observation.sources.map((source) => {
                          const date = formatSourceDate(source.experienceDate)

                          return (
                            <li key={source.reportId} className={styles.source}>
                              {/*
                                근거는 반드시 원래 경험으로 돌아갈 수 있어야 한다.
                                근거 없는 요약만 남기지 않는다.
                              */}
                              <Link
                                href={`/record/${source.experienceId}/report`}
                                className={styles.sourceLink}
                              >
                                <span className={styles.sourceDate}>{date ?? "날짜 미기록"}</span>
                                <span className={styles.sourceMeta}>
                                  {source.academyName} · {source.classTitle}
                                </span>
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}
