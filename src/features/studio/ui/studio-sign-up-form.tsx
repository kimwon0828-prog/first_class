"use client"

import Link from "next/link"
import { useActionState } from "react"

import { academyAreaOptions } from "@/shared/config/academy-areas"
import {
  studioSignUpAction,
  type StudioSignUpActionState
} from "@/features/studio/actions/studio-sign-up"
import styles from "@/features/studio/ui/studio-sign-up-form.module.css"

const initialState: StudioSignUpActionState = {
  status: "idle",
  message: ""
}

export const StudioSignUpForm = () => {
  const [state, formAction, isPending] = useActionState(studioSignUpAction, initialState)

  return (
    <form action={formAction} className={styles.form} encType="multipart/form-data">
      {state.status === "success" ? (
        <div className={styles.successCard} role="status" aria-live="polite">
          <div className={styles.successIcon} aria-hidden="true" />
          <div className={styles.successBody}>
            <p className={styles.successTitle}>학원 계정 신청이 접수되었습니다.</p>
            <p className={styles.successDescription}>
              관리자 승인 후{" "}
              <Link href="/studio/sign-in" className={styles.inlineLink}>
                운영보드 로그인
              </Link>
              이 가능합니다.
            </p>
          </div>
        </div>
      ) : null}

      <label className={styles.field}>
        <span className={styles.label}>학원명</span>
        <input
          name="organizationName"
          type="text"
          required
          minLength={2}
          maxLength={50}
          disabled={isPending}
          className={styles.input}
          placeholder="예: 첫수업 강남학원"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>학원가</span>
        <select name="academyArea" required disabled={isPending} className={styles.input} defaultValue="">
          <option value="" disabled>
            학원가를 선택해 주세요
          </option>
          {academyAreaOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>지점명 (선택)</span>
        <input
          name="branchName"
          type="text"
          maxLength={30}
          disabled={isPending}
          className={styles.input}
          placeholder="예: 강남점"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>대표자명</span>
        <input
          name="representativeName"
          type="text"
          required
          minLength={2}
          maxLength={40}
          disabled={isPending}
          className={styles.input}
          placeholder="예: 홍길동"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>사업자등록번호</span>
        <input
          name="businessRegistrationNumber"
          type="text"
          required
          maxLength={20}
          disabled={isPending}
          className={styles.input}
          placeholder="예: 123-45-67890"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>학원 대표 전화번호</span>
        <input
          name="academyPhone"
          type="tel"
          required
          maxLength={20}
          disabled={isPending}
          className={styles.input}
          placeholder="예: 02-1234-5678"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>담당자 전화번호</span>
        <input
          name="contactPhone"
          type="tel"
          required
          maxLength={20}
          disabled={isPending}
          className={styles.input}
          placeholder="예: 010-1234-5678"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>우편번호 (선택)</span>
        <input
          name="postalCode"
          type="text"
          maxLength={20}
          disabled={isPending}
          className={styles.input}
          placeholder="예: 12345"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>기본 주소</span>
        <input
          name="addressLine1"
          type="text"
          required
          maxLength={120}
          disabled={isPending}
          className={styles.input}
          placeholder="예: 경기도 고양시 일산서구 ..."
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>상세 주소 (선택)</span>
        <input
          name="addressLine2"
          type="text"
          maxLength={120}
          disabled={isPending}
          className={styles.input}
          placeholder="예: 5층 501호"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>사업자등록증 이미지</span>
        <input
          name="businessRegistrationFile"
          type="file"
          required
          accept="image/jpeg,image/png,image/webp"
          disabled={isPending}
          className={`${styles.input} ${styles.fileInput}`}
        />
        <p className={styles.fieldHint}>JPG, PNG, WEBP 파일만 업로드할 수 있으며 최대 5MB까지 지원합니다.</p>
      </label>

      <p className={styles.bottomHint}>입력한 주소와 연락처는 가입 심사 및 학원 공식 정보 검토에 사용됩니다.</p>

      <label className={styles.field}>
        <span className={styles.label}>이메일 (아이디)</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          disabled={isPending}
          className={styles.input}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>비밀번호</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          disabled={isPending}
          className={styles.input}
        />
      </label>

      {state.message && state.status !== "success" ? (
        <p className={state.status === "error" ? styles.errorMessage : styles.infoMessage} role="status">
          {state.message}
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className={styles.submitButton}>
        {isPending ? "신청 중..." : "운영보드 계정 신청"}
      </button>
    </form>
  )
}
