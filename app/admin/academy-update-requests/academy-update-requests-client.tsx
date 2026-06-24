"use client"

import Link from "next/link"
import { useMemo, useState, type FormEvent } from "react"

import type { AcademyUpdateRequestView } from "@/features/admin/queries/get-academy-update-requests"
import { ReviewSubmitButton } from "./review-submit-button"
import styles from "./academy-update-requests.module.css"

type AcademyUpdateRequestsClientProps = {
  requests: AcademyUpdateRequestView[]
  actionError: string | null
  listError: string | null
  approveAction: (formData: FormData) => void | Promise<void>
  rejectAction: (formData: FormData) => void | Promise<void>
}

const formatDateTime = (value: string | null) => {
  if (!value) {
    return null
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value))
}

const toText = (value: string | null | undefined, fallback?: string) => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallback ?? null
}

const comparisonRows = (request: AcademyUpdateRequestView) => [
  {
    label: "학원명",
    current: request.currentSnapshot.academyName,
    requested: request.requestedSnapshot.academyName
  },
  {
    label: "대표자명",
    current: request.currentSnapshot.representativeName,
    requested: request.requestedSnapshot.representativeName
  },
  {
    label: "사업자등록번호",
    current: request.currentSnapshot.businessRegistrationNumber,
    requested: request.requestedSnapshot.businessRegistrationNumber
  },
  {
    label: "학원 대표 전화번호",
    current: request.currentSnapshot.academyPhone ?? request.currentSnapshot.organizationPhone,
    requested: request.requestedSnapshot.academyPhone ?? request.requestedSnapshot.organizationPhone
  },
  {
    label: "담당자 전화번호",
    current: request.currentSnapshot.contactPhone ?? request.currentSnapshot.teacherPhone,
    requested: request.requestedSnapshot.contactPhone ?? request.requestedSnapshot.teacherPhone
  },
  {
    label: "우편번호",
    current: request.currentSnapshot.postalCode,
    requested: request.requestedSnapshot.postalCode
  },
  {
    label: "기본 주소",
    current: request.currentSnapshot.addressLine1 ?? request.currentSnapshot.address,
    requested: request.requestedSnapshot.addressLine1 ?? request.requestedSnapshot.address
  },
  {
    label: "상세 주소",
    current: request.currentSnapshot.addressLine2 ?? request.currentSnapshot.addressDetail,
    requested: request.requestedSnapshot.addressLine2 ?? request.requestedSnapshot.addressDetail
  }
]

function ReviewActions({
  request,
  approveAction,
  rejectAction
}: {
  request: AcademyUpdateRequestView
  approveAction: (formData: FormData) => void | Promise<void>
  rejectAction: (formData: FormData) => void | Promise<void>
}) {
  const [adminNote, setAdminNote] = useState(request.adminNote ?? "")

  const handleApproveConfirm = (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm("이 정보수정 요청을 승인할까요?\n승인하면 organizations에 요청값이 반영됩니다.")) {
      event.preventDefault()
    }
  }

  const handleRejectConfirm = (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm("이 정보수정 요청을 거절할까요?\n거절하면 organizations는 변경되지 않습니다.")) {
      event.preventDefault()
    }
  }

  return (
    <div className={styles.reviewPanel}>
      <label className={styles.noteField}>
        <span className={styles.noteLabel}>관리자 메모</span>
        <textarea
          value={adminNote}
          onChange={(event) => setAdminNote(event.target.value)}
          placeholder="승인 또는 거절 사유가 있으면 남겨 주세요."
          className={styles.noteInput}
          rows={4}
        />
      </label>

      <div className={styles.actionGroup}>
        <form action={approveAction} onSubmit={handleApproveConfirm}>
          <input type="hidden" name="requestId" value={request.requestId} />
          <input type="hidden" name="adminNote" value={adminNote} />
          <ReviewSubmitButton idleLabel="승인" pendingLabel="승인 중" variant="approve" />
        </form>
        <form action={rejectAction} onSubmit={handleRejectConfirm}>
          <input type="hidden" name="requestId" value={request.requestId} />
          <input type="hidden" name="adminNote" value={adminNote} />
          <ReviewSubmitButton idleLabel="거절" pendingLabel="거절 중" variant="reject" />
        </form>
      </div>
    </div>
  )
}

