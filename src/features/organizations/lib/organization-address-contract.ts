export type OrganizationAddressInput = {
  postalCode?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
}

export type OrganizationRegionInput = {
  sido?: string | null
  sigungu?: string | null
  bname?: string | null
  sigunguCode?: string | null
  bcode?: string | null
}

export type OrganizationAddressReadInput = {
  addressLine1?: string | null
  addressLine2?: string | null
  address?: string | null
  addressDetail?: string | null
}

const toNullableText = (value: string | null | undefined) => {
  const normalized = value?.trim() ?? ""
  return normalized || null
}

const normalizeAddressForComparison = (value: string | null | undefined) =>
  (value ?? "").replace(/\s+/g, " ").trim()

export const buildOrganizationAddressWritePayload = (input: OrganizationAddressInput) => {
  const postalCode = toNullableText(input.postalCode)
  const addressLine1 = toNullableText(input.addressLine1)
  const addressLine2 = toNullableText(input.addressLine2)

  return {
    postal_code: postalCode,
    address_line1: addressLine1,
    address_line2: addressLine2,
    address: addressLine1,
    address_detail: addressLine2
  }
}

// 행정지역 metadata 는 항상 5개가 함께 기록된다. 부분 갱신을 만들지 않는다.
export const buildOrganizationRegionWritePayload = (input: OrganizationRegionInput) => ({
  sido: toNullableText(input.sido),
  sigungu: toNullableText(input.sigungu),
  bname: toNullableText(input.bname),
  sigungu_code: toNullableText(input.sigunguCode),
  bcode: toNullableText(input.bcode)
})

export const buildSignupRequestRegionWritePayload = buildOrganizationRegionWritePayload

export const buildAcademyUpdateRequestRegionWritePayload = (input: OrganizationRegionInput) => ({
  requested_sido: toNullableText(input.sido),
  requested_sigungu: toNullableText(input.sigungu),
  requested_bname: toNullableText(input.bname),
  requested_sigungu_code: toNullableText(input.sigunguCode),
  requested_bcode: toNullableText(input.bcode)
})

export const resolveOrganizationAddressLines = (input: OrganizationAddressReadInput) => {
  const canonicalLine1 = toNullableText(input.addressLine1)

  if (canonicalLine1) {
    return {
      line1: canonicalLine1,
      line2: toNullableText(input.addressLine2),
      source: "canonical" as const
    }
  }

  return {
    line1: toNullableText(input.address),
    line2: toNullableText(input.addressDetail),
    source: "legacy" as const
  }
}

export const hasPrimaryOrganizationAddressChanged = (
  currentAddressLine1: string | null | undefined,
  nextAddressLine1: string | null | undefined
) =>
  normalizeAddressForComparison(currentAddressLine1) !==
  normalizeAddressForComparison(nextAddressLine1)

export const buildStaleCoordinateInvalidationPayload = (
  currentAddressLine1: string | null | undefined,
  nextAddressLine1: string | null | undefined
) =>
  hasPrimaryOrganizationAddressChanged(currentAddressLine1, nextAddressLine1)
    ? {
        latitude: null,
        longitude: null,
        map_updated_at: null
      }
    : {}
