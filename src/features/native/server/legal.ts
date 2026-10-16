import { Children, Fragment, isValidElement, type ReactNode } from "react"
import { LEGAL_DOCUMENTS, LEGAL_EFFECTIVE_DATE, LEGAL_UPDATED_DATE } from "@/shared/content/legal-documents"
import { COMPANY_ADDRESS, COMPANY_INFO } from "@/shared/config/company-info"

type Block = { kind: "paragraph" | "bullet"; text: string }
function textOf(node: ReactNode): string {
  return Children.toArray(node).map(child => {
    if (typeof child === "string" || typeof child === "number") return String(child)
    if (isValidElement<{ children?: ReactNode }>(child)) return textOf(child.props.children)
    throw new Error("unsupported_legal_text")
  }).join("")
}
export function legalBlocks(node: ReactNode): Block[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement<{ children?: ReactNode }>(child)) throw new Error("unsupported_legal_block")
    if (child.type === Fragment || child.type === "ul") return legalBlocks(child.props.children)
    if (child.type !== "p" && child.type !== "li") throw new Error("unsupported_legal_block")
    return [{ kind: child.type === "li" ? "bullet" as const : "paragraph" as const, text: textOf(child.props.children) }]
  })
}
export function readNativeLegal(slug: string) {
  const business = [
    `상호명: ${COMPANY_INFO.name}`, `대표자명: ${COMPANY_INFO.representative}`,
    `사업자등록번호: ${COMPANY_INFO.businessRegistrationNumber}`, `주소: ${COMPANY_ADDRESS}`,
    `대표 이메일: ${COMPANY_INFO.representativeEmail}`, `대표 연락처: ${COMPANY_INFO.customerCenterPhone}`
  ]
  if (slug === "business-info") return { title: "사업자 정보", business, sections: [] }
  if (!Object.hasOwn(LEGAL_DOCUMENTS, slug)) return null
  const source = LEGAL_DOCUMENTS[slug]
  return { eyebrow: source.eyebrow, title: source.title, description: source.description, notice: source.notice,
    effectiveDate: source.effectiveDate ?? LEGAL_EFFECTIVE_DATE,
    lastUpdatedDate: source.lastUpdatedDate === undefined ? LEGAL_UPDATED_DATE : source.lastUpdatedDate,
    sections: source.sections.map(section => ({ title: section.title, blocks: legalBlocks(section.body) })), business }
}
