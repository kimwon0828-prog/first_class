import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "첫수업 | 학원 체험수업 비교·예약",
  description:
    "우리 아이에게 맞는 학원 체험수업과 레벨테스트를 한곳에서 비교하고 예약하세요. 첫수업은 학부모와 학원을 연결하는 체험수업 플랫폼입니다.",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    url: "https://firstsuup.com/",
    siteName: "첫수업",
    title: "첫수업 | 학원 체험수업 비교·예약",
    description:
      "우리 아이에게 맞는 학원 체험수업과 레벨테스트를 한곳에서 비교하고 예약하세요. 첫수업은 학부모와 학원을 연결하는 체험수업 플랫폼입니다."
  }
}

export { default } from "./classes/page"
