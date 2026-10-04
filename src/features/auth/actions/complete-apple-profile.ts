"use server"

import { getApplePhoneState, enrollNewAppleParentPhone, needsPhoneVerification } from "../phone/gate"

import { getSupabaseServerClient } from "@/integrations/supabase/server"
import { ensureParentProfile, getProfileForUser } from "../lib/profile-sync"
import { hasAppleIdentity, isStudioSignup } from "../lib/apple-auth"
import { detectOAuthEmailConflict } from "../lib/oauth-account-conflict"
import { isMyParentAccountDeletionPending } from "@/features/my/lib/parent-account-deletion-server"
import { validateParentBirthDate } from "@/shared/lib/parent-birth-date"
import type { UpdateParentProfileActionState } from "@/features/my/actions/update-parent-profile"

export async function completeAppleProfileAction(
  previous: UpdateParentProfileActionState | undefined, formData: FormData
): Promise<UpdateParentProfileActionState> {
  void previous
  const failure = (message: string): UpdateParentProfileActionState => ({ status: "error", message })
  const supabase = await getSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return failure("로그인이 만료되었습니다. 다시 로그인해 주세요.")
  if (!hasAppleIdentity(user) || isStudioSignup(user)) return failure("학부모 Apple 로그인 계정을 확인해 주세요.")
  if (await isMyParentAccountDeletionPending()) return failure("탈퇴 처리 중인 계정은 정보를 생성할 수 없습니다.")
  const conflict = await detectOAuthEmailConflict(user.id, user.email)
  if (!conflict.ok) return failure("계정 정보를 확인하지 못했습니다. 다시 로그인해 주세요.")
  const existing = await getProfileForUser(user)
  const verifiedPhone = existing.status === "missing" ? await enrollNewAppleParentPhone(user) : await getApplePhoneState(user)
  if (existing.status === "missing" && verifiedPhone.unavailable) return failure("인증 정보를 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.")
  if (needsPhoneVerification(verifiedPhone)) return failure("휴대폰 인증을 먼저 완료해 주세요.")
  if (verifiedPhone.excluded) return failure("학부모 계정만 사용할 수 있습니다.")
  if (existing.status === "ok") {
    return existing.profile.role === "parent" ? { status: "success", message: "이미 보호자 정보가 저장되어 있습니다." } : failure("학부모 계정만 사용할 수 있습니다.")
  }
  if (existing.status !== "missing") return failure("계정 정보를 불러오지 못했습니다. 다시 시도해 주세요.")
  const name = String(formData.get("name") ?? "").trim()
  const phone = verifiedPhone.required ? verifiedPhone.phone! : String(formData.get("phone") ?? "").trim()
  const birth = validateParentBirthDate(formData.get("parentBirthDate"), { required: false })
  if (name.length < 2 || name.length > 30) return failure("보호자명은 2~30자로 입력해 주세요.")
  if (phone && (phone.length < 8 || phone.length > 20)) return failure("보호자 연락처를 다시 확인해 주세요.")
  if (!birth.ok) return failure(birth.message)
  const profile = await ensureParentProfile({ allowCreateParentIfMissing: true, requireProvidedName: true,
    preferredName: name, preferredPhone: phone || null, preferredParentBirthDate: birth.parentBirthDate })
  if (!profile || profile.role !== "parent") return failure("보호자 정보를 저장하지 못했습니다. 다시 시도해 주세요.")
  return { status: "success", message: "보호자 정보를 저장했습니다." }
}
