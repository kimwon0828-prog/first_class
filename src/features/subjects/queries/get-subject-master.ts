import "server-only"

import { unstable_cache } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"

import { getSupabaseServerClient } from "@/integrations/supabase/server"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import type { Subject, SubjectCatalogCategory, SubjectCategory } from "@/shared/lib/subject-master"

type SubjectCategoryRow = {
  id: string
  code: string
  name: string
  sort_order: number
  is_active: boolean
}

type SubjectRow = {
  id: string
  category_id: string
  code: string
  name: string
  sort_order: number
  is_active: boolean
}

const mapCategory = (row: SubjectCategoryRow): SubjectCategory => ({
  id: row.id,
  code: row.code,
  name: row.name,
  sortOrder: row.sort_order
})

const mapSubject = (
  row: SubjectRow,
  category: SubjectCategoryRow
): Subject => ({
  id: row.id,
  code: row.code,
  name: row.name,
  categoryId: row.category_id,
  categoryCode: category.code,
  categoryName: category.name,
  sortOrder: row.sort_order
})

// category 행을 id 로 읽는 단일 지점. is_active 로 거르지 않는다.
// (class 가 비활성 category 를 가리켜도 label 은 그대로 해석되어야 한다.)
const loadSubjectCategoryRowsByIdsWithClient = async (
  supabase: SupabaseClient,
  categoryIds: string[]
): Promise<Map<string, SubjectCategoryRow>> => {
  const uniqueCategoryIds = Array.from(new Set(categoryIds.filter(Boolean)))
  if (uniqueCategoryIds.length === 0) {
    return new Map<string, SubjectCategoryRow>()
  }

  const { data, error } = await supabase
    .from("subject_categories")
    .select("id, code, name, sort_order, is_active")
    .in("id", uniqueCategoryIds)

  if (error) {
    throw new Error("failed_to_fetch_subject_categories")
  }

  return new Map(((data ?? []) as SubjectCategoryRow[]).map((row) => [row.id, row]))
}

