import "server-only"

import { cookies } from "next/headers"

import {
  SEARCH_LOCATION_COOKIE_NAME,
  parseParentSearchLocation,
  serializeParentSearchLocation,
  type ParentSearchLocation
} from "./search-location"

export const readParentSearchLocation = async (): Promise<ParentSearchLocation | null> => {
  try {
    const cookieStore = await cookies()
    return parseParentSearchLocation(cookieStore.get(SEARCH_LOCATION_COOKIE_NAME)?.value)
  } catch {
    return null
  }
}

// server action / route handler 에서만 호출 가능하다.
export const writeParentSearchLocation = async (location: ParentSearchLocation) => {
  const cookieStore = await cookies()
  cookieStore.set(SEARCH_LOCATION_COOKIE_NAME, serializeParentSearchLocation(location), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  })
}

export const deleteParentSearchLocation = async () => {
  const cookieStore = await cookies()
  cookieStore.delete(SEARCH_LOCATION_COOKIE_NAME)
}
