"use client"

import Link from "next/link"
import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { HomeChildSelector } from "@/features/children/ui/home-child-selector"
import type { ChildSelectorOption } from "@/features/children/lib/child-selection"
import { ParentBottomNav } from "@/features/classes/ui/parent-bottom-nav"
import { buildClassesHref } from "@/features/classes/lib/classes-href"
import { formatScheduleDateLabel, formatScheduleTimeLabel } from "@/features/schedule/lib/parent-schedule"
import { groupScheduleMonths, type buildScheduleView } from "@/features/schedule/lib/schedule-view"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"
import styles from "./parent-schedule-screen.module.css"

type Props = {
  model: ReturnType<typeof buildScheduleView>
  childOptions: ChildSelectorOption[]
  selectedChildId: string | null
  today: string
  failed?: boolean
}
const tabs = ["upcoming", "completed"] as const
const weekdays = ["일", "월", "화", "수", "목", "금", "토"]
function OutlineIcon({ person = false }: { person?: boolean }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {person ? <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></> : <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18M8 15h3" /></>}
  </svg>
}
export function ScheduleFrame({ children }: { children: React.ReactNode }) {
  return <main data-parent-design="v1" className={styles.page}><div className={styles.shell}>
    <header className={styles.header}><h1>내 일정</h1></header>{children}
  </div><ParentBottomNav designVersion="v1" /></main>
}
export function ScheduleFailure({ retry }: { retry: () => void }) {
  return <section className={styles.empty} role="alert"><h2>일정을 불러오지 못했어요.</h2>
    <p>잠시 후 다시 시도해주세요.</p><button className={styles.action} onClick={retry}>다시 시도</button></section>
}
export function ParentScheduleScreen({ model, childOptions, selectedChildId, today, failed }: Props) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("upcoming")
  const router = useRouter()
  const id = useId()
  const selected = childOptions.find((child) => child.id === selectedChildId) ?? (childOptions.length === 1 ? childOptions[0] : null)
  const months = groupScheduleMonths(model[tab])
  return <ScheduleFrame>
    {failed ? <ScheduleFailure retry={() => router.refresh()} /> : <>
      {childOptions.length > 0 && <HomeChildSelector options={childOptions} selectedChildId={selectedChildId} manageSheetFocus
        className={styles.childSelector} labelClassName={styles.childLabel}
        triggerContent={<><span className={styles.avatar}><OutlineIcon person /></span><span className={styles.childText}>
          <span>{selected?.name ?? "우리 아이 전체"}</span><span className={styles.grade}>{selected?.grade || `${childOptions.length}명의 일정`}</span>
        </span></>} />}
      <div className={styles.tabs} role="tablist" aria-label="일정 상태">
        {tabs.map((value, index) => <button key={value} type="button" role="tab" id={`${id}-${value}`} aria-controls={`${id}-panel`}
          aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}
          onKeyDown={(event) => {
            const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : event.key === "ArrowRight" || event.key === "ArrowLeft" ? 1 - index : null
            if (next === null) return
            event.preventDefault(); setTab(tabs[next]); document.getElementById(`${id}-${tabs[next]}`)?.focus()
          }}>{value === "upcoming" ? "예정" : "완료"} ({model[value].length})</button>)}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} tabIndex={0} className={styles.content}>
        {months.length === 0 ? <section className={styles.empty}>
          <span className={styles.emptyIcon}><OutlineIcon /></span>
          <h2>{tab === "upcoming" ? "예정된 체험수업이 없어요." : "완료한 일정이 없어요."}</h2>
          <p>{tab === "upcoming" ? "새로운 수업을 둘러보세요." : "체험수업이 완료되면 여기에 표시돼요."}</p>
          {tab === "upcoming" && <Link href={buildClassesHref({ child: selectedChildId })} className={styles.action}>수업 찾아보기</Link>}
        </section> : months.map((month) => <section key={month.key} className={styles.month} aria-label={month.label}>
          <h2>{month.label}</h2><ul className={styles.list}>{month.items.map((item, index) => {
            const date = getSeoulDateTimeParts(item.startAt)!
            return <li key={item.id}>
              {item.dateKey === today && month.items[index - 1]?.dateKey !== today && <h3 className={styles.today}>오늘</h3>}
              <Link href={item.href} className={styles.card}>
                <time dateTime={item.startAt} className={styles.date} aria-label={formatScheduleDateLabel(item.startAt) ?? undefined}>
                  <strong>{date.day}</strong><span>{weekdays[date.weekday]}</span>
                </time>
                <span className={styles.details}>
                  <span className={styles.time}>{formatScheduleTimeLabel(item.startAt)}</span>
                  <span className={styles.title}>{item.title ?? "수업 정보 준비 중"}</span>
                  {item.academy && <span className={styles.academy}>{item.academy}</span>}
                  {item.address && <span className={styles.address}>{item.address}</span>}
                  <span className={styles.meta}><span className={tab === "upcoming" ? styles.upcoming : styles.completed}>{tab === "upcoming" ? "예정" : "완료"}</span>
                    {!selectedChildId && childOptions.length > 1 && <span>{item.childName}</span>}</span>
                </span><span aria-hidden="true" className={styles.chevron}>›</span>
              </Link>
            </li>
          })}</ul>
        </section>)}
      </div>
    </>}
  </ScheduleFrame>
}
export function ScheduleSkeleton() {
  return <ScheduleFrame><div className={styles.skeleton} role="status" aria-label="일정 불러오는 중">
    <div className={styles.skeletonChild} /><div className={styles.skeletonTabs} />
    {[0, 1, 2].map((key) => <div key={key} className={styles.skeletonCard}><span /><div><span /><span /><span /></div></div>)}
  </div></ScheduleFrame>
}
