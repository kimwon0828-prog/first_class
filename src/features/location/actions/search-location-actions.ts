"use server"

import { revalidatePath } from "next/cache"

import type { ActionResult } from "@/shared/actions"

import {
  buildParentSearchLocation,
  type ParentSearchLocation
} from "../lib/search-location"
import {
  deleteParentSearchLocation,
  writeParentSearchLocation
} from "../lib/search-location-cookie"

const CURRENT_LOCATION_LABEL = "현재 위치"

const revalidateLocationSurfaces = () => {
  revalidatePath("/classes")
}

export async function setCurrentSearchLocationAction(input: {
  latitude: number
  longitude: number
}): Promise<ActionResult<ParentSearchLocation>> {
  const location = buildParentSearchLocation({
    latitude: input.latitude,
    longitude: input.longitude,
    label: CURRENT_LOCATION_LABEL,
    source: "current"
  })

  if (!location) {
    return { ok: false, message: "현재 위치를 확인할 수 없어요. 주소로 위치를 설정해 주세요." }
  }

  await writeParentSearchLocation(location)
  revalidateLocationSurfaces()
  return { ok: true, data: location }
}

export async function clearSearchLocationAction(): Promise<ActionResult<null>> {
  await deleteParentSearchLocation()
  revalidateLocationSurfaces()
  return { ok: true, data: null }
}
