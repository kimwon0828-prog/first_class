"use client"

import Link from "next/link"
import { useMemo, useState, type FormEvent } from "react"

import { AdminApprovalNav } from "../_components/admin-approval-nav"
import { ApprovalSubmitButton } from "./approval-submit-button"
import styles from "./academy-approvals.module.css"

type SignupRequestView = {
  requestId: string
  signupEmail: string | null
  organizationName: string
  academyArea: string
  branchName: string | null
  address: string | null
  addressDetail: string | null
  teacherName: string
  teacherPhone: string | null
  organizationPhone: string | null
  status: string
  createdAt: string
  representativeName: string | null
  businessRegistrationNumber: string | null
  businessRegistrationFilePath: string | null
  academyPhone: string | null
  contactPhone: string | null
  postalCode: string | null
  addressLine1: string | null
  addressLine2: string | null
  adminNote: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  businessRegistrationSignedUrl: string | null
  businessRegistrationSignedUrlError: string | null
}

type AcademyApprovalsClientProps = {
  requests: SignupRequestView[]
  actionError: string | null
  listError: string | null
  approveAction: (formData: FormData) => void | Promise<void>
  rejectAction: (formData: FormData) => void | Promise<void>
}

type StatusFilter = "all" | "pending" | "approved" | "rejected"

const formatDateTime = (value: string | null) => {
  if (!value) {
    return null
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value))
}

const toText = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

const buildAddress = (row: SignupRequestView) => {
  const parts = [
    toText(row.addressLine1),
    toText(row.addressLine2),
    toText(row.address),
    toText(row.addressDetail)
  ].filter(Boolean) as string[]

  return parts.length > 0 ? parts.join(" ") : null
}

const getPrimaryContact = (row: SignupRequestView) =>
  toText(row.contactPhone) ??
  toText(row.teacherPhone) ??
  toText(row.academyPhone) ??
  toText(row.organizationPhone)

const getStatusMeta = (status: string) => {
  if (status === "approved") {
    return { label: "승인 완료", className: styles.status_approved }
  }

  if (status === "rejected") {
    return { label: "거절", className: styles.status_rejected }
  }

  return { label: "승인 대기", className: styles.status_pending }
}

const getMetricAccentClass = (key: string) => {
  if (key === "pending") {
    return styles.metricAccentPending
  }

  if (key === "approved") {
    return styles.metricAccentApproved
  }

  if (key === "rejected") {
    return styles.metricAccentRejected
  }

  return styles.metricAccentInfo
}

