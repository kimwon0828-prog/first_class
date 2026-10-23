import { StudioDetailLink } from "@/features/studio/ui/studio-detail-link"
import { StudioQueryRetry } from "@/features/studio/ui/studio-query-retry"
import Link from "next/link"
import { Fragment } from "react"

import { getStudioEntitlementsForDisplay } from "@/features/billing/queries/get-organization-entitlements"
import { getStudioRecentExperienceFeedback } from "@/features/feedback/queries/get-experience-feedback"
import { feedbackChipLabel } from "@/features/feedback/lib/experience-feedback"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { buildStudioDashboardView, type StudioDashboardActionItem } from "@/features/studio/lib/studio-dashboard-view"
import { buildStudioMonthlyConversion } from "@/features/studio/lib/studio-dashboard-monthly"
import { formatCasesDate, getCasesScheduleLabel } from "@/features/studio/lib/cases-workflow"
import { getSeoulTodayKey, toSeoulDateKey } from "@/features/studio/lib/studio-schedule-month"
import { getStudioApplicationsForDashboard } from "@/features/studio/queries/get-studio-applications"
import { getStudioCaseStageBoard, type StudioCaseStageCard, type StudioCaseStageKey } from "@/features/studio/queries/get-studio-cases"
import { StudioHomeFirstTask, type StudioHomeFirstTaskItem } from "@/features/studio/ui/studio-home-first-task"
import { v2ButtonClassName } from "@/features/studio/ui/v2/v2-button"
import { V2Avatar } from "@/features/studio/ui/v2/v2-avatar"
import { V2ChevronRightIcon, V2MessageIcon, V2PlusIcon, V2SearchIcon } from "@/features/studio/ui/v2/v2-icons"
import { V2StatusBadge } from "@/features/studio/ui/v2/v2-status-badge"
import { V2SubjectIcon3D } from "@/features/studio/ui/v2/v2-subject-icon-3d"
import { getChildGradeLabel } from "@/shared/constants/education-taxonomy"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"
import { getStudioNavigationPathResolver } from "@/shared/lib/studio-navigation-server"

import styles from "./page.module.css"

const WEEKDAYS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"]
const gradeLabel = (grade: string | null | undefined) => (grade ? getChildGradeLabel(grade) ?? grade : "")

/** 두 서울 날짜(YYYY-MM-DD) 사이 일수. */
const daysBetween = (fromKey: string | null, toKey: string) => {
  if (!fromKey) return 0
  const toUtc = (key: string) => { const [y, m, d] = key.split("-").map(Number); return Date.UTC(y, m - 1, d) }
  return Math.max(0, Math.round((toUtc(toKey) - toUtc(fromKey)) / 86_400_000))
}

/* 홈 "체험에서 등록까지" 칸. 판정은 getStudioCaseStageBoard(deriveCasesWorkflow)가 했다 — 여기서는 글자만 고른다. */
const STAGE_COLUMNS: Array<{ key: StudioCaseStageKey; title: string; caption: string; button: string; moreQuery: string }> = [
  { key: "schedule", title: "일정 확정", caption: "학부모 답 기다림", button: "확정", moreQuery: "filter=schedule_needed" },
  { key: "record", title: "기록 작성", caption: "체험 끝난 학생", button: "기록 쓰기", moreQuery: "view=closed&filter=undecided" },
  { key: "report", title: "리포트 보내기", caption: "기록 저장됨", button: "보내기", moreQuery: "view=closed&filter=undecided" },
  { key: "registration", title: "등록 결과", caption: "리포트 받은 학부모", button: "결과 입력", moreQuery: "view=closed&filter=undecided" }
]

/**
 * 홈 · 오늘 할 일 (Figma 2148:4963). STUDIO_DESIGN_SYSTEM.md §5.20.
 * 기존 대시보드 데이터 · 판정 · 지표 정의를 그대로 쓴다. 상태를 바꾸는 버튼은 "가장 먼저"의 [이 시간으로 확정] 하나이고,
 * 상세 일정 확정과 같은 서버 액션을 쓴다. 나머지 버튼은 상세의 해당 칸으로 이동만 한다.
 */
