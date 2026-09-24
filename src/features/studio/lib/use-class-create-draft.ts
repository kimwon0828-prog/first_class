"use client"

import { useEffect, useRef, useState } from "react"
import { createDefaultCreateClassScheduleDraft, type CreateClassScheduleDraft } from "./studio-operating-hours"

export type ClassFormDraftValues = {
  title: string
  programType: "trial_class" | "level_test"
  subjectCategoryId: string
  subjectId: string
  targetGrades: string[]
  classFormat: string
  trialPrice: string
  priceMode: "" | "free" | "paid"
  assignmentMode: "post_assign" | "preassigned"
  teacherId: string
  description: string
  recommendedFor: string
  experiencePoints: string
  curriculum: string
  coverImageUrl: string
  visibility: "private" | "public"
  scheduleDraft: CreateClassScheduleDraft
}

type StoredDraft = { version: number; values: ClassFormDraftValues }

const readDraft = (raw: string | null): StoredDraft | null => {
  try {
    const candidate = JSON.parse(raw ?? "null")
    if (!candidate || ![1, 2, 3, 4, 5].includes(candidate.version) || !candidate.values) return null
    const values = candidate.values
    const schedule = values.scheduleDraft
    return { version: candidate.version, values: {
      title: String(values.title ?? ""), programType: values.programType === "level_test" ? "level_test" : "trial_class",
      subjectCategoryId: String(values.subjectCategoryId ?? ""), subjectId: String(values.subjectId ?? ""),
      targetGrades: Array.isArray(values.targetGrades) ? values.targetGrades.filter((v: unknown) => typeof v === "string") : [],
      classFormat: String(values.classFormat ?? ""), trialPrice: String(values.trialPrice ?? ""),
      // A legacy blank price was implicit free, not an intentional choice. Ask again.
      priceMode: values.priceMode === "free" || values.priceMode === "paid" ? values.priceMode
        : String(values.trialPrice ?? "").trim() ? Number(values.trialPrice) === 0 ? "free" : "paid" : "",
      assignmentMode: values.assignmentMode === "preassigned" ? "preassigned" : "post_assign",
      teacherId: String(values.teacherId ?? ""), description: String(values.description ?? ""),
      recommendedFor: String(values.recommendedFor ?? ""), experiencePoints: String(values.experiencePoints ?? ""),
      curriculum: String(values.curriculum ?? ""), coverImageUrl: String(values.coverImageUrl ?? ""),
      visibility: values.visibility === "public" ? "public" : "private",
      scheduleDraft: schedule && Array.isArray(schedule.groups)
        ? { ...createDefaultCreateClassScheduleDraft(), ...schedule }
        : createDefaultCreateClassScheduleDraft()
    } }
  } catch { return null }
}

export const useClassCreateDraft = (
  enabled: boolean,
  organizationId: string,
  values: ClassFormDraftValues,
  restore: (values: ClassFormDraftValues) => void,
  saved: boolean
) => {
  const storageKey = `studio-class-create-draft:${organizationId}`
  const sessionKey = `studio-class-create-active-session:${organizationId}`
  const [pendingDraft, setPendingDraft] = useState<StoredDraft | null>(null)
  const [ready, setReady] = useState(false)
  const [storageUnavailable, setStorageUnavailable] = useState(false)
  const initialized = useRef(false)
  const restoreRef = useRef(restore)
  restoreRef.current = restore

  useEffect(() => {
    if (!enabled || initialized.current) return
    initialized.current = true
    try {
      const draft = readDraft(localStorage.getItem(storageKey))
      if (draft && sessionStorage.getItem(sessionKey) === "1") {
        restoreRef.current(draft.values)
      } else if (draft && (draft.values.title || draft.values.description || draft.values.subjectCategoryId ||
        draft.values.targetGrades.length || draft.values.coverImageUrl || draft.values.priceMode ||
        draft.values.scheduleDraft.operationStartDate || draft.values.classFormat || draft.values.teacherId ||
        draft.values.recommendedFor || draft.values.experiencePoints || draft.values.curriculum ||
        draft.values.programType === "level_test" || draft.values.assignmentMode === "preassigned" ||
        draft.values.visibility === "public")) {
        setPendingDraft(draft)
        return
      }
      sessionStorage.setItem(sessionKey, "1")
    } catch { setStorageUnavailable(true) }
    setReady(true)
  }, [enabled, sessionKey, storageKey])

  useEffect(() => {
    if (!enabled || !ready || pendingDraft || saved) return
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ version: 5, values, updatedAt: new Date().toISOString() }))
      } catch { setStorageUnavailable(true) }
    }, 700)
    return () => window.clearTimeout(timer)
  }, [enabled, pendingDraft, ready, saved, storageKey, values])

  useEffect(() => {
    if (!enabled || !saved) return
    try { localStorage.removeItem(storageKey); sessionStorage.removeItem(sessionKey) } catch {}
  }, [enabled, saved, sessionKey, storageKey])

  useEffect(() => () => {
    if (enabled) { try { sessionStorage.removeItem(sessionKey) } catch {} }
  }, [enabled, sessionKey])

  const chooseDraft = (keep: boolean) => {
    if (keep && pendingDraft) restoreRef.current(pendingDraft.values)
    try {
      if (!keep) localStorage.removeItem(storageKey)
      sessionStorage.setItem(sessionKey, "1")
    } catch { setStorageUnavailable(true) }
    setPendingDraft(null)
    setReady(true)
  }
  return { pendingDraft, chooseDraft, storageUnavailable }
}
