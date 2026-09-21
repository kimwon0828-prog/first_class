"use client"
import { useRef, useState, useTransition, type KeyboardEvent } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import type { ParentApplicationSummary } from "@/shared/lib/db/adapter"
import { ImageFallback } from "@/shared/ui/image-fallback"
import { resolveApplicationStatusDisplay } from "@/features/applications/lib/application-status-display"
import { applicationChildLabel, applicationSchedule } from "@/features/applications/lib/parent-application-card"
import { getExperienceTypeLabel } from "@/features/record/lib/experience-view"
import styles from "./page.module.css"

function Icon({ kind }: { kind: "child" | "calendar" | "chevron" | "empty" }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === "child" ? <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></> : kind === "calendar" ? <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></> : kind === "chevron" ? <path d="m9 6 6 6-6 6" /> : <><path d="M14 2H5v20h14V8ZM14 2v6h5M9 12h6M9 16h4" /></>}</svg>
}
function Thumbnail({ url, title }: { url?: string | null; title: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  return <span className={styles.thumbnail}>{url && failed !== url ? <Image src={url} alt={`${title} 수업 이미지`} fill sizes="64px" unoptimized style={{ objectFit: "cover" }} onError={() => setFailed(url)} /> : <ImageFallback label="수업 이미지 없음" />}</span>
}
function ApplicationCard({ item, image }: { item: ParentApplicationSummary; image?: string | null }) {
  const status = resolveApplicationStatusDisplay({ status: item.status, scheduledAt: item.confirmedSlotAt })
  const schedule = applicationSchedule(item)
  return <li><Link href={`/record/${item.id}`} className={styles.card}>
    <div className={styles.cardTop}><Thumbnail url={image} title={item.classTitle ?? "수업"} /><div className={styles.cardInfo}>
      <div className={styles.badges}><span className={styles.typeBadge}>{getExperienceTypeLabel(item.classProgramType)}</span><span className={`${styles.statusBadge} ${item.status === "confirmed" ? styles.confirmed : item.status === "canceled" ? styles.canceled : styles.pending}`}>{status.label}</span></div>
      <h2>{item.classTitle ?? "수업 정보 준비 중"}</h2>{item.academyName ? <p className={styles.academy}>{item.academyName}</p> : null}
    </div></div>
    <div className={styles.cardDetails}><div className={styles.detailRows}><p className={styles.detailRow}><Icon kind="child" /><span>{applicationChildLabel(item)}</span></p>
      {schedule ? <div className={styles.detailRow}><Icon kind="calendar" /><div><time dateTime={schedule.value}>{schedule.text}</time><p className={styles.scheduleLabel}>{schedule.label}</p></div></div> : null}
    </div><Icon kind="chevron" /></div>
  </Link></li>
}
export function ApplicationsFailure({ reload = false }: { reload?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return <section className={styles.state} role="alert"><h2>신청 현황을 불러오지 못했어요.</h2><p>잠시 후 다시 시도해 주세요.</p><button className={styles.primary} disabled={pending} aria-busy={pending} onClick={() => reload ? window.location.reload() : startTransition(() => router.refresh())}>{pending ? "불러오는 중…" : "다시 시도하기"}</button></section>
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
  return <><div className={styles.tabs} role="tablist" aria-label="신청 상태">{[inProgress, canceled].map((rows, i) => <button key={i} ref={el => { refs.current[i] = el }} id={`applications-tab-${i}`} type="button" role="tab" aria-selected={tab === i} aria-controls="applications-panel" tabIndex={tab === i ? 0 : -1} onKeyDown={handleKey} onClick={() => setTab(i as 0 | 1)}>{i === 0 ? "진행 중" : "취소"} <span>{rows.length}</span></button>)}</div>
    <section id="applications-panel" role="tabpanel" aria-labelledby={`applications-tab-${tab}`} tabIndex={0}>
      {items.length ? <ul className={styles.list}>{items.map(item => <ApplicationCard key={item.id} item={item} image={images[item.classId]} />)}</ul> : <div className={styles.state}><span className={styles.emptyIcon}><Icon kind="empty" /></span><h2>{tab === 0 ? "더 많은 수업을 만나보세요!" : "취소한 신청이 없어요."}</h2>{tab === 0 ? <><p>아이에게 맞는 새로운 수업을 찾아보세요.</p><Link href="/classes" className={styles.primary}>수업 찾아보기 <Icon kind="chevron" /></Link></> : null}</div>}
    </section></>
}
