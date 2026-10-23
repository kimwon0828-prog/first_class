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
import type { StudioAcademyPublicProfile } from "@/features/studio/queries/get-studio-academy-public-profile"
import type { StudioSettingsOrganization } from "@/features/studio/queries/get-studio-settings-organization"
import { getSupabaseBrowserClient } from "@/integrations/supabase/client"
import { OPERATING_DAYS, PARKING_PREFIX, parseHours, formatHours, hoursError, parseParking, formatParking, type HoursDraft, type ParkingDraft } from "@/features/studio/lib/academy-profile-visit-info"
import type { AcademyUpdateRequestHistoryItem } from "@/features/studio/queries/get-academy-update-request-history"
import { getSubjectCategoryLabel } from "@/shared/lib/subject-master"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"
import { V2Button, v2ButtonClassName } from "./v2/v2-button"
import { V2LockIcon, V2UploadIcon } from "./v2/v2-icons"
import { V2StatusBadge } from "./v2/v2-status-badge"
import { V2SubjectIcon3D } from "./v2/v2-subject-icon-3d"
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

const SHORT_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]
/** "10월 17일(토)" */
const formatShortDate = (value: string) => {
  const parts = getSeoulDateTimeParts(value)
  return parts ? `${parts.month}월 ${parts.day}일(${SHORT_WEEKDAYS[parts.weekday]})` : value
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
  /** 검토 중인 정보수정 요청의 신청 시각. 없으면 null. */
  pendingUpdateRequestedAt?: string | null
  /** 요청 상태 · 이력 조회 실패. 실패를 "요청 없음"으로 접지 않는다. */
  updateRequestStatusError?: boolean
  updateRequestHistory?: AcademyUpdateRequestHistoryItem[]
  /** 등록한 수업의 과목 대분류(많은 순). null 이면 조회 실패. */
  subjectCategories?: string[] | null
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
  canEditPublicProfile,
  pendingUpdateRequestedAt = null,
  updateRequestStatusError = false,
  updateRequestHistory = [],
  subjectCategories = []
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

  const permissionMessage = canEditPublicProfile ? null : "학원 대표 계정만 학원 정보를 고칠 수 있어요."
  const logoButtonLabel = isLogoUploading ? "올리는 중…" : currentLogoImagePath ? "로고 바꾸기" : "로고 올리기"
  const coverButtonLabel = isCoverUploading ? "올리는 중…" : currentCoverImagePath ? "대표 이미지 바꾸기" : "대표 이미지 올리기"
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

  const fallbackSubject = subjectCategories?.[0] ?? null
  const officialRows = organization
    ? [
        { label: "학원 이름", value: academyName },
        { label: "지점", value: toText(organization.branchName) },
        { label: "대표자명", value: toText(organization.representativeName) },
        { label: "사업자등록번호", value: toText(organization.businessRegistrationNumber) },
        { label: "주소", value: formatAddress(organization), wide: true },
        { label: "학원 전화번호", value: formatPhone(organization), wide: true, helper: "학부모 앱의 '전화하기'에 쓰여요." }
      ]
    : []

  return (
    <div className={styles.root}>
      {permissionMessage ? <p className={styles.notice} role="status">{permissionMessage}</p> : null}
      {publicProfileError ? <p className={styles.errorNotice} role="alert">{publicProfileError}</p> : null}

      {/* 학원 로고 (Figma 2148:6761): 원 80 · 간격 16 · 제목 15 Bold + 설명 13 | [로고 바꾸기] outline sm. 바로 저장된다. */}
      <section className={styles.imageRow} aria-label="학원 로고">
        <div className={styles.logoCircle}>
          {logoPublicUrl && !isLogoImageBroken ? (
            /* eslint-disable-next-line @next/next/no-img-element */
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
          ) : fallbackSubject ? (
            <V2SubjectIcon3D categoryCode={fallbackSubject} size={48} />
          ) : (
            <span className={styles.logoInitial} role="img" aria-label={`${academyName} 로고 없음`}>{logoInitial}</span>
          )}
        </div>
        <div className={styles.imageText}>
          <strong>학원 로고</strong>
          <p>학부모 앱에서 동그랗게 보여요. JPG · PNG · WEBP, 5MB까지(권장 500×500).</p>
        </div>
        <input ref={logoFileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className={styles.visuallyHidden} tabIndex={-1} onChange={handleLogoFileChange} />
        <V2Button variant="outline" size="sm" icon={<V2UploadIcon size={16} />} disabled={!canEditPublicProfile || isLogoUploading} onClick={handleLogoButtonClick}>
          {logoButtonLabel}
        </V2Button>
      </section>
      {logoFeedback.message ? <p className={logoFeedbackClassName} role="status">{logoFeedback.message}</p> : null}

      <section className={styles.imageRow} aria-label="대표 이미지">
        <div className={styles.coverThumb}>
          {visibleCoverImageUrl && !isCoverImageBroken ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={visibleCoverImageUrl} alt={`${academyName} 대표 이미지`} className={styles.coverImage} onError={() => setIsCoverImageBroken(true)} />
          ) : (
            <span className={styles.placeholderText} role="img" aria-label={`${academyName} 대표 이미지 없음`}>대표 이미지</span>
          )}
        </div>
        <div className={styles.imageText}>
          <strong>대표 이미지</strong>
          <p>학원 화면 위쪽에 보여요. 16:9 · JPG · PNG · WEBP, 10MB까지(권장 1600×900).</p>
        </div>
        <input ref={coverFileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className={styles.visuallyHidden} tabIndex={-1} onChange={handleCoverFileChange} />
        <V2Button variant="outline" size="sm" icon={<V2UploadIcon size={16} />} disabled={!canEditPublicProfile || isCoverUploading} onClick={handleCoverButtonClick}>
          {coverButtonLabel}
        </V2Button>
      </section>
      {coverFeedback.message ? <p className={coverFeedbackClassName} role="status">{coverFeedback.message}</p> : null}

      {/* 공식 정보: 바로 고칠 수 없다. 정보수정 요청 → 첫수업 팀 검토(academy_update_requests) 흐름 그대로. */}
      <section className={styles.official} aria-labelledby="official-title">
        <div className={styles.officialHead}>
          <div className={styles.officialTitle}>
            <h2 id="official-title"><V2LockIcon size={16} />공식 정보</h2>
            <p>학원 이름 · 지점 · 주소 · 전화 · 사업자 정보는 첫수업 팀이 확인한 뒤 바뀌어요.</p>
          </div>
          {pendingUpdateRequestedAt ? <V2StatusBadge tone="amber">검토 중</V2StatusBadge> : null}
          <Link href={studioPath("/studio/settings")} prefetch={false} className={v2ButtonClassName({ variant: "outline", size: "sm" })}>
            {pendingUpdateRequestedAt ? "요청 보기" : "수정 요청"}
          </Link>
        </div>
        {organizationError || !organization ? (
          <p className={styles.errorNotice} role="alert">{organizationError ?? "학원 기본 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."}</p>
        ) : (
          <dl className={styles.lockedGrid}>
            {officialRows.map(row => (
              <div key={row.label} className={row.wide ? `${styles.lockedField} ${styles.lockedFieldWide}` : styles.lockedField}>
                <dt>{row.label}</dt>
                <dd><span>{row.value}</span><V2LockIcon size={16} className={styles.lockIcon} /></dd>
                {row.helper ? <p className={styles.fieldHint}>{row.helper}</p> : null}
              </div>
            ))}
          </dl>
        )}
        {updateRequestStatusError ? <p className={styles.fieldHint}>정보수정 요청 상태를 불러오지 못했어요.</p> : null}
        {updateRequestHistory.length ? (
          <div className={styles.history}>
            <p className={styles.historyTitle}>요청 이력</p>
            <ul>
              {updateRequestHistory.map(item => (
                <li key={item.id}>
                  <span className={styles.historyDate}>{formatShortDate(item.createdAt)} 요청</span>
                  <V2StatusBadge tone={item.status === "pending" ? "amber" : item.status === "approved" ? "green" : "red"}>
                    {item.status === "pending" ? "검토 중" : item.status === "approved" ? "반영됨" : "반려됨"}
                  </V2StatusBadge>
                  {item.adminNote ? <span className={styles.historyNote}>{item.adminNote}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* 과목 (Figma 2148:6771): 학원 단위 과목 칸은 DB 에 없어서 등록한 수업의 과목 대분류를 보여준다(읽기 전용). */}
      <section className={styles.subjects} aria-labelledby="subjects-title">
        <h2 id="subjects-title" className={styles.fieldLabel}>과목</h2>
        {subjectCategories === null ? (
          <p className={styles.fieldHint}>과목을 불러오지 못했어요.</p>
        ) : subjectCategories.length ? (
          <ul className={styles.subjectChips}>
            {subjectCategories.map(code => (
              <li key={code}><V2SubjectIcon3D categoryCode={code} size={26} />{getSubjectCategoryLabel(code) ?? code}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.fieldHint}>아직 등록한 수업이 없어요.</p>
        )}
        <p className={styles.fieldHint}>등록한 수업의 과목이에요. 수업을 등록하거나 바꾸면 함께 바뀌어요.</p>
      </section>

      <form id="academy-profile-form" action={formAction} className={styles.profileForm} onSubmit={event => { if (visitError) event.preventDefault() }}>
        <section className={styles.formSection} aria-labelledby="intro-title">
          <h2 id="intro-title" className={styles.sectionTitle}>학원 소개</h2>
          {publicProfileFields.filter(field => field.key === "shortDescription" || field.key === "description").map(renderProfileField)}
        </section>

        <section id="visit-info" className={styles.formSection} aria-labelledby="visit-title">
          <h2 id="visit-title" className={styles.sectionTitle}>방문 정보</h2>
          <input type="hidden" name="operatingHours" value={formValues.operatingHours} />
          <input type="hidden" name="parkingInfo" value={formValues.parkingInfo} />
          <fieldset className={styles.visitFieldset} disabled={disableVisitControls}>
            <legend className={styles.fieldLabel}>운영 요일 · 시간</legend>
            {!hoursChanged && parseHours(formValues.operatingHours) === null ? <div className={styles.legacyInfo}>
              <span>직접 입력된 기존 안내</span><p>{formValues.operatingHours}</p>
              <small>요일과 시간을 고르기 전까지 기존 안내가 그대로 보여요.</small>
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

        <details className={styles.urlDetails}>
          <summary>공개 페이지 주소</summary>
          <div className={styles.urlBody}>
            <div className={styles.linkCard}>
              <p className={styles.linkLabel}>지금 주소</p>
              <p className={styles.linkValue}>{publicPageUrl}</p>
              <div className={styles.linkActions}>
                <a href={buildAcademyPublicPageUrl(initialSlug, organizationId)} target="_blank" rel="noopener noreferrer" className={v2ButtonClassName({ variant: "ghost", size: "sm" })}>공개 페이지 보기</a>
                <V2Button variant="outline" size="sm" onClick={handleCopyPublicLink}>{copyButtonLabel}</V2Button>
              </div>
            </div>
            <label className={styles.field}>
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
              <span className={styles.fieldHint}>소문자 영문 · 숫자 · 하이픈 2~50자. 비워 두면 지금 주소가 그대로예요.</span>
            </label>
          </div>
        </details>

        <div className={styles.saveBar}>
          <div className={styles.saveMeta}>
            {state.message ? <p className={feedbackClassName} role="status">{state.message}</p> : null}
            <p className={styles.saveHint}>소개 · 방문 정보 · 주소는 [저장]으로, 로고 · 대표 이미지는 올리는 즉시 저장돼요.</p>
          </div>
          <V2Button type="submit" size="lg" disabled={disableSaveButton}>{isPending ? "저장 중…" : "저장"}</V2Button>
        </div>
      </form>
    </div>
  )
}
