import sharp from "sharp"
import { detectPhotoType, REPORT_PHOTO_BYTES, REPORT_PHOTO_PIXELS } from "../lib/report-attachments"

/** Decode all pixels; a file extension/MIME header alone is never trusted. Strip EXIF/GPS. */
export async function validateReportPhoto(bytes: Buffer, declaredType: string) {
  if (!bytes.length || bytes.length > REPORT_PHOTO_BYTES) throw new Error("사진은 한 장당 4MiB 이하로 선택해 주세요.")
  const mimeType = detectPhotoType(bytes)
  if (!mimeType || declaredType !== mimeType) throw new Error("JPEG·PNG·WebP 사진만 첨부할 수 있어요.")
  const input = sharp(bytes, { limitInputPixels: REPORT_PHOTO_PIXELS, failOn: "warning" })
  const meta = await input.metadata()
  if ((meta.pages ?? 1) !== 1) throw new Error("움직이는 사진은 지원하지 않아요.")
  const { data, info } = await input.rotate().toBuffer({ resolveWithObject: true })
  if (data.length > REPORT_PHOTO_BYTES) throw new Error("처리한 사진이 4MiB를 초과해요. 크기를 줄여 다시 선택해 주세요.")
  return { data, width: info.width, height: info.height, mimeType }
}
