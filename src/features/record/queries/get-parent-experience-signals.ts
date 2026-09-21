import "server-only"

import { getMyChildren } from "@/features/children/queries/get-my-children"
import { dataAdapter } from "@/shared/lib/db"
import type { ParentApplicationSummary } from "@/shared/lib/db/adapter"

/**
 * 경험마다 "리포트가 있는가 / 내 생각을 남겼는가".
 *
 * ⚠️ 새 table · migration · RPC 없이 기존 조회만 조립한다.
 *    발행본은 아이 단위 bulk 로, 결정은 발행본이 있는 경험에 대해서만 읽는다.
 *
 * ⚠️ 실패를 "없음" 으로 접지 않는다. 읽지 못했으면 error 를 올려서
 *    화면이 "리포트 없음" 이라고 단정하지 않게 한다.
 *
 * /record 목록과 /notifications의 리포트 안내 가 같은 사실을 같은 방법으로 읽는다.
 */
export type ParentExperienceSignals = {
  /** 지금 살아 있는 발행본이 있는 경험. */
  reportedExperienceIds: Set<string>
  /** ParentDecision 이 남아 있는 경험. 무엇을 골랐는지는 보지 않는다. */
  decidedExperienceIds: Set<string>
  error: string | null
}

const EMPTY: ParentExperienceSignals = {
  reportedExperienceIds: new Set(),
  decidedExperienceIds: new Set(),
  error: null
}

export const getParentExperienceSignals = async (
  candidates: readonly ParentApplicationSummary[]
): Promise<ParentExperienceSignals> => {
  if (candidates.length === 0) {
    return EMPTY
  }

  const candidateIds = new Set(candidates.map((item) => item.id))

  try {
    const children = await getMyChildren()
    if (children.error) throw new Error("failed_to_fetch_signal_children")
    const reportedExperienceIds = new Set<string>()

    if (!children.error && children.data.length > 0) {
      const perChild = await Promise.all(
        children.data.map((child) => dataAdapter.listMyPublishedReportsByChild(child.id))
      )
      for (const reports of perChild) {
        for (const report of reports) {
          if (candidateIds.has(report.experienceId)) {
            reportedExperienceIds.add(report.experienceId)
          }
        }
      }
    }

    /*
     * child_id 가 없는 legacy 신청은 아이 단위 조회에 걸리지 않는다.
     * 그 몇 건만 개별로 확인한다 — 빠뜨리면 그 리포트는 영영 안 뜬다.
     */
    const legacyCandidates = candidates.filter((item) => !item.childId)
    if (legacyCandidates.length > 0) {
      const legacyReports = await Promise.all(
        legacyCandidates.map(async (item) => {
          const report = await dataAdapter.getPublishedExperienceReport(item.id)
          return report ? item.id : null
        })
      )
      for (const experienceId of legacyReports) {
        if (experienceId) {
          reportedExperienceIds.add(experienceId)
        }
      }
    }

    if (reportedExperienceIds.size === 0) {
      return { ...EMPTY, reportedExperienceIds }
    }

    const decided = await Promise.all(
      [...reportedExperienceIds].map(async (experienceId) => {
        const decision = await dataAdapter.getCurrentParentDecision(experienceId)
        return decision ? experienceId : null
      })
    )

    return {
      reportedExperienceIds,
      decidedExperienceIds: new Set(decided.filter((value): value is string => value !== null)),
      error: null
    }
  } catch {
    return {
      reportedExperienceIds: new Set(),
      decidedExperienceIds: new Set(),
      error: "기록 정보를 불러오지 못했어요."
    }
  }
}
