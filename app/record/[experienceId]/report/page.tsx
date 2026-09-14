import Link from "next/link"
import { notFound } from "next/navigation"
import { unstable_noStore as noStore } from "next/cache"

import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { getMyExperienceReport } from "@/features/record/queries/get-my-experience-report"

import styles from "./page.module.css"

// 학원이 발행한 체험 리포트를 학부모가 보는 화면.
//
// ⚠️ 이 화면은 experience_reports.content 만 본다.
//    trial_results 를 다시 읽어 조립하지 않는다 — 그러면 학원이 평가를 고치는 순간
//    학부모가 이미 본 리포트가 같이 바뀐다. 발행본은 발행 시점에 얼어붙은 것이다.
//
// Experience Detail 과 역할이 다르다.
//   Detail  — 무슨 일이 있었는가
//   Report  — 그 경험을 어떻게 이해할 수 있는가

export const dynamic = "force-dynamic"
export const revalidate = 0

const formatReportDate = (value: string | null) => {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const weekdays = ["일", "월", "화", "수", "목", "금", "토"]
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${weekdays[date.getDay()]})`
}

const formatPublishedDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${date.getFullYear()}.${month}.${day}`
}

export default async function ExperienceReportPage({
  params
}: {
  params: Promise<{ experienceId: string }>
}) {
  noStore()
  const { experienceId } = await params
  await requireParentAccess({ returnTo: `/record/${experienceId}/report` })

  const result = await getMyExperienceReport(experienceId)

  // 남의 경험은 존재 여부조차 알려주지 않는다. Experience Detail 과 같은 처리다.
  if (result.status === "not_found") {
    notFound()
  }

  const backHref = `/record/${experienceId}`

  // 내 경험이지만 지금 볼 수 있는 리포트가 없을 때.
  // 조회 실패와 미발행을 같은 화면으로 뭉개지 않는다.
  if (result.status !== "ok") {
    const isError = result.status === "error"

    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <header className={styles.header}>
            <Link href={backHref} className={styles.back}>
              ← 체험 기록
            </Link>
          </header>

          <section className={styles.emptyState} aria-live="polite">
            <p className={styles.emptyTitle}>
              {isError
                ? "리포트 정보를 불러오지 못했습니다."
                : "현재 확인할 수 있는 체험 리포트가 없습니다."}
            </p>
            <p className={styles.emptyBody}>
              {isError
                ? "잠시 후 다시 확인해 주세요."
                : "학원에서 리포트를 발행하면 이곳에서 확인할 수 있어요."}
            </p>
            <Link href={backHref} className={styles.emptyAction}>
              체험 기록으로 돌아가기
            </Link>
          </section>
        </div>
      </main>
    )
  }

  const { report } = result
  const snapshot = report.content
  const experienceDate = formatReportDate(snapshot.experience.date)
  const publishedDate = formatPublishedDate(report.publishedAt)
  const recommendations = [
    { label: "과정", value: snapshot.recommendation.course },
    { label: "레벨", value: snapshot.recommendation.level },
    { label: "일정", value: snapshot.recommendation.schedule }
  ].filter((item): item is { label: string; value: string } => Boolean(item.value))

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href={backHref} className={styles.back}>
            ← 체험 기록
          </Link>
        </header>

        <section className={styles.hero}>
          <p className={styles.childName}>{snapshot.experience.child.displayName}</p>
          <h1 className={styles.title}>체험 리포트</h1>
          {experienceDate ? <p className={styles.heroDate}>{experienceDate}</p> : null}
          <p className={styles.academy}>{snapshot.experience.academy.name}</p>
          <p className={styles.className}>{snapshot.experience.class.title}</p>
        </section>

        {snapshot.observations.length > 0 ? (
          <section className={styles.block} aria-labelledby="observations-title">
            <h2 id="observations-title" className={styles.blockTitle}>
              이번 체험에서 관찰된 모습
            </h2>
            {/*
              발행 당시 저장된 문장을 그대로 보여 준다.
              여기서 다시 해석하거나 다른 말로 바꾸지 않는다 — 학원이 적은 것이
              학부모가 읽는 것이어야 한다.
            */}
            <ul className={styles.observationList}>
              {snapshot.observations.map((item) => (
                <li key={item.code} className={styles.observationItem}>
                  {item.label}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {recommendations.length > 0 ? (
          <section className={styles.block} aria-labelledby="recommendation-title">
            <h2 id="recommendation-title" className={styles.blockTitle}>
              추천받은 다음 과정
            </h2>
            {/* 값이 없는 항목은 "-" 를 채우지 않고 행 자체를 두지 않는다. */}
            <dl className={styles.recommendationList}>
              {recommendations.map((item) => (
                <div key={item.label} className={styles.recommendationRow}>
                  <dt className={styles.recommendationLabel}>{item.label}</dt>
                  <dd className={styles.recommendationValue}>{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <footer className={styles.footer}>
          {publishedDate ? <p className={styles.publishedAt}>{publishedDate} 발행</p> : null}
          {/*
            이 리포트가 어디서 왔는지 조용히 밝힌다.
            첫수업이 분석했다거나 평가했다고 말하지 않는다 — 쓴 사람은 학원이다.
          */}
          <p className={styles.sourceNote}>
            이 리포트는 체험 당시 학원에서 기록하고 발행한 내용을 바탕으로 보여드려요.
          </p>
        </footer>
      </div>
    </main>
  )
}
