/** Optimize only our public storage assets; keep other/legacy image URLs working as-is. */
export function canOptimizeParentImage(src: string): boolean {
  const storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!storageUrl) return false
  try {
    const storage = new URL(storageUrl)
    const image = new URL(src)
    return storage.protocol === "https:" && image.origin === storage.origin &&
      !image.search && !image.username && !image.password &&
      /^\/storage\/v1\/object\/public\/(class-covers|academy-profile-assets)\/.+/.test(image.pathname)
  } catch {
    return false
  }
}
