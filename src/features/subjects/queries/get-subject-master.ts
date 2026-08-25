import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { getSupabaseServerClient } from "@/integrations/supabase/server"
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

export const loadSubjectCategoriesByIdsWithClient = async (
  supabase: SupabaseClient,
  categoryIds: string[]
): Promise<Map<string, SubjectCategory>> => {
  if (categoryIds.length === 0) {
    return new Map<string, SubjectCategory>()
  }

  const { data, error } = await supabase
    .from("subject_categories")
    .select("id, code, name, sort_order, is_active")
    .in("id", Array.from(new Set(categoryIds)))

  if (error) {
    throw new Error("failed_to_fetch_subject_categories")
  }

  return new Map(
    ((data ?? []) as SubjectCategoryRow[]).map((row) => [row.id, mapCategory(row)])
  )
}

export const loadSubjectMasterByIdsWithClient = async (
  supabase: SupabaseClient,
  subjectIds: string[]
): Promise<Map<string, Subject>> => {
  const uniqueSubjectIds = Array.from(new Set(subjectIds.filter(Boolean)))
  if (uniqueSubjectIds.length === 0) {
    return new Map()
  }

  const { data, error } = await supabase
    .from("subjects")
    .select("id, category_id, code, name, sort_order, is_active")
    .in("id", uniqueSubjectIds)

  if (error) {
    throw new Error("failed_to_fetch_subjects")
  }

  const subjectRows = (data ?? []) as SubjectRow[]
  const categoryById = await loadSubjectCategoriesByIdsWithClient(
    supabase,
    subjectRows.map((row) => row.category_id)
  )

  return new Map(
    subjectRows.flatMap((row) => {
      const category = categoryById.get(row.category_id)
      return category
        ? [[
            row.id,
            {
              id: row.id,
              code: row.code,
              name: row.name,
              categoryId: row.category_id,
              categoryCode: category.code,
              categoryName: category.name,
              sortOrder: row.sort_order
            }
          ] as const]
        : []
    })
  )
}

export const getSelectableSubjectCatalog = async (): Promise<SubjectCatalogCategory[]> => {
  const supabase = await getSupabaseServerClient()
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
