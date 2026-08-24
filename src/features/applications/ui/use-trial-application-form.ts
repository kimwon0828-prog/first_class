"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useMemo, useState, type FormEvent } from "react"

import {
  createTrialApplicationAction,
  type CreateTrialApplicationActionState
} from "@/features/applications/actions/create-trial-application"
import { clearTrialApplicationDraft } from "@/features/applications/lib/trial-application-draft"
import {
  formatStoredTargetGrades,
  isChildEligibleForClass
} from "@/shared/constants/grade-options"
import { normalizeLearnerGrade } from "@/shared/constants/education-taxonomy"
import type { AvailableScheduleSlot, ChildProfile } from "@/shared/lib/db/adapter"

export type TrialApplicationFormProps = {
  classId: string
  classTargetAge: string
  availableSlots: AvailableScheduleSlot[]
  slotsError: string | null
  childProfiles: ChildProfile[]
  childProfilesError: string | null
  parentName: string
  parentPhone: string | null
}

type UseTrialApplicationFormOptions = {
  autoSelectSingleSlot?: boolean
}

const initialState: CreateTrialApplicationActionState = {
  status: "idle",
  message: ""
}

const WEEKDAY_LABELS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"]

export const formatSlotDateLine = (startAt: string, endAt: string) => {
  const startDate = new Date(startAt)
  const endDate = new Date(endAt)

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null
  }

  const dateText = `${startDate.getFullYear()}. ${String(startDate.getMonth() + 1).padStart(2, "0")}. ${String(
    startDate.getDate()
  ).padStart(2, "0")}.`
  const weekdayText = WEEKDAY_LABELS[startDate.getDay()] ?? ""

  return `${dateText} ${weekdayText}`
}

export const formatSlotTimeLine = (startAt: string, endAt: string, remainingCount: number) => {
  const startDate = new Date(startAt)
  const endDate = new Date(endAt)

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null
  }

  const timeText = `${String(startDate.getHours()).padStart(2, "0")}:${String(
    startDate.getMinutes()
  ).padStart(2, "0")}~${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`

  return `${timeText} · 남은 ${remainingCount}자리`
}

export const resolveSlotDisplay = (slot: AvailableScheduleSlot) => {
  const dateLine = formatSlotDateLine(slot.startAt, slot.endAt)
  const timeLine = formatSlotTimeLine(slot.startAt, slot.endAt, slot.remainingCount)

  if (dateLine && timeLine) {
    return {
      primaryLine: dateLine,
      secondaryLine: timeLine
    }
  }

  return {
    primaryLine: slot.label || slot.startAt,
    secondaryLine: slot.isClosed ? null : `남은 ${slot.remainingCount}자리`
  }
}

