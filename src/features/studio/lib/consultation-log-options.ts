import type { ConsultationLogChannel, ConsultationSentiment } from "@/shared/lib/db/adapter"

export const CONSULTATION_CHANNEL_OPTIONS: Array<{
  value: ConsultationLogChannel
  label: string
}> = [
  { value: "PHONE", label: "전화" },
  { value: "KAKAO", label: "카카오톡" },
  { value: "SMS", label: "문자" },
  { value: "VISIT", label: "방문" },
  { value: "OTHER", label: "기타" }
]

export const getConsultationChannelLabel = (value: ConsultationLogChannel | null | undefined) => {
  if (!value) {
    return null
  }

  return CONSULTATION_CHANNEL_OPTIONS.find((item) => item.value === value)?.label ?? null
}

export const CONSULTATION_SENTIMENT_OPTIONS: Array<{
  value: ConsultationSentiment
  label: string
  description: string
}> = [
  { value: "POSITIVE", label: "긍정적", description: "등록 의향이 느껴졌어요" },
  { value: "NEUTRAL", label: "보통", description: "아직 판단하기 어려워요" },
  { value: "NEGATIVE", label: "부정적", description: "등록 가능성이 낮아 보여요" }
]

export const getConsultationSentimentLabel = (value: ConsultationSentiment | null | undefined) => {
  if (!value) {
    return null
  }

  return CONSULTATION_SENTIMENT_OPTIONS.find((item) => item.value === value)?.label ?? null
}
