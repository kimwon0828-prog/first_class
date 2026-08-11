import type { MetadataRoute } from "next"

import { getAllPublicClasses } from "@/features/classes/queries/get-public-classes"

const SITE_URL = "https://firstsuup.com"

const STATIC_PUBLIC_PATHS: Array<{
  path: string
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>
  priority: number
}> = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/academies", changeFrequency: "daily", priority: 0.8 },
  { path: "/partner", changeFrequency: "weekly", priority: 0.7 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.3 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.3 },
  { path: "/third-party-consent", changeFrequency: "monthly", priority: 0.3 }
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticUrls: MetadataRoute.Sitemap = STATIC_PUBLIC_PATHS.map(
    ({ path, changeFrequency, priority }) => ({
      url: `${SITE_URL}${path}`,
      lastModified: now,
      changeFrequency,
      priority
    })
  )

  try {
    const { data: classes } = await getAllPublicClasses()
    const classDetailUrls: MetadataRoute.Sitemap = Array.from(
      new Set(classes.filter((item) => item.isActive).map((item) => item.id))
    ).map((classId) => ({
      url: `${SITE_URL}/classes/${classId}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8
    }))

    return [...staticUrls, ...classDetailUrls]
  } catch {
    return staticUrls
  }
}
