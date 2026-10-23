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
import type { StudioStatusTone } from "@/features/studio/lib/application-status-labels"
import { useStudioNavigationPathFactory } from "@/features/studio/ui/studio-navigation-provider"
import { V2Button, v2ButtonClassName } from "@/features/studio/ui/v2/v2-button"
import { V2BackIcon, V2CheckIcon, V2DownloadIcon, V2InfoIcon } from "@/features/studio/ui/v2/v2-icons"
import { V2StatusBadge } from "@/features/studio/ui/v2/v2-status-badge"

import styles from "./reservation-import-workspace.module.css"

// 파일을 고르자마자 저장하지 않는다. 항상 검증 → 확인 → 가져오기 순서다.
//
// 미리보기가 수백 행이 될 수 있어 modal 이 아니라 전체 화면으로 만든다.
// 사이드바에는 항목을 추가하지 않고 신청 화면의 버튼으로만 들어온다.

const SEVERITY_BADGE: Record<ReservationImportSeverity, { label: string; tone: StudioStatusTone }> = {
  VALID: { label: "정상", tone: "green" },
  WARNING: { label: "확인 필요", tone: "amber" },
  ERROR: { label: "오류", tone: "red" }
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

const STEPS = ["파일 올리기", "확인하기", "가져오기"] as const

export const ReservationImportWorkspace = ({
  classCount,
  teacherCount,
  contextError
}: ReservationImportWorkspaceProps) => {
  const studioPath = useStudioNavigationPathFactory()
  const router = useRouter()
  const [previewState, previewFormAction, isPreviewing] = useActionState(
    previewReservationImportAction,
    initialPreviewState
  )
  const [rows, setRows] = useState<ReservationImportPreviewRow[]>([])
  const [commitState, setCommitState] = useState<CommitReservationImportState>(initialCommitState)
  const [isImporting, startImport] = useTransition()
  const [pickedFileName, setPickedFileName] = useState<string | null>(null)

  useEffect(() => {
    if (previewState.status === "success" && previewState.preview) {
      setRows(previewState.preview.rows)
      setCommitState(initialCommitState)
    }
  }, [previewState])

  const preview = previewState.preview ?? null
  const selectedCount = rows.filter((row) => row.selected && row.write).length
  const isCompleted = commitState.status === "success"
  // 단계 표시: 확인 전 → 1, 확인 표가 나오면 2, 가져오기를 마치면 3.
  const currentStep = isCompleted ? 3 : preview ? 2 : 1

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
      <Link href={studioPath("/studio/cases")} className={styles.backLink}>
        <V2BackIcon size={18} />
        신청
      </Link>

      <header className={styles.header}>
        <h1 className={styles.title}>기존 예약 가져오기</h1>
        <p className={styles.description}>
          엑셀로 관리하던 체험 예약을 첫수업으로 옮겨요. 가져오기 전에 내용을 먼저 확인해요.
        </p>
      </header>

      <p className={styles.notice}>
        <V2InfoIcon size={18} />
        가져온 신청은 알림이 가지 않고, 학부모 앱 계정이 없어 리포트를 보낼 수 없어요.
      </p>

      <ol className={styles.steps} aria-label="가져오기 단계">
        {STEPS.map((label, index) => {
          const step = index + 1
          const state = step < currentStep ? "done" : step === currentStep ? "current" : "waiting"
          return (
            <li key={label} className={styles.step} data-state={state} aria-current={state === "current" ? "step" : undefined}>
              {index > 0 ? <span className={styles.stepLine} aria-hidden="true" /> : null}
              <span className={styles.stepDot} aria-hidden="true">
                {state === "done" ? <V2CheckIcon size={14} /> : step}
              </span>
              <span className={styles.stepLabel}>{label}</span>
            </li>
          )
        })}
      </ol>

      <section className={styles.fileBox} aria-labelledby="import-file-title">
        <V2DownloadIcon size={22} className={styles.fileIcon} />
        <div className={styles.fileText}>
          <h2 id="import-file-title">{preview?.fileName ?? pickedFileName ?? "양식에 맞춰 작성한 파일을 올려 주세요"}</h2>
          <p>
            {preview
              ? `${preview.totalRows}건 · 정상 ${preview.summary.valid}건, 확인 필요 ${preview.summary.warning}건, 오류 ${preview.summary.error}건`
              : `우리 학원 수업 ${classCount}개와 선생님 ${teacherCount}명이 선택값으로 들어간 양식이에요. 한 번에 최대 ${RESERVATION_IMPORT_MAX_ROWS}행까지 가져올 수 있어요.`}
          </p>
        </div>
        <a href={studioPath("/studio/cases/import/template")} className={v2ButtonClassName({ variant: "ghost", size: "sm" })} download>
          <V2DownloadIcon size={16} />
          양식 받기
        </a>
      </section>
      {contextError ? <p className={styles.messageError} role="alert">{contextError}</p> : null}

      {!isCompleted ? (
        <form action={previewFormAction} className={styles.uploadRow}>
          <label className={styles.fileField}>
            <span className={styles.fileFieldLabel}>{preview ? "다른 파일" : "파일 고르기"}</span>
            <input
              type="file"
              name="file"
              accept=".xlsx"
              aria-label="예약 엑셀 파일"
              required
              onChange={(event) => setPickedFileName(event.target.files?.[0]?.name ?? null)}
            />
          </label>
          <span className={styles.fileName}>{pickedFileName ?? ".xlsx 파일만 올릴 수 있어요."}</span>
          <V2Button type="submit" variant="outline" size="sm" disabled={isPreviewing}>
            {isPreviewing ? "확인 중..." : "파일 확인"}
          </V2Button>
        </form>
      ) : null}
      <p className={styles.hint}>파일을 올려도 바로 저장되지 않아요. 내용을 확인한 뒤 마지막에 가져와요.</p>
      {previewState.status === "error" ? <p className={styles.messageError} role="alert">{previewState.message}</p> : null}

      {preview ? (
        <section className={styles.review} aria-labelledby="import-review-title">
          <h2 id="import-review-title" className={styles.srOnly}>가져올 내용 확인</h2>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col"><span className={styles.srOnly}>가져오기</span></th>
                  <th scope="col">행</th>
                  <th scope="col">학생</th>
                  <th scope="col">학년</th>
                  <th scope="col">보호자 연락처</th>
                  <th scope="col">수업</th>
                  <th scope="col">진행 상태</th>
                  <th scope="col">체험 일시</th>
                  <th scope="col">확인</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.rowNumber}
                    className={row.severity === "ERROR" ? styles.rowError : row.severity === "WARNING" ? styles.rowWarning : undefined}
                  >
                    <td>
                      <span className={styles.checkbox}>
                        <input
                          type="checkbox"
                          checked={row.selected && row.severity !== "ERROR"}
                          disabled={row.severity === "ERROR" || isCompleted}
                          onChange={() => toggleRow(row.rowNumber)}
                          aria-label={`${row.rowNumber}행 가져오기`}
                        />
                        <V2CheckIcon size={14} className={styles.checkMark} />
                      </span>
                    </td>
                    <td className={styles.muted}>{row.rowNumber}</td>
                    <td>{row.studentName || "-"}</td>
                    <td>{row.gradeLabel || "-"}</td>
                    <td>{row.guardianPhoneMasked ?? "-"}</td>
                    <td>{row.className || "-"}</td>
                    <td>{row.statusLabel || "-"}</td>
                    <td>{row.scheduleLabel ?? "-"}</td>
                    <td className={styles.checkCell}>
                      <V2StatusBadge tone={SEVERITY_BADGE[row.severity].tone}>{SEVERITY_BADGE[row.severity].label}</V2StatusBadge>
                      {row.messages.length > 0 ? <span className={styles.rowMessage}>{row.messages.map((item) => item.text).join(" ")}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.footer}>
            <p className={styles.hint}>오류가 있는 행은 빼고 가져와요. 확인 필요 행은 체크를 풀 수 있어요.</p>
            {!isCompleted ? (
              <Link href={studioPath("/studio/cases")} className={v2ButtonClassName({ variant: "outline", size: "lg" })}>
                취소
              </Link>
            ) : null}
            <V2Button size="lg" onClick={handleImport} disabled={selectedCount === 0 || isImporting || isCompleted}>
              {isImporting ? "가져오는 중..." : `${selectedCount}건 가져오기`}
            </V2Button>
          </div>

          {commitState.status === "error" ? <p className={styles.messageError} role="alert">{commitState.message}</p> : null}
          {commitState.status === "success" ? <p className={styles.messageSuccess} role="status">{commitState.message}</p> : null}
        </section>
      ) : null}

      {isCompleted ? (
        <Link href={studioPath("/studio/cases")} className={v2ButtonClassName({ variant: "outline", size: "md" })}>
          신청 목록에서 확인
        </Link>
      ) : null}
    </div>
  )
}
