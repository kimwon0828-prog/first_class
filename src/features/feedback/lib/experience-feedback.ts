/** Stable storage IDs; labels are presentation only. No registration intent or rating. */
export const FEEDBACK_CHIPS = [
  { id: "child_enjoyed", label: "아이가 즐거워했어요", scope: "CLASS", category: "아이 반응" },
  { id: "child_focused", label: "수업에 집중했어요", scope: "CLASS", category: "아이 반응" },
  { id: "child_participated", label: "적극적으로 참여했어요", scope: "CLASS", category: "아이 반응" },
  { id: "good_child_fit", label: "아이에게 잘 맞았어요", scope: "CLASS", category: "아이와의 적합도" },
  { id: "good_level_fit", label: "아이 수준에 잘 맞았어요", scope: "CLASS", category: "아이와의 적합도" },
  { id: "understood_child", label: "아이 성향을 잘 이해해줬어요", scope: "BOTH", category: "아이와의 적합도" },
  { id: "clear_instruction", label: "설명이 이해하기 쉬웠어요", scope: "CLASS", category: "수업 내용" },
  { id: "structured_lesson", label: "수업이 체계적이었어요", scope: "CLASS", category: "수업 내용" },
  { id: "interesting_activities", label: "활동이 흥미로웠어요", scope: "CLASS", category: "수업 내용" },
  { id: "good_hands_on", label: "직접 해보는 활동이 좋았어요", scope: "CLASS", category: "수업 내용" },
  { id: "kind_teacher", label: "선생님이 친절했어요", scope: "BOTH", category: "선생님" },
  { id: "tailored_guidance", label: "아이에게 맞춰 지도해줬어요", scope: "CLASS", category: "선생님" },
  { id: "attentive_teacher", label: "아이 반응을 세심하게 봐줬어요", scope: "BOTH", category: "선생님" },
  { id: "specific_feedback", label: "피드백이 구체적이었어요", scope: "BOTH", category: "선생님" },
  { id: "kind_consultation", label: "상담이 친절했어요", scope: "ACADEMY", category: "상담·안내" },
  { id: "clear_consultation", label: "설명이 명확했어요", scope: "ACADEMY", category: "상담·안내" },
  { id: "clean_facilities", label: "시설이 깔끔했어요", scope: "ACADEMY", category: "학원 환경" },
  { id: "comfortable_atmosphere", label: "분위기가 편안했어요", scope: "ACADEMY", category: "학원 환경" },
] as const
export type FeedbackChipId = (typeof FEEDBACK_CHIPS)[number]["id"]
export type FeedbackProgramType = "trial_class" | "level_test"
export type FeedbackScope = "CLASS" | "ACADEMY"
export const LEVEL_TEST_EXCLUDED_CHIPS: readonly string[] = ["child_focused", "structured_lesson", "interesting_activities", "good_hands_on"]
export const isFeedbackProgramType = (value: unknown): value is FeedbackProgramType => value === "trial_class" || value === "level_test"
export const feedbackChipsForProgram = (program: FeedbackProgramType) => FEEDBACK_CHIPS.filter(chip => program !== "level_test" || !LEVEL_TEST_EXCLUDED_CHIPS.includes(chip.id))
export const feedbackChipLabel = (id: FeedbackChipId) => FEEDBACK_CHIPS.find(chip => chip.id === id)!.label
export const normalizeFeedbackNote = (note: string | null) => note?.trim() || null
export function validateFeedbackInput(program: FeedbackProgramType, ids: readonly string[], note: string | null): string | null {
  const allowed = feedbackChipsForProgram(program)
  if (ids.length > 5 || new Set(ids).size !== ids.length || ids.some(id => !allowed.some(chip => chip.id === id))) return "해당되는 항목을 최대 5개까지 골라주세요."
  const normalized = normalizeFeedbackNote(note)
  if (normalized && Array.from(normalized).length > 1000) return "의견은 1000자 이내로 남겨주세요."
  if (!ids.length && !normalized) return "항목을 선택하거나 학원에 전할 의견을 남겨주세요."
  return null
}
// Explicit, separate DTOs. Public never inherits any private row fields.
export type ParentExperienceFeedback = { selectedChipIds: FeedbackChipId[]; privateNote: string | null; createdAt: string; updatedAt: string }
export type StudioExperienceFeedback = { selectedChipIds: FeedbackChipId[]; privateNote: string | null; createdAt: string; updatedAt: string }
export type PublicFeedbackSummary = { chips: { id: FeedbackChipId; count: number }[] }
export type ParentFeedbackContext = { eligible: boolean; programType: FeedbackProgramType | null; feedback: ParentExperienceFeedback | null }
export type ParentFeedbackResult = { status: "ok"; context: ParentFeedbackContext } | { status: "error" }
/** Mock-only aggregate input. Never returned by a public query. */
export type FeedbackAggregateSource = { applicationId: string; parentId: string; selectedChipIds: FeedbackChipId[] }
export function summarizeFeedback(rows: FeedbackAggregateSource[], scope: FeedbackScope): PublicFeedbackSummary {
  const taxonomy = FEEDBACK_CHIPS.filter(chip => chip.scope === scope || chip.scope === "BOTH")
  const eligible = rows.filter(row => row.selectedChipIds.some(id => taxonomy.some(chip => chip.id === id)))
  if (new Set(eligible.map(row => row.applicationId)).size < 3 || new Set(eligible.map(row => row.parentId)).size < 3) return { chips: [] }
  return { chips: taxonomy.map(chip => {
    const selected = eligible.filter(row => row.selectedChipIds.includes(chip.id))
    return { id: chip.id, count: new Set(selected.map(row => row.applicationId)).size, parents: new Set(selected.map(row => row.parentId)).size }
  }).filter(chip => chip.parents >= 3).sort((a, b) => b.count - a.count).slice(0, 6).map(({ id, count }) => ({ id, count })) }
}
