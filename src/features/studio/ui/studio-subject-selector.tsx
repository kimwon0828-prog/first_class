"use client"

import type { SubjectCatalogCategory } from "@/shared/lib/subject-master"
import styles from "./studio-subject-selector.module.css"

type StudioSubjectSelectorProps = {
  catalog: SubjectCatalogCategory[]
  categoryId: string
  subjectId: string
  onCategoryChange: (categoryId: string) => void
  onSubjectChange: (subjectId: string) => void
  disabled?: boolean
  error?: string
  catalogError?: string | null
  legacySubjectLabel?: string | null
}

export const StudioSubjectSelector = ({
  catalog,
  categoryId,
  subjectId,
  onCategoryChange,
  onSubjectChange,
  disabled = false,
  error,
  catalogError,
  legacySubjectLabel
}: StudioSubjectSelectorProps) => {
  const selectedCategory = catalog.find((category) => category.id === categoryId) ?? null
  const subjects = selectedCategory?.subjects ?? []

  const handleCategoryChange = (nextCategoryId: string) => {
    onCategoryChange(nextCategoryId)
    onSubjectChange("")
  }

  return (
    <div className={styles.selector}>
      <div className={styles.selectGrid}>
        <label className={styles.field}>
          <span className={styles.label}>대분류 *</span>
          <select
            value={categoryId}
            onChange={(event) => handleCategoryChange(event.target.value)}
            disabled={disabled || Boolean(catalogError)}
            className={styles.select}
            aria-invalid={Boolean(error)}
            required
          >
            <option value="">대분류 선택</option>
            {catalog.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>세부 과목 (선택)</span>
          <select
            value={subjectId}
            onChange={(event) => onSubjectChange(event.target.value)}
            disabled={disabled || !selectedCategory || Boolean(catalogError)}
            className={styles.select}
            aria-invalid={Boolean(error)}
          >
            <option value="">선택하지 않음</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {legacySubjectLabel ? (
        <p className={styles.hint}>
          기존 과목: {legacySubjectLabel}. 새 과목을 선택해 주세요.
        </p>
      ) : null}
      {catalogError ? <p className={styles.error}>{catalogError}</p> : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
