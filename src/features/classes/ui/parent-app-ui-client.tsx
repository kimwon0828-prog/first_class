"use client"

import Link from "next/link"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { AppIcon } from "./app-icon"
import { ParentBackLink } from "./parent-back-link"
import ui from "./parent-app-ui.module.css"

/** 대표 이미지(threshold)를 지나 스크롤하면 나타나는 흰 고정 헤더. 앱 StickyHeader. */
export function StickyDetailHeader({ title, backHref, threshold, children }: { title: string; backHref: string; threshold: number; children?: ReactNode }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const update = () => setVisible(window.scrollY > threshold - 52)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [threshold])
  return <div className={ui.sticky} data-visible={visible || undefined} aria-hidden={!visible} inert={!visible}>
    <ParentBackLink href={backHref} preferHistory label="뒤로가기" className={ui.headerButton}><AppIcon name="chevron-left" size={22} /></ParentBackLink>
    <p className={ui.stickyTitle}>{title}</p>
    <div className={ui.stickyActions}>{children}</div>
  </div>
}

/** 공유: 기기 공유 시트, 없으면 링크 복사. */
export function ShareButton({ message, path, className }: { message: string; path: string; className: string }) {
  const [copied, setCopied] = useState(false)
  const share = async () => {
    const url = new URL(path, window.location.origin).toString()
    try {
      if (navigator.share) { await navigator.share({ text: message, url }); return }
      await navigator.clipboard.writeText(`${message}\n${url}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch { /* 사용자가 취소했거나 공유를 지원하지 않는 환경. */ }
  }
  return <button type="button" className={className} aria-label={copied ? "링크를 복사했어요" : "공유하기"} onClick={() => void share()}>
    <AppIcon name={copied ? "check" : "share"} size={18} />
    <span className={ui.srOnly} role="status">{copied ? "링크를 복사했어요" : ""}</span>
  </button>
}

/** "학원에 문의하기": 전화번호가 있으면 전화하기/문자 보내기 시트, 없으면 학원 소개로. */
export function AcademyInquiry({ phone, academyHref }: { phone: string | null; academyHref: string | null }) {
  const [open, setOpen] = useState(false)
  const digits = phone?.replace(/[^0-9+]/g, "") || null
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])
  const row = <><AppIcon name="message-square" size={18} /><span>궁금한 점이 있으면 학원에 문의하기</span><AppIcon name="chevron-right" size={18} /></>
  if (!digits) return academyHref ? <Link href={academyHref} className={ui.inquiry}>{row}</Link> : null
  return <>
    <button type="button" className={ui.inquiry} aria-haspopup="dialog" onClick={() => setOpen(true)}>{row}</button>
    {open ? <div className={ui.scrim} onClick={() => setOpen(false)}>
      <div className={ui.actionSheet} role="dialog" aria-modal="true" aria-label="학원에 문의하기" onClick={event => event.stopPropagation()}>
        <div className={ui.actionGroup}>
          <p className={ui.actionTitle}>학원에 문의하기</p>
          <a className={ui.actionItem} href={`tel:${digits}`} onClick={() => setOpen(false)}>전화하기</a>
          <a className={ui.actionItem} href={`sms:${digits}`} onClick={() => setOpen(false)}>문자 보내기</a>
        </div>
        <button ref={cancelRef} type="button" className={`${ui.actionItem} ${ui.actionCancel}`} onClick={() => setOpen(false)}>취소</button>
      </div>
    </div> : null}
  </>
}

/** 학원 상세 탭 줄: 누르면 그 위치로, 스크롤하면 지나간 마지막 구역이 선택된다. */
export function AnchorTabs({ tabs }: { tabs: [id: string, label: string][] }) {
  const [active, setActive] = useState(tabs[0]?.[0])
  useEffect(() => {
    const update = () => {
      const passed = tabs.filter(([id]) => {
        const element = document.getElementById(id)
        return element ? element.getBoundingClientRect().top <= 61 : false
      })
      setActive(passed.at(-1)?.[0] ?? tabs[0]?.[0])
    }
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [tabs])
  return <nav className={ui.anchorTabs} aria-label="학원 정보 구역">
    {tabs.map(([id, label]) => <a key={id} href={`#${id}`} className={ui.anchorTab} aria-current={active === id ? "true" : undefined}>{label}</a>)}
  </nav>
}
