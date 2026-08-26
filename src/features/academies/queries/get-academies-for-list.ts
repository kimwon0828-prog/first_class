import "server-only"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import type { AcademyArea } from "@/shared/config/academy-areas"
import { formatStoredTargetGrades, parseStoredTargetGrades } from "@/shared/constants/grade-options"

import {
  formatAcademySubjectTag,
  matchesAcademiesSubjectFilter,
  resolveAcademiesSubjectFilter
} from "../lib/subject-filter-map"

type PublicClassRow = {
  id: string
  organization_id: string | null
  title: string
  subject: string
  region: AcademyArea
  target_age: string
  description: string
  trial_price: number
  cover_image_url: string | null
}

type SafeOrganizationRow = {
  id: string
  name: string
  branch_name: string | null
  academy_area: AcademyArea | null
  address: string | null
  address_detail: string | null
  sido: string | null
  sigungu: string | null
  bname: string | null
}

export type AcademyClassPreview = {
  id: string
  title: string
  subject: string
  displaySubject: string
  targetAge: string
  description: string
  trialPrice: number
  coverImageUrl: string | null
}

export type AcademyListItem = {
  id: string
  displayName: string
  academyArea: AcademyArea | null
  address: string | null
  addressDetail: string | null
  sido: string | null
  sigungu: string | null
  bname: string | null
  locationSummary: string
  subjectTags: string[]
  targetAgeSummary: string
  representativeClasses: AcademyClassPreview[]
  distanceKm?: number
}

type GetAcademiesForListOptions = {
  subject?: string | null
  // legacy academy-area filter. 2C-3 에서 제거 예정.
  region?: AcademyArea | null
  grade?: string | null
  sort?: string | null
  // 위치 탐색은 query 가 아니라 page orchestration 이 해석한다.
  // 여기로는 이미 결정된 organization 집합과 거리만 넘어온다.
  organizationIds?: readonly string[]
  distanceByOrganizationId?: ReadonlyMap<string, number>
}

const PUBLIC_CLASS_SELECT_FIELDS = [
  "id",
  "organization_id",
  "title",
  "subject",
  "region",
  "target_age",
  "description",
  "trial_price",
  "cover_image_url"
].join(", ")

const ORGANIZATION_SELECT_FIELDS = [
  "id",
  "name",
  "branch_name",
  // legacy. 2C-3 에서 제거 예정이며 그때까지 표시 경로가 계속 사용한다.
  "academy_area",
  "address",
  "address_detail",
  // 2C-2 의 행정지역 label 용. 이 단계에서는 전달만 하고 표시하지 않는다.
  "sido",
  "sigungu",
  "bname"
].join(", ")

const summarizeLocation = (organization: SafeOrganizationRow) => {
  if (organization.academy_area) {
    return organization.academy_area === "은행사거리학원가"
      ? "중계 은행사거리 학원가"
      : organization.academy_area
  }

  const baseAddress = organization.address?.trim()
  if (!baseAddress) {
    return "주소 정보 준비 중"
  }

  const segments = baseAddress.split(/\s+/).filter(Boolean)
  if (segments.length >= 3) {
    return segments.slice(1, 3).join(" ")
  }

  return baseAddress
}

const buildClassPreview = (row: PublicClassRow): AcademyClassPreview => ({
  id: row.id,
  title: row.title,
  subject: row.subject,
  displaySubject: formatAcademySubjectTag(row.subject),
  targetAge: row.target_age,
  description: row.description,
  trialPrice: row.trial_price,
  coverImageUrl: row.cover_image_url ?? null
})

const buildTargetAgeSummary = (items: PublicClassRow[]) => {
  const uniqueValues = Array.from(
    new Set(
      items
        .map((item) => formatStoredTargetGrades(item.target_age))
        .filter((value): value is string => Boolean(value))
    )
  )

  if (uniqueValues.length === 0) {
    return "대상 연령 정보 준비 중"
  }

  return uniqueValues.slice(0, 2).join(" · ")
}

const sortClasses = (items: PublicClassRow[]) =>
  [...items].sort((left, right) => {
    if (left.cover_image_url && !right.cover_image_url) {
      return -1
    }
    if (!left.cover_image_url && right.cover_image_url) {
      return 1
    }
    return left.title.localeCompare(right.title, "ko")
  })

