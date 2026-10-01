"use client"

import Image from "next/image"
import { useState } from "react"
import { ImageFallback } from "@/shared/ui/image-fallback"

/** Actual public-profile brand mark first; never crop it or substitute a class photo. */
export function HomeAcademyLogo({ url, name }: { url: string | null; name: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  return url && failedUrl !== url
    ? <Image src={url} alt={`${name} 로고`} width={64} height={64} unoptimized
        style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={() => setFailedUrl(url)} />
    : <ImageFallback label={`${name} 로고 없음`} />
}
