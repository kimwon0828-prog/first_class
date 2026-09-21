"use client"

import { useState } from "react"
import Image from "next/image"
import { ImageFallback } from "@/shared/ui/image-fallback"
import styles from "./page.module.css"

export function ClassThumbnail({ url, title }: { url: string | null; title: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  return <span className={styles.thumbnail}>
    {url && url !== failedUrl ? <Image src={url} alt={`${title} 수업 이미지`} fill sizes="64px" unoptimized
      style={{ objectFit: "cover" }} onError={() => setFailedUrl(url)} />
      : <ImageFallback label="수업 이미지 없음" />}
  </span>
}
