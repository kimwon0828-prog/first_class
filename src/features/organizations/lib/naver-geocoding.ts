import "server-only"

import { getServerEnv } from "@/shared/config/server-env"

type GeocodedCoordinates = {
  latitude: number
  longitude: number
}

type NaverGeocodeAddress = {
  x: string
  y: string
}

type NaverGeocodeResponse = {
  status?: string
  addresses?: NaverGeocodeAddress[]
}

const NAVER_GEOCODE_ENDPOINT = "https://maps.apigw.ntruss.com/map-geocode/v2/geocode"

const normalizeAddress = (value: string) => value.replace(/\s+/g, " ").trim()

const buildGeocodeQueries = (input: string) => {
  const normalized = normalizeAddress(input)
  const stripped = normalized
    .replace(/\s+\d+층(?:\s+\d+(?:-\d+)?)?/g, "")
    .replace(/\s+\d+(?:-\d+)?호/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()

  return stripped && stripped !== normalized ? [normalized, stripped] : [normalized]
}

const getNaverGeocodeCredentials = () => {
  const { naverMapClientId, naverMapClientSecret } = getServerEnv()
  if (!naverMapClientId || !naverMapClientSecret) {
    throw new Error("missing_naver_geocoding_credentials")
  }

  return {
    keyId: naverMapClientId,
    keySecret: naverMapClientSecret
  }
}

export const geocodeAddressOnServer = async (
  address: string
): Promise<GeocodedCoordinates | null> => {
  const normalizedAddress = normalizeAddress(address)
  if (!normalizedAddress) {
    return null
  }

  const { keyId, keySecret } = getNaverGeocodeCredentials()
  const queries = buildGeocodeQueries(normalizedAddress)

  for (const query of queries) {
    const url = new URL(NAVER_GEOCODE_ENDPOINT)
    url.searchParams.set("query", query)

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-NCP-APIGW-API-KEY-ID": keyId,
        "X-NCP-APIGW-API-KEY": keySecret
      },
      cache: "no-store"
    })

    if (!response.ok) {
      throw new Error(`naver_geocoding_request_failed:${response.status}`)
    }

    const result = (await response.json()) as NaverGeocodeResponse
    const firstAddress = result.addresses?.[0]
    if (!firstAddress) {
      continue
    }

    const latitude = Number(firstAddress.y)
    const longitude = Number(firstAddress.x)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue
    }

    return {
      latitude,
      longitude
    }
  }

  return null
}
