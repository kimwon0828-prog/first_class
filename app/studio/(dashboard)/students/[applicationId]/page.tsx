import Link from "next/link"
import { notFound } from "next/navigation"

import {
  STUDIO_STUDENT_RESULT_LABELS,
  STUDIO_STUDENT_RESULT_TONES
} from "@/features/studio/lib/application-status-labels"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getSeoulTodayKey } from "@/features/studio/lib/studio-schedule-month"
import { StudioQueryRetry } from "@/features/studio/ui/studio-query-retry"
import { v2ButtonClassName } from "@/features/studio/ui/v2/v2-button"
import { V2Avatar } from "@/features/studio/ui/v2/v2-avatar"
import { V2BackIcon, V2MessageIcon, V2PhoneIcon, V2SendIcon } from "@/features/studio/ui/v2/v2-icons"
import { V2StatusBadge } from "@/features/studio/ui/v2/v2-status-badge"
import { V2SubjectIcon3D } from "@/features/studio/ui/v2/v2-subject-icon-3d"
import { formatStudentDateWithWeekday, STUDENT_LOCK_LABELS } from "@/features/students/lib/student-grouping"
import { getRecontactPanelContext } from "@/features/students/queries/get-recontact-panel-context"
import { getStudioStudentDetail, type StudioStudentDetail } from "@/features/students/queries/get-studio-students"
import { NextContactCard } from "@/features/students/ui/next-contact-card"
import { StudentSendLauncher } from "@/features/students/ui/student-send-launcher"
import styles from "@/features/students/ui/student-detail.module.css"
import { getStudioNavigationPathResolver } from "@/shared/lib/studio-navigation-server"

type StudioStudentDetailPageProps = {
  params: Promise<{ applicationId: string }>
}

const consentLine = (detail: StudioStudentDetail) => {
  if (detail.lock === "no_account") return "엑셀로 가져온 학생이라 수신 동의를 받을 수 없어요"
  return detail.consent?.consented ? "광고성 정보 수신 동의함" : "광고성 정보 수신 동의 안 함"
}

const consentInfo = (detail: StudioStudentDetail) => {
  if (detail.lock === "no_account") return "받을 수 없음 · 엑셀 학생"
  if (detail.consent?.consented && detail.consent.consentedAt) {
    const base = `동의함 · ${formatStudentDateWithWeekday(detail.consent.consentedAt)}`
    return detail.lock === "no_phone" ? `${base} · 휴대폰 인증 필요` : base
  }
  if (detail.consent?.withdrawnAt) return `동의 철회 · ${formatStudentDateWithWeekday(detail.consent.withdrawnAt)}`
  return "동의 안 함"
}

/**
 * 학생 상세 (Figma 2148:5959). STUDIO_DESIGN_SYSTEM.md §5.28.
 * 주소의 신청 id 가 속한 학생(신청 묶음)을 보인다. 다음 연락 저장은 무료, 안내 보내기는 스탠다드다.
 */
