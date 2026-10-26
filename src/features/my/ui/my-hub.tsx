"use client"

import Link from "next/link"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AppIcon, type AppIconName } from "@/features/classes/ui/app-icon"
import { appUi as ui } from "@/features/classes/ui/parent-app-ui"
import { getChildGradeLabel } from "@/shared/constants/education-taxonomy"
import { COMPANY_EMAIL_HREF, COMPANY_INFO } from "@/shared/config/company-info"
import { readFavoriteClassIds } from "@/features/favorites/lib/storage"
import type { MarketingConsentState } from "@/features/marketing-consent/lib/marketing-consent"
import type { ChildProfile } from "@/shared/lib/db/adapter"
import type { MyParentProfileDetail } from "../queries/get-my-parent-profile-detail"
import { ParentProfileForm, type ParentProfileValues } from "./parent-profile-form"
import { ParentAccountDeletion } from "./parent-account-deletion"
import { ParentAccountSheet } from "./parent-account-sheet"
import { MyRetry } from "./my-retry"
import styles from "./my-hub.module.css"

// 앱 (tabs)/my(feat/marketing-consent 2b7854e). 웹에 없는 알림 설정(기기 푸시) · 앱 버전은 두지 않는다.
type MyHubProps = {
  profile: MyParentProfileDetail
  email: string | null
  provider: string | null
  kids: ChildProfile[] | null
  childrenError: string | null
  /** 학원 소식 수신 동의. null 이면 읽지 못함(줄은 보이고 값은 비움). */
  consent: MarketingConsentState | null
}
const legal = [["/terms", "이용약관"], ["/privacy", "개인정보처리방침"], ["/third-party-consent", "개인정보 제3자 제공 동의"], ["/terms#business-info", "사업자 정보"]] as const

function Row({ icon, label, value, href, onClick }: { icon: AppIconName; label: string; value?: string | null; href?: string; onClick?: () => void }) {
  const content = <><AppIcon name={icon} size={20} /><span className={styles.rowLabel}>{label}</span>{value ? <span className={styles.rowValue}>{value}</span> : null}<AppIcon name="chevron-right" size={18} /></>
  const aria = [label, value].filter(Boolean).join(", ")
  return href ? <Link href={href} className={styles.row} aria-label={aria}>{content}</Link>
    : <button type="button" className={styles.row} aria-label={aria} onClick={onClick}>{content}</button>
}
function Group({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.group} aria-label={title}><h2 className={ui.caption}>{title}</h2>{children}</section>
}
// 로그인 방식 배지. 카카오 노랑·Apple 검정은 외부 브랜드 색(로그인 가이드).
function LoginBadge({ provider }: { provider: string | null }) {
  if (provider === "kakao") return <span className={styles.badge}><span className={styles.kakao} aria-hidden="true"><svg width="9" height="9" viewBox="0 0 24 24"><path fill="#191919" d="M12 3C6.5 3 2 6.6 2 11c0 2.9 1.9 5.4 4.8 6.8L5.8 21.5l4.3-2.8c.6.1 1.2.1 1.9.1 5.5 0 10-3.6 10-8S17.5 3 12 3Z" /></svg></span>카카오로 로그인됨</span>
  if (provider === "apple") return <span className={styles.badge}><span className={styles.apple} aria-hidden="true"><svg width="10" height="10" viewBox="0 0 24 24"><path fill="#fff" d="M16.4 12.6c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9s-2-.9-3.3-.9C6.1 6.9 4.5 7.9 3.6 9.5c-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.8-4.3ZM14 5.2c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.1.1 2.3-.6 3-1.5Z" /></svg></span>Apple로 로그인됨</span>
  return null
}

