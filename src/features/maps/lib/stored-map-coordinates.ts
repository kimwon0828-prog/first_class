export type StoredMapCoordinates = {
  latitude: number
  longitude: number
}

export const resolveStoredMapCoordinates = (
  latitude: number | null | undefined,
  longitude: number | null | undefined
): StoredMapCoordinates | null => {
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude)
  ) {
    return null
  }

  return { latitude, longitude }
}