export default async function StudioStudentDetailPage({ params }: StudioStudentDetailPageProps) {
  const teacher = await requireTeacherStudioAccess()
  const { applicationId } = await params
  const studioPath = await getStudioNavigationPathResolver()
  const now = new Date()
  const [{ data: detail, error }, panel] = await Promise.all([
    getStudioStudentDetail(teacher.organizationId, applicationId, now),
    getRecontactPanelContext(teacher.organizationId)
  ])

  if (!detail && !error) {
    notFound()
  }

  const back = (
    <Link href={studioPath("/studio/students")} className={styles.back}>
      <V2BackIcon size={18} />학생
    </Link>
  )

  if (!detail) {
    return (
      <div className={styles.page}>
        {back}
        <section className={styles.errorCard} role="alert">
          <p>{error}</p>
          <StudioQueryRetry />
        </section>
      </div>
    )
  }

  const phoneDigits = detail.parentPhone?.replace(/\D/g, "") ?? ""
  const recipient = { applicationId: detail.applicationId, name: detail.name, trialLabel: detail.trialLabel }
  const sendLock = detail.lock ? STUDENT_LOCK_LABELS[detail.lock].long : null
  const info: Array<[string, string]> = [
    ["관심 과목", detail.info.interestSubjects ?? "—"],
    ["학습 수준", detail.info.currentLevel ?? "—"],
    ["정규 희망 시간", detail.info.regularSchedule ?? "—"],
    ["보호자", detail.parentName ?? "—"],
    ["수신 동의", consentInfo(detail)]
  ]

  return (
    <div className={styles.page}>
      {back}

      <header className={styles.head}>
        {/* 첫 글자는 이름(성 뺀) 첫 글자 — Figma "하"(정하람). */}
        <V2Avatar name={/^[가-힣]{3}$/.test(detail.name) ? detail.name.slice(1) : detail.name} size={64} tone="brand" className={styles.avatar} />
        <div className={styles.headText}>
          <div className={styles.headLine}>
            <h1 className={styles.name}>{detail.name}</h1>
            <span className={styles.gradeSchool}>{[detail.gradeLabel, detail.school].filter(Boolean).join(" · ")}</span>
            <V2StatusBadge tone={STUDIO_STUDENT_RESULT_TONES[detail.result]}>{STUDIO_STUDENT_RESULT_LABELS[detail.result]}</V2StatusBadge>
          </div>
          <p className={styles.guardian}>
            {[detail.parentName ? `보호자 ${detail.parentName}` : null, detail.parentPhone, consentLine(detail)].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className={styles.headActions}>
          {phoneDigits ? (
            <a href={`tel:${phoneDigits}`} className={v2ButtonClassName({ variant: "outline", size: "sm" })}>
              <V2PhoneIcon size={16} />전화
            </a>
          ) : null}
          <StudentSendLauncher context={panel} recipient={recipient} template="custom" variant="outline" size="sm" icon={<V2MessageIcon size={16} />} label="문자" disabledReason={sendLock} />
          <StudentSendLauncher context={panel} recipient={recipient} template="new_class" variant="tonal" size="sm" icon={<V2SendIcon size={16} />} label="안내 보내기" disabledReason={sendLock} />
        </div>
      </header>

      <div className={styles.split}>
        <div className={styles.main}>
          <h2 className={styles.sectionTitle}>체험 기록</h2>
          {detail.experiences.map((experience) => (
            <article key={experience.applicationId} className={styles.experience}>
              <div className={styles.experienceHead}>
                <V2SubjectIcon3D categoryCode={experience.subjectCategory} size={44} />
                <div className={styles.experienceText}>
                  <p className={styles.experienceTitle}>{experience.classTitle}</p>
                  <p className={styles.experienceMeta}>
                    {[experience.whenLabel, experience.teacherName ? experience.teacherName : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Link href={studioPath(`/studio/applications/${experience.applicationId}`)} className={styles.experienceLink}>
                  {experience.reportSent ? "리포트 보기 ›" : "신청 보기 ›"}
                </Link>
              </div>
              {experience.publicSummary ? (
                <div className={styles.story}>
                  <p className={styles.storyLabel}>선생님 이야기</p>
                  <p className={styles.storyText}>{experience.publicSummary}</p>
                </div>
              ) : null}
              <div className={styles.experienceResult}>
                <V2StatusBadge tone={STUDIO_STUDENT_RESULT_TONES[experience.result]}>{experience.resultLabel}</V2StatusBadge>
                {experience.reasonLine ? <span className={styles.experienceReason}>{experience.reasonLine}</span> : null}
                <span className={styles.spacer} />
                {experience.recordedLabel ? <span className={styles.experienceRecorded}>{experience.recordedLabel}</span> : null}
              </div>
            </article>
          ))}

          <h2 className={styles.sectionTitle}>연락 기록</h2>
          <ol className={styles.timeline}>
            {detail.timeline.map((item, index) => (
              <li key={item.key} className={styles.timelineItem}>
                <span className={index === 0 ? `${styles.dot} ${styles.dotLatest}` : styles.dot} aria-hidden="true" />
                <div className={styles.timelineText}>
                  <p className={styles.timelineTitle}>{item.title}</p>
                  <p className={styles.timelineDetail}>{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <aside className={styles.side}>
          <NextContactCard
            applicationId={detail.applicationId}
            nextContact={detail.nextContact}
            todayKey={getSeoulTodayKey(now)}
            sendButton={sendLock ? null : (
              <StudentSendLauncher context={panel} recipient={recipient} template="new_class" variant="primary" size="md" icon={<V2SendIcon size={18} />} label="안내 보내기" fullWidth />
            )}
          />
          <section className={styles.info} aria-labelledby="student-info-title">
            <h2 id="student-info-title" className={styles.infoTitle}>학생 정보</h2>
            {info.map(([label, value]) => (
              <div key={label} className={styles.infoRow}>
                <span className={styles.infoLabel}>{label}</span>
                <span className={styles.infoValue}>{value}</span>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  )
}
