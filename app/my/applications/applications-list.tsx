"use client"

import { ParentDetailLink } from "@/features/classes/ui/parent-detail-link"
import { useRef, useState, useTransition, type KeyboardEvent } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import type { ParentApplicationSummary } from "@/shared/lib/db/adapter"
import { AppIcon } from "@/features/classes/ui/app-icon"
import { AppButton, AppButtonLink, StatusBadge, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import { resolveApplicationStatusDisplay } from "@/features/applications/lib/application-status-display"
import { applicationChildLabel, applicationSchedule } from "@/features/applications/lib/parent-application-card"
import { getExperienceTypeLabel } from "@/features/record/lib/experience-view"
import styles from "./page.module.css"

function Thumbnail({ url, title }: { url?: string | null; title: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  return <span className={styles.thumbnail}>{url && failed !== url ? <Image src={url} alt={`${title} 수업 이미지`} fill sizes="64px" unoptimized style={{ objectFit: "cover" }} onError={() => setFailed(url)} /> : <AppIcon name="image" size={24} />}</span>
}
// 앱 my/applications 카드: 이미지 64 · 종류/상태 배지 · 제목 · 학원 · 구분선 · 아이 · 일정(확정/희망).
function ApplicationCard({ item, image }: { item: ParentApplicationSummary; image?: string | null }) {
  const status = resolveApplicationStatusDisplay({ status: item.status, scheduledAt: item.confirmedSlotAt })
  const schedule = applicationSchedule(item)
  const tone = item.status === "confirmed" ? "positive" : item.status === "new" || item.status === "reviewing" ? "warning" : "neutral"
  return <li><ParentDetailLink href={`/record/${item.id}`} className={`${ui.card} ${styles.card}`}>
    <div className={styles.cardTop}><Thumbnail url={image} title={item.classTitle ?? "수업"} /><div className={styles.cardInfo}>
      <div className={ui.badgeRow}><StatusBadge label={getExperienceTypeLabel(item.classProgramType)} tone="positive" /><StatusBadge label={item.status === "confirmed" ? "확정됨" : status.label} tone={tone} /></div>
      <h2 className={ui.subtitle}>{item.classTitle ?? "수업 정보 준비 중"}</h2>{item.academyName ? <p className={ui.caption}>{item.academyName}</p> : null}
    </div></div>
    <div className={styles.cardDetails}><div className={styles.detailRows}><p className={styles.detailRow}><AppIcon name="user" size={20} /><span>{applicationChildLabel(item)}</span></p>
      {schedule ? <div className={styles.detailRow}><AppIcon name="calendar" size={20} /><div><time dateTime={schedule.value}>{schedule.text}</time><p className={ui.caption}>{schedule.label}</p></div></div> : null}
    </div><AppIcon name="chevron-right" size={20} /></div>
  </ParentDetailLink></li>
}
export function ApplicationsFailure({ reload = false }: { reload?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return <div className={ui.notice} role="alert"><p className={ui.body}>신청 현황을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p><AppButton variant="secondary" disabled={pending} aria-busy={pending} onClick={() => reload ? window.location.reload() : startTransition(() => router.refresh())}>{pending ? "불러오는 중…" : "다시 시도"}</AppButton></div>
}
export function ApplicationsList({ inProgress, canceled, images }: { inProgress: ParentApplicationSummary[]; canceled: ParentApplicationSummary[]; images: Record<string, string | null> }) {
  const [tab, setTab] = useState<0 | 1>(0)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const items = tab === 0 ? inProgress : canceled
  function handleKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : tab === 0 ? 1 : 0
    setTab(next); refs.current[next]?.focus()
  }
  return <><div className={`${ui.segTabs} ${styles.tabs}`} role="tablist" aria-label="신청 상태">{[inProgress, canceled].map((rows, i) => <button key={i} ref={el => { refs.current[i] = el }} id={`applications-tab-${i}`} type="button" role="tab" className={ui.segTab} aria-selected={tab === i} aria-controls="applications-panel" tabIndex={tab === i ? 0 : -1} onKeyDown={handleKey} onClick={() => setTab(i as 0 | 1)}>{i === 0 ? "진행 중" : "취소"} <span>{rows.length}</span></button>)}</div>
    <section id="applications-panel" role="tabpanel" aria-labelledby={`applications-tab-${tab}`} tabIndex={0}>
      {items.length ? <ul className={styles.list}>{items.map(item => <ApplicationCard key={item.id} item={item} image={images[item.classId]} />)}</ul>
        : <div className={styles.empty}><AppIcon name="file-text" size={32} /><h2 className={ui.subtitle}>{tab === 0 ? "아직 신청한 수업이 없어요." : "취소한 신청이 없어요."}</h2>{tab === 0 ? <AppButtonLink href="/classes" size="medium">수업 찾아보기</AppButtonLink> : null}</div>}
    </section></>
}
