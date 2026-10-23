import "server-only"

import { dataAdapter } from "@/shared/lib/db"
import type { StudioCurrentParentDecision } from "@/shared/lib/db/adapter"

/**
 * 여러 신청의 지금 유효한 학부모 의향(홈 "다시 연락할 학생"). 읽기 전용.
 * 실패하면 error 를 돌려준다 — 화면은 등록 결과(고민 중)만으로 센다.
 */
export const listStudioCurrentParentDecisions = async (
  applicationIds: string[]
): Promise<{ data: StudioCurrentParentDecision[]; error: boolean }> => {
  try {
    return { data: await dataAdapter.listCurrentParentDecisions(applicationIds), error: false }
  } catch {
    return { data: [], error: true }
  }
}
