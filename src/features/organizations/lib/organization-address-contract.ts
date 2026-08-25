export type OrganizationAddressInput = {
  postalCode?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
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
