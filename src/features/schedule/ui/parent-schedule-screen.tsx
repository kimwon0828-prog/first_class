"use client"

import { useId, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"

import { HomeChildSelector } from "@/features/children/ui/home-child-selector"
import type { ChildSelectorOption } from "@/features/children/lib/child-selection"
import { buildClassesHref } from "@/features/classes/lib/classes-href"
import { appDateLabel, appTimeRangeLabel, seoulDateKey } from "@/features/classes/lib/app-presentation"
import { AppIcon } from "@/features/classes/ui/app-icon"
import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentDetailLink } from "@/features/classes/ui/parent-detail-link"
import { AppButton, AppButtonLink, AppLoading, ClassThumb, EmptyState, StatusBadge, TabHeader, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import { ExperienceCancelButton } from "@/features/record/ui/experience-cancel-button"
import { withRecordChild } from "@/features/record/lib/record-href"
import { applicationAddress, applicationBadge, isPendingApplication, slotAt } from "@/features/schedule/lib/app-schedule"
import type { ParentApplicationSummary } from "@/shared/lib/db/adapter"

import styles from "./parent-schedule-screen.module.css"

type Row = ParentApplicationSummary
type Props = {
  upcoming: Row[]
  finished: Row[]
  /** 발행 리포트가 있는 신청. 읽지 못했으면 없음. */
  reportedIds?: string[]
  childOptions: ChildSelectorOption[]
  selectedChildId: string | null
  now: number
  failed?: boolean
}

const DAY = 24 * 60 * 60 * 1000
function dayTitle(value: string, now: number) {
  const days = Math.round((Date.parse(seoulDateKey(value)) - Date.parse(seoulDateKey(new Date(now).toISOString()))) / DAY)
  return `${days === 0 ? "오늘 · " : days === 1 ? "내일 · " : ""}${appDateLabel(value)}`
}
const meta = (row: Row) => [row.academyName, row.childName].filter(Boolean).join(" · ")
const mapHref = (address: string) => `https://map.naver.com/p/search/${encodeURIComponent(address)}`

/** 일정 탭 틀(앱 (tabs)/my/schedule): "일정" 제목 + 아이 선택. */
export function ScheduleFrame({ right, children }: { right?: ReactNode; children: ReactNode }) {
  return <ParentAppShell data-parent-design="v1" className={ui.page}><div className={ui.column}>
    <TabHeader title="일정">{right}</TabHeader>{children}
  </div></ParentAppShell>
}

function ChildPicker({ childOptions, selectedChildId }: Pick<Props, "childOptions" | "selectedChildId">) {
  if (childOptions.length < 2) return null
  const chosen = childOptions.find(child => child.id === selectedChildId)
  return <HomeChildSelector options={childOptions} selectedChildId={selectedChildId} manageSheetFocus unselectedLabel="모든 아이" allChildrenLabel="모든 아이"
    className={styles.childPicker} labelClassName={styles.childPickerLabel}
    triggerContent={<span>{chosen?.name ?? "모든 아이"}</span>} />
}

function UpcomingCard({ row, childId }: { row: Row; childId: string | null }) {
  const badge = applicationBadge(row), pending = isPendingApplication(row), address = applicationAddress(row)
  return <article className={ui.card}>
    <ParentDetailLink href={withRecordChild(`/record/${row.id}`, childId)} className={styles.cardLink} aria-label={`${row.classTitle ?? "수업"} 예약 상세`}>
      <span className={styles.cardTop}>
        {badge ? <StatusBadge label={badge.label} tone={badge.tone} /> : null}
        <span className={`${ui.label} ${styles.grow}`}>{appTimeRangeLabel(slotAt(row), row.slotEndAt)}</span>
        <AppIcon name="chevron-right" size={18} />
      </span>
      <span className={styles.cardBody}>
        <ClassThumb src={row.classCoverImageUrl} subjectCode="other" size={48} />
        <span className={ui.rowText}>
          <span className={`${ui.subtitle} ${ui.oneLine}`}>{row.classTitle ?? "수업 정보 준비 중"}</span>
          <span className={`${ui.caption} ${ui.oneLine}`}>{meta(row)}</span>
        </span>
      </span>
    </ParentDetailLink>
    {pending ? <>
      <p className={ui.pendingNote}><AppIcon name="clock" size={14} /><span>학원이 확인하면 확정 알림을 보내드려요</span></p>
      {row.canCancel ? <ExperienceCancelButton experienceId={row.id} confirmDescription={`${row.classTitle ?? "이 수업"} 신청을 취소할까요?`} className={ui.cancelTrigger} /> : null}
    </> : address ? <a href={mapHref(address)} target="_blank" rel="noreferrer" className={ui.button} data-size="medium" data-variant="primary" aria-label="길찾기 (새 창)">길찾기</a> : null}
  </article>
}

function PastRow({ row, reported, childId }: { row: Row; reported: boolean | null; childId: string | null }) {
  // 완료 처리 전(확정·일정 지남)은 리포트 준비 중으로 보고 버튼을 두지 않는다.
  const awaiting = row.status === "confirmed", report = !awaiting && reported === true
  const badge = awaiting || reported === false ? { label: "리포트 준비 중", tone: "neutral" as const } : report ? { label: "리포트 도착", tone: "positive" as const } : null
  return <li className={styles.pastRow}>
    <ParentDetailLink href={withRecordChild(`/record/${row.id}`, childId)} className={styles.pastLink} aria-label={`${row.classTitle ?? "수업"} 상세`}>
      <ClassThumb src={row.classCoverImageUrl} subjectCode="other" size={48} />
      <span className={ui.rowText}>
        <span className={ui.caption}>{appDateLabel(slotAt(row))}</span>
        <span className={`${ui.subtitle} ${ui.oneLine}`}>{row.classTitle ?? "수업 정보 준비 중"}</span>
        <span className={`${ui.caption} ${ui.oneLine}`}>{meta(row)}</span>
      </span>
      {badge ? <StatusBadge label={badge.label} tone={badge.tone} /> : null}
    </ParentDetailLink>
    {report ? <div className={styles.pastActions}>
      <AppButtonLink href={withRecordChild(`/record/${row.id}/report`, childId)} variant="secondary" size="medium">리포트 보기</AppButtonLink>
      {row.academyHandle ? <AppButtonLink href={`/academy/${row.academyHandle}`} variant="secondary" size="medium">학원 보기</AppButtonLink> : null}
    </div> : null}
  </li>
}

const tabs = ["upcoming", "past"] as const
export function ParentScheduleScreen({ upcoming, finished, reportedIds, childOptions, selectedChildId, now, failed }: Props) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("upcoming")
  const router = useRouter()
  const id = useId()
  const reported = reportedIds ? new Set(reportedIds) : null
  const groups = new Map<string, Row[]>()
  for (const row of upcoming) { const key = seoulDateKey(slotAt(row)); groups.set(key, [...(groups.get(key) ?? []), row]) }
  return <ScheduleFrame right={<ChildPicker childOptions={childOptions} selectedChildId={selectedChildId} />}>
    <div className={ui.segTabs} role="tablist" aria-label="일정 상태">
      {tabs.map((value, index) => <button key={value} type="button" role="tab" id={`${id}-${value}`} aria-controls={`${id}-panel`} className={ui.segTab}
        aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}
        onKeyDown={event => {
          const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : event.key === "ArrowRight" || event.key === "ArrowLeft" ? 1 - index : null
          if (next === null) return
          event.preventDefault(); setTab(tabs[next]); document.getElementById(`${id}-${tabs[next]}`)?.focus()
        }}>{value === "upcoming" ? "예정" : "지난 체험"} {failed ? "" : value === "upcoming" ? upcoming.length : finished.length}</button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} className={`${ui.tabContent} ${styles.panel}`}>
      {failed ? <div className={ui.notice} role="alert"><p className={ui.body}>일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
        <AppButton variant="secondary" onClick={() => router.refresh()}>다시 시도</AppButton></div>
        : tab === "upcoming" ? upcoming.length ? <div className={ui.stackLoose}>{[...groups].map(([key, rows]) => <section key={key} className={ui.stack} aria-label={dayTitle(slotAt(rows[0]), now)}>
          <h2 className={ui.groupLabel}>{dayTitle(slotAt(rows[0]), now)}</h2>
          {rows.map(row => <UpcomingCard key={row.id} row={row} childId={selectedChildId} />)}
        </section>)}</div>
          : <EmptyState icon="calendar" title="예정된 체험이 없어요" body={"은행사거리 학원의 체험수업을\n전화 없이 바로 예약해 보세요"}
            action={<AppButtonLink href={buildClassesHref({ child: selectedChildId })} size="medium">체험수업 둘러보기</AppButtonLink>} />
        : finished.length ? <ul className={styles.pastList}>{finished.map(row => <PastRow key={row.id} row={row} reported={reported ? reported.has(row.id) : null} childId={selectedChildId} />)}</ul>
          : <p className={styles.pastEmpty}>아직 완료된 체험이 없어요.</p>}
    </div>
  </ScheduleFrame>
}

export function ScheduleSkeleton() {
  return <ScheduleFrame><div className={ui.tabContent} aria-busy="true"><AppLoading label="일정 불러오는 중" /></div></ScheduleFrame>
}
