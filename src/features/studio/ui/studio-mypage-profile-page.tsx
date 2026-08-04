"use client"

import { useActionState, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import {
  saveAcademyPublicProfileAction,
  type SaveAcademyPublicProfileActionState
} from "@/features/studio/actions/save-academy-public-profile"
import type { StudioAcademyPublicProfile } from "@/features/studio/queries/get-studio-academy-public-profile"
import type { StudioSettingsOrganization } from "@/features/studio/queries/get-studio-settings-organization"
import styles from "./studio-mypage-profile-page.module.css"

const toNullableText = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

const toText = (value: string | null | undefined, fallback = "미등록") => toNullableText(value) ?? fallback

const formatAddress = (organization: StudioSettingsOrganization) => {
  const line1 = toNullableText(organization.addressLine1 ?? organization.address ?? null)
  const line2 = toNullableText(organization.addressLine2 ?? organization.addressDetail ?? null)
  const combined = [line1, line2].filter((value): value is string => Boolean(value)).join(" ")
  return combined.length > 0 ? combined : "미등록"
}

const formatPhone = (organization: StudioSettingsOrganization) =>
  toNullableText(organization.academyPhone) ?? toNullableText(organization.organizationPhone) ?? "미등록"

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

const toInputValue = (value: string | null | undefined) => value ?? ""

const createInitialFormValues = (publicProfile: StudioAcademyPublicProfile | null): PublicProfileFormValues => ({
  shortDescription: toInputValue(publicProfile?.shortDescription),
  description: toInputValue(publicProfile?.description),
  operatingHours: toInputValue(publicProfile?.operatingHours),
  parkingInfo: toInputValue(publicProfile?.parkingInfo),
  directions: toInputValue(publicProfile?.directions)
})

type StudioMypageProfilePageProps = {
  organization: StudioSettingsOrganization | null
  organizationError: string | null
  publicProfile: StudioAcademyPublicProfile | null
  publicProfileError: string | null
  canEditPublicProfile: boolean
}

export function StudioMypageProfilePage({
  organization,
  organizationError,
  publicProfile,
  publicProfileError,
  canEditPublicProfile
}: StudioMypageProfilePageProps) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(saveAcademyPublicProfileAction, initialActionState)
  const academyName = organization?.name?.trim() || "학원"
  const disableFormByQueryError = Boolean(publicProfileError)
  const readOnlyFields = !disableFormByQueryError && (!canEditPublicProfile || isPending)
  const disableSaveButton = !canEditPublicProfile || isPending || disableFormByQueryError
  const refreshHandledRef = useRef<string | null>(null)
  const initialFormValues = useMemo(() => createInitialFormValues(publicProfile), [publicProfile])
  const [formValues, setFormValues] = useState<PublicProfileFormValues>(initialFormValues)

  useEffect(() => {
    setFormValues(initialFormValues)
  }, [initialFormValues])

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

  const feedbackClassName =
    state.status === "error"
      ? `${styles.feedbackMessage} ${styles.feedbackError}`
      : state.status === "success"
        ? `${styles.feedbackMessage} ${styles.feedbackSuccess}`
        : ""

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <Link href="/studio/mypage" prefetch={false} className={styles.backLink}>
            <span aria-hidden="true" className={styles.backIcon}>
              {"←"}
            </span>
            마이페이지
          </Link>
          <h1 className={styles.title}>프로필 수정</h1>
        </header>

        <section className={styles.sectionCard} aria-label="기본 정보">
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>기본 정보</h2>
              <p className={styles.sectionDescription}>
                학원명, 대표자명, 사업자정보, 주소와 연락처는 관리자 승인 후 변경됩니다.
              </p>
            </div>
            <Link href="/studio/settings" prefetch={false} className={styles.secondaryLink}>
              학원 공식정보 수정
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
              <article className={styles.infoItem}>
                <p className={styles.infoLabel}>학원가</p>
                <p className={styles.infoValue}>{toText(organization.academyArea)}</p>
              </article>
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

        <section className={styles.sectionCard} aria-label="프로필 수정">
          <div className={styles.sectionHeaderStack}>
            <h2 className={styles.sectionTitle}>프로필 수정</h2>
            <p className={styles.sectionDescription}>학부모에게 공개되는 소개와 운영 정보를 관리합니다.</p>
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
              <div
                className={`${styles.imagePlaceholder} ${styles.logoPlaceholder}`}
                role="img"
                aria-label="학원 로고 업로드 준비 영역"
              >
                <span className={styles.placeholderText}>로고</span>
              </div>
              <div className={styles.imageMeta}>
                <div>
                  <p className={styles.rowTitle}>학원 로고</p>
                  <p className={styles.metaText}>권장 크기 500×500 · JPG, PNG, WEBP</p>
                  <p className={styles.metaText}>이미지 등록 기능은 준비 중입니다.</p>
                </div>
                <button type="button" className={styles.disabledButton} disabled>
                  로고 등록
                </button>
              </div>
            </article>

            <article className={styles.imageCard}>
              <div
                className={`${styles.imagePlaceholder} ${styles.coverPlaceholder}`}
                role="img"
                aria-label="대표 이미지 업로드 준비 영역"
              >
                <span className={styles.placeholderText}>대표 이미지</span>
              </div>
              <div className={styles.imageMeta}>
                <div>
                  <p className={styles.rowTitle}>대표 이미지</p>
                  <p className={styles.metaText}>권장 크기 1600×900 · JPG, PNG, WEBP</p>
                  <p className={styles.metaText}>이미지 등록 기능은 준비 중입니다.</p>
                </div>
                <button type="button" className={styles.disabledButton} disabled>
                  대표 이미지 등록
                </button>
              </div>
            </article>
          </div>

          <form action={formAction} className={styles.profileForm}>
            <div className={styles.formGrid}>
              {publicProfileFields.map((field) => {
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
              })}
            </div>

            <div className={styles.saveBar}>
              <div className={styles.saveMeta}>
                {state.message ? (
                  <p className={feedbackClassName} role="status">
                    {state.message}
                  </p>
                ) : null}
                <p className={styles.saveHint}>이미지 등록 기능은 준비 중입니다. 텍스트 정보만 저장할 수 있습니다.</p>
              </div>
              <button type="submit" className={styles.primaryButton} disabled={disableSaveButton}>
                {isPending ? "저장 중..." : "저장"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
