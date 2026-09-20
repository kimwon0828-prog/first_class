import styles from "./image-fallback.module.css"

/** The containing image frame owns size and radius; the fallback never adds layout. */
export function ImageFallback({ label = "이미지 없음" }: { label?: string }) {
  return (
    <span className={styles.fallback} role="img" aria-label={label}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8" cy="8" r="1" />
        <path d="m3 17 5-5 4 4 3-3 6 6" />
      </svg>
    </span>
  )
}
