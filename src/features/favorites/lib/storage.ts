const STORAGE_KEY = "firstclass_favorites"

const safeParse = (raw: string | null): string[] => {
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((value): value is string => typeof value === "string" && value.length > 0)
  } catch {
    return []
  }
}

export const getFavoriteClassIds = (): string[] => {
  if (typeof window === "undefined") {
    return []
  }
  return safeParse(window.localStorage.getItem(STORAGE_KEY))
}

export const setFavoriteClassIds = (ids: string[]) => {
  if (typeof window === "undefined") {
    return
  }

  const normalized = Array.from(new Set(ids.filter((id) => typeof id === "string" && id.length > 0)))
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new Event("firstclass_favorites_updated"))
}

export const toggleFavoriteClassId = (classId: string) => {
  if (typeof window === "undefined") {
    return { nextIds: [] as string[], isFavorite: false }
  }

  const current = getFavoriteClassIds()
  const isFavorite = current.includes(classId)
  const nextIds = isFavorite ? current.filter((id) => id !== classId) : [...current, classId]
  setFavoriteClassIds(nextIds)
  return { nextIds, isFavorite: !isFavorite }
}

