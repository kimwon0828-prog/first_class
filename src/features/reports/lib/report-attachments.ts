export const REPORT_PHOTO_LIMIT = 6
export const REPORT_PHOTO_BYTES = 4 * 1024 * 1024
export const REPORT_PHOTO_PIXELS = 24_000_000
export const REPORT_PHOTO_CAPTION = 100
export const REPORT_PHOTO_BUCKET = "report-attachments"
export const REPORT_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
export type ReportAttachment = { id: string; caption: string; width: number; height: number; mimeType: string }
export const isAttachmentId = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
export const attachmentUrl = (id: string) => `/api/report-attachments/${encodeURIComponent(id)}`
export function detectPhotoType(bytes: Uint8Array): string | null {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg"
  if ([137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)) return "image/png"
  if (String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") return "image/webp"
  return null
}
export function parseReportAttachments(value: unknown): ReportAttachment[] | null {
  if (!Array.isArray(value) || value.length > REPORT_PHOTO_LIMIT) return null
  const ids = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== "object" || !isAttachmentId(item.id) || ids.has(item.id) ||
      Object.keys(item).some(key => !["id","caption","width","height","mimeType"].includes(key)) ||
      typeof item.caption !== "string" || item.caption.length > REPORT_PHOTO_CAPTION ||
      !Number.isSafeInteger(item.width) || !Number.isSafeInteger(item.height) || item.width < 1 || item.height < 1 ||
      item.width * item.height > REPORT_PHOTO_PIXELS || !REPORT_PHOTO_TYPES.includes(item.mimeType)) return null
    ids.add(item.id)
  }
  return value as ReportAttachment[]
}
export async function validateClientPhoto(file: File) {
  if (!file.size || file.size > REPORT_PHOTO_BYTES) throw new Error("사진은 한 장당 4MiB 이하로 선택해 주세요.")
  const type = detectPhotoType(new Uint8Array(await file.slice(0,16).arrayBuffer()))
  if (!type || type !== file.type) throw new Error("JPEG·PNG·WebP 사진만 첨부할 수 있어요. HEIC·GIF·PDF는 지원하지 않아요.")
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file) } catch { throw new Error("이미지를 읽을 수 없어요. 다른 파일로 다시 시도해 주세요.") }
  const pixels = bitmap.width * bitmap.height
  bitmap.close()
  if (pixels > REPORT_PHOTO_PIXELS) throw new Error("사진은 2,400만 화소 이하로 선택해 주세요.")
}
