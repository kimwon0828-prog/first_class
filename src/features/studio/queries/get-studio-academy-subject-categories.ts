import "server-only"

import { getReportSubjectCategory } from "@/features/studio/lib/trial-result-options"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

type Embedded<T> = T | T[] | null
const one = <T,>(value: Embedded<T> | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null)

type ClassCategoryRow = {
  subject: string | null
  report_category: Embedded<{ code: string | null }>
  report_subject: Embedded<{ code: string | null; subject_categories: Embedded<{ code: string | null }> }>
}

/**
 * 학원 정보 화면의 "과목". 학원 단위 과목 칸은 DB 에 없어서, 학원이 등록한 수업의 과목 대분류를 모아 보여준다.
 * 읽기 전용. 보관한 수업은 뺀다. 순서는 수업이 많은 과목부터.
 */
export const getStudioAcademySubjectCategories = async (organizationId: string): Promise<string[]> => {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from("classes")
    .select("subject, report_category:subject_categories(code), report_subject:subjects(code, subject_categories(code))")
    .eq("organization_id", organizationId)
    .is("archived_at", null)

  if (error) {
    throw new Error("failed_to_fetch_academy_subject_categories")
  }

  const counts = new Map<string, number>()
  for (const row of (data ?? []) as unknown as ClassCategoryRow[]) {
    const subject = one(row.report_subject)
    const code = getReportSubjectCategory(one(row.report_category)?.code ?? one(subject?.subject_categories)?.code, subject?.code, row.subject)
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1)
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1]).map(([code]) => code)
}
