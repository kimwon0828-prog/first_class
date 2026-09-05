"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState, useTransition } from "react"

import {
  commitReservationImportAction,
  type CommitReservationImportState
} from "@/features/reservation-import/actions/commit-reservation-import"
import {
  previewReservationImportAction,
  type PreviewReservationImportState
} from "@/features/reservation-import/actions/preview-reservation-import"
import { RESERVATION_IMPORT_MAX_ROWS } from "@/features/reservation-import/lib/reservation-import-contract"
import type {
  ReservationImportPreviewRow,
  ReservationImportSeverity
} from "@/features/reservation-import/lib/reservation-import-preview"

import styles from "./reservation-import-workspace.module.css"

// 파일을 고르자마자 저장하지 않는다. 항상 검증 → 확인 → 가져오기 순서다.
//
// 미리보기가 수백 행이 될 수 있어 modal 이 아니라 전체 화면으로 만든다.
// 사이드바에는 항목을 추가하지 않고 상담·등록 화면의 버튼으로만 들어온다.

const SEVERITY_BADGE: Record<ReservationImportSeverity, { label: string; className: string }> = {
  VALID: { label: "정상", className: styles.badgeValid },
  WARNING: { label: "확인 필요", className: styles.badgeWarning },
  ERROR: { label: "오류", className: styles.badgeError }
}

const initialPreviewState: PreviewReservationImportState = {
  status: "idle",
  message: "",
  preview: null
}

const initialCommitState: CommitReservationImportState = { status: "idle", message: "" }

type ReservationImportWorkspaceProps = {
  classCount: number
  teacherCount: number
  contextError: string | null
}

