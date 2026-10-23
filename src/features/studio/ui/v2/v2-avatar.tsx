"use client"

import { useEffect, useState, type CSSProperties } from "react"

import styles from "./v2-avatar.module.css"

type V2AvatarProps = {
  /** 이름 · 학원명. 첫 글자를 보여주고, 이미지의 대체 텍스트로도 쓴다. */
  name: string
  imageUrl?: string | null
  /** 이미지 대체 텍스트. 기본은 name. */
  imageAlt?: string
  /** 지름(px). Figma 기본 36, 목록 행 40. */
  size?: number
  /** neutral = surface/fill, brand = brand/50. */
  tone?: "neutral" | "brand"
  className?: string
}

/**
 * Studio v2/Avatar (Figma 2024:166).
 *
 * 이미지가 없거나 깨지면 첫 글자로 돌아간다.
 */
export const V2Avatar = ({ name, imageUrl, imageAlt, size = 36, tone = "neutral", className }: V2AvatarProps) => {
  const [isImageBroken, setIsImageBroken] = useState(false)
  const label = name.trim()
  const initial = label.slice(0, 1)

  useEffect(() => {
    setIsImageBroken(false)
  }, [imageUrl])

  return (
    <span
      className={[styles.avatar, tone === "brand" ? styles.brand : null, className].filter(Boolean).join(" ")}
      style={{ "--v2-avatar-size": `${size}px` } as CSSProperties}
    >
      {imageUrl && !isImageBroken ? (
        // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL. next/image 의 원격 도메인 설정을 늘리지 않는다.
        <img src={imageUrl} alt={imageAlt ?? label} className={styles.image} onError={() => setIsImageBroken(true)} />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </span>
  )
}
