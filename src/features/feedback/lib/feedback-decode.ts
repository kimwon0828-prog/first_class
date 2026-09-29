import { FEEDBACK_CHIPS, isFeedbackProgramType, type FeedbackChipId, type ParentExperienceFeedback, type ParentFeedbackContext, type PublicFeedbackSummary } from "./experience-feedback"
const object = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("feedback_invalid_response")
  return raw as Record<string, unknown>
}
const chipIds = (raw: unknown): FeedbackChipId[] => {
  if (!Array.isArray(raw) || raw.length > 5 || raw.some(id => !FEEDBACK_CHIPS.some(chip => chip.id === id))) throw new Error("feedback_invalid_response")
  return [...raw] as FeedbackChipId[]
}
export function decodePrivateFeedback(raw: unknown): ParentExperienceFeedback {
  const row = object(raw)
  if (!(row.privateNote === null || typeof row.privateNote === "string") || typeof row.createdAt !== "string" || typeof row.updatedAt !== "string") throw new Error("feedback_invalid_response")
  return { selectedChipIds: chipIds(row.selectedChipIds), privateNote: row.privateNote, createdAt: row.createdAt, updatedAt: row.updatedAt }
}
export function decodeParentFeedbackContext(raw: unknown): ParentFeedbackContext {
  const row = object(raw)
  if (typeof row.eligible !== "boolean" || !(row.programType === null || isFeedbackProgramType(row.programType))) throw new Error("feedback_invalid_response")
  return { eligible: row.eligible, programType: row.programType, feedback: row.feedback === null ? null : decodePrivateFeedback(row.feedback) }
}
export function decodePublicFeedback(raw: unknown): PublicFeedbackSummary {
  const row = object(raw)
  if (!Array.isArray(row.chips) || row.chips.length > 6) throw new Error("feedback_invalid_response")
  // Rebuild a strict public DTO instead of passing RPC JSON or a private row through.
  return { chips: row.chips.map(rawChip => {
    const chip = object(rawChip)
    if (!FEEDBACK_CHIPS.some(item => item.id === chip.id) || typeof chip.count !== "number" || !Number.isSafeInteger(chip.count) || chip.count < 3) throw new Error("feedback_invalid_response")
    return { id: chip.id as FeedbackChipId, count: chip.count }
  }) }
}