export function AcademyUpdateRequestsClient({
  requests,
  actionError,
  listError,
  approveAction,
  rejectAction
}: AcademyUpdateRequestsClientProps) {
  const [query, setQuery] = useState("")

  const filteredRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return requests.filter((request) => {
      if (!normalizedQuery) {
        return true
      }

      return [
        request.currentSnapshot.academyName,
        request.currentSnapshot.branchName,
        request.currentSnapshot.academyArea,
        request.requesterName,
        request.requestedSnapshot.representativeName
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    })
  }, [query, requests])

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <div className={styles.heroContent}>
            <span className={styles.adminBadge}>Admin</span>
            <h1 className={styles.pageTitle}>학원 정보수정 요청 검토</h1>
            <p className={styles.pageDescription}>
              학원이 제출한 정보수정 요청을 검토하고 승인 또는 거절합니다. 사업자등록증은 private bucket의 signed
              URL로만 확인합니다.
            </p>
          </div>
          <div className={styles.heroActions}>
            <Link href="/admin/academy-update-requests" prefetch={false} className={styles.buttonSecondary}>
              새로고침
            </Link>
            <Link href="/admin/academy-approvals" prefetch={false} className={styles.buttonGhost}>
              가입 승인 화면
            </Link>
          </div>
        </header>

        {actionError ? (
          <section className={styles.alert}>
            <p className={styles.alertTitle}>처리 중 오류가 발생했습니다.</p>
            <p className={styles.alertDescription}>{actionError}</p>
          </section>
        ) : null}

        {listError ? (
          <section className={styles.alert}>
            <p className={styles.alertTitle}>요청 목록을 불러오지 못했습니다.</p>
            <p className={styles.alertDescription}>{listError}</p>
          </section>
        ) : null}

        <section className={styles.toolbar}>
          <div>
            <h2 className={styles.toolbarTitle}>검토 대기 요청</h2>
            <p className={styles.toolbarDescription}>현재 pending 상태인 학원 정보수정 요청만 보여줍니다.</p>
          </div>
          <div className={styles.searchRow}>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="학원명, 학원가, 요청자 검색"
              className={styles.searchInput}
            />
            <span className={styles.toolbarMeta}>총 {filteredRequests.length}건</span>
          </div>
        </section>

        {listError ? null : filteredRequests.length === 0 ? (
          <section className={styles.emptyState}>
            <p className={styles.emptyTitle}>검토 대기 중인 정보수정 요청이 없습니다.</p>
            <p className={styles.emptyDescription}>새 요청이 접수되면 이 화면에서 바로 확인할 수 있습니다.</p>
          </section>
        ) : (
          <section className={styles.requestList}>
            {filteredRequests.map((request) => (
              <article key={request.requestId} className={styles.requestCard}>
                <div className={styles.requestHeader}>
                  <div>
                    <p className={styles.requestTitle}>
                      {toText(request.currentSnapshot.academyName) ?? "학원명 없음"}
                    </p>
                    <p className={styles.requestSubtitle}>
                      {[toText(request.currentSnapshot.academyArea), toText(request.currentSnapshot.branchName)]
                        .filter(Boolean)
                        .join(" · ") || "학원가/지점 정보 없음"}
                    </p>
                  </div>
                  <div className={styles.requestMeta}>
                    <span className={styles.statusBadge}>검토 대기</span>
                    <span className={styles.metaText}>요청일 {formatDateTime(request.createdAt) ?? "확인 불가"}</span>
                    <span className={styles.metaText}>요청자 {toText(request.requesterName, "이름 없음")}</span>
                  </div>
                </div>

                <div className={styles.compareGrid}>
                  {comparisonRows(request).map((row) => (
                    <div key={row.label} className={styles.compareItem}>
                      <p className={styles.compareLabel}>{row.label}</p>
                      <div className={styles.compareBox}>
                        <p className={styles.compareCaption}>현재값</p>
                        <p className={styles.compareValue}>{toText(row.current, "미입력")}</p>
                      </div>
                      <div className={`${styles.compareBox} ${styles.compareBoxRequested}`}>
                        <p className={styles.compareCaption}>요청값</p>
                        <p className={styles.compareValue}>{toText(row.requested, "미입력")}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <section className={styles.documentSection}>
                  <div>
                    <p className={styles.documentTitle}>사업자등록증</p>
                    <p className={styles.documentDescription}>
                      저장 경로는 object path로 유지되며, 화면에서는 signed URL로만 확인합니다.
                    </p>
                    <p className={styles.documentPath}>
                      {toText(request.requestedBusinessRegistrationFilePath, "첨부된 사업자등록증 없음")}
                    </p>
                  </div>
                  <div className={styles.documentActions}>
                    {request.requestedBusinessRegistrationSignedUrl ? (
                      <Link
                        href={request.requestedBusinessRegistrationSignedUrl}
                        target="_blank"
                        rel="noreferrer"
                        prefetch={false}
                        className={styles.documentLink}
                      >
                        사업자등록증 보기
                      </Link>
                    ) : (
                      <p className={styles.documentFallback}>첨부된 사업자등록증 없음</p>
                    )}
                    {request.requestedBusinessRegistrationSignedUrlError ? (
                      <p className={styles.documentError}>{request.requestedBusinessRegistrationSignedUrlError}</p>
                    ) : null}
                  </div>
                </section>

                <ReviewActions request={request} approveAction={approveAction} rejectAction={rejectAction} />
              </article>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
