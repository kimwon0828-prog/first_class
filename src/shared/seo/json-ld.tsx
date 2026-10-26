import { PARENT_ORIGIN, toParentUrl } from "@/shared/config/site-origins"

/**
 * 검색엔진 · AI 검색이 읽는 schema.org 구조화 데이터(JSON-LD).
 *
 * 화면에 보이는 값만 넣는다. 없는 값은 키째 뺀다(지어내지 않는다).
 * 학부모 휴대폰 같은 비공개 값은 절대 넣지 않는다 — 넣는 전화번호는 학원 대표번호뿐이다.
 */

type JsonLdValue = string | number | boolean | null | undefined | JsonLdObject | JsonLdValue[]
export type JsonLdObject = { [key: string]: JsonLdValue }

const ORGANIZATION_ID = `${PARENT_ORIGIN}/#organization`
const WEBSITE_ID = `${PARENT_ORIGIN}/#website`
const LOGO_URL = toParentUrl("/images/first-class-logo.png")

/** null · undefined · 빈 문자열 · 빈 배열을 재귀로 뺀다. */
const compact = (value: JsonLdValue): JsonLdValue => {
  if (Array.isArray(value)) {
    const items = value.map(compact).filter((item) => item !== undefined)
    return items.length ? items : undefined
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, compact(item)] as const)
      .filter(([, item]) => item !== undefined)
    return entries.length ? Object.fromEntries(entries) : undefined
  }
  if (value === null || value === undefined) return undefined
  if (typeof value === "string" && value.trim().length === 0) return undefined
  return value
}

// </script> 로 블록이 끊기지 않도록 < 를 이스케이프한다.
const serialize = (data: JsonLdObject | JsonLdObject[]) =>
  JSON.stringify(compact(data as JsonLdValue)).replace(/</g, "\\u003c")

export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialize(data) }} />
}

const trimText = (value: string | null | undefined, max = 300) => {
  const text = value?.replace(/\s+/g, " ").trim()
  if (!text) return undefined
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** 첫수업 회사 · 사이트. 홈과 /partner 에서 쓴다. */
export const firstsuupOrganizationJsonLd = (): JsonLdObject => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: "첫수업",
  alternateName: ["firstsuup", "First Class"],
  url: PARENT_ORIGIN,
  logo: LOGO_URL,
  email: "hello@firstsuup.com",
  description:
    "학부모가 여러 학원의 체험수업·레벨테스트를 한곳에서 비교하고 예약하는 서비스. 학원은 체험 신청부터 등록 결정까지를 한 화면에서 관리한다.",
  areaServed: { "@type": "AdministrativeArea", name: "서울특별시 노원구" },
  address: {
    "@type": "PostalAddress",
    streetAddress: "무궁화로 20-38 경기창업혁신공간",
    addressLocality: "고양시 일산동구",
    addressRegion: "경기도",
    addressCountry: "KR"
  }
})

export const firstsuupWebsiteJsonLd = (): JsonLdObject => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  name: "첫수업",
  url: PARENT_ORIGIN,
  inLanguage: "ko-KR",
  publisher: { "@id": ORGANIZATION_ID },
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${PARENT_ORIGIN}/classes?q={search_term_string}`
    },
    "query-input": "required name=search_term_string"
  }
})

/** /partner — 학원용 서비스(SaaS) 설명. */
export const firstsuupPartnerSoftwareJsonLd = (input: {
  monthlyPrice: number
  trialDays: number
}): JsonLdObject => ({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "첫수업 파트너 (Studio)",
  url: toParentUrl("/partner"),
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  inLanguage: "ko-KR",
  description:
    "학원용 체험수업 운영·등록 전환 관리 서비스. 학부모는 체험을 직접 예약하고, 원장님은 일정·기록·리포트·등록 결과를 한 화면에서 관리한다.",
  publisher: { "@id": ORGANIZATION_ID },
  offers: [
    {
      "@type": "Offer",
      name: "무료",
      price: 0,
      priceCurrency: "KRW"
    },
    {
      "@type": "Offer",
      name: "스탠다드",
      price: input.monthlyPrice,
      priceCurrency: "KRW",
      description: `입점 승인 후 ${input.trialDays}일 무료, 이후 월 구독`
    }
  ]
})

export const faqPageJsonLd = (items: ReadonlyArray<{ question: string; answer: string }>): JsonLdObject => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: items.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer }
  }))
})

type AcademyJsonLdInput = {
  name: string
  path: string
  description?: string | null
  address?: string | null
  sido?: string | null
  sigungu?: string | null
  phone?: string | null
  latitude?: number | null
  longitude?: number | null
  logoUrl?: string | null
  imageUrl?: string | null
  subjects?: string[]
}

/** 학원 상세(/academy/[handle]). */
export const academyJsonLd = (input: AcademyJsonLdInput): JsonLdObject => ({
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  "@id": `${toParentUrl(input.path)}#academy`,
  name: input.name,
  url: toParentUrl(input.path),
  description: trimText(input.description),
  telephone: input.phone,
  logo: input.logoUrl,
  image: input.imageUrl ?? input.logoUrl,
  knowsAbout: input.subjects,
  address: input.address
    ? {
        "@type": "PostalAddress",
        streetAddress: input.address,
        addressLocality: input.sigungu,
        addressRegion: input.sido,
        addressCountry: "KR"
      }
    : undefined,
  geo:
    typeof input.latitude === "number" && typeof input.longitude === "number"
      ? { "@type": "GeoCoordinates", latitude: input.latitude, longitude: input.longitude }
      : undefined
})

type ClassJsonLdInput = {
  id: string
  title: string
  description?: string | null
  programLabel: string
  subjectLabel?: string | null
  targetLabel?: string | null
  imageUrl?: string | null
  /** 학원이 가격을 확인한 경우에만 넣는다. */
  price?: number | null
  academy?: { name: string; path: string | null } | null
}

/** 수업 상세(/classes/[id]) — 체험수업 · 레벨테스트. */
export const classJsonLd = (input: ClassJsonLdInput): JsonLdObject => {
  const url = toParentUrl(`/classes/${input.id}`)
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    "@id": `${url}#course`,
    name: input.title,
    url,
    description: trimText(input.description) ?? `${input.title} ${input.programLabel}`,
    inLanguage: "ko-KR",
    image: input.imageUrl,
    about: input.subjectLabel,
    educationalLevel: input.targetLabel,
    courseMode: "Onsite",
    provider: input.academy
      ? {
          "@type": "EducationalOrganization",
          name: input.academy.name,
          url: input.academy.path ? toParentUrl(input.academy.path) : undefined
        }
      : undefined,
    offers:
      typeof input.price === "number"
        ? {
            "@type": "Offer",
            category: input.programLabel,
            price: input.price,
            priceCurrency: "KRW",
            url
          }
        : undefined
  }
}

export const breadcrumbJsonLd = (items: Array<{ name: string; path: string }>): JsonLdObject => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    item: toParentUrl(item.path)
  }))
})
