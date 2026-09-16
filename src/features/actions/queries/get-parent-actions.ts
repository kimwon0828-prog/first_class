import "server-only"

import {
  selectParentActionCandidates,
  selectParentActions,
  type ParentAction
} from "@/features/actions/lib/parent-actions"
import { getMyApplications } from "@/features/applications/queries/get-my-applications"
import { getParentExperienceSignals } from "@/features/record/queries/get-parent-experience-signals"

/**
 * 지금 해야 할 일.
 *
 * ⚠️ 새 table · migration · RLS · RPC 없이 기존 domain state 에서 파생한다.
 *    Action 전용 영구 상태를 만들지 않는다 — ParentDecision 이 생기면
 *    그 사실만으로 Action 이 사라진다.
 *
 * ⚠️ 조회 실패를 "할 일 없음" 으로 접지 않는다. 확인할 것이 있는데 없다고
 *    말하는 쪽이, 화면이 잠깐 비는 것보다 나쁘다.
 */
export type ParentActionsResult = {
  actions: ParentAction[]
  error: string | null
}

/** 한 번에 확인할 최대 경험 수. 홈에서 전 이력을 훑지 않는다. */
export const PARENT_ACTION_LOOKUP_LIMIT = 20

const LOAD_ERROR_MESSAGE = "확인할 내용을 불러오지 못했어요."

const EMPTY: ParentActionsResult = { actions: [], error: null }

export const getParentActions = async (): Promise<ParentActionsResult> => {
  const applications = await getMyApplications()

  if (applications.error) {
    return { actions: [], error: LOAD_ERROR_MESSAGE }
  }

  const candidates = selectParentActionCandidates(applications.data).slice(
    0,
    PARENT_ACTION_LOOKUP_LIMIT
  )
  if (candidates.length === 0) {
    return EMPTY
  }

  /*
   * 발행본 · 결정 판정은 /record 목록과 같은 조회를 쓴다.
   * 두 화면이 서로 다른 사실을 말하지 않게 하기 위해서다.
   */
  const signals = await getParentExperienceSignals(candidates)
  if (signals.error) {
    return { actions: [], error: LOAD_ERROR_MESSAGE }
  }

  return {
    actions: selectParentActions({
      applications: candidates,
      reportedExperienceIds: signals.reportedExperienceIds,
      decidedExperienceIds: signals.decidedExperienceIds
    }),
    error: null
  }
}
