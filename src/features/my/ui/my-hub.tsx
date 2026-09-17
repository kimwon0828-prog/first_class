import Link from "next/link"

import styles from "./my-hub.module.css"

/**
 * 마이페이지 Hub.
 *
 * ⚠️ dashboard 가 아니다. 숫자와 카드로 상황을 요약하는 자리가 아니라,
 *    설정과 관리 화면으로 가는 단순한 메뉴다.
 *
 * ⚠️ 다가오는 일정 · 진행 중 경험을 여기서 다시 강조하지 않는다.
 *    일정은 /my/schedule, 기록은 /record 라는 top-level 탭이 이미 맡는다.
 *    같은 것을 두 군데서 말하면 어느 쪽이 최신인지 알 수 없게 된다.
 *
 * ⚠️ 없는 기능을 메뉴로 만들지 않는다 — 결제 · 구독 · 쿠폰 · 포인트는 없다.
 */
type MyHubProps = {
  profileName: string
  profilePhone: string | null
  /** 실제 등록된 자녀 수. 없는 값을 만들지 않는다. */
  childrenCount: number
}

const ChevronIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const MyHub = ({ profileName, profilePhone, childrenCount }: MyHubProps) => {
  const greetingName = profileName.trim() || "학부모"

  return (
    <div className={styles.stack}>
      <section className={styles.profileCard} aria-label="내 정보">
        <h1 className={styles.profileName}>{greetingName}님</h1>
        <p className={styles.profileContact}>{profilePhone?.trim() || "연락처 미입력"}</p>
      </section>

      <section className={styles.menuGroup} aria-label="자녀">
        <Link href="/my/children" className={styles.menuItem}>
          <span className={styles.menuLabel}>자녀 관리</span>
          <span className={styles.menuValue}>{childrenCount}명</span>
          <ChevronIcon />
        </Link>
      </section>

      <section className={styles.menuGroup} aria-label="수업">
        {/*
          일정과 기록은 하단 탭에 있으므로 여기서 중복하지 않는다.
          신청 현황은 탭이 없어서 이 자리가 유일한 진입점이다.
        */}
        <Link href="/my/applications" className={styles.menuItem}>
          <span className={styles.menuLabel}>신청 현황</span>
          <ChevronIcon />
        </Link>
        <Link href="/favorites" className={styles.menuItem}>
          <span className={styles.menuLabel}>관심수업</span>
          <ChevronIcon />
        </Link>
      </section>

      <section className={styles.menuGroup} aria-label="계정">
        <Link href="/my/profile" className={styles.menuItem}>
          <span className={styles.menuLabel}>내 정보</span>
          <ChevronIcon />
        </Link>
      </section>

      <section className={styles.menuGroup} aria-label="로그아웃">
        <form method="post" action="/auth/sign-out">
          <button type="submit" className={styles.menuButton}>
            로그아웃
          </button>
        </form>
      </section>
    </div>
  )
}