export const getAcademiesForList = async (
  options?: GetAcademiesForListOptions
): Promise<{
  academies: AcademyListItem[]
  selectedSubjectLabel: string | null
}> => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const subjectFilter = resolveAcademiesSubjectFilter(options?.subject)
  const normalizedGrades = parseStoredTargetGrades(options?.grade)

  // 위치 필터가 후보를 0개로 좁혔으면 조회 자체를 하지 않는다.
  if (options?.organizationIds && options.organizationIds.length === 0) {
    return {
      academies: [],
      selectedSubjectLabel: subjectFilter?.label ?? null
    }
  }

  let classQuery = serviceRoleClient
    .from("classes")
    .select(PUBLIC_CLASS_SELECT_FIELDS)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (options?.region) {
    classQuery = classQuery.eq("region", options.region)
  }

  // organization 후보가 정해져 있으면 classes 조회 단계로 밀어 스캔량을 줄인다.
  if (options?.organizationIds) {
    classQuery = classQuery.in("organization_id", [...options.organizationIds])
  }

  const { data, error } = await classQuery
  if (error) {
    throw new Error("failed_to_fetch_public_academies")
  }

  const classRows = (((data ?? []) as unknown) as PublicClassRow[])
    .filter((row) => Boolean(row.organization_id))
    .filter((row) => matchesAcademiesSubjectFilter(row.subject, subjectFilter))
    .filter((row) => {
      if (normalizedGrades.length === 0) {
        return true
      }
      const rowGrades = parseStoredTargetGrades(row.target_age)
      return normalizedGrades.some((grade) => rowGrades.includes(grade))
    })

  const organizationIds = Array.from(
    new Set(classRows.map((row) => row.organization_id).filter((id): id is string => Boolean(id)))
  )

  if (organizationIds.length === 0) {
    return {
      academies: [],
      selectedSubjectLabel: subjectFilter?.label ?? null
    }
  }

  const { data: organizationData, error: organizationError } = await serviceRoleClient
    .from("organizations")
    .select(ORGANIZATION_SELECT_FIELDS)
    .in("id", organizationIds)

  if (organizationError) {
    throw new Error("failed_to_fetch_public_organization_projection")
  }

  const organizationById = new Map<string, SafeOrganizationRow>(
    (((organizationData ?? []) as unknown) as SafeOrganizationRow[]).map((item) => [item.id, item])
  )

  const groupedByOrganization = new Map<string, PublicClassRow[]>()
  for (const row of classRows) {
    if (!row.organization_id) {
      continue
    }
    const current = groupedByOrganization.get(row.organization_id) ?? []
    current.push(row)
    groupedByOrganization.set(row.organization_id, current)
  }

  const academies = Array.from(groupedByOrganization.entries())
    .map(([organizationId, organizationClasses]) => {
      const organization = organizationById.get(organizationId)
      if (!organization) {
        return null
      }

      const representativeClasses = sortClasses(organizationClasses).slice(0, 2).map(buildClassPreview)
      const subjectTags = Array.from(
        new Set(organizationClasses.map((item) => formatAcademySubjectTag(item.subject)))
      ).slice(0, 4)
      const displayName = [organization.name, organization.branch_name].filter(Boolean).join(" ").trim()

      const distanceKm = options?.distanceByOrganizationId?.get(organizationId)

      return {
        id: organizationId,
        displayName: displayName || organization.name,
        academyArea: organization.academy_area ?? null,
        address: organization.address ?? null,
        addressDetail: organization.address_detail ?? null,
        sido: organization.sido ?? null,
        sigungu: organization.sigungu ?? null,
        bname: organization.bname ?? null,
        locationSummary: summarizeLocation(organization),
        subjectTags,
        targetAgeSummary: buildTargetAgeSummary(organizationClasses),
        representativeClasses,
        ...(distanceKm === undefined ? {} : { distanceKm })
      } satisfies AcademyListItem
    })
    .filter((item): item is AcademyListItem => Boolean(item))
    .sort((left, right) => {
      // 거리 정보가 넘어온 경우(= 내 주변)에는 거리순이 다른 정렬보다 우선한다.
      if (options?.distanceByOrganizationId) {
        const leftDistance = left.distanceKm ?? Number.POSITIVE_INFINITY
        const rightDistance = right.distanceKm ?? Number.POSITIVE_INFINITY
        if (leftDistance !== rightDistance) {
          return leftDistance - rightDistance
        }

        return left.displayName.localeCompare(right.displayName, "ko")
      }

      if ((options?.sort ?? "").trim() === "name") {
        return left.displayName.localeCompare(right.displayName, "ko")
      }

      const classDiff = right.representativeClasses.length - left.representativeClasses.length
      if (classDiff !== 0) {
        return classDiff
      }

      return left.displayName.localeCompare(right.displayName, "ko")
    })

  return {
    academies,
    selectedSubjectLabel: subjectFilter?.label ?? null
  }
}
