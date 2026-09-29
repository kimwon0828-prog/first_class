"use client"

import { toParentUrl } from "@/shared/config/site-origins"

import { useActionState, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import {
  saveAcademyCoverPath,
  type SaveAcademyCoverPathResult
} from "@/features/studio/actions/save-academy-cover-path"
import {
  saveAcademyLogoPath,
  type SaveAcademyLogoPathResult
} from "@/features/studio/actions/save-academy-logo-path"
import {
  saveAcademyPublicProfileAction,
  type SaveAcademyPublicProfileActionState
} from "@/features/studio/actions/save-academy-public-profile"
import { formatAdministrativeRegionLabel } from "@/features/location/lib/region-selection"
import type { StudioAcademyPublicProfile } from "@/features/studio/queries/get-studio-academy-public-profile"
import type { StudioSettingsOrganization } from "@/features/studio/queries/get-studio-settings-organization"
import { getSupabaseBrowserClient } from "@/integrations/supabase/client"
import { OPERATING_DAYS, PARKING_PREFIX, parseHours, formatHours, hoursError, parseParking, formatParking, type HoursDraft, type ParkingDraft } from "@/features/studio/lib/academy-profile-visit-info"
import styles from "./studio-mypage-profile-page.module.css"

const toNullableText = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

// 학생의 "미등록"(등록하지 않음)과 다른 뜻이다. 같은 단어를 쓰면
// 대시보드의 미등록 수와 같은 개념처럼 읽힌다.
const toText = (value: string | null | undefined, fallback = "미입력") => toNullableText(value) ?? fallback

const formatAddress = (organization: StudioSettingsOrganization) => {
  const line1 = toNullableText(organization.addressLine1 ?? organization.address ?? null)
  const line2 = toNullableText(organization.addressLine2 ?? organization.addressDetail ?? null)
  const combined = [line1, line2].filter((value): value is string => Boolean(value)).join(" ")
  return combined.length > 0 ? combined : "미입력"
}

const formatPhone = (organization: StudioSettingsOrganization) =>
  toNullableText(organization.academyPhone) ?? toNullableText(organization.organizationPhone) ?? "미입력"

type PublicProfileField = {
  key: keyof PublicProfileFormValues
  name: string
  label: string
  type: "input" | "textarea"
  placeholder: string
  hint?: string
  rows?: number
  maxLength: number
}

type PublicProfileFormValues = {
  slug: string
  shortDescription: string
  description: string
  operatingHours: string
  parkingInfo: string
  directions: string
}

const publicProfileFields: PublicProfileField[] = [
  {
    key: "shortDescription",
    name: "shortDescription",
    label: "한 줄 소개",
    type: "input",
    placeholder: "학원의 특징을 한 문장으로 소개해 주세요.",
    hint: "최대 80자",
    maxLength: 80
  },
  {
    key: "description",
    name: "description",
    label: "상세 소개",
    type: "textarea",
    placeholder: "교육 철학, 수업 방식과 학원의 특징을 소개해 주세요.",
    hint: "최대 1,000자",
    rows: 6,
    maxLength: 1000
  },
  {
    key: "operatingHours",
    name: "operatingHours",
    label: "운영시간",
    type: "textarea",
    placeholder: "예: 평일 13:00~22:00 / 토요일 10:00~18:00",
    rows: 4,
    hint: "최대 500자",
    maxLength: 500
  },
  {
    key: "parkingInfo",
    name: "parkingInfo",
    label: "주차 안내",
    type: "textarea",
    placeholder: "주차 가능 여부와 이용 방법을 작성해 주세요.",
    rows: 4,
    hint: "최대 500자",
    maxLength: 500
  },
  {
    key: "directions",
    name: "directions",
    label: "찾아오는 방법",
    type: "textarea",
    placeholder: "가까운 지하철역, 버스정류장 또는 건물 위치를 안내해 주세요.",
    rows: 4,
    hint: "최대 500자",
    maxLength: 500
  }
]

const initialActionState: SaveAcademyPublicProfileActionState = {
  status: "idle",
  message: "",
  completedAt: null
}

const PROFILE_ASSET_BUCKET = "academy-profile-assets"
const ASSET_FILENAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/
const LOGO_FILE_SIZE_LIMIT = 5 * 1024 * 1024
const COVER_FILE_SIZE_LIMIT = 10 * 1024 * 1024
const SLUG_ALLOWED_CHARACTER_PATTERN = /[^a-z0-9-]/g

const imageMimeTypeToExtension: Record<string, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
}

