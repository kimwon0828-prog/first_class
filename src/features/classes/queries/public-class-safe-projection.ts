import "server-only"

import { hasVisibleTeacherPublicProfile } from "@/shared/lib/teacher-public-visibility"

import {
  loadSubjectMasterMapsByIdsWithClient
} from "@/features/subjects/queries/get-subject-master"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import type {
  ClassDetail,
  ClassSummary,
  OrganizationLocationInfo,
  TeacherPublicProfile
} from "@/shared/lib/db/adapter"
import { normalizeSubjectCategory } from "@/shared/constants/education-taxonomy"
import {
  buildClassSubjectReadModel,
  formatClassSubjectDisplayLabel,
  type Subject,
  type SubjectCategory
} from "@/shared/lib/subject-master"

type PublicClassRow = {
  id: string
  organization_id: string | null
  program_type: ClassSummary["programType"]
  assignment_mode: ClassSummary["assignmentMode"] | null
  title: string
  subject_category_id?: string | null
  subject_id?: string | null
  subject: string
  target_age: string
  description: string
  trial_price: number
  teacher_id: string | null
  teacher_display_name: string | null
  cover_image_url: string | null
  is_active: boolean
  class_format?: string | null
  recommended_for?: string | null
  experience_points?: string | null
  curriculum?: string | null
  teacher_intro?: string | null
  subject_master?: Subject | null
  subject_category_master?: SubjectCategory | null
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
  address_line1?: string | null
  address_line2?: string | null
  latitude?: number | null
  longitude?: number | null
}

type SafeTeacherRow = {
  teacher_id: string
  teacher_name: string | null
  intro: string | null
  specialty: string | null
  career_years: number | null
  subjects: string | null
  target_students: string | null
  specialties: string | null
  short_intro: string | null
  teaching_style: string | null
}

type ListPublicClassesOptions = {
  subject?: string
  subjectCategoryId?: string
  subjectId?: string
  query?: string
  // 위치 기반 탐색: 반경 안의 organization 만 조회하고 거리를 붙인다.
  organizationIds?: readonly string[]
  distanceByOrganizationId?: ReadonlyMap<string, number>
  // 화면이 앞의 N개만 쓰는 경우에만 넘긴다. 넘기지 않으면 기존처럼 전체를 조회한다.
  // query/subject 후처리 필터가 걸리는 호출에는 사용하지 않는다(자르고 거르면 결과가 달라진다).
  limit?: number
}

const PUBLIC_CLASS_SELECT_FIELDS = [
  "id",
  "organization_id",
  "program_type",
  "assignment_mode",
  "title",
  "subject_category_id",
  "subject_id",
  "subject",
  "target_age",
  "description",
  "trial_price",
  "teacher_id",
  "teacher_display_name",
  "cover_image_url",
  "is_active",
  "class_format",
  "recommended_for",
  "experience_points",
  "curriculum",
  "teacher_intro"
].join(", ")

const LEGACY_PUBLIC_CLASS_SELECT_FIELDS = [
  "id",
  "organization_id",
  "program_type",
  "title",
  "subject",
  "target_age",
  "description",
  "trial_price",
  "teacher_id",
  "teacher_display_name",
  "cover_image_url",
  "is_active",
  "class_format",
  "recommended_for",
  "experience_points",
  "curriculum",
  "teacher_intro"
].join(", ")

const isMissingColumnError = (error: { code?: string; message?: string } | null) => {
  if (!error) {
    return false
  }

  const code = typeof error.code === "string" ? error.code : ""
  const message = typeof error.message === "string" ? error.message : ""
  return code === "42703" || message.includes("does not exist")
}

const normalizeText = (value: string | null | undefined) => (value ?? "").trim().toLowerCase()

const attachSubjectMaster = async (rows: PublicClassRow[]): Promise<PublicClassRow[]> => {
  const categoryIds = rows
    .map((row) => row.subject_category_id)
    .filter((categoryId): categoryId is string => Boolean(categoryId))
  const subjectIds = rows
    .map((row) => row.subject_id)
    .filter((subjectId): subjectId is string => Boolean(subjectId))

  if (categoryIds.length === 0 && subjectIds.length === 0) {
    return rows
  }

  try {
    const serviceRoleClient = getSupabaseServiceRoleClient()
    const { categoryById, subjectById } = await loadSubjectMasterMapsByIdsWithClient(
      serviceRoleClient,
      categoryIds,
      subjectIds
    )
    return rows.map((row) => ({
      ...row,
      subject_category_master: row.subject_category_id
        ? categoryById.get(row.subject_category_id) ?? null
        : null,
      subject_master: row.subject_id ? subjectById.get(row.subject_id) ?? null : null
    }))
  } catch {
    return rows
  }
}

