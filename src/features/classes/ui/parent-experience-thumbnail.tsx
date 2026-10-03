"use client"

import Image from "next/image"
import { useState } from "react"
import { canOptimizeParentImage } from "@/features/classes/lib/parent-image"
import { ImageFallback } from "@/shared/ui/image-fallback"
import styles from "./parent-experience-thumbnail.module.css"

/** Decorative beside the class title. Only approved optimized storage URLs are loaded. */
export function ParentExperienceThumbnail({ src, size = "record" }: {
  src?: string | null
  size?: "schedule" | "record" | "report"
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const usable = src && src !== failedSource && canOptimizeParentImage(src)
  return <span className={`${styles.frame} ${styles[size]}`} data-experience-thumbnail={size}>
    {usable ? <Image src={src} alt="" fill sizes={`${size === "schedule" ? 88 : size === "record" ? 96 : 120}px`}
      style={{ objectFit: "cover" }} onError={() => setFailedSource(src)} /> : <ImageFallback />}
  </span>
}
