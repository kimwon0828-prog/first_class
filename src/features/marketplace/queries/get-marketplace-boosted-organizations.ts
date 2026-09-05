import "server-only"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

// 공개 Marketplace 우선 노출 자격 조회.
//
// 수업마다 요금제를 확인하면 목록 한 번에 N번 조회가 된다. 학원 단위로 한 번만 읽고
// 그 결과를 정렬에 쓴다.
//
// 실패하면 빈 집합을 돌려준다(fail-safe organic). 결제 정보를 읽지 못했다고 해서
// 학부모에게 보여줄 수업 목록 자체가 사라지면 무료 학원까지 플랫폼에서 지워진다.
// Studio 의 유료 쓰기(fail closed)와 방향이 반대인 것은 의도된 것이다.

export const getMarketplaceBoostedOrganizationIds = async (): Promise<ReadonlySet<string>> => {
  try {
    const serviceRoleClient = getSupabaseServiceRoleClient()
    const { data, error } = await serviceRoleClient
      .from("marketplace_boosted_organizations")
      .select("organization_id")

    if (error) {
      return new Set()
    }

    return new Set(
      ((data ?? []) as Array<{ organization_id: string }>).map((row) => row.organization_id)
    )
  } catch {
    return new Set()
  }
}