export const MyHub = ({ profile, email, provider, kids, childrenError, consent }: MyHubProps) => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editOpen = searchParams.get("edit") === "profile"
  const [savedProfile, setSavedProfile] = useState<ParentProfileValues | null>(null)
  const [withdrawalOpen, setWithdrawalOpen] = useState(false)
  const [legalOpen, setLegalOpen] = useState(false)
  const [favoriteCount, setFavoriteCount] = useState<number | null>(null)
  const deletionBusy = useRef(false)
  const closeWithdrawal = () => { if (!deletionBusy.current) setWithdrawalOpen(false) }
  const pendingRef = useRef(false)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const currentProfile = savedProfile ?? profile
  const greetingName = currentProfile.name.trim() || "학부모"
  // 관심 수업은 이 기기에 저장된다. 서버 렌더와 맞추려고 그린 뒤에 읽는다.
  useEffect(() => { const stored = readFavoriteClassIds(); setFavoriteCount(stored.error ? null : stored.ids.length) }, [])
  useEffect(() => {
    if (!legalOpen) return
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setLegalOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [legalOpen])
  const openEditor = () => {
    const url = new URL(window.location.href)
    url.searchParams.set("edit", "profile")
    window.history.pushState({ parentProfileEditor: true }, "", url)
  }
  const closeEditor = () => {
    if (pendingRef.current) return
    if (window.history.state?.parentProfileEditor) {
      router.back()
    } else {
      const url = new URL(window.location.href)
      url.searchParams.delete("edit")
      window.history.replaceState(null, "", url)
    }
    editButtonRef.current?.focus()
  }
  const handleSaved = (values: ParentProfileValues) => {
    pendingRef.current = false
    setSavedProfile(values)
    closeEditor()
    // The existing action revalidates /my; avoid racing that refresh with Back.
  }
  return <div>
    <section className={styles.profile} aria-label="학부모 내 정보">
      <span className={styles.avatar} aria-hidden="true"><AppIcon name="user" size={24} /></span>
      <div className={styles.identity}><h2 className={`${ui.title} ${ui.oneLine}`}>{greetingName}님</h2><LoginBadge provider={provider} /></div>
      <button ref={editButtonRef} type="button" onClick={openEditor} className={ui.cancelTrigger}>내 정보</button>
    </section>

    <section className={styles.kids} aria-labelledby="my-children-title">
      <div className={ui.sectionHead}>
        <h2 id="my-children-title" className={ui.subtitle}>우리 아이</h2>
        <Link href="/my/children" className={styles.manage} aria-label="자녀 관리">관리</Link>
      </div>
      {childrenError || !kids ? <div className={ui.notice} role="status"><p className={ui.body}>자녀 정보를 불러오지 못했어요.</p><MyRetry /></div>
        : <div className={styles.kidRail}>
          {kids.map(child => <Link key={child.id} href="/my/children" className={styles.kid} aria-label={`${child.name} 정보 수정`}>
            <span className={styles.kidInitial} aria-hidden="true">{child.name.slice(0, 1)}</span>
            <span className={styles.kidText}>
              <span className={`${ui.subtitle} ${ui.oneLine}`}>{child.name}</span>
              <span className={`${ui.caption} ${ui.oneLine}`}>{getChildGradeLabel(child.grade) ?? child.grade}</span>
              {child.interestSubjects ? <span className={`${ui.caption} ${ui.oneLine}`}>관심 {child.interestSubjects}</span> : null}
            </span>
          </Link>)}
          <Link href="/my/children" className={styles.addKid} data-wide={!kids.length || undefined} aria-label="아이 추가"><AppIcon name="plus" size={20} /><span>추가</span></Link>
        </div>}
    </section>

    <div className={ui.band} aria-hidden="true" />
    <Group title="내 활동">
      <Row icon="heart" label="관심 수업" value={favoriteCount === null ? null : String(favoriteCount)} href="/favorites" />
      <Row icon="file-text" label="신청 현황" href="/my/applications" />
    </Group>
    <div className={ui.band} aria-hidden="true" />
    <Group title="설정 및 안내">
      <Row icon="message-square" label="학원 소식" value={consent ? (consent.consented ? "받는 중" : "받지 않음") : null} href="/my/academy-news" />
      <Row icon="mail" label="고객센터" value={COMPANY_INFO.customerCenterEmail} href={COMPANY_EMAIL_HREF} />
      <Row icon="file-text" label="약관 및 개인정보처리방침" onClick={() => setLegalOpen(true)} />
    </Group>
    <div className={styles.footer}>
      <form method="post" action="/auth/sign-out"><button type="submit" className={styles.footerLink}>로그아웃</button></form>
      <span className={styles.divider} aria-hidden="true" />
      <button type="button" className={styles.footerLink} onClick={() => setWithdrawalOpen(true)} aria-haspopup="dialog">회원 탈퇴</button>
    </div>

    {legalOpen ? <div className={ui.scrim} onClick={() => setLegalOpen(false)}>
      <div className={ui.actionSheet} role="dialog" aria-modal="true" aria-label="약관 및 개인정보처리방침" onClick={event => event.stopPropagation()}>
        <div className={ui.actionGroup}>
          <p className={ui.actionTitle}>약관 및 개인정보처리방침</p>
          {legal.map(([href, label]) => <Link key={href} href={href} className={ui.actionItem}>{label}</Link>)}
        </div>
        <button type="button" className={`${ui.actionItem} ${ui.actionCancel}`} onClick={() => setLegalOpen(false)} autoFocus>취소</button>
      </div>
    </div> : null}
    <ParentAccountSheet open={editOpen} title="내 정보 수정" onClose={closeEditor} restoreFocusRef={editButtonRef}>
      {editOpen ? <ParentProfileForm
        initialName={currentProfile.name}
        initialPhone={currentProfile.phone}
        initialParentBirthDate={currentProfile.parentBirthDate}
        email={email}
        onCancel={closeEditor}
        onSaved={handleSaved}
        onPendingChange={(pending) => { pendingRef.current = pending }}
      /> : null}
    </ParentAccountSheet>
    <ParentAccountSheet open={withdrawalOpen} title="회원탈퇴" onClose={closeWithdrawal}>
      {withdrawalOpen ? <ParentAccountDeletion onCancel={closeWithdrawal} onBusyChange={(busy) => { deletionBusy.current = busy }} /> : null}
    </ParentAccountSheet>
  </div>
}
