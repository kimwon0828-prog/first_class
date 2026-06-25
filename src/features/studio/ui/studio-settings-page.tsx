"use client"

import { useActionState, useState } from "react"

import {
  requestAcademyUpdateAction,
  type RequestAcademyUpdateActionState
} from "@/features/studio/actions/request-academy-update"
import type { PendingAcademyUpdateRequest } from "@/features/studio/queries/get-pending-academy-update-request"
import type { StudioSettingsOrganization } from "@/features/studio/queries/get-studio-settings-organization"
import styles from "./studio-settings-page.module.css"

type StudioSettingsPageProps = {
  organization: StudioSettingsOrganization | null
  organizationError: string | null
  pendingRequest: PendingAcademyUpdateRequest | null
  pendingError: string | null
}

const initialState: RequestAcademyUpdateActionState = {
  status: "idle",
  message: ""
}

const formatDateTime = (value: string | null) => {
  if (!value) {
    return null
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value))
}

const toText = (value: string | null | undefined, fallback = "미입력") => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallback
}

const createFieldRows = (organization: StudioSettingsOrganization) => [
  { label: "학원명", value: organization.name },
  { label: "학원가", value: toText(organization.academyArea) },
  { label: "지점명", value: toText(organization.branchName) },
  { label: "대표자명", value: toText(organization.representativeName) },
  { label: "사업자등록번호", value: toText(organization.businessRegistrationNumber) },
  { label: "학원 대표 전화번호", value: toText(organization.academyPhone ?? organization.organizationPhone) },
  { label: "담당자 전화번호", value: toText(organization.contactPhone) },
  { label: "우편번호", value: toText(organization.postalCode) },
  { label: "기본 주소", value: toText(organization.addressLine1 ?? organization.address) },
  { label: "상세 주소", value: toText(organization.addressLine2 ?? organization.addressDetail) },
  { label: "사업자등록증 경로", value: toText(organization.businessRegistrationFilePath, "등록된 파일 없음") }
]

