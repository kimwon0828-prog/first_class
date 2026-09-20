"use client"

import Image from "next/image"
import { useState } from "react"
import styles from "./parent-profile-avatar.module.css"

type ParentProfileAvatarProps = {
  /** Parent image only. Current AuthProfile has no image field; Home supplies null. */
  imageUrl?: string | null
  name?: string
}

export function ParentProfileAvatar({ imageUrl, name }: ParentProfileAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  return (
    <span className={styles.avatar}>
      {imageUrl && imageUrl !== failedUrl ? (
        <Image src={imageUrl} alt={`${name || "학부모"} 프로필`} fill sizes="40px" unoptimized
          className={styles.image} onError={() => setFailedUrl(imageUrl)} />
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
        </svg>
      )}
    </span>
  )
}
