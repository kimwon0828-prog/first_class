"use client"

import { canOptimizeParentImage } from "@/features/classes/lib/parent-image"
import Image from "next/image"
import { useState, type ReactNode } from "react"
import { ImageFallback } from "@/shared/ui/image-fallback"

/** Actual public-profile brand mark first; never crop it or substitute a class photo. */
export function HomeAcademyLogo({ url, name, fallback }: { url: string | null; name: string; fallback?: ReactNode }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  return url && failedUrl !== url
    ? <Image src={url} alt={`${name} 로고`} width={64} height={64} sizes="56px" unoptimized={!canOptimizeParentImage(url)}
        style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={() => setFailedUrl(url)} />
    : fallback ?? <ImageFallback label={`${name} 로고 없음`} />
}