export const ReservationImportWorkspace = ({
  classCount,
  teacherCount,
  contextError
}: ReservationImportWorkspaceProps) => {
  const router = useRouter()
  const [previewState, previewFormAction, isPreviewing] = useActionState(
    previewReservationImportAction,
    initialPreviewState
  )
  const [rows, setRows] = useState<ReservationImportPreviewRow[]>([])
  const [commitState, setCommitState] = useState<CommitReservationImportState>(initialCommitState)
  const [isImporting, startImport] = useTransition()

  useEffect(() => {
    if (previewState.status === "success" && previewState.preview) {
      setRows(previewState.preview.rows)
      setCommitState(initialCommitState)
    }
  }, [previewState])

  const preview = previewState.preview ?? null
  const selectedCount = rows.filter((row) => row.selected && row.write).length
  const isCompleted = commitState.status === "success"

  const toggleRow = (rowNumber: number) => {
    setRows((current) =>
      current.map((row) =>
        row.rowNumber === rowNumber && row.severity !== "ERROR"
          ? { ...row, selected: !row.selected }
          : row
      )
    )
  }

  const handleImport = () => {
    if (!preview || selectedCount === 0 || isCompleted) {
      return
    }

    startImport(async () => {
      const result = await commitReservationImportAction(preview.batchId, rows)
      setCommitState(result)
      if (result.status === "success") {
        router.refresh()
      }
    })
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/studio/cases" className={styles.backLink}>
          ← 상담·등록으로 돌아가기
        </Link>
        <h1 className={styles.title}>기존 예약 가져오기</h1>
        <p className={styles.subtitle}>
          엑셀로 관리하던 체험 예약을 첫수업으로 옮깁니다. 가져오기 전에 내용을 먼저 확인합니다.
        </p>
      </header>

      <section className={styles.step} aria-labelledby="import-step-1">
        <div className={styles.stepHead}>
          <span className={styles.stepIndex}>1</span>
          <h2 id="import-step-1" className={styles.stepTitle}>
            양식 준비
          </h2>
        </div>
        <p className={styles.stepDescription}>
          우리 학원 수업 {classCount}개와 선생님 {teacherCount}명이 선택값으로 들어간 양식입니다.
          한 번에 최대 {RESERVATION_IMPORT_MAX_ROWS}행까지 가져올 수 있습니다.
        </p>
        <div className={styles.actionRow}>
          <a href="/studio/cases/import/template" className={styles.secondaryButton} download>
            Excel 양식 다운로드
          </a>
        </div>
        {contextError ? <p className={`${styles.message} ${styles.messageError}`}>{contextError}</p> : null}
      </section>

      <section className={styles.step} aria-labelledby="import-step-2">
        <div className={styles.stepHead}>
          <span className={styles.stepIndex}>2</span>
          <h2 id="import-step-2" className={styles.stepTitle}>
            작성한 파일 업로드
          </h2>
        </div>
        <p className={styles.stepDescription}>
          파일을 올려도 바로 저장되지 않습니다. 내용을 확인한 뒤 마지막에 가져옵니다.
        </p>
        <form action={previewFormAction} className={styles.actionRow}>
          <input
            type="file"
            name="file"
            accept=".xlsx"
            className={styles.fileInput}
            aria-label="예약 엑셀 파일"
            required
          />
          <button type="submit" className={styles.secondaryButton} disabled={isPreviewing}>
            {isPreviewing ? "확인 중..." : "파일 확인"}
          </button>
        </form>
        {previewState.status === "error" ? (
          <p className={`${styles.message} ${styles.messageError}`}>{previewState.message}</p>
        ) : null}
      </section>

      {preview ? (
        <section className={styles.step} aria-labelledby="import-step-3">
          <div className={styles.stepHead}>
            <span className={styles.stepIndex}>3</span>
            <h2 id="import-step-3" className={styles.stepTitle}>
              가져올 내용 확인
            </h2>
          </div>

          <div className={styles.summaryRow}>
            <span className={styles.summaryItem}>
              총 <strong className={styles.summaryValue}>{preview.totalRows}</strong>건
            </span>
            <span className={styles.summaryItem}>
              정상 <strong className={styles.summaryValue}>{preview.summary.valid}</strong>건
            </span>
            <span className={styles.summaryItem}>
              확인 필요 <strong className={styles.summaryValue}>{preview.summary.warning}</strong>건
            </span>
            <span className={styles.summaryItem}>
              오류 <strong className={styles.summaryValue}>{preview.summary.error}</strong>건
            </span>
          </div>

          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">가져오기</th>
                  <th scope="col">행</th>
                  <th scope="col">상태</th>
                  <th scope="col">학생</th>
                  <th scope="col">학년</th>
                  <th scope="col">연락처</th>
                  <th scope="col">수업</th>
                  <th scope="col">진행 상태</th>
                  <th scope="col">일정</th>
                  <th scope="col">확인할 내용</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.rowNumber}
                    className={row.severity === "ERROR" ? styles.rowError : undefined}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={row.selected && row.severity !== "ERROR"}
                        disabled={row.severity === "ERROR" || isCompleted}
                        onChange={() => toggleRow(row.rowNumber)}
                        aria-label={`${row.rowNumber}행 가져오기`}
                      />
                    </td>
                    <td>{row.rowNumber}</td>
                    <td>
                      <span className={`${styles.badge} ${SEVERITY_BADGE[row.severity].className}`}>
                        {SEVERITY_BADGE[row.severity].label}
                      </span>
                    </td>
                    <td>{row.studentName || "-"}</td>
                    <td>{row.gradeLabel || "-"}</td>
                    <td>{row.guardianPhoneMasked ?? "-"}</td>
                    <td>{row.className || "-"}</td>
                    <td>{row.statusLabel || "-"}</td>
                    <td>{row.scheduleLabel ?? "-"}</td>
                    <td className={styles.messageCell}>
                      {row.messages.length > 0
                        ? row.messages.map((item) => item.text).join(" ")
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.footerRow}>
            <p className={styles.footerHint}>
              오류가 있는 행은 제외하고 가져옵니다. 확인 필요 행은 체크를 해제할 수 있습니다.
            </p>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleImport}
              disabled={selectedCount === 0 || isImporting || isCompleted}
            >
              {isImporting ? "가져오는 중..." : `${selectedCount}건 가져오기`}
            </button>
          </div>

          {commitState.status === "error" ? (
            <p className={`${styles.message} ${styles.messageError}`}>{commitState.message}</p>
          ) : null}
          {commitState.status === "success" ? (
            <p className={`${styles.message} ${styles.messageSuccess}`}>{commitState.message}</p>
          ) : null}
        </section>
      ) : null}

      {isCompleted ? (
        <section className={styles.resultCard}>
          <div className={styles.actionRow}>
            <Link href="/studio/cases" className={styles.primaryButton}>
              상담·등록 목록에서 확인
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  )
}
