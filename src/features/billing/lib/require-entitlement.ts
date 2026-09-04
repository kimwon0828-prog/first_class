import "server-only"

import type { StudioEntitlements } from "@/features/billing/lib/entitlements"
import { getOrganizationEntitlements } from "@/features/billing/queries/get-organization-entitlements"

// 유료 mutation 앞에 세우는 gate.
//
// UI 에서 버튼을 숨기는 것으로 끝내지 않는다. server action 은 form 없이도 호출될 수
// 있으므로 실제 차단은 여기서 한다.
//
// 조회가 실패하면 허용하지 않는다(fail closed). 요금제를 확인하지 못한 상태에서
// 유료 기능을 열어 주는 쪽이 훨씬 나쁘다.

export type EntitlementGateResult =
  | { allowed: true }
  | { allowed: false; message: string }

const UPGRADE_MESSAGE =
  "이 기능은 스탠다드 플랜에서 사용할 수 있습니다. 기존 기록은 계속 확인할 수 있습니다."

const LOOKUP_FAILED_MESSAGE = "플랜 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."

/**
 * 조직이 해당 기능을 쓸 수 있는지 확인한다.
 *
 * 호출자는 결과를 그대로 사용자에게 돌려주면 된다. Postgres/PGRST 원문은 넘어가지 않는다.
 */
export const requireStudioEntitlement = async (
  organizationId: string,
  key: keyof StudioEntitlements
): Promise<EntitlementGateResult> => {
  try {
    const { entitlements } = await getOrganizationEntitlements(organizationId)
    if (entitlements[key]) {
      return { allowed: true }
    }

    return { allowed: false, message: UPGRADE_MESSAGE }
  } catch {
    return { allowed: false, message: LOOKUP_FAILED_MESSAGE }
  }
}