const buildPublicClassesQuery = (
  selectFields: string,
  options?: ListPublicClassesOptions
) => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  let query = serviceRoleClient
    .from("classes")
    .select(selectFields)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (options?.subjectCategoryId) {
    query = query.eq("subject_category_id", options.subjectCategoryId)
  }

  if (options?.subjectId) {
    query = query.eq("subject_id", options.subjectId)
  }

  if (options?.organizationIds) {
    query = query.in("organization_id", [...options.organizationIds])
  }

  // limit 은 모든 필터와 order 가 적용된 뒤 마지막에 붙인다.
  if (typeof options?.limit === "number" && Number.isInteger(options.limit) && options.limit > 0) {
    query = query.limit(options.limit)
  }

  return query
}

const toOrganizationLocation = (
  row: SafeOrganizationRow | undefined,
  includeMapLocation = false
): OrganizationLocationInfo | null => {
  if (!row) {
    return null
  }

  return {
    name: row.name,
    branchName: row.branch_name ?? null,
    address: row.address ?? null,
    addressDetail: row.address_detail ?? null,
    sido: row.sido ?? null,
    sigungu: row.sigungu ?? null,
    bname: row.bname ?? null,
    ...(includeMapLocation
      ? {
          addressLine1: row.address_line1 ?? null,
          addressLine2: row.address_line2 ?? null,
          latitude: row.latitude ?? null,
          longitude: row.longitude ?? null
        }
      : {})
  }
}

const toTeacherProfileMap = async (teacherIds: string[]) => {
  const uniqueTeacherIds = Array.from(new Set(teacherIds.filter(Boolean)))
  if (uniqueTeacherIds.length === 0) {
    return new Map<string, TeacherPublicProfile>()
  }

  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data: teacherData, error: teacherError } = await serviceRoleClient
    .from("teacher_public_profiles")
    .select(
      "teacher_id, teacher_name, intro, specialty, career_years, subjects, target_students, specialties, short_intro, teaching_style"
    )
    .in("teacher_id", uniqueTeacherIds)

  if (teacherError) {
    throw new Error("failed_to_fetch_public_teacher_projection")
  }

  const teacherRows = (teacherData ?? []) as SafeTeacherRow[]
  return new Map<string, TeacherPublicProfile>(
    teacherRows
      .map((row): TeacherPublicProfile => ({
        teacherId: row.teacher_id,
        teacherName: row.teacher_name?.trim() || null,
        intro: row.intro ?? null,
        specialty: row.specialty ?? null,
        careerYears: row.career_years ?? 0,
        subjects: row.subjects ?? null,
        targetStudents: row.target_students ?? null,
        specialties: row.specialties ?? null,
        shortIntro: row.short_intro ?? null,
        teachingStyle: row.teaching_style ?? null
      }))
      // 공개 항목이 전부 비어 있으면 공개 프로필이 없는 것으로 보고 map 에 넣지 않는다.
      .filter(hasVisibleTeacherPublicProfile)
      .map((profile) => [profile.teacherId, profile])
  )
}

const toOrganizationMap = async (organizationIds: string[], includeMapLocation = false) => {
  const uniqueOrganizationIds = Array.from(new Set(organizationIds.filter(Boolean)))
  if (uniqueOrganizationIds.length === 0) {
    return new Map<string, SafeOrganizationRow>()
  }

  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("organizations")
    .select(
      includeMapLocation
        ? "id, name, branch_name, address, address_detail, sido, sigungu, bname, address_line1, address_line2, latitude, longitude"
        : "id, name, branch_name, address, address_detail, sido, sigungu, bname"
    )
    .in("id", uniqueOrganizationIds)

  if (error) {
    throw new Error("failed_to_fetch_public_organization_projection")
  }

  return new Map<string, SafeOrganizationRow>(
    (((data ?? []) as unknown) as SafeOrganizationRow[]).map((row) => [row.id, row])
  )
}

