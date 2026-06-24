import "server-only"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import type {
  ClassDetail,
  ClassSummary,
  OrganizationLocationInfo,
  TeacherPublicProfile
} from "@/shared/lib/db/adapter"
import type { AcademyArea } from "@/shared/config/academy-areas"

type PublicClassRow = {
  id: string
  organization_id: string | null
  program_type: ClassSummary["programType"]
  title: string
  subject: string
  region: AcademyArea
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
}

type SafeOrganizationRow = {
  id: string
  name: string
  branch_name: string | null
  address: string | null
  address_detail: string | null
}

type SafeTeacherRow = {
  id: string
  profile_id: string | null
  display_name: string | null
  intro: string | null
  specialty: string | null
  career_years: number | null
  is_active: boolean
}

type SafeProfileRow = {
  id: string
  name: string | null
  role: string | null
}

type ListPublicClassesOptions = {
  region?: AcademyArea
  subject?: string
  query?: string
}

const PUBLIC_CLASS_SELECT_FIELDS = [
  "id",
  "organization_id",
  "program_type",
  "title",
  "subject",
  "region",
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

const normalizeText = (value: string | null | undefined) => (value ?? "").trim().toLowerCase()

const toOrganizationLocation = (
  row: SafeOrganizationRow | undefined
): OrganizationLocationInfo | null => {
  if (!row) {
    return null
  }

  return {
    name: row.name,
    branchName: row.branch_name ?? null,
    address: row.address ?? null,
    addressDetail: row.address_detail ?? null
  }
}

const toTeacherProfileMap = async (teacherIds: string[]) => {
  const uniqueTeacherIds = Array.from(new Set(teacherIds.filter(Boolean)))
  if (uniqueTeacherIds.length === 0) {
    return new Map<string, TeacherPublicProfile>()
  }

  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data: teacherData, error: teacherError } = await serviceRoleClient
    .from("teachers")
    .select("id, profile_id, display_name, intro, specialty, career_years, is_active")
    .in("id", uniqueTeacherIds)
    .eq("is_active", true)

  if (teacherError) {
    throw new Error("failed_to_fetch_public_teacher_projection")
  }

  const teacherRows = (teacherData ?? []) as SafeTeacherRow[]
  const profileIds = teacherRows
    .map((row) => row.profile_id)
    .filter((profileId): profileId is string => Boolean(profileId))

  let profileById = new Map<string, SafeProfileRow>()
  if (profileIds.length > 0) {
    const { data: profileData, error: profileError } = await serviceRoleClient
      .from("profiles")
      .select("id, name, role")
      .in("id", Array.from(new Set(profileIds)))

    if (profileError) {
      throw new Error("failed_to_fetch_public_teacher_profile_names")
    }

    profileById = new Map(
      ((profileData ?? []) as SafeProfileRow[]).map((row) => [row.id, row])
    )
  }

  const safeRows = teacherRows.filter((row) => {
    if (!row.profile_id) {
      return true
    }

    return profileById.get(row.profile_id)?.role === "teacher"
  })

  return new Map<string, TeacherPublicProfile>(
    safeRows.map((row) => {
      const profile = row.profile_id ? profileById.get(row.profile_id) : null
      const teacherName =
        row.display_name?.trim() ||
        profile?.name?.trim() ||
        "이름 미등록 선생님"

      return [
        row.id,
        {
          teacherId: row.id,
          teacherName,
          intro: row.intro ?? null,
          specialty: row.specialty ?? null,
          careerYears: row.career_years ?? 0
        }
      ]
    })
  )
}

const toOrganizationMap = async (organizationIds: string[]) => {
  const uniqueOrganizationIds = Array.from(new Set(organizationIds.filter(Boolean)))
  if (uniqueOrganizationIds.length === 0) {
    return new Map<string, SafeOrganizationRow>()
  }

  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("organizations")
    .select("id, name, branch_name, address, address_detail")
    .in("id", uniqueOrganizationIds)

  if (error) {
    throw new Error("failed_to_fetch_public_organization_projection")
  }

  return new Map<string, SafeOrganizationRow>(
    ((data ?? []) as SafeOrganizationRow[]).map((row) => [row.id, row])
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
    title: row.title,
    subject: row.subject,
    region: row.region,
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
  const serviceRoleClient = getSupabaseServiceRoleClient()
  let query = serviceRoleClient
    .from("classes")
    .select(PUBLIC_CLASS_SELECT_FIELDS)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (options?.region) {
    query = query.eq("region", options.region)
  }

  if (options?.subject?.trim()) {
    query = query.eq("subject", options.subject.trim())
  }

  const { data, error } = await query
  if (error) {
    throw new Error("failed_to_fetch_public_classes")
  }

  const classRows = ((data ?? []) as unknown) as PublicClassRow[]
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
  const shouldFilterByQuery = Boolean(needle)

  return classRows
    .map((row) => {
      const summary = mapPublicClassSummary(row, teacherProfileById)
      const organization = row.organization_id ? organizationById.get(row.organization_id) : undefined

      return {
        summary,
        haystacks: [
          row.title,
          row.description,
          row.subject,
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
  const { data, error } = await serviceRoleClient
    .from("classes")
    .select(PUBLIC_CLASS_SELECT_FIELDS)
    .eq("id", classId)
    .eq("is_active", true)
    .maybeSingle()

  if (error) {
    throw new Error("failed_to_fetch_public_class_detail")
  }

  if (!data) {
    return null
  }

  const classRow = data as unknown as PublicClassRow
  const [teacherProfileById, organizationById] = await Promise.all([
    toTeacherProfileMap(classRow.teacher_id ? [classRow.teacher_id] : []),
    toOrganizationMap(classRow.organization_id ? [classRow.organization_id] : [])
  ])

  const summary = mapPublicClassSummary(classRow, teacherProfileById)
  const teacherProfile = classRow.teacher_id
    ? teacherProfileById.get(classRow.teacher_id) ?? null
    : null
  const organization = classRow.organization_id
    ? toOrganizationLocation(organizationById.get(classRow.organization_id))
    : null

  return {
    ...summary,
    teacherProfile,
    organization
  }
}