export default async function StudioIndexPage() {
  const studioPath = await getStudioNavigationPathResolver()
  const teacher = await requireTeacherStudioAccess()
  const now = new Date()
  const todayKey = getSeoulTodayKey(now)
  const [{ data: applications, error }, { entitlements }, stageBoard, feedback] = await Promise.all([
    getStudioApplicationsForDashboard(teacher.organizationId),
    getStudioEntitlementsForDisplay(teacher.organizationId),
    getStudioCaseStageBoard(teacher.organizationId),
    getStudioRecentExperienceFeedback(teacher.organizationId, now)
  ])
  const view = buildStudioDashboardView(applications, now)
  // 전환 지표는 유료다. 권한이 없으면 집계 자체를 하지 않는다(값이 payload 에 실리지 않게).
  const monthly = entitlements.canUseConversionAnalytics ? buildStudioMonthlyConversion(applications, now) : null
  const thisMonth = monthly?.at(-1) ?? null
  const lastMonth = monthly?.at(-2) ?? null
  const monthDelta = thisMonth?.rate != null && lastMonth?.rate != null ? Math.round((thisMonth.rate - lastMonth.rate) * 10) / 10 : null
  const maxRate = Math.max(1, ...(monthly ?? []).map(item => item.rate ?? 0))
  const currentMonth = Number(todayKey.slice(5, 7))

  /* ── 머리: 날짜 · 시각 · 시간대 인사 ─────────────────────────── */
  const nowParts = getSeoulDateTimeParts(now)
  const hour = nowParts?.hour ?? 9
  const dateLine = nowParts
    ? `${nowParts.month}월 ${nowParts.day}일 ${WEEKDAYS[nowParts.weekday]} · ${hour < 12 ? "오전" : "오후"} ${hour % 12 === 0 ? 12 : hour % 12}:${String(nowParts.minute).padStart(2, "0")}`
    : view.todayLabel
  const greeting = hour < 12 ? "좋은 아침이에요" : hour < 18 ? "좋은 오후예요" : "좋은 저녁이에요"

  /* ── 가장 먼저: 오늘 할 일 미리보기(최대 5건)를 사람 중심 문장으로 ─────── */
  const toFirstTask = (item: StudioDashboardActionItem): StudioHomeFirstTaskItem => {
    const name = item.studentName
    const isConfirmKind = item.kind === "CONFIRM_SCHEDULE" || item.kind === "REVIEW_NEW"
    // 체험 완료 뒤 할 일(기록 · 리포트 · 등록 결과)은 신청 목록과 같은 판정(deriveCasesWorkflow)으로 나눈다.
    const completedAction = item.kind === "NEEDS_REGISTRATION" ? stageBoard.data.completedActionById[item.id] ?? "registration" : null
    const waitedDays = daysBetween(toSeoulDateKey(item.createdAt), todayKey)
    const title = isConfirmKind ? (waitedDays > 0 ? `${name} 학부모님이 ${waitedDays}일째 답을 기다려요` : `${name} 학부모님이 오늘 신청했어요`)
      : item.kind === "NEEDS_COMPLETION" ? `${name} 체험이 끝났어요. 완료 처리해 주세요`
      : completedAction === "record" ? `${name} 체험 기록을 남겨 주세요`
      : completedAction === "report" ? `${name} 학부모님께 리포트를 보내 주세요`
      : completedAction === "registration" ? `${name} 학부모님 등록 결과를 알려 주세요`
      : `${name} 담당 선생님을 정해 주세요`
    const schedule = item.scheduleAt ? getCasesScheduleLabel({ requestedSlotAt: item.scheduleAt, confirmedSlotAt: item.scheduleConfirmed ? item.scheduleAt : null }) : null
    const meta = [gradeLabel(item.studentGrade), item.classTitle, schedule].filter(Boolean).join(" · ")
    // 희망 시간이 남아 있고 확정할 일정이 있을 때만 홈에서 바로 확정한다(상세의 확정 버튼 막힘 조건과 같다).
    const canConfirmHere = isConfirmKind && (item.applicationStatus === "new" || item.applicationStatus === "reviewing") &&
      item.hasSchedule && !item.scheduleConfirmed && item.scheduleAt !== null && Date.parse(item.scheduleAt) > now.getTime()
    const primary: StudioHomeFirstTaskItem["primary"] = canConfirmHere ? { type: "confirm" }
      : isConfirmKind ? { type: "link", label: "일정 확정하러 가기", section: "confirm-schedule" }
      : item.kind === "NEEDS_COMPLETION" ? { type: "link", label: "완료 확인하러 가기", section: null }
      : completedAction === "record" ? { type: "link", label: "기록 쓰기", section: "trial-record" }
      : completedAction === "report" ? { type: "link", label: "리포트 보내기", section: null }
      : completedAction === "registration" ? { type: "link", label: "결과 입력", section: "registration-result-title" }
      : { type: "link", label: "담당 배정하러 가기", section: null }
    return {
      id: item.id, href: item.href, title, meta, subjectCategory: item.classSubjectCategory, primary,
      secondary: canConfirmHere ? { label: "다른 시간 보기", section: "confirm-schedule" } : null,
      hint: canConfirmHere ? "확정하면 학부모에게 바로 알림이 가요" : null
    }
  }

  /* ── 체험에서 등록까지 카드 문구 ─────────────────────────────── */
  const stageCardLines = (key: StudioCaseStageKey, card: StudioCaseStageCard): { when: string | null; foot: string; footTone: "warn" | "brand" | null } => {
    const schedule = getCasesScheduleLabel(card)
    if (key === "schedule") {
      const days = daysBetween(toSeoulDateKey(card.createdAt), todayKey)
      return { when: schedule, foot: days > 0 ? `${days}일째 기다림` : "오늘 신청", footTone: days > 0 ? "warn" : null }
    }
    const when = schedule ? `${schedule.replace(/^희망 /, "")} 체험` : null
    if (card.completionNeeded) return { when, foot: "완료 확인 필요", footTone: "warn" }
    if (key === "record") return { when, foot: `${daysBetween(toSeoulDateKey(card.completedAt ?? card.confirmedSlotAt ?? card.requestedSlotAt), todayKey)}일째`, footTone: null }
    if (key === "report") return { when, foot: "아직 안 보냄", footTone: null }
    return {
      when,
      foot: card.hasParentFeedback ? "학부모 의견 있음" : card.reportSentAt ? `리포트 ${formatCasesDate(card.reportSentAt)} 보냄` : "리포트 보냄",
      footTone: card.hasParentFeedback ? "brand" : null
    }
  }

  const latestFeedback = feedback.data.latest
  const feedbackQuote = latestFeedback
    ? latestFeedback.privateNote?.trim() || latestFeedback.selectedChipIds.map(id => feedbackChipLabel(id)).join(" · ")
    : null
  const pending = view.pendingRegistrationItems

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <p className={styles.dateLine}>{dateLine}</p>
          <h1 className={styles.title}>{greeting}, 원장님</h1>
        </div>
        {/* 학생 이름으로 찾기: 신청 목록의 기존 검색(q)으로 넘긴다. */}
        <form action={studioPath("/studio/cases")} method="get" role="search" className={styles.search}>
          <V2SearchIcon size={18} className={styles.searchIcon} />
          <input type="search" name="q" maxLength={60} placeholder="학생 이름으로 찾기" aria-label="학생 이름으로 찾기" />
        </form>
        <Link href={studioPath("/studio/classes/new")} className={v2ButtonClassName({ variant: "outline", size: "md" })}>
          <V2PlusIcon size={18} />수업 등록
        </Link>
      </header>

      {error ? <section className={styles.errorCard} role="alert"><p>{error}</p><StudioQueryRetry /></section> : null}

      <div className={styles.hero}>
        <StudioHomeFirstTask items={view.actionItems.map(toFirstTask)} totalCount={view.actionTotalCount} />

        <section className={styles.todayCard} aria-labelledby="today-title">
          <div className={styles.todayHead}>
            <h2 id="today-title">오늘 체험 <strong>{view.todayScheduleCount}명</strong></h2>
            <Link href={studioPath("/studio/schedule")} className={styles.moreLink}>수업·일정 ›</Link>
          </div>
          {view.scheduleItems.length ? <ul className={styles.slots}>
            {view.scheduleItems.map(item => {
              // 버튼은 모양만 Figma 그대로이고 상세로 이동한다(완료 · 배정은 상세에서).
              const button = item.completionDue ? "완료" : !item.teacherName ? "배정" : null
              return <li key={item.id}>
                <StudioDetailLink internalPath={item.href} className={styles.slot} data-in-trial={item.inTrial ? "" : undefined}>
                  <span className={styles.slotTime}>{item.timeLabel}</span>
                  <span className={styles.slotDot} aria-hidden="true" />
                  <span className={styles.slotBody}>
                    <span className={styles.slotName}>{item.studentName}{item.studentGrade ? ` · ${gradeLabel(item.studentGrade)}` : ""}<V2StatusBadge tone={item.statusTone}>{item.statusLabel}</V2StatusBadge></span>
                    <span className={item.teacherName ? styles.slotMeta : `${styles.slotMeta} ${styles.slotMetaAlert}`}>{item.classTitle} · {item.teacherName ?? "담당 미배정"}</span>
                  </span>
                  {button ? <span className={v2ButtonClassName({ variant: "tonal", size: "sm" })}>{button}</span> : null}
                </StudioDetailLink>
              </li>
            })}
          </ul> : <div className={styles.todayEmpty}>
            <p className={styles.emptyText}>오늘 체험은 없어요</p>
            {view.upcomingItems.length ? <>
              <p className={styles.upcomingTitle}>다가오는 체험</p>
              <ul className={styles.upcoming}>
                {view.upcomingItems.map(item => <li key={item.id}>
                  <StudioDetailLink internalPath={item.href} className={styles.upcomingRow}>
                    <span className={styles.upcomingWhen}>{item.dateLabel} {item.timeLabel}</span>
                    <span className={styles.upcomingName}>{item.studentName}{item.studentGrade ? ` · ${gradeLabel(item.studentGrade)}` : ""}</span>
                  </StudioDetailLink>
                </li>)}
              </ul>
            </> : null}
          </div>}
        </section>
      </div>

      <section className={styles.pipeline} aria-labelledby="pipeline-title">
        <div className={styles.blockHead}>
          <h2 id="pipeline-title">체험에서 등록까지</h2>
          <p>체험 예정 {view.scheduledUpcomingCount}명은 오늘 체험 · 수업·일정에서 봐요</p>
          <Link href={studioPath("/studio/cases")} className={styles.moreLinkLg}>신청 전체보기 ›</Link>
        </div>
        {stageBoard.error ? <div role="alert" className={styles.inlineError}><p>{stageBoard.error}</p><StudioQueryRetry /></div> : null}
        <div className={styles.board}>
          {STAGE_COLUMNS.map((column, index) => {
            const stage = stageBoard.data[column.key]
            return <Fragment key={column.key}>
              {index > 0 ? <span className={styles.boardArrow} aria-hidden="true"><V2ChevronRightIcon size={20} /></span> : null}
              <section className={styles.stage} aria-labelledby={`stage-${column.key}`}>
                <div className={styles.stageHead}>
                  <h3 id={`stage-${column.key}`}>{column.title}</h3>
                  <span className={styles.stageCount}>{stage.count}</span>
                </div>
                <p className={styles.stageCaption}>{column.caption}</p>
                {stage.items.map((card, cardIndex) => {
                  const lines = stageCardLines(column.key, card)
                  return <StudioDetailLink key={card.id} internalPath={`/studio/applications/${card.id}`} section={card.section}
                    className={column.key === "schedule" && cardIndex === 0 ? `${styles.stageCard} ${styles.stageCardFirst}` : styles.stageCard}>
                    <span className={styles.stageHeadRow}>
                      <V2SubjectIcon3D categoryCode={card.subjectCategory} size={32} />
                      <span className={styles.stageWho}>
                        <span><strong>{card.student.name}</strong><small>{gradeLabel(card.student.grade)}</small></span>
                        <span className={styles.stageClass}>{card.klass.title ?? "수업 정보 없음"}</span>
                      </span>
                    </span>
                    {lines.when ? <span className={styles.stageWhen}>{lines.when}</span> : null}
                    <span className={styles.stageFoot}>
                      <span data-tone={lines.footTone ?? undefined}>{lines.foot}</span>
                      <span className={v2ButtonClassName({ variant: "tonal", size: "sm" })}>{card.completionNeeded ? "완료 확인" : column.button}</span>
                    </span>
                  </StudioDetailLink>
                })}
                {!stage.items.length && !stageBoard.error ? <p className={styles.stageEmpty}>지금은 없어요</p> : null}
                {stage.count > stage.items.length ? <Link href={`${studioPath("/studio/cases")}?${column.moreQuery}`} className={styles.stageMore}>{stage.count - stage.items.length}건 더 보기 ›</Link> : null}
              </section>
            </Fragment>
          })}
        </div>
      </section>

      <div className={styles.insights}>
        <section className={styles.month} aria-labelledby="month-title">
          <div className={styles.cardHead}>
            <h2 id="month-title">{currentMonth}월 등록 전환</h2>
            <Link href={studioPath("/studio/analytics")} className={styles.moreLink}>분석 ›</Link>
          </div>
          {monthly && thisMonth ? <>
            <div className={styles.bigValue}>
              <strong>{thisMonth.rate == null ? "-" : `${thisMonth.rate}%`}</strong>
              {monthDelta != null && lastMonth ? <span className={styles.delta}>{lastMonth.month}월보다 {monthDelta >= 0 ? "+" : ""}{monthDelta}%p</span> : null}
            </div>
            <p className={styles.cardCaption}>{thisMonth.decidedCount ? `체험 ${thisMonth.decidedCount}명 중 ${thisMonth.enrolledCount}명이 등록했어요` : "이번 달은 아직 등록 결과가 나온 학생이 없어요"}</p>
            <ol className={styles.trend} aria-label="최근 6개월 등록 전환율">
              {monthly.map(item => <li key={item.month} data-current={item.current ? "" : undefined}>
                <span className={styles.trendBar} style={{ height: `${item.rate == null ? 0 : Math.max(4, Math.round(62 * item.rate / maxRate))}px` }} />
                <span className={styles.trendLabel}>{item.month}월<span className={styles.srOnly}> {item.rate == null ? "-" : `${item.rate}%`}</span></span>
              </li>)}
            </ol>
          </> : <>
            <p className={styles.cardCaption}>등록 전환은 스탠다드 플랜에서 볼 수 있어요.</p>
            <Link href={studioPath("/studio/billing")} className={v2ButtonClassName({ variant: "tonal", size: "sm", className: styles.cardButton })}>요금제 보기</Link>
          </>}
        </section>

        <section className={styles.feedback} aria-labelledby="feedback-title">
          <div className={styles.cardHead}>
            <V2MessageIcon size={18} className={styles.feedbackIcon} />
            <h2 id="feedback-title">학부모 의견</h2>
            {feedback.data.recentCount > 0 ? <span className={styles.newCount}>새 글 {feedback.data.recentCount}</span> : null}
          </div>
          {feedback.error ? <div role="alert"><p className={styles.cardCaption}>학부모 의견을 불러오지 못했어요.</p><StudioQueryRetry /></div>
            : latestFeedback && feedbackQuote ? <>
              <p className={styles.quote}>“{feedbackQuote}”</p>
              <div className={styles.feedbackFoot}>
                <span>{latestFeedback.childName}{latestFeedback.childGrade ? `(${gradeLabel(latestFeedback.childGrade)})` : ""} 보호자</span>
                <StudioDetailLink internalPath={`/studio/applications/${latestFeedback.applicationId}`} className={styles.replyLink}>답하기 ›</StudioDetailLink>
              </div>
            </> : <p className={styles.cardCaption}>아직 학부모 의견이 없어요</p>}
        </section>

        <section className={styles.recontact} aria-labelledby="recontact-title">
          <div className={styles.cardHead}>
            <h2 id="recontact-title">다시 연락할 학생</h2>
            <Link href={`${studioPath("/studio/cases")}?view=closed&filter=pending`} className={styles.moreLink}>학생 ›</Link>
          </div>
          {pending.length ? <>
            <div className={styles.bigValue}><strong>{pending.length}명</strong><span className={styles.mutedValue}>고민 중</span></div>
            <div className={styles.avatars} aria-label={`고민 중인 학생 ${pending.length}명`}>
              {pending.slice(0, 3).map((item, index) => <V2Avatar key={item.id} name={item.studentName} size={32} tone={index === 0 ? "brand" : "neutral"} className={styles.avatar} />)}
              {pending.length > 3 ? <span className={styles.avatarMore}>+{pending.length - 3}</span> : null}
            </div>
          </> : <p className={styles.cardCaption}>지금 고민 중인 학생이 없어요</p>}
        </section>
      </div>
    </div>
  )
}