export const useTrialApplicationForm = (
  {
    classId,
    classTargetAge,
    availableSlots,
    slotsError,
    childProfiles
  }: Pick<
    TrialApplicationFormProps,
    "classId" | "classTargetAge" | "availableSlots" | "slotsError" | "childProfiles"
  >,
  options?: UseTrialApplicationFormOptions
) => {
  const router = useRouter()
  const boundAction = createTrialApplicationAction.bind(null, classId)
  const [state, formAction, isPending] = useActionState(boundAction, initialState)
  const [selectedChildId, setSelectedChildId] = useState("")
  const [selectedOptionId, setSelectedOptionId] = useState("")
  const [childName, setChildName] = useState("")
  const [childGrade, setChildGrade] = useState("")
  const [childSchool, setChildSchool] = useState("")
  const [childNotes, setChildNotes] = useState("")
  const [subjectExperienceYn, setSubjectExperienceYn] = useState("")
  const [subjectExperienceDuration, setSubjectExperienceDuration] = useState("")
  const [currentLevel, setCurrentLevel] = useState("")
  const [preferredRegularSchedule, setPreferredRegularSchedule] = useState("")
  const [goalType, setGoalType] = useState("")
  const [goalNote, setGoalNote] = useState("")
  const [memo, setMemo] = useState("")
  const [privacyAgreed, setPrivacyAgreed] = useState(false)
  const [thirdPartyAgreed, setThirdPartyAgreed] = useState(false)
  const [guardianAgreed, setGuardianAgreed] = useState(false)
  const [clientMessage, setClientMessage] = useState("")

  const autoSelectSingleSlot = options?.autoSelectSingleSlot ?? true
  const selectedSlot = useMemo(
    () => availableSlots.find((slot) => slot.optionId === selectedOptionId) ?? null,
    [availableSlots, selectedOptionId]
  )
  const selectedChild = useMemo(
    () => childProfiles.find((child) => child.id === selectedChildId) ?? null,
    [childProfiles, selectedChildId]
  )
  const classTargetGradeLabel = useMemo(() => formatStoredTargetGrades(classTargetAge), [classTargetAge])
  const isGradeEligible = useMemo(() => {
    if (!childGrade.trim()) {
      return true
    }

    return isChildEligibleForClass(childGrade, classTargetAge)
  }, [childGrade, classTargetAge])
  const normalizedChildGrade = normalizeLearnerGrade(childGrade)
  const legacyChildGradeValue = childGrade.trim() && !normalizedChildGrade ? childGrade.trim() : null
  const hasSelectableSlots = useMemo(
    () => availableSlots.some((slot) => !slot.isClosed),
    [availableSlots]
  )
  const canSubmit =
    !slotsError && hasSelectableSlots && Boolean(selectedSlot && !selectedSlot.isClosed) && isGradeEligible
  const requiredAgreementsChecked = privacyAgreed && thirdPartyAgreed && guardianAgreed

  useEffect(() => {
    if (selectedSlot?.isClosed) {
      setSelectedOptionId("")
    }
  }, [selectedSlot?.isClosed])

  useEffect(() => {
    const selectableSlots = availableSlots.filter((slot) => !slot.isClosed)

    if (autoSelectSingleSlot && selectableSlots.length === 1) {
      setSelectedOptionId(selectableSlots[0].optionId)
      return
    }

    setSelectedOptionId((current) =>
      availableSlots.some((slot) => slot.optionId === current && !slot.isClosed) ? current : ""
    )
  }, [autoSelectSingleSlot, availableSlots])

  useEffect(() => {
    if (!selectedChild) {
      return
    }

    setChildName(selectedChild.name)
    setChildGrade(normalizeLearnerGrade(selectedChild.grade) ?? selectedChild.grade)
    setChildSchool(selectedChild.schoolName ?? "")
    setChildNotes(selectedChild.notes ?? "")
    setCurrentLevel(selectedChild.currentLevel ?? "")
    setGoalNote(selectedChild.goalNote ?? "")
  }, [selectedChild])

  useEffect(() => {
    if (state.status !== "success") {
      return
    }

    clearTrialApplicationDraft()
    if (state.redirectTo) {
      router.replace(state.redirectTo)
    }
  }, [router, state.redirectTo, state.status])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!requiredAgreementsChecked) {
      event.preventDefault()
      setClientMessage("체험수업 신청에 필요한 필수 동의 항목을 확인해주세요.")
      return
    }

    if (!isGradeEligible) {
      event.preventDefault()
      setClientMessage("선택한 자녀의 학년이 이 수업의 대상 학년과 맞지 않아 신청할 수 없어요.")
      return
    }

    setClientMessage("")
  }

  return {
    state,
    formAction,
    isPending,
    selectedChildId,
    setSelectedChildId,
    selectedOptionId,
    setSelectedOptionId,
    childName,
    setChildName,
    childGrade,
    setChildGrade,
    childSchool,
    setChildSchool,
    childNotes,
    setChildNotes,
    subjectExperienceYn,
    setSubjectExperienceYn,
    subjectExperienceDuration,
    setSubjectExperienceDuration,
    currentLevel,
    setCurrentLevel,
    preferredRegularSchedule,
    setPreferredRegularSchedule,
    goalType,
    setGoalType,
    goalNote,
    setGoalNote,
    memo,
    setMemo,
    privacyAgreed,
    setPrivacyAgreed,
    thirdPartyAgreed,
    setThirdPartyAgreed,
    guardianAgreed,
    setGuardianAgreed,
    clientMessage,
    setClientMessage,
    selectedSlot,
    selectedChild,
    classTargetGradeLabel,
    isGradeEligible,
    legacyChildGradeValue,
    hasSelectableSlots,
    canSubmit,
    requiredAgreementsChecked,
    handleSubmit
  }
}