const getSearchableText = (row: SignupRequestView) =>
  [
    row.organizationName,
    row.branchName,
    row.teacherName,
    row.representativeName,
    row.signupEmail,
    row.academyArea,
    row.contactPhone,
    row.teacherPhone,
    row.academyPhone,
    row.organizationPhone,
    row.addressLine1,
    row.addressLine2,
    row.address,
    row.addressDetail
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

const isPendingStatus = (status: string) => status === "pending"

function ApprovalActions({
  requestId,
  approveAction,
  rejectAction
}: {
  requestId: string
  approveAction: (formData: FormData) => void | Promise<void>
  rejectAction: (formData: FormData) => void | Promise<void>
}) {
  const handleApproveConfirm = (event: FormEvent<HTMLFormElement>) => {
    if (
      !window.confirm(
        "이 학원 계정 신청을 승인할까요?\n승인하면 운영보드 계정과 학원 정보가 생성됩니다."
      )
    ) {
      event.preventDefault()
    }
  }

  const handleRejectConfirm = (event: FormEvent<HTMLFormElement>) => {
    if (
      !window.confirm(
        "이 신청을 거절할까요?\n거절된 신청은 운영보드 계정으로 전환되지 않습니다."
      )
    ) {
      event.preventDefault()
    }
  }

  return (
    <div className={styles.actionGroup}>
      <form action={approveAction} onSubmit={handleApproveConfirm}>
        <input type="hidden" name="requestId" value={requestId} />
        <ApprovalSubmitButton idleLabel="승인" pendingLabel="승인 중" variant="approve" />
      </form>
      <form action={rejectAction} onSubmit={handleRejectConfirm}>
        <input type="hidden" name="requestId" value={requestId} />
        <ApprovalSubmitButton idleLabel="거절" pendingLabel="거절 중" variant="reject" />
      </form>
    </div>
  )
}

export function AcademyApprovalsClient({
  requests,
  actionError,
  listError,
  approveAction,
  rejectAction
}: AcademyApprovalsClientProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [query, setQuery] = useState("")

  const summary = useMemo(() => {
    const todayKey = new Date().toDateString()

    return {
      total: requests.length,
      pending: requests.filter((item) => item.status === "pending").length,
      approved: requests.filter((item) => item.status === "approved").length,
      rejected: requests.filter((item) => item.status === "rejected").length,
      today: requests.filter((item) => new Date(item.createdAt).toDateString() === todayKey).length
    }
  }, [requests])

  const statusTabs = [
    { value: "all" as const, label: "전체", count: summary.total },
    { value: "pending" as const, label: "승인 대기", count: summary.pending },
    { value: "approved" as const, label: "승인 완료", count: summary.approved },
    { value: "rejected" as const, label: "거절", count: summary.rejected }
  ]

  const filteredRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return requests.filter((row) => {
      const matchesStatus = statusFilter === "all" ? true : row.status === statusFilter
      if (!matchesStatus) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      return getSearchableText(row).includes(normalizedQuery)
    })
  }, [query, requests, statusFilter])

  const metricCards = [
    {
      key: "total",
      label: "전체 신청",
      value: summary.total,
      description: "검토 이력을 포함한 전체 신청 수"
    },
    {
      key: "pending",
      label: "승인 대기",
      value: summary.pending,
      description: "검토가 필요한 신청"
    },
    {
      key: "approved",
      label: "승인 완료",
      value: summary.approved,
      description: "운영보드 계정 생성 완료"
    },
    {
      key: "rejected",
      label: "거절",
      value: summary.rejected,
      description: "승인되지 않은 신청"
    },
    {
      key: "today",
      label: "오늘 신청",
      value: summary.today,
      description: "오늘 새로 접수된 신청"
    }
  ] as const

  const emptyTitle =
    requests.length === 0
      ? "학원 계정 신청 내역이 없어요."
      : statusFilter === "pending"
        ? "승인 대기 중인 학원 신청이 없어요."
        : "조건에 맞는 학원 신청이 없어요."

  const emptyDescription =
    requests.length === 0
      ? "새로운 학원 계정 신청이 들어오면 이곳에서 확인할 수 있어요."
      : "필터나 검색어를 조정해서 다시 확인해 주세요."

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <div className={styles.heroContent}>
            <span className={styles.adminBadge}>Admin</span>
            <h1 className={styles.pageTitle}>학원 계정 승인</h1>
            <p className={styles.pageDescription}>
              운영보드 사용을 신청한 학원 계정을 검토하고 승인해요. 승인 대기 상태와 처리 결과를 한 화면에서
              빠르게 확인할 수 있습니다.
            </p>
          </div>
          <div className={styles.heroActions}>
            <Link href="/admin/academy-approvals" prefetch={false} className={styles.buttonSecondary}>
              새로고침
            </Link>
          </div>
        </header>

        <AdminApprovalNav currentPath="/admin/academy-approvals" />

        {actionError ? (
          <section className={styles.alert}>
            <p className={styles.alertTitle}>처리 중 오류가 발생했습니다.</p>
            <p className={styles.alertDescription}>{actionError}</p>
          </section>
        ) : null}

        {listError ? (
          <section className={styles.alert}>
            <p className={styles.alertTitle}>학원 신청 목록을 불러오지 못했습니다.</p>
            <p className={styles.alertDescription}>잠시 후 다시 시도해 주세요.</p>
          </section>
        ) : null}

        <section className={styles.metricGrid} aria-label="승인 관리 요약">
          {metricCards.map((card) => (
            <article key={card.key} className={styles.metricCard}>
              <div className={styles.metricTop}>
                <p className={styles.metricLabel}>{card.label}</p>
                <span className={`${styles.metricAccent} ${getMetricAccentClass(card.key)}`} aria-hidden="true" />
              </div>
              <p className={styles.metricValue}>{card.value}</p>
              <p className={styles.metricDescription}>{card.description}</p>
            </article>
          ))}
        </section>

        <section className={styles.toolbar}>
          <div className={styles.toolbarTop}>
            <div>
              <h2 className={styles.toolbarTitle}>승인 상태별 보기</h2>
              <p className={styles.toolbarDescription}>필요한 상태만 빠르게 골라 검토할 수 있어요.</p>
            </div>
            <span className={styles.toolbarMeta}>현재 {filteredRequests.length}건 표시</span>
          </div>

          <div className={styles.filterRow} role="tablist" aria-label="승인 상태 필터">
            {statusTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                className={`${styles.filterPill} ${statusFilter === tab.value ? styles.filterPillActive : ""}`}
                onClick={() => setStatusFilter(tab.value)}
              >
                <span>{tab.label}</span>
                <span className={styles.filterCount}>{tab.count}</span>
              </button>
            ))}
          </div>

          <div className={styles.searchRow}>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="학원명, 신청자, 이메일 검색..."
              className={styles.searchInput}
            />
            <span className={styles.resultMeta}>지역, 연락처, 지점명까지 함께 검색합니다.</span>
          </div>
        </section>

        {listError ? null : filteredRequests.length === 0 ? (
          <section className={styles.emptyState}>
            <span className={styles.emptyIcon} aria-hidden="true" />
            <p className={styles.emptyTitle}>{emptyTitle}</p>
            <p className={styles.emptyDescription}>{emptyDescription}</p>
          </section>
        ) : (
          <section className={styles.contentCard}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>신청일</th>
                    <th className={styles.th}>학원명</th>
                    <th className={styles.th}>신청자</th>
                    <th className={styles.th}>이메일</th>
                    <th className={styles.th}>연락처</th>
                    <th className={styles.th}>지역</th>
                    <th className={styles.th}>상태</th>
                    <th className={styles.thRight}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((row) => {
                    const statusMeta = getStatusMeta(row.status)
                    const address = buildAddress(row)
                    const createdAt = formatDateTime(row.createdAt)
                    const reviewedAt = formatDateTime(row.reviewedAt)
                    const primaryContact = getPrimaryContact(row)

                    return (
                      <tr key={row.requestId} className={styles.row}>
                        <td className={styles.td}>
                          <p className={styles.primaryText}>{createdAt ?? "일시 미확인"}</p>
                          {reviewedAt ? <p className={styles.secondaryText}>처리 {reviewedAt}</p> : null}
                        </td>
                        <td className={styles.td}>
                          <p className={styles.primaryText}>{row.organizationName}</p>
                          <p className={styles.secondaryText}>
                            {[toText(row.branchName), toText(row.representativeName)].filter(Boolean).join(" · ") ||
                              "지점/대표자 정보 없음"}
                          </p>
                          <details className={styles.details}>
                            <summary className={styles.detailsSummary}>추가 정보 보기</summary>
                            <div className={styles.detailsBody}>
                              <div className={styles.detailGrid}>
                                {address ? (
                                  <div className={styles.detailItem}>
                                    <span className={styles.detailLabel}>주소</span>
                                    <span className={styles.detailValue}>{address}</span>
                                  </div>
                                ) : null}
                                {toText(row.businessRegistrationNumber) ? (
                                  <div className={styles.detailItem}>
                                    <span className={styles.detailLabel}>사업자등록번호</span>
                                    <span className={styles.detailValue}>{row.businessRegistrationNumber}</span>
                                  </div>
                                ) : null}
                                {toText(row.adminNote) ? (
                                  <div className={styles.detailItem}>
                                    <span className={styles.detailLabel}>관리자 메모</span>
                                    <span className={styles.detailValue}>{row.adminNote}</span>
                                  </div>
                                ) : null}
                                {reviewedAt ? (
                                  <div className={styles.detailItem}>
                                    <span className={styles.detailLabel}>처리 시각</span>
                                    <span className={styles.detailValue}>{reviewedAt}</span>
                                  </div>
                                ) : null}
                              </div>
                              {row.businessRegistrationSignedUrl ? (
                                <Link
                                  href={row.businessRegistrationSignedUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  prefetch={false}
                                  className={styles.documentLink}
                                >
                                  사업자등록증 보기
                                </Link>
                              ) : row.businessRegistrationFilePath ? (
                                <p className={styles.secondaryText}>사업자등록증 링크를 생성하지 못했습니다.</p>
                              ) : null}
                            </div>
                          </details>
                        </td>
                        <td className={styles.td}>
                          <p className={styles.primaryText}>{row.teacherName}</p>
                          {toText(row.contactPhone) || toText(row.teacherPhone) ? (
                            <p className={styles.secondaryText}>{primaryContact}</p>
                          ) : null}
                        </td>
                        <td className={styles.td}>
                          {toText(row.signupEmail) ? (
                            <p className={styles.primaryText}>{row.signupEmail}</p>
                          ) : (
                            <p className={`${styles.primaryText} ${styles.mutedText}`}>이메일 없음</p>
                          )}
                        </td>
                        <td className={styles.td}>
                          {primaryContact ? (
                            <p className={styles.primaryText}>{primaryContact}</p>
                          ) : (
                            <p className={`${styles.primaryText} ${styles.mutedText}`}>연락처 없음</p>
                          )}
                        </td>
                        <td className={styles.td}>
                          <p className={styles.primaryText}>{row.academyArea}</p>
                          {toText(row.branchName) ? <p className={styles.secondaryText}>{row.branchName}</p> : null}
                        </td>
                        <td className={styles.td}>
                          <span className={`${styles.statusBadge} ${statusMeta.className}`}>{statusMeta.label}</span>
                        </td>
                        <td className={styles.tdRight}>
                          {isPendingStatus(row.status) ? (
                            <ApprovalActions
                              requestId={row.requestId}
                              approveAction={approveAction}
                              rejectAction={rejectAction}
                            />
                          ) : (
                            <span className={styles.doneText}>처리 완료</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className={styles.mobileList}>
              {filteredRequests.map((row) => {
                const statusMeta = getStatusMeta(row.status)
                const createdAt = formatDateTime(row.createdAt)
                const primaryContact = getPrimaryContact(row)
                const address = buildAddress(row)

                return (
                  <article key={row.requestId} className={styles.mobileCard}>
                    <div className={styles.mobileTop}>
                      <div>
                        <p className={styles.primaryText}>{row.organizationName}</p>
                        <p className={styles.secondaryText}>{row.academyArea}</p>
                      </div>
                      <span className={`${styles.statusBadge} ${statusMeta.className}`}>{statusMeta.label}</span>
                    </div>

                    <div className={styles.mobileMeta}>
                      <div className={styles.mobileMetaRow}>
                        <span className={styles.mobileMetaLabel}>신청자</span>
                        <span className={styles.mobileMetaValue}>{row.teacherName}</span>
                      </div>
                      {toText(row.signupEmail) ? (
                        <div className={styles.mobileMetaRow}>
                          <span className={styles.mobileMetaLabel}>이메일</span>
                          <span className={styles.mobileMetaValue}>{row.signupEmail}</span>
                        </div>
                      ) : null}
                      {primaryContact ? (
                        <div className={styles.mobileMetaRow}>
                          <span className={styles.mobileMetaLabel}>연락처</span>
                          <span className={styles.mobileMetaValue}>{primaryContact}</span>
                        </div>
                      ) : null}
                      {createdAt ? (
                        <div className={styles.mobileMetaRow}>
                          <span className={styles.mobileMetaLabel}>신청일</span>
                          <span className={styles.mobileMetaValue}>{createdAt}</span>
                        </div>
                      ) : null}
                      {address ? (
                        <div className={styles.mobileMetaRow}>
                          <span className={styles.mobileMetaLabel}>주소</span>
                          <span className={styles.mobileMetaValue}>{address}</span>
                        </div>
                      ) : null}
                    </div>

                    {row.businessRegistrationSignedUrl ? (
                      <Link
                        href={row.businessRegistrationSignedUrl}
                        target="_blank"
                        rel="noreferrer"
                        prefetch={false}
                        className={styles.documentLink}
                      >
                        사업자등록증 보기
                      </Link>
                    ) : null}

                    {isPendingStatus(row.status) ? (
                      <div className={styles.mobileActions}>
                        <form action={approveAction} onSubmit={(event) => {
                          if (
                            !window.confirm(
                              "이 학원 계정 신청을 승인할까요?\n승인하면 운영보드 계정과 학원 정보가 생성됩니다."
                            )
                          ) {
                            event.preventDefault()
                          }
                        }}>
                          <input type="hidden" name="requestId" value={row.requestId} />
                          <ApprovalSubmitButton idleLabel="승인" pendingLabel="승인 중" variant="approve" />
                        </form>
                        <form action={rejectAction} onSubmit={(event) => {
                          if (
                            !window.confirm(
                              "이 신청을 거절할까요?\n거절된 신청은 운영보드 계정으로 전환되지 않습니다."
                            )
                          ) {
                            event.preventDefault()
                          }
                        }}>
                          <input type="hidden" name="requestId" value={row.requestId} />
                          <ApprovalSubmitButton idleLabel="거절" pendingLabel="거절 중" variant="reject" />
                        </form>
                      </div>
                    ) : (
                      <span className={styles.doneText}>처리 완료</span>
                    )}
                  </article>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
