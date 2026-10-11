import { isValidTimeValue } from "./class-schedule-rule-utils"

// Only format user input. Schedule generation still uses the existing HH:mm contract.
export function normalizeOperatingTimeInput(value: string): string | null {
  const raw = value.normalize("NFKC").trim()
  if (!raw) return ""
  let hours: string, minutes: string
  if (/^\d{1,2}:\d{2}$/.test(raw)) [hours, minutes] = raw.split(":")
  else if (/^\d{3,4}$/.test(raw)) { hours = raw.slice(0, -2); minutes = raw.slice(-2) }
  else if (/^\d{1,2}$/.test(raw)) { hours = raw; minutes = "00" }
  else return null
  const normalized = `${hours.padStart(2, "0")}:${minutes}`
  return isValidTimeValue(normalized) ? normalized : null
}

const halfHourTimes = Array.from({ length: 48 }, (_, index) =>
  `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`)

export function operatingTimeOptions(value: string): string[] {
  const current = normalizeOperatingTimeInput(value)
  return current ? [...new Set([...halfHourTimes, current])].sort() : halfHourTimes
}
