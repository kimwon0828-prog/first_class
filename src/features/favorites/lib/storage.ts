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
  try {
    return safeParse(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return []
  }
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

  const result = readFavoriteClassIds()
  if (result.error) throw new Error("favorite_storage_unavailable")
  const current = result.ids
  const isFavorite = current.includes(classId)
  const nextIds = isFavorite ? current.filter((id) => id !== classId) : [...current, classId]
  setFavoriteClassIds(nextIds)
  return { nextIds, isFavorite: !isFavorite }
}


/** Unlike legacy readers, screens can distinguish inaccessible storage from an empty list. */
export const readFavoriteClassIds = (): { ids: string[]; error: boolean } => {
  try {
    return { ids: safeParse(window.localStorage.getItem(STORAGE_KEY)), error: false }
  } catch {
    return { ids: [], error: true }
  }
}


const OWNER_KEY = "firstclass_favorites_account"

export function clearParentFavoriteData() {
  window.localStorage.removeItem(STORAGE_KEY)
  window.localStorage.removeItem(OWNER_KEY)
  window.dispatchEvent(new Event("firstclass_favorites_updated"))
}

// Favorites are browser-local. Never transfer a previous/unknown account's list
// to a newly signed-in UUID, including a rejoined account with the same email.
export function bindFavoriteAccount(userId: string | null) {
  const previous = window.localStorage.getItem(OWNER_KEY)
  if (previous === userId) return
  clearParentFavoriteData()
  if (userId) window.localStorage.setItem(OWNER_KEY, userId)
}
