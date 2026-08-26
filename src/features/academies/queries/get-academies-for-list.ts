import "server-only"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { formatStoredTargetGrades, parseStoredTargetGrades } from "@/shared/constants/grade-options"

import {
  loadSubjectCategoriesByIdsWithClient,
  loadSubjectMasterByIdsWithClient
} from "@/features/subjects/queries/get-subject-master"
import {
  buildClassSubjectReadModel,
  formatClassSubjectDisplayLabel,
  type Subject,
  type SubjectCategory
} from "@/shared/lib/subject-master"

type PublicClassRow = {
  id: string
  organization_id: string | null
  title: string
  subject: string
  subject_category_id: string | null
  subject_id: string | null
  target_age: string
  description: string
  trial_price: number
  cover_image_url: string | null
}

type SafeOrganizationRow = {
  id: string
  name: string
  branch_name: string | null
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
  address: string | null
  addressDetail: string | null
  sido: string | null
  sigungu: string | null
  bname: string | null
  subjectTags: string[]
  targetAgeSummary: string
  representativeClasses: AcademyClassPreview[]
  distanceKm?: number
}

type GetAcademiesForListOptions = {
  // Subject Master FK. code -> id 해석은 page orchestration 이 담당한다.
  subjectCategoryId?: string | null
  subjectId?: string | null
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
  // legacy mirror. 표시/필터에 쓰지 않고 타입 호환을 위해서만 남긴다.
  "subject",
  "subject_category_id",
  "subject_id",
  "target_age",
  "description",
  "trial_price",
  "cover_image_url"
].join(", ")

const ORGANIZATION_SELECT_FIELDS = [
  "id",
  "name",
  "branch_name",
  "address",
  "address_detail",
  // 공개 UI 의 지역 표시는 이 행정지역 metadata 로만 만든다.
  "sido",
  "sigungu",
  "bname"
].join(", ")

// 과목 표시도 Subject Master 를 canonical source 로 쓴다. classes.subject 문자열은 읽지 않는다.
const buildSubjectLabel = (
  row: PublicClassRow,
  categoryById: Map<string, SubjectCategory>,
  subjectById: Map<string, Subject>
) => {
  const masterCategory = row.subject_category_id ? categoryById.get(row.subject_category_id) ?? null : null
  const masterSubject = row.subject_id ? subjectById.get(row.subject_id) ?? null : null
  const readModel = buildClassSubjectReadModel({
    subjectCategoryId: row.subject_category_id,
    masterCategory,
    subjectId: row.subject_id,
    masterSubject
  })

  // subject: null -> legacy 문자열 fallback 을 쓰지 않는다.
  return formatClassSubjectDisplayLabel({ ...readModel, subject: null }) || "과목 정보 준비 중"
}

const buildClassPreview = (
  row: PublicClassRow,
  categoryById: Map<string, SubjectCategory>,
  subjectById: Map<string, Subject>
): AcademyClassPreview => ({
  id: row.id,
  title: row.title,
  subject: row.subject,
  displaySubject: buildSubjectLabel(row, categoryById, subjectById),
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
): Promise<AcademyListItem[]> => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const normalizedGrades = parseStoredTargetGrades(options?.grade)

  // 위치 필터가 후보를 0개로 좁혔으면 조회 자체를 하지 않는다.
  if (options?.organizationIds && options.organizationIds.length === 0) {
    return []
  }

  let classQuery = serviceRoleClient
    .from("classes")
    .select(PUBLIC_CLASS_SELECT_FIELDS)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  // organization 후보가 정해져 있으면 classes 조회 단계로 밀어 스캔량을 줄인다.
  if (options?.organizationIds) {
    classQuery = classQuery.in("organization_id", [...options.organizationIds])
  }

  // 과목 필터는 Subject Master FK 로만 건다. classes.subject 문자열은 읽지 않는다.
  if (options?.subjectCategoryId) {
    classQuery = classQuery.eq("subject_category_id", options.subjectCategoryId)
  }

  if (options?.subjectId) {
    classQuery = classQuery.eq("subject_id", options.subjectId)
  }

  const { data, error } = await classQuery
  if (error) {
    throw new Error("failed_to_fetch_public_academies")
  }

  const classRows = (((data ?? []) as unknown) as PublicClassRow[])
    .filter((row) => Boolean(row.organization_id))
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
    return []
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

  const [categoryById, subjectById] = await Promise.all([
    loadSubjectCategoriesByIdsWithClient(
      serviceRoleClient,
      classRows
        .map((row) => row.subject_category_id)
        .filter((id): id is string => Boolean(id))
    ),
    loadSubjectMasterByIdsWithClient(
      serviceRoleClient,
      classRows.map((row) => row.subject_id).filter((id): id is string => Boolean(id))
    )
  ])

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

      const representativeClasses = sortClasses(organizationClasses)
        .slice(0, 2)
        .map((item) => buildClassPreview(item, categoryById, subjectById))
      const subjectTags = Array.from(
        new Set(
          organizationClasses.map((item) => {
            const masterCategory = item.subject_category_id
              ? categoryById.get(item.subject_category_id) ?? null
              : null
            return masterCategory?.name ?? "기타"
          })
        )
      ).slice(0, 4)
      const displayName = [organization.name, organization.branch_name].filter(Boolean).join(" ").trim()

      const distanceKm = options?.distanceByOrganizationId?.get(organizationId)

      return {
        id: organizationId,
        displayName: displayName || organization.name,
        address: organization.address ?? null,
        addressDetail: organization.address_detail ?? null,
        sido: organization.sido ?? null,
        sigungu: organization.sigungu ?? null,
        bname: organization.bname ?? null,
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

  return academies
}
