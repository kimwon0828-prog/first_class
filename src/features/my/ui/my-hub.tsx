import Link from "next/link"
import { MyRetry } from "./my-retry"
import styles from "./my-hub.module.css"

type MyHubProps = {
  profileName: string
  profilePhone: string | null
  childrenCount: number | null
  childrenError: string | null
}
const ChevronIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
</svg>

type MenuIconKind = "children" | "applications" | "heart" | "logout" | "terms" | "privacy" | "consent"
const MenuIcon = ({ kind }: { kind: MenuIconKind }) => {
  const paths: Record<MenuIconKind, string> = {
    children: "M16 21v-2a6 6 0 0 0-12 0v2M16 4a4 4 0 0 1 0 8M20 21v-2a6 6 0 0 0-3-5M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
    applications: "M9 4H5v17h14V4h-4M9 3h6v4H9ZM8 12h8M8 16h5",
    heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
    logout: "M9 21H4V3h5M9 12h12M17 8l4 4-4 4",
    terms: "M14 3H5v18h14V8ZM14 3v5h5M8 12h8M8 16h6",
    privacy: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6ZM9 12l2 2 4-4",
    consent: "M9 4H5v17h14V4h-4M9 3h6v4H9ZM8 14l3 3 5-6"
  }
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={paths[kind]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export const MyHub = ({ profileName, childrenCount, childrenError }: MyHubProps) => {
  const greetingName = profileName.trim() || "학부모"
  return <div className={styles.stack}>
    <section className={styles.profileCard} aria-label="학부모 내 정보">
      <Link href="/my/profile" className={styles.profileIdentity} aria-label="내 정보 보기">
        <span className={styles.avatar} aria-hidden="true"><svg width="32" height="32" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
        <div className={styles.identityText}><h2 className={styles.profileName}>{greetingName}님</h2></div>
      </Link>
      <Link href="/my/profile" className={styles.editLink}>내 정보 수정하기</Link>
    </section>

    <section aria-labelledby="my-children-title">
      <h2 id="my-children-title" className={styles.sectionTitle}>우리 아이</h2>
      <div className={styles.menuGroup}>
        <Link href="/my/children" className={styles.menuItem}>
          <span className={styles.iconSurface}><MenuIcon kind="children" /></span>
          <span className={styles.menuBody}><span className={styles.menuLabel}>자녀 관리</span>
            {childrenCount !== null ? <span className={styles.description}>{childrenCount === 0 ? "등록된 자녀가 없어요." : `${childrenCount}명의 자녀가 등록되어 있어요.`}</span> : null}
          </span>
          <ChevronIcon />
        </Link>
        {childrenError ? <div className={styles.partialError} role="status"><p>자녀 수를 불러오지 못했어요.</p><MyRetry /></div> : null}
      </div>
    </section>

    <section aria-labelledby="my-activity-title">
      <h2 id="my-activity-title" className={styles.sectionTitle}>내 활동</h2>
      <div className={styles.menuGroup}>
        <Link href="/my/applications" className={styles.menuItem}><span className={styles.iconSurface}><MenuIcon kind="applications" /></span><span className={styles.menuBody}><span className={styles.menuLabel}>신청 현황</span><span className={styles.description}>진행 중인 신청과 결과를 확인해요.</span></span><ChevronIcon /></Link>
        <Link href="/favorites" className={styles.menuItem}><span className={styles.iconSurface}><MenuIcon kind="heart" /></span><span className={styles.menuBody}><span className={styles.menuLabel}>관심수업</span><span className={styles.description}>찜한 수업을 다시 볼 수 있어요.</span></span><ChevronIcon /></Link>
      </div>
    </section>

    <section aria-labelledby="my-service-title">
      <h2 id="my-service-title" className={styles.sectionTitle}>계정 및 서비스 안내</h2>
      <div className={styles.menuGroup}>
        <form method="post" action="/auth/sign-out"><button type="submit" className={styles.menuButton}><MenuIcon kind="logout" /><span className={styles.menuLabel}>로그아웃</span></button></form>
        <Link href="/terms" className={styles.menuItem}><MenuIcon kind="terms" /><span className={styles.menuLabel}>이용약관</span><ChevronIcon /></Link>
        <Link href="/privacy" className={styles.menuItem}><MenuIcon kind="privacy" /><span className={styles.menuLabel}>개인정보처리방침</span><ChevronIcon /></Link>
        <Link href="/third-party-consent" className={styles.menuItem}><MenuIcon kind="consent" /><span className={styles.menuLabel}>제3자 제공 동의</span><ChevronIcon /></Link>
      </div>
    </section>
  </div>
}
