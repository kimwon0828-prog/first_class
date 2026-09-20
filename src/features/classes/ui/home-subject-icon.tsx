import type { ReactNode } from "react"
import styles from "./home-subject-icon.module.css"

/** Existing inline SVG convention; only the database catalog decides which categories appear. */
const paths: Record<string, string> = {
  all: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  korean_language: "M3 4h7l2 2 2-2h7v16h-7l-2 1-2-1H3zM12 6v15M6 8h3M15 8h3",
  math: "M5 3h14v18H5zM8 7h8M8 12h1M15 12h1M8 16h1M15 16h1",
  english: "M3 18 8 5l5 13M5 13h6M15 11h5M17 8v10",
  science: "M9 3h6M10 3v7L4 20h16l-6-10V3M8 14h8",
  social_history: "M3 9 12 3l9 6H3zM5 10v8M10 10v8M14 10v8M19 10v8M3 21h18",
  coding_it_robotics: "M8 7 3 12l5 5M16 7l5 5-5 5M14 4l-4 16",
  foreign_language: "M3 5h12M9 3v2M5 5c0 6 5 10 9 11M13 5c0 6-5 10-10 11M14 21l4-10 4 10M16 17h4",
  music: "M9 18V5l11-2v13M9 8l11-2M9 18c0 4-6 4-6 1s6-4 6-1M20 16c0 4-6 4-6 1s6-4 6-1",
  art_design: "M12 3a9 9 0 1 0 0 18c3 0 1-4 3-5s6 0 6-4a9 9 0 0 0-9-9ZM7 9h.01M10 6h.01M15 6h.01M18 10h.01",
  sports_dance: "M6 4 3 7l14 14 3-3ZM4 14l6 6M14 4l6 6M3 17l4 4M17 3l4 4",
  creative_mind: "M9 18h6M10 21h4M8 14a7 7 0 1 1 8 0l-1 4H9z",
  academy: "M4 21V7l8-4 8 4v14M2 21h20M9 21v-6h6v6M8 9h1M15 9h1",
  other: "M4 6h16M4 12h16M4 18h16"
}

/** Flat pictograms: one shared grid, rounded strokes and at most three token colors. */
const pictograms: Record<string, ReactNode> = {
  korean_language: <>
    <path className={styles.surface} d="M3 5h6l3 2 3-2h6v15h-6l-3 1-3-1H3z" />
    <path d="M3 5h6l3 2 3-2h6v15h-6l-3 1-3-1H3zM12 7v14M6 9h3M6 13h3" />
    <path className={styles.accent} d="m16 14 4-8 2 1-4 8-3 2z" fill="currentColor" stroke="none" />
  </>,
  math: <>
    <rect className={styles.surface} x="3" y="3" width="8" height="8" rx="2" />
    <path d="M5 7h4M7 5v4" />
    <circle className={styles.accent} cx="17" cy="7" r="4" fill="currentColor" stroke="none" />
    <path d="m7 14 5 7H2z" fill="currentColor" stroke="none" />
    <path className={styles.accent} d="M15 16h6M15 20h6" />
  </>,
  english: <>
    <path className={styles.surface} d="M2 4h20v16H2z" stroke="none" />
    <path d="m3 17 3-10 3 10M4 14h4" />
    <path className={styles.accent} d="M11 7v10h2a2.5 2.5 0 0 0 0-5h-2 2a2.5 2.5 0 0 0 0-5zM22 8c-5-4-5 12 0 8" />
  </>,
  science: <>
    <path className={styles.surface} d="M9 3h6v7l6 10H3l6-10z" />
    <path className={styles.accent} d="M7 14h10l4 6H3z" fill="currentColor" stroke="none" />
    <path d="M8 3h8M9 3v7L3 20h18l-6-10V3" />
    <circle cx="11" cy="11" r="1" fill="currentColor" stroke="none" />
  </>,
  social_history: <>
    <path className={styles.surface} d="M4 9h16v11H4z" stroke="none" />
    <path className={styles.accent} d="m12 3 10 6H2z" fill="currentColor" stroke="none" />
    <path d="M5 11v7M10 11v7M14 11v7M19 11v7M3 21h18" />
  </>,
  coding_it_robotics: <>
    <rect className={styles.surface} x="3" y="4" width="18" height="13" rx="2" />
    <path d="M3 17h18l2 3H1z" fill="currentColor" stroke="none" />
    <path className={styles.accent} d="m9 8-3 3 3 3M15 8l3 3-3 3" />
  </>,
  foreign_language: <>
    <path className={styles.surface} d="M2 3h13v12H8l-4 3v-3H2z" />
    <path d="M5 7h7M8 5v2M6 7c0 3 3 5 5 5M11 7c0 3-3 5-6 5" />
    <path className={styles.accent} d="m14 21 4-10 4 10M16 17h4" />
  </>,
  music: <>
    <path className={styles.surface} d="M8 4h13v15H8z" stroke="none" />
    <path d="M9 18V6l11-3v13M9 9l11-3" />
    <ellipse className={styles.accent} cx="6" cy="18" rx="3" ry="2" fill="currentColor" stroke="none" />
    <ellipse className={styles.accent} cx="17" cy="16" rx="3" ry="2" fill="currentColor" stroke="none" />
  </>,
  art_design: <>
    <path className={styles.surface} d="M12 3a9 9 0 1 0 0 18c3 0 1-4 3-5s6 0 6-4a9 9 0 0 0-9-9z" />
    <circle className={styles.accent} cx="7" cy="10" r="2" fill="currentColor" stroke="none" />
    <circle cx="11" cy="7" r="2" fill="currentColor" stroke="none" />
    <path className={styles.accent} d="m15 11 5-7 2 2-5 7-3 1z" fill="currentColor" stroke="none" />
  </>,
  sports_dance: <>
    <path className={styles.surface} d="M2 4h6v16H2zM16 4h6v16h-6z" stroke="none" />
    <path d="M8 12h8" />
    <path className={styles.accent} d="M4 7h4v10H4zM16 7h4v10h-4z" fill="currentColor" stroke="none" />
    <path d="M2 10v4M22 10v4" />
  </>,
  creative_mind: <>
    <path className={styles.surface} d="M8 15a7 7 0 1 1 8 0l-1 3H9z" />
    <path className={styles.accent} d="m9 10 3 3 3-3M12 13v5" />
    <path d="M9 21h6" />
  </>,
  other: <>
    <rect className={styles.surface} x="3" y="3" width="8" height="8" rx="2" />
    <circle className={styles.accent} cx="17" cy="7" r="4" fill="currentColor" stroke="none" />
    <path d="m7 14 5 7H2z" fill="currentColor" stroke="none" />
    <path className={styles.accent} d="M17 15v6M14 18h6" />
  </>
}

export function SubjectIcon({ code, colored = false }: { code: string; colored?: boolean }) {
  return (
    <svg className={colored ? styles.pictogram : undefined} data-subject={colored ? code : undefined}
      width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {colored ? pictograms[code] ?? pictograms.other : <path d={paths[code] ?? paths.other} />}
    </svg>
  )
}
