import { formatSeoulDateTime as formatSharedSeoulDateTime } from "@/shared/lib/seoul-datetime"

export {
  formatSeoulDateTimeInputValue,
  parseSeoulDateTimeLocalToIso
} from "@/shared/lib/seoul-datetime"

/** Node/browser ICU can emit AM/PM or 오전/오후 for the same ko-KR date. */
export const formatSeoulDateTime = (
  value: string | null | undefined,
  options?: Intl.DateTimeFormatOptions
) => formatSharedSeoulDateTime(value, options)
  ?.replace(/\bAM\b/gi, "오전")
  .replace(/\bPM\b/gi, "오후") ?? null
