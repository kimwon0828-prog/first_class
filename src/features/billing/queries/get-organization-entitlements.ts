import "server-only"

import { cache } from "react"

import {
  NO_PAID_ENTITLEMENTS,
  resolveStudioEntitlements,
  type ResolvedStudioEntitlements
} from "@/features/billing/lib/entitlements"
import { dataAdapter } from "@/shared/lib/db"

// entitlement 를 읽는 유일한 경로.
//
// 화면과 action 이 organization_subscriptions 를 직접 읽지 않는다. 요금제 해석이
// 여러 곳에 흩어지면 같은 학원이 화면마다 다른 권한을 갖게 된다.
//
// 실패하면 던진다. 조회 실패를 무료 권한으로 바꿔 돌려주면 "DB 오류 = 유료 기능 차단"
// 인지 "무료 학원" 인지 호출자가 구분할 수 없다. 유료 mutation gate 는 fail closed 여야
// 하므로, 실패는 실패로 알린다.

const getOrganizationEntitlementsCached = cache(
  async (organizationId: string): Promise<ResolvedStudioEntitlements> => {
    const snapshot = await dataAdapter.getOrganizationBillingSnapshot(organizationId)
    return resolveStudioEntitlements(snapshot)
  }
)

/**
 * 이 조직이 지금 쓸 수 있는 기능.
 *
 * 같은 요청 안에서 여러 번 불러도 조회는 한 번이다(React cache).
 * 조회에 실패하면 throw 한다 — 호출자가 fail closed 로 처리해야 한다.
 */
export const getOrganizationEntitlements = async (
  organizationId: string
): Promise<ResolvedStudioEntitlements> => getOrganizationEntitlementsCached(organizationId)

/**
 * 화면 표시용 조회.
 *
 * 읽기 경로에서는 예외를 던지지 않는다. 조회에 실패하면 유료 기능이 닫힌 것으로
 * 취급한다 — 확인하지 못한 권한을 열어 두는 것보다 잠긴 상태를 보여 주는 편이 안전하다.
 * 무료 기능과 기존 데이터 열람은 이 경우에도 그대로 열려 있다.
 */
export const getStudioEntitlementsForDisplay = async (
  organizationId: string
): Promise<ResolvedStudioEntitlements> => {
  try {
    return await getOrganizationEntitlementsCached(organizationId)
  } catch {
    return {
      entitlements: NO_PAID_ENTITLEMENTS,
      billedPlanCode: "free",
      hasInternalFullAccess: false
    }
  }
}