export function StudioSettingsPage({
  organization,
  organizationError,
  pendingRequest,
  pendingError
}: StudioSettingsPageProps) {
  const [state, formAction, isPending] = useActionState(requestAcademyUpdateAction, initialState)
  const [isUpdateRequestOpen, setIsUpdateRequestOpen] = useState(false)

  if (organizationError || !organization) {
    return (
      <div className={styles.page}>
        <section className={styles.alertCard}>
          <p className={styles.alertTitle}>학원 정보를 불러오지 못했습니다.</p>
          <p className={styles.alertDescription}>{organizationError ?? "잠시 후 다시 시도해 주세요."}</p>
        </section>
      </div>
    )
  }

  const rows = createFieldRows(organization)
  const canRequestUpdate = organization.actorRole === "academy"
  const requestedDocumentPath =
    pendingRequest?.requestedSnapshot.businessRegistrationFilePath ??
    pendingRequest?.requestedBusinessRegistrationFilePath ??
    null

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <section className={styles.heroCard}>
          <div>
            <p className={styles.badge}>Studio</p>
            <h1 className={styles.title}>학원 설정</h1>
            <p className={styles.description}>
              현재 학원 공식 정보를 확인하고, 변경이 필요할 때 관리자 승인 기반으로 정보수정 요청을 제출할 수
              있습니다.
            </p>
          </div>
          <div className={styles.heroMeta}>
            <p className={styles.heroMetaLabel}>요청 정책</p>
            <p className={styles.heroMetaValue}>즉시 반영되지 않고 관리자 검토 후 `organizations`에 반영됩니다.</p>
          </div>
        </section>

        {state.message ? (
          <section
            className={`${styles.feedbackCard} ${
              state.status === "error" ? styles.feedbackError : styles.feedbackSuccess
            }`}
            role="status"
          >
            {state.message}
          </section>
        ) : null}

        {pendingError ? (
          <section className={styles.alertCard}>
            <p className={styles.alertTitle}>기존 정보수정 요청 상태를 확인하지 못했습니다.</p>
            <p className={styles.alertDescription}>{pendingError}</p>
          </section>
        ) : null}

        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>현재 학원 정보</h2>
              <p className={styles.sectionDescription}>현재 `organizations`에 저장된 공식 정보입니다.</p>
            </div>
          </div>
          <div className={styles.infoGrid}>
            {rows.map((row) => (
              <article key={row.label} className={styles.infoItem}>
                <p className={styles.infoLabel}>{row.label}</p>
                <p className={styles.infoValue}>{row.value}</p>
              </article>
            ))}
          </div>
        </section>

        {pendingRequest ? (
          <section className={styles.pendingCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>검토 중인 정보수정 요청</h2>
                <p className={styles.sectionDescription}>
                  현재 요청이 검토 중이므로 새 요청은 제출할 수 없습니다.
                </p>
              </div>
              <span className={styles.pendingBadge}>관리자 검토 중입니다</span>
            </div>

            <div className={styles.metaRow}>
              <span>요청일 {formatDateTime(pendingRequest.createdAt) ?? "확인 불가"}</span>
              <span>최근 업데이트 {formatDateTime(pendingRequest.updatedAt) ?? "확인 불가"}</span>
            </div>

            <div className={styles.infoGrid}>
              <article className={styles.infoItem}>
                <p className={styles.infoLabel}>요청 학원명</p>
                <p className={styles.infoValue}>{toText(pendingRequest.requestedSnapshot.academyName)}</p>
              </article>
              <article className={styles.infoItem}>
                <p className={styles.infoLabel}>요청 대표자명</p>
                <p className={styles.infoValue}>{toText(pendingRequest.requestedSnapshot.representativeName)}</p>
              </article>
              <article className={styles.infoItem}>
                <p className={styles.infoLabel}>요청 사업자등록번호</p>
                <p className={styles.infoValue}>
                  {toText(pendingRequest.requestedSnapshot.businessRegistrationNumber)}
                </p>
              </article>
              <article className={styles.infoItem}>
                <p className={styles.infoLabel}>요청 학원 대표 전화번호</p>
                <p className={styles.infoValue}>{toText(pendingRequest.requestedSnapshot.academyPhone)}</p>
              </article>
              <article className={styles.infoItem}>
                <p className={styles.infoLabel}>요청 담당자 전화번호</p>
                <p className={styles.infoValue}>{toText(pendingRequest.requestedSnapshot.contactPhone)}</p>
              </article>
              <article className={styles.infoItem}>
                <p className={styles.infoLabel}>요청 우편번호</p>
                <p className={styles.infoValue}>{toText(pendingRequest.requestedSnapshot.postalCode)}</p>
              </article>
              <article className={styles.infoItem}>
                <p className={styles.infoLabel}>요청 기본 주소</p>
                <p className={styles.infoValue}>{toText(pendingRequest.requestedSnapshot.addressLine1)}</p>
              </article>
              <article className={styles.infoItem}>
                <p className={styles.infoLabel}>요청 상세 주소</p>
                <p className={styles.infoValue}>{toText(pendingRequest.requestedSnapshot.addressLine2)}</p>
              </article>
              <article className={`${styles.infoItem} ${styles.fullWidthItem}`}>
                <p className={styles.infoLabel}>요청 사업자등록증 경로</p>
                <p className={styles.infoValue}>{toText(requestedDocumentPath, "기존 문서 유지")}</p>
              </article>
            </div>
          </section>
        ) : null}

        {!canRequestUpdate ? (
          <section className={styles.alertCard}>
            <p className={styles.alertTitle}>대표 계정 전용 기능입니다.</p>
            <p className={styles.alertDescription}>
              현재 로그인한 계정은 학원 대표 계정이 아니어서 정보수정 요청을 제출할 수 없습니다.
            </p>
          </section>
        ) : null}

        {!pendingRequest && canRequestUpdate ? (
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>정보수정 요청 제출</h2>
                <p className={styles.sectionDescription}>
                  제출 후에는 관리자 검토가 끝날 때까지 동일 학원에서 중복 요청을 보낼 수 없습니다.
                </p>
              </div>
              <div className={styles.sectionActions}>
                {isUpdateRequestOpen ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setIsUpdateRequestOpen(false)}
                    disabled={isPending}
                  >
                    닫기
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => setIsUpdateRequestOpen(true)}
                  >
                    수정하기
                  </button>
                )}
              </div>
            </div>

            {isUpdateRequestOpen ? (
              <form action={formAction} className={styles.form}>
                <label className={styles.field}>
                  <span className={styles.label}>학원명</span>
                  <input
                    name="academyName"
                    type="text"
                    defaultValue={organization.name}
                    minLength={2}
                    maxLength={50}
                    required
                    disabled={isPending}
                    className={styles.input}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>대표자명</span>
                  <input
                    name="representativeName"
                    type="text"
                    defaultValue={organization.representativeName ?? ""}
                    minLength={2}
                    maxLength={40}
                    required
                    disabled={isPending}
                    className={styles.input}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>사업자등록번호</span>
                  <input
                    name="businessRegistrationNumber"
                    type="text"
                    defaultValue={organization.businessRegistrationNumber ?? ""}
                    maxLength={20}
                    required
                    disabled={isPending}
                    className={styles.input}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>학원 대표 전화번호</span>
                  <input
                    name="academyPhone"
                    type="tel"
                    defaultValue={organization.academyPhone ?? organization.organizationPhone ?? ""}
                    maxLength={20}
                    required
                    disabled={isPending}
                    className={styles.input}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>담당자 전화번호</span>
                  <input
                    name="contactPhone"
                    type="tel"
                    defaultValue={organization.contactPhone ?? ""}
                    maxLength={20}
                    required
                    disabled={isPending}
                    className={styles.input}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>우편번호</span>
                  <input
                    name="postalCode"
                    type="text"
                    defaultValue={organization.postalCode ?? ""}
                    maxLength={20}
                    disabled={isPending}
                    className={styles.input}
                  />
                </label>

                <label className={`${styles.field} ${styles.fullWidthField}`}>
                  <span className={styles.label}>기본 주소</span>
                  <input
                    name="addressLine1"
                    type="text"
                    defaultValue={organization.addressLine1 ?? organization.address ?? ""}
                    maxLength={120}
                    required
                    disabled={isPending}
                    className={styles.input}
                  />
                </label>

                <label className={`${styles.field} ${styles.fullWidthField}`}>
                  <span className={styles.label}>상세 주소</span>
                  <input
                    name="addressLine2"
                    type="text"
                    defaultValue={organization.addressLine2 ?? organization.addressDetail ?? ""}
                    maxLength={120}
                    disabled={isPending}
                    className={styles.input}
                  />
                </label>

                <label className={`${styles.field} ${styles.fullWidthField}`}>
                  <span className={styles.label}>사업자등록증 재업로드</span>
                  <input
                    name="businessRegistrationFile"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={isPending}
                    className={`${styles.input} ${styles.fileInput}`}
                  />
                  <p className={styles.fieldHint}>
                    새 이미지를 올리지 않으면 기존 사업자등록증 경로를 유지합니다. JPG, PNG, WEBP만 지원하며 최대
                    5MB까지 업로드할 수 있습니다.
                  </p>
                </label>

                <button type="submit" disabled={isPending} className={styles.submitButton}>
                  {isPending ? "요청 제출 중..." : "정보수정 요청 제출"}
                </button>
              </form>
            ) : (
              <div className={styles.sectionHint}>
                <p className={styles.sectionHintTitle}>현재 정보와 다른 부분이 있나요?</p>
                <p className={styles.sectionHintDescription}>
                  수정하기를 누르면 학원명, 연락처, 주소, 사업자등록증 등을 수정 요청할 수 있어요.
                </p>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  )
}
