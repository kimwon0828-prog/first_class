import "server-only"
import { logHomeEnhancementFailure } from "@/features/classes/lib/home-enhancement"
import type { ParentApplicationSummary } from "@/shared/lib/db/adapter"
import type { ParentNotificationsResult } from "@/features/notifications/queries/get-parent-notifications"
import { getParentExperienceSignals } from "@/features/record/queries/get-parent-experience-signals"
import { selectParentActionCandidates } from "../lib/parent-actions"
import { selectParentHomeActions, type ParentHomeAction } from "../lib/parent-home-actions"
import { PARENT_ACTION_LOOKUP_LIMIT } from "./get-parent-actions"

export async function getParentHomeActions(
  applications: readonly ParentApplicationSummary[],
  notifications: Promise<ParentNotificationsResult | null>
): Promise<{ actions: ParentHomeAction[]; error: string | null }> {
  try {
    const candidates = selectParentActionCandidates(applications).slice(0, PARENT_ACTION_LOOKUP_LIMIT)
    if (!candidates.length) return { actions: [], error: null }
    const [signals, events] = await Promise.all([getParentExperienceSignals(candidates), notifications])
    if (!signals) throw new Error("Missing Home report/decision signal payload")
    if (signals.error || !events || events.error || events.readStateStatus !== "available") {
      logHomeEnhancementFailure("actions", new Error(signals.error || events?.error || "Report read state unavailable"))
      return { actions: [], error: "체험 후 안내를 불러오지 못했어요." }
    }
    if (!Array.isArray(events.notifications) || !(signals.reportedExperienceIds instanceof Set) || !(signals.decidedExperienceIds instanceof Set)) {
      throw new Error("Invalid Home action signal payload")
    }
    return {
      actions: selectParentHomeActions({ applications: candidates.filter(item => signals.reportedExperienceIds.has(item.id)), notifications: events.notifications, decidedExperienceIds: signals.decidedExperienceIds }),
      error: null
    }
  } catch (error) {
    logHomeEnhancementFailure("actions", error)
    return { actions: [], error: "체험 후 안내를 불러오지 못했어요." }
  }
}