const isManagedAssetPath = (path: string, organizationId: string, folder: "logo" | "cover") => {
  const parts = path.split("/")

  if (parts.length !== 3) {
    return false
  }

  const [pathOrganizationId, pathFolder, filename] = parts

  return (
    pathOrganizationId === organizationId && pathFolder === folder && ASSET_FILENAME_PATTERN.test(filename)
  )
}

const toInputValue = (value: string | null | undefined) => value ?? ""

const sanitizeSlugInput = (value: string) => value.trim().toLowerCase().replace(SLUG_ALLOWED_CHARACTER_PATTERN, "")

const buildAcademyPublicPageHandle = (slug: string | null | undefined, organizationId: string) =>
  toNullableText(slug) ?? organizationId

const buildAcademyPublicPageUrl = (slug: string | null | undefined, organizationId: string) =>
  toParentUrl(`/academy/${buildAcademyPublicPageHandle(slug, organizationId)}`)

const createInitialFormValues = (
  publicProfile: StudioAcademyPublicProfile | null,
  initialSlug: string | null
): PublicProfileFormValues => ({
  slug: toInputValue(initialSlug),
  shortDescription: toInputValue(publicProfile?.shortDescription),
  description: toInputValue(publicProfile?.description),
  operatingHours: toInputValue(publicProfile?.operatingHours),
  parkingInfo: toInputValue(publicProfile?.parkingInfo),
  directions: toInputValue(publicProfile?.directions)
})

type StudioMypageProfilePageProps = {
  organizationId: string
  academyName: string
  initialLogoImagePath: string | null
  initialCoverImagePath: string | null
  organization: StudioSettingsOrganization | null
  organizationError: string | null
  publicProfile: StudioAcademyPublicProfile | null
  initialSlug: string | null
  publicProfileError: string | null
  canEditPublicProfile: boolean
}

import { useStudioNavigationPathFactory } from "@/features/studio/ui/studio-navigation-provider"

