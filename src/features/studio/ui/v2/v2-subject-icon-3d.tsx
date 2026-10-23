import type { CSSProperties } from "react"

import styles from "./v2-subject-icon-3d.module.css"

/*
 * 과목 3D 아이콘 (Figma SubjectIcon3D 1986:154).
 *
 * Figma 는 12개 과목을 한 장의 시트(public/images/studio/subject-3d-sprite.png, 1200×896)에 두고
 * 과목마다 위치만 옮겨 보여준다. 위치 값은 Figma 변형(Subject=…)의 값을 그대로 옮겼다.
 * 키는 DB 과목 대분류 코드(subject_categories.code)다. 모르는 코드는 "기타" 그림을 쓴다.
 *
 * 디자인 규칙: 3D 아이콘은 흰 바탕 위에만, 52px 이상 자리에서만 쓴다(작은 자리는 선 아이콘).
 */
const SPRITE_OFFSETS: Record<string, readonly [left: number, top: number]> = {
  korean_language: [-36.73, -34.18],
  math: [-182.14, -31.63],
  english: [-330.1, -31.63],
  science: [-478.06, -31.63],
  social_history: [-34.18, -177.04],
  coding_it_robotics: [-182.14, -177.04],
  foreign_language: [-330.1, -179.59],
  music: [-478.06, -177.04],
  art_design: [-34.18, -325],
  sports_dance: [-184.69, -319.9],
  creative_mind: [-330.1, -325],
  other: [-480.61, -322.45]
}

type V2SubjectIcon3DProps = {
  /** 과목 대분류 코드. null 이면 "기타". */
  categoryCode: string | null | undefined
  /** 한 변 길이(px). */
  size?: number
  className?: string
}

export const V2SubjectIcon3D = ({ categoryCode, size = 56, className }: V2SubjectIcon3DProps) => {
  const [left, top] = SPRITE_OFFSETS[categoryCode ?? ""] ?? SPRITE_OFFSETS.other
  return (
    <span
      className={[styles.icon, className].filter(Boolean).join(" ")}
      style={{ "--v2-subject-icon-size": `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 시트 한 장을 잘라 쓰는 장식 이미지라 next/image 최적화 대상이 아니다. */}
      <img src="/images/studio/subject-3d-sprite.png" alt="" className={styles.sheet} style={{ left: `${left}%`, top: `${top}%` }} />
    </span>
  )
}
