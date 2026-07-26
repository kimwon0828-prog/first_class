import iconv from "iconv-lite"

import type { SmsMessageType, SmsPreparedContent } from "@/features/notifications/sms/types"

const LMS_SUBJECT = "[첫수업] 알림"
const SMS_MAX_EUC_KR_BYTES = 90

const CHARACTER_REPLACEMENTS: Record<string, string> = {
  "\u00a0": " ",
  "\u2013": "-",
  "\u2014": "-",
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2026": "..."
}

const normalizeLine = (value: string) => value.replace(/\s+/g, " ").trim()

const isEucKrSafeChunk = (value: string) => iconv.decode(iconv.encode(value, "euc-kr"), "euc-kr") === value

const sanitizeSmsCharacters = (value: string) =>
  Array.from(value)
    .map((character) => {
      const replacement = CHARACTER_REPLACEMENTS[character] ?? character

      return Array.from(replacement)
        .filter((chunk) => isEucKrSafeChunk(chunk))
        .join("")
    })
    .join("")

const limitCharacters = (value: string, maxLength: number) => Array.from(value).slice(0, maxLength).join("")

export const sanitizeSmsSingleLine = (value: string | null | undefined, maxLength: number) => {
  const normalized = normalizeLine(String(value ?? ""))
  const sanitized = sanitizeSmsCharacters(normalized)
  return limitCharacters(normalizeLine(sanitized), maxLength)
}

export const sanitizeSmsContent = (value: string) => {
  const normalized = value.replace(/\r\n?/g, "\n")
  const sanitizedLines = normalized.split("\n").map((line) => normalizeLine(sanitizeSmsCharacters(line)))
  return sanitizedLines.join("\n").trim()
}

export const getEucKrByteLength = (value: string) => iconv.encode(value, "euc-kr").length

export const prepareSmsContent = (value: string): SmsPreparedContent => {
  const normalized = value.replace(/\r\n?/g, "\n").trim()
  const content = sanitizeSmsContent(normalized)
  const byteLength = getEucKrByteLength(content)
  const messageType: SmsMessageType = byteLength <= SMS_MAX_EUC_KR_BYTES ? "SMS" : "LMS"

  return {
    content,
    byteLength,
    messageType,
    subject: messageType === "LMS" ? LMS_SUBJECT : null,
    hadUnsupportedCharacters: content !== normalized
  }
}
