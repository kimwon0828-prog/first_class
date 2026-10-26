import "server-only"

import { getMyChildren } from "@/features/children/queries/get-my-children"
import { dataAdapter } from "@/shared/lib/db"
import type { ParentApplicationSummary } from "@/shared/lib/db/adapter"
import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { getExperienceReportSummary, getReportAttachments, type ExperienceReportSnapshotV1 } from "@/features/reports/lib/experience-report-snapshot"

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
  /** 기록 카드용(`recordCards` 일 때만): 발행본의 선생님 이야기 첫 줄과 앞 사진 3장. */
  reportPreviews?: Map<string, ReportCardPreview>
  /** 기록 카드용: 의견을 남길 수 있는 경험 / 의견(피드백)과 등록 의향을 모두 남긴 경험(앱 "내 의견 보냄"). */
  feedbackEligibleIds?: Set<string>
  feedbackSentIds?: Set<string>
  error: string | null
}
export type ReportCardPreview = { summary: string | null; photoIds: string[]; photoCount: number }

const EMPTY: ParentExperienceSignals = {
  reportedExperienceIds: new Set(),
  decidedExperienceIds: new Set(),
  error: null
}

// 선생님 이야기 첫 줄. 이미 읽은 발행 스냅샷에서만 만든다.
const firstLine = (text: string | null) => text?.split("\n").map(line => line.trim()).find(Boolean) ?? null
const toPreview = (content: ExperienceReportSnapshotV1): ReportCardPreview => {
  const photos = getReportAttachments(content)
  return { summary: firstLine(getExperienceReportSummary(content)), photoIds: photos.slice(0, 3).map(photo => photo.id), photoCount: photos.length }
}

export const getParentExperienceSignals = async (
  candidates: readonly ParentApplicationSummary[],
  options: { recordCards?: boolean } = {}
): Promise<ParentExperienceSignals> => {
  if (candidates.length === 0) {
    return EMPTY
  }

  const candidateIds = new Set(candidates.map((item) => item.id))

  let queryStage = "getMyChildren"
  try {
    const children = await getMyChildren()
    if (children.error) throw new Error("failed_to_fetch_signal_children")
    const reportedExperienceIds = new Set<string>()
    const reportPreviews = new Map<string, ReportCardPreview>()

    // Both paths remain session/RLS scoped. Legacy reports do not depend on
    // the child report results; wait for both before querying decisions.
    queryStage = "publishedReports"
    const legacyCandidates = candidates.filter((item) => !item.childId)
    const [perChild, legacyReports] = await Promise.all([
      Promise.all(children.data.map((child) => dataAdapter.listMyPublishedReportsByChild(child.id))),
      Promise.all(legacyCandidates.map(async (item) => {
        const report = await dataAdapter.getPublishedExperienceReport(item.id)
        if (report) reportPreviews.set(item.id, toPreview(report.content))
        return report ? item.id : null
      }))
    ])
    for (const reports of perChild) {
      for (const report of reports) {
        if (!candidateIds.has(report.experienceId)) continue
        reportedExperienceIds.add(report.experienceId)
        reportPreviews.set(report.experienceId, toPreview(report.content))
      }
    }
    for (const experienceId of legacyReports) {
      if (experienceId) reportedExperienceIds.add(experienceId)
    }

    if (reportedExperienceIds.size === 0) {
      return { ...EMPTY, reportedExperienceIds }
    }

    queryStage = "getCurrentParentDecision"
    // 기록 카드는 기존 의견 화면과 같은 읽기(세션 · RLS 범위의 피드백 context)로 "의견을 남겼는가"도 본다.
    const parentId = options.recordCards ? (await getMyProfile())?.id ?? null : null
    const rows = await Promise.all(
      [...reportedExperienceIds].map(async (experienceId) => {
        const [decision, feedback] = await Promise.all([
          dataAdapter.getCurrentParentDecision(experienceId),
          parentId ? dataAdapter.getParentFeedbackContext(experienceId, parentId).catch(() => null) : Promise.resolve(null)
        ])
        return { experienceId, decided: Boolean(decision), feedback }
      })
    )
    const decidedExperienceIds = new Set(rows.filter(row => row.decided).map(row => row.experienceId))
    if (!options.recordCards) return { reportedExperienceIds, decidedExperienceIds, error: null }

    return {
      reportedExperienceIds,
      decidedExperienceIds,
      reportPreviews,
      feedbackEligibleIds: new Set(rows.filter(row => row.feedback?.eligible).map(row => row.experienceId)),
      feedbackSentIds: new Set(rows.filter(row => row.decided && row.feedback?.feedback).map(row => row.experienceId)),
      error: null
    }
  } catch (error) {
    const detail = error as { code?: unknown; message?: unknown; stack?: unknown } | null
    console.error(`[parent-experience-signals:${queryStage}] query failed`, {
      code: typeof detail?.code === "string" ? detail.code : "unknown",
      message: typeof detail?.message === "string" ? detail.message : "Experience signal query failed",
      stack: typeof detail?.stack === "string" ? detail.stack : undefined
    })
    return {
      reportedExperienceIds: new Set(),
      decidedExperienceIds: new Set(),
      error: "기록 정보를 불러오지 못했어요."
    }
  }
}