const mapPublicClassSummary = (
  row: PublicClassRow,
  teacherProfileById: Map<string, TeacherPublicProfile>
): ClassSummary => {
  const teacherProfile = row.teacher_id ? teacherProfileById.get(row.teacher_id) ?? null : null
  const resolvedTeacherName =
    teacherProfile?.teacherName ??
    (row.teacher_id ? null : row.teacher_display_name ?? null)
  const resolvedTeacherIntro =
    teacherProfile?.intro ??
    (row.teacher_id ? null : row.teacher_intro ?? null)

  return {
    id: row.id,
    programType: row.program_type,
    assignmentMode:
      row.assignment_mode === "preassigned" || row.assignment_mode === "post_assign"
        ? row.assignment_mode
        : row.teacher_id
          ? "preassigned"
          : "post_assign",
    title: row.title,
    ...buildClassSubjectReadModel({
      subjectCategoryId: row.subject_category_id,
      masterCategory: row.subject_category_master,
      subjectId: row.subject_id,
      masterSubject: row.subject_master
    }),
    subject: row.subject,
    targetAge: row.target_age,
    classFormat: row.class_format ?? null,
    description: row.description,
    recommendedFor: row.recommended_for ?? null,
    experiencePoints: row.experience_points ?? null,
    curriculum: row.curriculum ?? null,
    teacherIntro: resolvedTeacherIntro,
    trialPrice: row.trial_price,
    teacherId: row.teacher_id,
    teacherDisplayName: resolvedTeacherName,
    teacherName: resolvedTeacherName,
    coverImageUrl: row.cover_image_url ?? null,
    isActive: row.is_active
  }
}

export const listPublicClassesWithSafeProjection = async (
  options?: ListPublicClassesOptions
): Promise<ClassSummary[]> => {
  const initialResult = await buildPublicClassesQuery(PUBLIC_CLASS_SELECT_FIELDS, options)
  const { data, error } = isMissingColumnError(initialResult.error)
    ? await buildPublicClassesQuery(LEGACY_PUBLIC_CLASS_SELECT_FIELDS, options)
    : initialResult
  if (error) {
    throw new Error("failed_to_fetch_public_classes")
  }

  const classRows = await attachSubjectMaster(((data ?? []) as unknown) as PublicClassRow[])
  const [teacherProfileById, organizationById] = await Promise.all([
    toTeacherProfileMap(
      classRows
        .map((row) => row.teacher_id)
        .filter((teacherId): teacherId is string => Boolean(teacherId))
    ),
    toOrganizationMap(
      classRows
        .map((row) => row.organization_id)
        .filter((organizationId): organizationId is string => Boolean(organizationId))
    )
  ])

  const needle = normalizeText(options?.query)
  const normalizedSubject = normalizeSubjectCategory(options?.subject)
  const shouldFilterByQuery = Boolean(needle)

  return classRows
    .filter((row) => {
      if (!normalizedSubject) {
        return true
      }

      return normalizeSubjectCategory(row.subject) === normalizedSubject
    })
    .map((row) => {
      const organization = row.organization_id ? organizationById.get(row.organization_id) : undefined
      const distanceKm = row.organization_id
        ? options?.distanceByOrganizationId?.get(row.organization_id)
        : undefined
      const summary: ClassSummary = {
        ...mapPublicClassSummary(row, teacherProfileById),
        organization: toOrganizationLocation(organization),
        ...(distanceKm === undefined ? {} : { distanceKm })
      }
      const subjectLabel = formatClassSubjectDisplayLabel(summary)

      return {
        summary,
        haystacks: [
          row.title,
          row.description,
          row.subject,
          subjectLabel,
          summary.subjectCategoryName,
          summary.subjectName,
          summary.teacherDisplayName,
          organization?.name ?? null
        ]
      }
    })
    .filter(({ haystacks }) => {
      if (!shouldFilterByQuery) {
        return true
      }

      return haystacks.map(normalizeText).some((value) => value.includes(needle))
    })
    .map(({ summary }) => summary)
}

export const getPublicClassDetailWithSafeProjection = async (
  classId: string
): Promise<ClassDetail | null> => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const initialResult = await serviceRoleClient
    .from("classes")
    .select(PUBLIC_CLASS_SELECT_FIELDS)
    .eq("id", classId)
    .eq("is_active", true)
    .maybeSingle()
  const { data, error } = isMissingColumnError(initialResult.error)
    ? await serviceRoleClient
        .from("classes")
        .select(LEGACY_PUBLIC_CLASS_SELECT_FIELDS)
        .eq("id", classId)
        .eq("is_active", true)
        .maybeSingle()
    : initialResult

  if (error) {
    throw new Error("failed_to_fetch_public_class_detail")
  }

  if (!data) {
    return null
  }

  const [classRow] = await attachSubjectMaster([data as unknown as PublicClassRow])
  const [teacherProfileById, organizationById] = await Promise.all([
    toTeacherProfileMap(classRow.teacher_id ? [classRow.teacher_id] : []),
    toOrganizationMap(classRow.organization_id ? [classRow.organization_id] : [], true)
  ])

  const summary = mapPublicClassSummary(classRow, teacherProfileById)
  const teacherProfile = classRow.teacher_id
    ? teacherProfileById.get(classRow.teacher_id) ?? null
    : null
  const organization = classRow.organization_id
    ? toOrganizationLocation(organizationById.get(classRow.organization_id), true)
    : null

  return {
    ...summary,
    teacherProfile,
    organization
  }
}