export function StudioMypageProfilePage({
  organizationId,
  academyName,
  initialLogoImagePath,
  initialCoverImagePath,
  organization,
  organizationError,
  publicProfile,
  initialSlug,
  publicProfileError,
  canEditPublicProfile
}: StudioMypageProfilePageProps) {
  const studioPath = useStudioNavigationPathFactory()
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(saveAcademyPublicProfileAction, initialActionState)
  const disableFormByQueryError = Boolean(publicProfileError)
  const readOnlyFields = !disableFormByQueryError && (!canEditPublicProfile || isPending)
  const refreshHandledRef = useRef<string | null>(null)
  const logoFileInputRef = useRef<HTMLInputElement | null>(null)
  const coverFileInputRef = useRef<HTMLInputElement | null>(null)
  const initialFormValues = useMemo(
    () => createInitialFormValues(publicProfile, initialSlug),
    [initialSlug, publicProfile]
  )
  const initialFormValuesKey = useMemo(() => JSON.stringify(initialFormValues), [initialFormValues])
  const formValuesKeyRef = useRef<string | null>(null)
  const [formValues, setFormValues] = useState<PublicProfileFormValues>(initialFormValues)
  const [hoursDraft, setHoursDraft] = useState<HoursDraft>(() => parseHours(initialFormValues.operatingHours) ?? { days: [], start: "", end: "" })
  const [hoursChanged, setHoursChanged] = useState(false)
  const [parkingDraft, setParkingDraft] = useState<ParkingDraft>(() => parseParking(initialFormValues.parkingInfo) ?? { available: null, detail: initialFormValues.parkingInfo })
  const visitError = (hoursChanged ? hoursError(hoursDraft) : null) || (formValues.parkingInfo.length > 500 ? "주차 안내는 500자 이하로 입력해 주세요." : null)
  const disableSaveButton = !canEditPublicProfile || isPending || disableFormByQueryError || Boolean(visitError)
  const disableVisitControls = readOnlyFields || disableFormByQueryError
  const updateHours = (next: HoursDraft) => {
    setHoursDraft(next)
    setHoursChanged(true)
    if (!hoursError(next)) setFormValues(current => ({ ...current, operatingHours: formatHours(next) ?? "" }))
  }
  const updateParking = (next: ParkingDraft) => {
    setParkingDraft(next)
    setFormValues(current => ({ ...current, parkingInfo: next.available === null ? next.detail : formatParking(next) ?? "" }))
  }
  const [currentLogoImagePath, setCurrentLogoImagePath] = useState(initialLogoImagePath)
  const [currentCoverImagePath, setCurrentCoverImagePath] = useState(initialCoverImagePath)
  const [isLogoUploading, setIsLogoUploading] = useState(false)
  const [isCoverUploading, setIsCoverUploading] = useState(false)
  const [logoFeedback, setLogoFeedback] = useState<{
    type: "error" | "success" | "warning" | null
    message: string
  }>({
    type: null,
    message: ""
  })
  const [coverFeedback, setCoverFeedback] = useState<{
    type: "error" | "success" | "warning" | null
    message: string
  }>({
    type: null,
    message: ""
  })
  const [isLogoImageBroken, setIsLogoImageBroken] = useState(false)
  const [isCoverImageBroken, setIsCoverImageBroken] = useState(false)
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null)
  const [copyButtonLabel, setCopyButtonLabel] = useState("링크 복사")

  useEffect(() => {
    if (formValuesKeyRef.current === initialFormValuesKey) {
      return
    }

    setFormValues(initialFormValues)
    setHoursDraft(parseHours(initialFormValues.operatingHours) ?? { days: [], start: "", end: "" })
    setHoursChanged(false)
    setParkingDraft(parseParking(initialFormValues.parkingInfo) ?? { available: null, detail: initialFormValues.parkingInfo })
    formValuesKeyRef.current = initialFormValuesKey
  }, [initialFormValues, initialFormValuesKey])

  useEffect(() => {
    setCurrentLogoImagePath(initialLogoImagePath)
  }, [initialLogoImagePath])

  useEffect(() => {
    setCurrentCoverImagePath(initialCoverImagePath)
    setCoverPreviewUrl(null)
  }, [initialCoverImagePath])

  useEffect(() => {
    setIsLogoImageBroken(false)
  }, [currentLogoImagePath])

  useEffect(() => {
    setIsCoverImageBroken(false)
  }, [currentCoverImagePath, coverPreviewUrl])

  useEffect(() => {
    setCopyButtonLabel("링크 복사")
  }, [organizationId, formValues.slug])

  useEffect(() => {
    return () => {
      if (coverPreviewUrl) {
        URL.revokeObjectURL(coverPreviewUrl)
      }
    }
  }, [coverPreviewUrl])

  useEffect(() => {
    if (state.status !== "success" || !state.completedAt) {
      return
    }

    if (refreshHandledRef.current === state.completedAt) {
      return
    }

    refreshHandledRef.current = state.completedAt
    router.refresh()
  }, [router, state.completedAt, state.status])

  const permissionMessage = canEditPublicProfile ? null : "학원 대표 계정만 프로필을 수정할 수 있습니다."
  const logoButtonLabel = isLogoUploading ? "업로드 중..." : currentLogoImagePath ? "로고 변경" : "로고 등록"
  const coverButtonLabel = isCoverUploading ? "업로드 중..." : currentCoverImagePath ? "대표 이미지 변경" : "대표 이미지 등록"
  const publicPageUrl = useMemo(
    () => buildAcademyPublicPageUrl(formValues.slug, organizationId),
    [formValues.slug, organizationId]
  )
  const logoInitial = academyName.trim().charAt(0) || "학"
  const logoPublicUrl = useMemo(() => {
    if (!currentLogoImagePath) {
      return null
    }

    const {
      data: { publicUrl }
    } = getSupabaseBrowserClient().storage.from(PROFILE_ASSET_BUCKET).getPublicUrl(currentLogoImagePath)

    return publicUrl || null
  }, [currentLogoImagePath])
  const coverPublicUrl = useMemo(() => {
    if (!currentCoverImagePath) {
      return null
    }

    const {
      data: { publicUrl }
    } = getSupabaseBrowserClient().storage.from(PROFILE_ASSET_BUCKET).getPublicUrl(currentCoverImagePath)

    return publicUrl || null
  }, [currentCoverImagePath])
  const visibleCoverImageUrl = coverPreviewUrl ?? coverPublicUrl

  const feedbackClassName =
    state.status === "error"
      ? `${styles.feedbackMessage} ${styles.feedbackError}`
      : state.status === "success"
        ? `${styles.feedbackMessage} ${styles.feedbackSuccess}`
        : ""

  const logoFeedbackClassName =
    logoFeedback.type === "error"
      ? `${styles.feedbackMessage} ${styles.feedbackError}`
      : logoFeedback.type === "warning"
        ? `${styles.feedbackMessage} ${styles.feedbackWarning}`
        : logoFeedback.type === "success"
          ? `${styles.feedbackMessage} ${styles.feedbackSuccess}`
          : ""

  const coverFeedbackClassName =
    coverFeedback.type === "error"
      ? `${styles.feedbackMessage} ${styles.feedbackError}`
      : coverFeedback.type === "warning"
        ? `${styles.feedbackMessage} ${styles.feedbackWarning}`
        : coverFeedback.type === "success"
          ? `${styles.feedbackMessage} ${styles.feedbackSuccess}`
          : ""

  const resetLogoFileInput = () => {
    if (logoFileInputRef.current) {
      logoFileInputRef.current.value = ""
    }
  }

  const resetCoverFileInput = () => {
    if (coverFileInputRef.current) {
      coverFileInputRef.current.value = ""
    }
  }

  const handleLogoButtonClick = () => {
    if (!canEditPublicProfile || isLogoUploading) {
      return
    }

    logoFileInputRef.current?.click()
  }

  const handleCoverButtonClick = () => {
    if (!canEditPublicProfile || isCoverUploading) {
      return
    }

    coverFileInputRef.current?.click()
  }

  const handleCopyPublicLink = async () => {
    const targetUrl = publicPageUrl

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(targetUrl)
      } else {
        const textarea = document.createElement("textarea")
        textarea.value = targetUrl
        textarea.setAttribute("readonly", "true")
        textarea.style.position = "absolute"
        textarea.style.left = "-9999px"
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand("copy")
        document.body.removeChild(textarea)
      }

      setCopyButtonLabel("복사되었습니다")
      window.setTimeout(() => {
        setCopyButtonLabel("링크 복사")
      }, 2000)
    } catch {
      setCopyButtonLabel("복사 실패")
      window.setTimeout(() => {
        setCopyButtonLabel("링크 복사")
      }, 2000)
    }
  }

  const handleLogoFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file || isLogoUploading) {
      resetLogoFileInput()
      return
    }

    const extension = imageMimeTypeToExtension[file.type]

    if (!extension) {
      setLogoFeedback({
        type: "error",
        message: "JPEG, PNG, WEBP 파일만 업로드할 수 있습니다."
      })
      resetLogoFileInput()
      return
    }

    if (file.size > LOGO_FILE_SIZE_LIMIT) {
      setLogoFeedback({
        type: "error",
        message: "로고 이미지는 5MB 이하 파일만 업로드할 수 있습니다."
      })
      resetLogoFileInput()
      return
    }

    const nextLogoPath = `${organizationId}/logo/${crypto.randomUUID()}.${extension}`
    const previousLogoPath = currentLogoImagePath
    const supabase = getSupabaseBrowserClient()

    setIsLogoUploading(true)
    setLogoFeedback({ type: null, message: "" })

    try {
      const { error: uploadError } = await supabase.storage
        .from(PROFILE_ASSET_BUCKET)
        .upload(nextLogoPath, file, {
          contentType: file.type,
          upsert: false
        })

      if (uploadError) {
        setLogoFeedback({
          type: "error",
          message: "로고 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요."
        })
        return
      }

      let saveResult: SaveAcademyLogoPathResult

      try {
        saveResult = await saveAcademyLogoPath({ logoImagePath: nextLogoPath })
      } catch {
        await supabase.storage.from(PROFILE_ASSET_BUCKET).remove([nextLogoPath])

        setLogoFeedback({
          type: "error",
          message: "로고를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."
        })
        return
      }

      if (saveResult.status !== "success") {
        await supabase.storage.from(PROFILE_ASSET_BUCKET).remove([nextLogoPath])

        setLogoFeedback({
          type: "error",
          message: saveResult.message
        })
        return
      }

      setCurrentLogoImagePath(nextLogoPath)

      if (previousLogoPath && previousLogoPath !== nextLogoPath) {
        const { error: removePreviousLogoError } = await supabase.storage
          .from(PROFILE_ASSET_BUCKET)
          .remove([previousLogoPath])

        if (removePreviousLogoError) {
          setLogoFeedback({
            type: "warning",
            message: "로고는 저장되었지만 이전 이미지 정리에 실패했습니다."
          })
          router.refresh()
          return
        }
      }

      setLogoFeedback({
        type: "success",
        message: saveResult.message
      })
      router.refresh()
    } finally {
      setIsLogoUploading(false)
      resetLogoFileInput()
    }
  }

  const handleCoverFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file || isCoverUploading) {
      resetCoverFileInput()
      return
    }

    const extension = imageMimeTypeToExtension[file.type]

    if (!extension) {
      setCoverFeedback({
        type: "error",
        message: "JPEG, PNG, WEBP 파일만 업로드할 수 있습니다."
      })
      resetCoverFileInput()
      return
    }

    if (file.size > COVER_FILE_SIZE_LIMIT) {
      setCoverFeedback({
        type: "error",
        message: "대표 이미지는 10MB 이하 파일만 업로드할 수 있습니다."
      })
      resetCoverFileInput()
      return
    }

    const nextCoverPath = `${organizationId}/cover/${crypto.randomUUID()}.${extension}`
    const previousCoverPath = currentCoverImagePath
    const nextCoverPreviewUrl = URL.createObjectURL(file)
    const supabase = getSupabaseBrowserClient()

    setIsCoverUploading(true)
    setCoverFeedback({ type: null, message: "" })
    setCoverPreviewUrl(nextCoverPreviewUrl)

    try {
      const { error: uploadError } = await supabase.storage
        .from(PROFILE_ASSET_BUCKET)
        .upload(nextCoverPath, file, {
          contentType: file.type,
          upsert: false
        })

      if (uploadError) {
        setCoverPreviewUrl(null)
        setCoverFeedback({
          type: "error",
          message: "대표 이미지 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요."
        })
        return
      }

      let saveResult: SaveAcademyCoverPathResult

      try {
        saveResult = await saveAcademyCoverPath({ coverImagePath: nextCoverPath })
      } catch {
        if (isManagedAssetPath(nextCoverPath, organizationId, "cover")) {
          await supabase.storage.from(PROFILE_ASSET_BUCKET).remove([nextCoverPath])
        }

        setCoverPreviewUrl(null)
        setCoverFeedback({
          type: "error",
          message: "대표 이미지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."
        })
        return
      }

      if (saveResult.status !== "success") {
        if (isManagedAssetPath(nextCoverPath, organizationId, "cover")) {
          await supabase.storage.from(PROFILE_ASSET_BUCKET).remove([nextCoverPath])
        }

        setCoverPreviewUrl(null)
        setCoverFeedback({
          type: "error",
          message: saveResult.message
        })
        return
      }

      setCurrentCoverImagePath(nextCoverPath)

      if (
        previousCoverPath &&
        previousCoverPath !== nextCoverPath &&
        isManagedAssetPath(previousCoverPath, organizationId, "cover")
      ) {
        const { error: removePreviousCoverError } = await supabase.storage
          .from(PROFILE_ASSET_BUCKET)
          .remove([previousCoverPath])

        if (removePreviousCoverError) {
          setCoverFeedback({
            type: "warning",
            message: "대표 이미지는 저장되었지만 이전 이미지 정리에 실패했습니다."
          })
          router.refresh()
          return
        }
      }

      setCoverFeedback({
        type: "success",
        message: saveResult.message
      })
      router.refresh()
    } finally {
      setIsCoverUploading(false)
      resetCoverFileInput()
    }
  }

  const renderProfileField = (field: PublicProfileField) => {
    const value = formValues[field.key]

    return (
      <label
        key={field.name}
        className={`${styles.field} ${field.type === "textarea" ? styles.fullWidthField : ""}`}
      >
        <span className={styles.fieldHeader}>
          <span className={styles.fieldLabel}>{field.label}</span>
          <span className={styles.fieldCount}>
            {value.length}/{field.maxLength}
          </span>
        </span>
        {field.type === "input" ? (
          <input
            name={field.name}
            type="text"
            className={styles.input}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            value={value}
            readOnly={readOnlyFields}
            disabled={disableFormByQueryError}
            onChange={(event) =>
              setFormValues((current) => ({
                ...current,
                [field.key]: event.target.value
              }))
            }
          />
        ) : (
          <textarea
            name={field.name}
            className={styles.textarea}
            placeholder={field.placeholder}
            rows={field.rows ?? 4}
            maxLength={field.maxLength}
            value={value}
            readOnly={readOnlyFields}
            disabled={disableFormByQueryError}
            onChange={(event) =>
              setFormValues((current) => ({
                ...current,
                [field.key]: event.target.value
              }))
            }
          />
        )}
        {field.hint ? <span className={styles.fieldHint}>{field.hint}</span> : null}
      </label>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <Link href={studioPath("/studio/mypage")} prefetch={false} className={styles.backLink}>
            <span aria-hidden="true" className={styles.backIcon}>
              {"←"}
            </span>
            마이페이지
          </Link>
          <div className={styles.topRow}>
            <div className={styles.sectionHeaderStack}>
              <h1 className={styles.title}>학원 프로필</h1>
              <p className={styles.sectionDescription}>학원 소개와 방문에 필요한 정보를 관리해요.</p>
            </div>
            <div className={styles.topActions}>
              <a href={buildAcademyPublicPageUrl(initialSlug, organizationId)} target="_blank" rel="noopener noreferrer" className={styles.secondaryLink}>공개 페이지 보기</a>
              <button type="submit" form="academy-profile-form" className={styles.primaryButton} disabled={disableSaveButton}>
                {isPending ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </header>

        <section className={styles.sectionCard} aria-label="공식 학원정보">
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>공식 학원정보</h2>
              <p className={styles.sectionDescription}>
                학원명, 대표자명, 사업자정보, 주소와 연락처는 관리자 승인 후 변경됩니다.
              </p>
            </div>
            <Link href={studioPath("/studio/settings")} prefetch={false} className={styles.secondaryLink}>
              공식정보 수정 요청
            </Link>
          </div>

          {organizationError || !organization ? (
            <div className={styles.errorCard} role="status">
              <p className={styles.errorText}>
                {organizationError ?? "학원 기본 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."}
              </p>
            </div>
          ) : (
            <div className={styles.infoGrid} aria-label="공식 학원 정보">
              <article className={styles.infoItem}>
                <p className={styles.infoLabel}>학원명</p>
                <p className={styles.infoValue}>{academyName}</p>
              </article>
              <article className={styles.infoItem}>
                <p className={styles.infoLabel}>지점명</p>
                <p className={styles.infoValue}>{toText(organization.branchName)}</p>
              </article>
              {formatAdministrativeRegionLabel(organization) ? (
                <article className={styles.infoItem}>
                  <p className={styles.infoLabel}>지역</p>
                  <p className={styles.infoValue}>{formatAdministrativeRegionLabel(organization)}</p>
                </article>
              ) : null}
              <article className={styles.infoItem}>
                <p className={styles.infoLabel}>대표 전화번호</p>
                <p className={styles.infoValue}>{formatPhone(organization)}</p>
              </article>
              <article className={`${styles.infoItem} ${styles.fullWidthInfoItem}`}>
                <p className={styles.infoLabel}>주소</p>
                <p className={styles.infoValue}>{formatAddress(organization)}</p>
              </article>
            </div>
          )}
        </section>

        <section className={styles.sectionCard} aria-label="대표 이미지">
          <div className={styles.sectionHeaderStack}>
            <h2 className={styles.sectionTitle}>대표 이미지</h2>
            <p className={styles.sectionDescription}>학원의 로고와 대표 이미지를 설정해요.</p>
          </div>

          {publicProfileError ? (
            <div className={styles.errorCard} role="status">
              <p className={styles.errorText}>{publicProfileError}</p>
            </div>
          ) : null}

          {permissionMessage ? (
            <div className={styles.noticeCard} role="status">
              <p className={styles.noticeText}>{permissionMessage}</p>
            </div>
          ) : null}

          <div className={styles.imageGrid}>
            <article className={styles.imageCard}>
              {logoPublicUrl && !isLogoImageBroken ? (
                <div className={`${styles.imagePlaceholder} ${styles.logoPlaceholder}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoPublicUrl}
                    alt={`${academyName} 로고`}
                    className={styles.logoImage}
                    onLoad={event => {
                      const image = event.currentTarget
                      if (!image.naturalWidth || !image.naturalHeight) return
                      const ratio = Math.min(image.naturalWidth, image.naturalHeight) / Math.max(image.naturalWidth, image.naturalHeight)
                      // Fit every image corner inside the circle; never blindly enlarge a square logo.
                      const scale = Math.min(1.1, 0.995 / (0.7 * Math.hypot(1, ratio)))
                      image.style.setProperty("--logo-preview-scale", String(scale))
                    }}
                    onError={() => setIsLogoImageBroken(true)}
                  />
                </div>
              ) : (
                <div
                  className={`${styles.imagePlaceholder} ${styles.logoPlaceholder}`}
                  role="img"
                  aria-label={`${academyName} 로고 placeholder`}
                >
                  <span className={styles.logoInitial}>{logoInitial}</span>
                </div>
              )}
              <div className={styles.imageMeta}>
                <div>
                  <p className={styles.rowTitle}>학원 로고</p>
                  <p className={styles.metaText}>권장 크기 500×500 · JPG, PNG, WEBP · 최대 5MB</p>
                  <p className={styles.metaText}>이미지가 잘리지 않게 원본 비율로 전체가 표시돼요.</p>
                </div>
                <div className={styles.imageActionColumn}>
                  <input
                    ref={logoFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className={styles.visuallyHidden}
                    tabIndex={-1}
                    onChange={handleLogoFileChange}
                  />
                  <button
                    type="button"
                    className={canEditPublicProfile ? styles.secondaryButton : styles.disabledButton}
                    disabled={!canEditPublicProfile || isLogoUploading}
                    onClick={handleLogoButtonClick}
                  >
                    {logoButtonLabel}
                  </button>
                </div>
              </div>
              {logoFeedback.message ? (
                <p className={logoFeedbackClassName} role="status">
                  {logoFeedback.message}
                </p>
              ) : null}
            </article>

            <article className={styles.imageCard}>
              {visibleCoverImageUrl && !isCoverImageBroken ? (
                <div className={`${styles.imagePlaceholder} ${styles.coverPlaceholder}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={visibleCoverImageUrl}
                    alt={`${academyName} 대표 이미지`}
                    className={styles.coverImage}
                    onError={() => setIsCoverImageBroken(true)}
                  />
                </div>
              ) : (
                <div
                  className={`${styles.imagePlaceholder} ${styles.coverPlaceholder}`}
                  role="img"
                  aria-label={`${academyName} 대표 이미지 placeholder`}
                >
                  <span className={styles.placeholderText}>대표 이미지</span>
                </div>
              )}
              <div className={styles.imageMeta}>
                <div>
                  <p className={styles.rowTitle}>대표 이미지</p>
                  <p className={styles.metaText}>권장 크기 1600×900 · 16:9 · JPG, PNG, WEBP · 최대 10MB</p>
                  <p className={styles.metaText}>이미지가 잘리지 않게 원본 비율로 전체가 표시돼요.</p>
                </div>
                <div className={styles.imageActionColumn}>
                  <input
                    ref={coverFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className={styles.visuallyHidden}
                    tabIndex={-1}
                    onChange={handleCoverFileChange}
                  />
                  <button
                    type="button"
                    className={canEditPublicProfile ? styles.secondaryButton : styles.disabledButton}
                    disabled={!canEditPublicProfile || isCoverUploading}
                    onClick={handleCoverButtonClick}
                  >
                    {coverButtonLabel}
                  </button>
                </div>
              </div>
              {coverFeedback.message ? (
                <p className={coverFeedbackClassName} role="status">
                  {coverFeedback.message}
                </p>
              ) : null}
            </article>
          </div>

        </section>

        <form id="academy-profile-form" action={formAction} className={styles.profileForm} onSubmit={event => { if (visitError) event.preventDefault() }}>
          <section className={styles.sectionCard} aria-label="학원 소개">
            <h2 className={styles.sectionTitle}>학원 소개</h2>
            <div className={styles.formGrid}>{publicProfileFields.filter(field => field.key === "shortDescription" || field.key === "description").map(renderProfileField)}</div>
          </section>
          <section className={styles.sectionCard} aria-label="방문 정보">
            <h2 className={styles.sectionTitle}>방문 정보</h2>
            <input type="hidden" name="operatingHours" value={formValues.operatingHours} />
            <input type="hidden" name="parkingInfo" value={formValues.parkingInfo} />
            <fieldset className={styles.visitFieldset} disabled={disableVisitControls}>
              <legend className={styles.fieldLabel}>운영 요일</legend>
              {!hoursChanged && parseHours(formValues.operatingHours) === null ? <div className={styles.legacyInfo}>
                <span>직접 입력된 기존 안내</span><p>{formValues.operatingHours}</p>
                <small>요일과 시간을 선택하기 전까지 기존 안내가 유지돼요.</small>
              </div> : null}
              <div className={styles.visitChoices}>{OPERATING_DAYS.map(day => <button key={day} type="button" aria-label={`${day}요일`} aria-pressed={hoursDraft.days.includes(day)} onClick={() => updateHours({ ...hoursDraft, days: hoursDraft.days.includes(day) ? hoursDraft.days.filter(value => value !== day) : [...hoursDraft.days, day] })}>{day}</button>)}</div>
              <div className={styles.visitTimeRow}>
                <label className={styles.field}><span className={styles.fieldLabel}>시작 시간</span><input className={styles.input} type="time" value={hoursDraft.start} aria-describedby={visitError ? "visit-input-error" : undefined} onChange={event => updateHours({ ...hoursDraft, start: event.target.value })} /></label>
                <label className={styles.field}><span className={styles.fieldLabel}>종료 시간</span><input className={styles.input} type="time" value={hoursDraft.end} aria-describedby={visitError ? "visit-input-error" : undefined} onChange={event => updateHours({ ...hoursDraft, end: event.target.value })} /></label>
              </div>
            </fieldset>
            <fieldset className={styles.visitFieldset} disabled={disableVisitControls}>
              <legend className={styles.fieldLabel}>주차</legend>
              <div className={styles.visitChoices}>
                <button type="button" aria-pressed={parkingDraft.available === true} onClick={() => updateParking({ ...parkingDraft, available: true })}>주차 가능</button>
                <button type="button" aria-pressed={parkingDraft.available === false} onClick={() => updateParking({ ...parkingDraft, available: false })}>주차 불가</button>
              </div>
              <label className={styles.field}>
                <span className={styles.fieldHeader}><span className={styles.fieldLabel}>주차 안내</span><span className={styles.fieldCount}>{formValues.parkingInfo.length}/500</span></span>
                <textarea className={styles.textarea} rows={3} placeholder="예: 건물 지하주차장 2시간 무료" maxLength={parkingDraft.available === true ? 500 - PARKING_PREFIX.length : 500} value={parkingDraft.available === false ? "" : parkingDraft.detail} disabled={parkingDraft.available === false} onChange={event => updateParking({ ...parkingDraft, detail: event.target.value })} />
                {parkingDraft.available === false ? <span className={styles.fieldHint}>주차 불가로 안내해요.</span> : null}
                {parkingDraft.available === null && formValues.parkingInfo ? <span className={styles.fieldHint}>주차 선택을 바꾸기 전까지 기존 안내를 유지해요.</span> : null}
              </label>
            </fieldset>
            {visitError ? <p id="visit-input-error" className={styles.errorText} role="alert">{visitError}</p> : null}
            {publicProfileFields.filter(field => field.key === "directions").map(renderProfileField)}
          </section>

            <div className={styles.saveBar}>
              <div className={styles.saveMeta}>
                {state.message ? (
                  <p className={feedbackClassName} role="status">
                    {state.message}
                  </p>
                ) : null}
                <p className={styles.saveHint}>텍스트 정보 저장과 이미지 업로드는 서로 독립적으로 동작합니다.</p>
              </div>
              <button type="submit" className={styles.primaryButton} disabled={disableSaveButton}>
                {isPending ? "저장 중..." : "변경사항 저장"}
              </button>
            </div>
          <details className={`${styles.sectionCard} ${styles.urlDetails}`}><summary>공개 URL</summary>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderStack}>

              <p className={styles.sectionDescription}>학원 공개 페이지 주소를 확인하고 공유할 수 있어요.</p>
            </div>
            <button type="button" className={styles.secondaryButton} onClick={handleCopyPublicLink}>
              {copyButtonLabel}
            </button>
          </div>
          <div className={styles.linkCard}>
            <p className={styles.linkLabel}>현재 주소</p>
            <p className={styles.linkValue}>{publicPageUrl}</p>
            <p className={styles.linkHint}>slug를 비워두면 UUID 주소가 유지됩니다.</p>
          </div>

              <label className={`${styles.field} ${styles.fullWidthField}`}>
                <span className={styles.fieldHeader}>
                  <span className={styles.fieldLabel}>페이지 주소</span>
                  <span className={styles.fieldCount}>{formValues.slug.length}/50</span>
                </span>
                <div className={styles.slugInputShell}>
                  <span className={styles.slugPrefix}>firstsuup.com/academy/</span>
                  <input
                    name="slug"
                    type="text"
                    inputMode="url"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className={styles.slugInput}
                    placeholder="my-academy"
                    maxLength={50}
                    value={formValues.slug}
                    readOnly={readOnlyFields}
                    disabled={disableFormByQueryError}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        slug: sanitizeSlugInput(event.target.value)
                      }))
                    }
                  />
                </div>
                <span className={styles.fieldHint}>소문자 영문, 숫자, 하이픈만 허용하며 2~50자까지 저장됩니다.</span>
              </label>
          </details>
        </form>
      </div>
    </div>
  )
}
