import type { ParentApplicationSummary } from "@/shared/lib/db/adapter"
import type { ParentNotification } from "@/features/notifications/lib/parent-notifications"
import { selectParentActionCandidates, type ParentAction } from "./parent-actions"

export type HomeExperienceSignals = {
  /** null means receipt state unavailable, not read or unread. */
  reportRead: boolean | null
  parentDecisionCompleted: boolean
  /** Absent until a real academy evaluation source exists. Never default to false. */
  academyEvaluationCompleted?: boolean
}
export type HomeExperienceActionKind = "report_review" | "experience_reflection"

export function resolveHomeExperienceAction(signals: HomeExperienceSignals): HomeExperienceActionKind | null {
  if (signals.reportRead === false) return "report_review"
  if (signals.reportRead !== true) return null
  if (!signals.parentDecisionCompleted || signals.academyEvaluationCompleted === false) return "experience_reflection"
  return null
}

export type ParentHomeAction = Omit<ParentAction, "kind"> & {
  kind: HomeExperienceActionKind
  description: string
  /** Only report-review actions mark a real persisted notification key. */
  notificationKey?: string
}

export function selectParentHomeActions(input: {
  applications: readonly ParentApplicationSummary[]
  notifications: readonly ParentNotification[]
  decidedExperienceIds: ReadonlySet<string>
}): ParentHomeAction[] {
  const reports = new Map(input.notifications.filter(item => item.kind === "report_published").map(item => [item.href, item]))
  return selectParentActionCandidates(input.applications)
    .sort((a, b) => Date.parse(b.completedAt!) - Date.parse(a.completedAt!) || b.id.localeCompare(a.id))
    .flatMap((item): ParentHomeAction[] => {
      const report = reports.get(`/record/${item.id}/report`)
      if (!report) return []
      const kind = resolveHomeExperienceAction({
        reportRead: typeof report.isUnread === "boolean" ? !report.isUnread : null,
        parentDecisionCompleted: input.decidedExperienceIds.has(item.id)
        // No evaluation field is invented or read from DB in this version.
      })
      if (!kind || (kind === "experience_reflection" && !item.canCollectParentDecision)) return []
      return [{
        id: `${kind}:${item.id}`, kind, experienceId: item.id,
        childId: item.childId, childName: item.childName, childGrade: item.childGrade,
        classTitle: item.classTitle, academyName: item.academyName,
        title: kind === "report_review" ? "체험 리포트가 도착했어요" : "이번 체험은 어떠셨나요?",
        description: kind === "report_review" ? "선생님이 남긴 관찰을 확인해보세요." : "등록 여부와 학원에 대한 생각을 남겨주세요.",
        ctaLabel: kind === "report_review" ? "리포트 확인하기" : "등록 여부 남기기",
        href: kind === "report_review" ? report.href : `/record/${item.id}#decision-title`,
        notificationKey: kind === "report_review" ? report.id : undefined
      }]
    })
    // Unread report comes before a later-stage prompt; preserve recency within each kind.
    .sort((a, b) => Number(b.kind === "report_review") - Number(a.kind === "report_review"))
}
