import { toParentUrl } from "@/shared/config/site-origins"

import type { MetadataRoute } from "next"

import { getAcademiesForList } from "@/features/academies/queries/get-academies-for-list"
import { getPublicAcademyPageByHandle } from "@/features/academies/queries/get-public-academy-page"
import { getAllPublicClasses } from "@/features/classes/queries/get-public-classes"
import { PARENT_LAUNCH_REGION } from "@/features/location/lib/parent-launch-region"

// 한 시간마다 다시 만든다. 새 수업 · 학원이 검색엔진에 늦게 잡히지 않게.
export const revalidate = 3600

/**
 * lastModified 는 넣지 않는다.
 * 실제 수정 시각이 없는 상태에서 "지금"을 넣으면 매번 전 페이지가 바뀐 것처럼 보여
 * 검색엔진이 값을 무시한다. 수정 시각을 읽게 되면 그때 넣는다.
 */
const STATIC_PUBLIC_PATHS: Array<{
  path: string
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>
  priority: number
}> = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/partner", changeFrequency: "weekly", priority: 0.9 },
  { path: "/academies", changeFrequency: "daily", priority: 0.8 },
  { path: "/classes", changeFrequency: "daily", priority: 0.8 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.2 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.2 },
  { path: "/refund-policy", changeFrequency: "monthly", priority: 0.2 },
  { path: "/third-party-consent", changeFrequency: "monthly", priority: 0.2 }
]

const classUrls = async (): Promise<MetadataRoute.Sitemap> => {
  const { data: classes } = await getAllPublicClasses()
  return Array.from(new Set(classes.filter((item) => item.isActive).map((item) => item.id))).map(
    (classId) => ({
      url: toParentUrl(`/classes/${classId}`),
      changeFrequency: "daily",
      priority: 0.7
    })
  )
}

// 학원 상세는 canonical 과 같은 주소(slug 우선)로 싣는다.
const academyUrls = async (): Promise<MetadataRoute.Sitemap> => {
  const academies = await getAcademiesForList({ launchRegion: PARENT_LAUNCH_REGION })
  const pages = await Promise.all(
    academies.map((item) => getPublicAcademyPageByHandle(item.id).catch(() => null))
  )
  return pages
    .filter((page): page is NonNullable<typeof page> => page !== null)
    .map((page) => ({
      url: toParentUrl(`/academy/${page.slug ?? page.organizationId}`),
      changeFrequency: "weekly",
      priority: 0.8
    }))
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticUrls: MetadataRoute.Sitemap = STATIC_PUBLIC_PATHS.map(
    ({ path, changeFrequency, priority }) => ({
      url: toParentUrl(path),
      changeFrequency,
      priority
    })
  )

  // 한쪽 조회가 실패해도 나머지는 싣는다.
  const [academies, classes] = await Promise.all([
    academyUrls().catch(() => []),
    classUrls().catch(() => [])
  ])

  return [...staticUrls, ...academies, ...classes]
}
