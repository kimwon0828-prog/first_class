import "server-only"

import { cache } from "react"

import { getMyApplications } from "@/features/applications/queries/get-my-applications"
import type { ParentExperience } from "@/features/record/lib/experience-view"

// 한 번의 교육 경험 상세.
//
// ⚠️ 학부모 본인의 경험만 돌려준다.
//
// 새 쿼리를 만들지 않고 getMyApplications 에서 찾는다. 그 쿼리는 이미
// `.eq("parent_id", profile.id)` 로 잠겨 있고 RLS(parent_id = auth.uid())도
// 걸려 있어, 다른 학부모의 application id 를 URL 에 넣어도 목록에 없으니
// 여기서 null 이 된다. service role 을 쓰지 않는다.
//
// DTO 도 Parent 전용(ParentApplicationSummary)을 그대로 쓴다 —
// Studio Detail DTO 를 재사용하면 학원 운영 필드가 같이 따라온다.

const getMyExperienceDetailCached = cache(
  async (experienceId: string): Promise<ParentExperience | null> => {
    const { data } = await getMyApplications()
    return data.find((item) => item.id === experienceId) ?? null
  }
)

export const getMyExperienceDetail = async (experienceId: string) =>
  getMyExperienceDetailCached(experienceId)