const loadSubjectRowsByIdsWithClient = async (
  supabase: SupabaseClient,
  subjectIds: string[]
): Promise<SubjectRow[]> => {
  const uniqueSubjectIds = Array.from(new Set(subjectIds.filter(Boolean)))
  if (uniqueSubjectIds.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from("subjects")
    .select("id, category_id, code, name, sort_order, is_active")
    .in("id", uniqueSubjectIds)

  if (error) {
    throw new Error("failed_to_fetch_subjects")
  }

  return (data ?? []) as SubjectRow[]
}

const buildSubjectMap = (
  subjectRows: SubjectRow[],
  categoryRowById: ReadonlyMap<string, SubjectCategoryRow>
): Map<string, Subject> =>
  new Map(
    subjectRows.flatMap((row) => {
      const category = categoryRowById.get(row.category_id)
      return category ? [[row.id, mapSubject(row, category)] as const] : []
    })
  )

export const loadSubjectCategoriesByIdsWithClient = async (
  supabase: SupabaseClient,
  categoryIds: string[]
): Promise<Map<string, SubjectCategory>> => {
  const categoryRowById = await loadSubjectCategoryRowsByIdsWithClient(supabase, categoryIds)
  return new Map(
    Array.from(categoryRowById.values()).map((row) => [row.id, mapCategory(row)])
  )
}

// category/subject 를 함께 필요로 하는 호출자용 통합 loader.
// subjects 를 먼저 읽고 category 는 (직접 요청분 ∪ subject 의 category) 를 한 번에 읽어서,
// 같은 요청에서 subject_categories 를 두 번 조회하던 왕복을 없앤다.
// 반환되는 categoryById 는 기존과 동일하게 categoryIds 로 요청한 항목만 담는다.
export const loadSubjectMasterMapsByIdsWithClient = async (
  supabase: SupabaseClient,
  categoryIds: string[],
  subjectIds: string[]
): Promise<{
  categoryById: Map<string, SubjectCategory>
  subjectById: Map<string, Subject>
}> => {
  const subjectRows = await loadSubjectRowsByIdsWithClient(supabase, subjectIds)
  const categoryRowById = await loadSubjectCategoryRowsByIdsWithClient(supabase, [
    ...categoryIds,
    ...subjectRows.map((row) => row.category_id)
  ])

  const requestedCategoryIds = new Set(categoryIds.filter(Boolean))

  return {
    categoryById: new Map(
      Array.from(categoryRowById.values())
        .filter((row) => requestedCategoryIds.has(row.id))
        .map((row) => [row.id, mapCategory(row)])
    ),
    subjectById: buildSubjectMap(subjectRows, categoryRowById)
  }
}

export const loadSubjectMasterByIdsWithClient = async (
  supabase: SupabaseClient,
  subjectIds: string[]
): Promise<Map<string, Subject>> => {
  const subjectRows = await loadSubjectRowsByIdsWithClient(supabase, subjectIds)
  if (subjectRows.length === 0) {
    return new Map()
  }

  const categoryRowById = await loadSubjectCategoryRowsByIdsWithClient(
    supabase,
    subjectRows.map((row) => row.category_id)
  )

  return buildSubjectMap(subjectRows, categoryRowById)
}

// 공개 기준정보라 요청 cookie 와 무관하다. 캐시 안에서는 dynamic API 를 쓸 수 없으므로
// cookie-aware client 대신 service role client 로 읽는다.
// subject_categories/subjects 의 공개 read 정책이 이미 USING (true) 라 반환 행은 동일하다.
const readSelectableSubjectCatalog = async (): Promise<SubjectCatalogCategory[]> => {
  const supabase = getSupabaseServiceRoleClient()
  const [{ data: categoryData, error: categoryError }, { data: subjectData, error: subjectError }] =
    await Promise.all([
      supabase
        .from("subject_categories")
        .select("id, code, name, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("subjects")
        .select("id, category_id, code, name, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
    ])

  if (categoryError || subjectError) {
    throw new Error("failed_to_fetch_selectable_subject_catalog")
  }

  const categoryRows = (categoryData ?? []) as SubjectCategoryRow[]
  const subjectRows = (subjectData ?? []) as SubjectRow[]
  const activeCategoryById = new Map(categoryRows.map((row) => [row.id, row]))

  return categoryRows.map((category) => ({
    ...mapCategory(category),
    subjects: subjectRows
      .filter((subject) => subject.category_id === category.id)
      .map((subject) => mapSubject(subject, activeCategoryById.get(subject.category_id) ?? category))
      .sort((left, right) => left.sortOrder - right.sortOrder)
  }))
}

// 공개 카탈로그 read 경로만 캐시한다. 쓰기/검증용 subject 함수는 캐시하지 않는다.
export const getSelectableSubjectCatalog = unstable_cache(
  readSelectableSubjectCatalog,
  ["selectable-subject-catalog-v1"],
  { revalidate: 300, tags: ["selectable-subject-catalog-v1"] }
)

export const getSubjectMasterById = async (subjectId: string): Promise<Subject | null> => {
  const supabase = await getSupabaseServerClient()
  const subjectById = await loadSubjectMasterByIdsWithClient(supabase, [subjectId])
  return subjectById.get(subjectId) ?? null
}

const getActiveSubjectForWriteByWithClient = async (
  supabase: SupabaseClient,
  field: "id" | "code",
  value: string
): Promise<Subject | null> => {
  const { data, error } = await supabase
    .from("subjects")
    .select("id, category_id, code, name, sort_order, is_active")
    .eq(field, value)
    .eq("is_active", true)
    .maybeSingle()

  if (error) {
    throw new Error("failed_to_validate_subject")
  }

  if (!data) {
    return null
  }

  const subjectRow = data as SubjectRow
  const { data: categoryData, error: categoryError } = await supabase
    .from("subject_categories")
    .select("id, code, name, sort_order, is_active")
    .eq("id", subjectRow.category_id)
    .eq("is_active", true)
    .maybeSingle()

  if (categoryError) {
    throw new Error("failed_to_validate_subject_category")
  }

  if (!categoryData) {
    return null
  }

  return mapSubject(subjectRow, categoryData as SubjectCategoryRow)
}

export const getActiveSubjectCategoryForWriteWithClient = async (
  supabase: SupabaseClient,
  categoryId: string
): Promise<SubjectCategory | null> => {
  const { data, error } = await supabase
    .from("subject_categories")
    .select("id, code, name, sort_order, is_active")
    .eq("id", categoryId)
    .eq("is_active", true)
    .maybeSingle()

  if (error) {
    throw new Error("failed_to_validate_subject_category")
  }

  return data ? mapCategory(data as SubjectCategoryRow) : null
}

export const getActiveSubjectForWriteWithClient = async (
  supabase: SupabaseClient,
  subjectId: string
): Promise<Subject | null> => getActiveSubjectForWriteByWithClient(supabase, "id", subjectId)

export const getActiveSubjectForWriteByCodeWithClient = async (
  supabase: SupabaseClient,
  subjectCode: string
): Promise<Subject | null> => getActiveSubjectForWriteByWithClient(supabase, "code", subjectCode)
