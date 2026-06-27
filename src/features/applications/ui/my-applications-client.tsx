"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import type { User } from "@supabase/supabase-js"

import { MyApplicationList } from "@/features/applications/ui/my-application-list"
import { createSupabaseBrowserClient } from "@/integrations/supabase/client"
import { getPublicEnv } from "@/shared/config/env"
import type {
  ApplicationRegistrationStatus,
  ApplicationStatus,
  TrialApplicationSummary
} from "@/shared/lib/db/adapter"
import styles from "../../../../app/my/applications/page.module.css"

type LoadState = "loading" | "ready" | "auth_required" | "forbidden" | "error"

type AuthDebugState = {
  hasSession: boolean
  hasUser: boolean
  sessionError: string | null
  userError: string | null
  userId: string | null
  supabaseProjectRef: string | null
  hasSbCookie: boolean
}

type EmbeddedClassRow = {
  title?: string
  program_type?: TrialApplicationSummary["classProgramType"]
  region?: string
}

type TrialApplicationRow = {
  id: string
  class_id: string
  parent_id: string
  child_name: string
  child_grade: string
  parent_name: string | null
  parent_phone: string | null
  class_schedule_id: string | null
  requested_schedule_block_id: string | null
  selected_schedule_label: string | null
  requested_slot_at: string | null
  confirmed_slot_at: string | null
  registration_status: ApplicationRegistrationStatus | null
  goal_type: string | null
  status: ApplicationStatus
  created_at: string
  updated_at: string
  classes?: EmbeddedClassRow[] | EmbeddedClassRow | null
}

export type MyApplicationListItem = TrialApplicationSummary & {
  registrationStatus: ApplicationRegistrationStatus | null
}

const ACTIVE_STATUSES: ApplicationStatus[] = ["new", "reviewing", "confirmed"]
const CLOSED_STATUSES: ApplicationStatus[] = ["completed", "canceled"]

const getEmbeddedClass = (row: TrialApplicationRow): EmbeddedClassRow | null => {
  if (!row.classes) {
    return null
  }

  if (Array.isArray(row.classes)) {
    return row.classes[0] ?? null
  }

  return row.classes
}

const mapApplication = (row: TrialApplicationRow): MyApplicationListItem => {
  const embeddedClass = getEmbeddedClass(row)

  return {
    id: row.id,
    classId: row.class_id,
    classTitle: embeddedClass?.title ?? null,
    classProgramType: embeddedClass?.program_type ?? null,
    parentId: row.parent_id,
    childName: row.child_name,
    childGrade: row.child_grade,
    parentName: row.parent_name ?? null,
    parentPhone: row.parent_phone ?? null,
    classScheduleId: row.class_schedule_id ?? null,
    requestedScheduleBlockId: row.requested_schedule_block_id ?? null,
    selectedScheduleLabel: row.selected_schedule_label ?? null,
    requestedSlotAt: row.requested_slot_at ?? "",
    confirmedSlotAt: row.confirmed_slot_at ?? null,
    registrationStatus: row.registration_status ?? null,
    status: row.status,
    goalType: row.goal_type ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

const resolvePageCopy = (statusFilter: string | null) => {
  if (statusFilter === "active") {
    return {
      title: "진행 중 신청",
      subtitle: "접수 이후 진행 중인 첫수업 신청만 모아볼 수 있어요.",
      emptyTitle: "진행 중인 신청이 없어요.",
      emptyDesc: "새 체험수업을 신청하거나 전체 신청 내역을 확인해보세요."
    }
  }

  if (statusFilter === "closed") {
    return {
      title: "완료/취소 신청",
      subtitle: "완료되었거나 취소된 첫수업 신청을 확인할 수 있어요.",
      emptyTitle: "완료 또는 취소된 신청이 없어요.",
      emptyDesc: "진행 중인 신청은 전체 신청 내역에서 확인할 수 있어요."
    }
  }

  return {
    title: "내 신청",
    subtitle: "신청한 첫수업 진행 상태를 확인할 수 있어요.",
    emptyTitle: "아직 신청한 첫수업이 없어요.",
    emptyDesc: "우리 아이에게 맞는 수업을 찾아보세요."
  }
}

const filterItemsByStatus = (items: MyApplicationListItem[], statusFilter: string | null) => {
  if (statusFilter === "active") {
    return items.filter((item) => ACTIVE_STATUSES.includes(item.status))
  }

  if (statusFilter === "closed") {
    return items.filter((item) => CLOSED_STATUSES.includes(item.status))
  }

  return items
}

export const MyApplicationsClient = () => {
  const searchParams = useSearchParams()
  const statusFilter = searchParams.get("status")
  const pageCopy = useMemo(() => resolvePageCopy(statusFilter), [statusFilter])
  const [items, setItems] = useState<MyApplicationListItem[]>([])
  const [status, setStatus] = useState<LoadState>("loading")
  const [message, setMessage] = useState("")
  const authFallbackTimerRef = useRef<number | null>(null)
  const [authDebug, setAuthDebug] = useState<AuthDebugState>({
    hasSession: false,
    hasUser: false,
    sessionError: null,
    userError: null,
    userId: null,
    supabaseProjectRef: null,
    hasSbCookie: false
  })

  const resolveProjectRef = useCallback(() => {
    try {
      const { supabaseUrl } = getPublicEnv()
      const parsed = new URL(supabaseUrl)
      return parsed.hostname.split(".")[0] ?? null
    } catch {
      return null
    }
  }, [])

  const applyAuthenticatedState = useCallback(async (user: User) => {
    const supabase = createSupabaseBrowserClient()
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) {
      setItems([])
      setStatus("error")
      setMessage("신청 내역을 불러오기 전에 계정 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.")
      return
    }

    if (!profile || profile.role !== "parent") {
      setItems([])
      setStatus("forbidden")
      setMessage("학부모 계정만 신청 내역을 확인할 수 있어요.")
      return
    }

    const { data, error } = await supabase
      .from("trial_applications")
      .select(
        "id, class_id, parent_id, child_name, child_grade, parent_name, parent_phone, class_schedule_id, requested_schedule_block_id, selected_schedule_label, requested_slot_at, confirmed_slot_at, registration_status, goal_type, status, created_at, updated_at, classes(title, program_type, region)"
      )
      .eq("parent_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      setItems([])
      setStatus("error")
      setMessage("내 신청내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.")
      return
    }

    setItems(((data ?? []) as TrialApplicationRow[]).map(mapApplication))
    setStatus("ready")
  }, [])

  const clearAuthFallbackTimer = useCallback(() => {
    if (authFallbackTimerRef.current !== null) {
      window.clearTimeout(authFallbackTimerRef.current)
      authFallbackTimerRef.current = null
    }
  }, [])

  const scheduleAuthRequired = useCallback(
    (nextDebug: AuthDebugState) => {
      clearAuthFallbackTimer()
      authFallbackTimerRef.current = window.setTimeout(() => {
        setAuthDebug(nextDebug)
        setItems([])
        setStatus("auth_required")
        setMessage("로그인 상태를 확인하지 못했어요. 다시 로그인해 주세요.")
      }, 1200)
    },
    [clearAuthFallbackTimer]
  )

  const loadApplications = useCallback(async () => {
    setStatus("loading")
    setMessage("")
    clearAuthFallbackTimer()

    try {
      const supabase = createSupabaseBrowserClient()
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      const sessionUser = sessionData.session?.user ?? null
      console.log("MY_APPLICATIONS_CLIENT_AUTH", {
        phase: "session",
        hasSession: Boolean(sessionData.session),
        sessionError: sessionError?.message ?? null,
        userId: sessionUser?.id ?? null
      })

      const {
        data: userData,
        error: userError
      } = await supabase.auth.getUser()
      const resolvedUser = sessionUser ?? userData.user ?? null

      console.log("MY_APPLICATIONS_CLIENT_AUTH", {
        phase: "user",
        hasUser: Boolean(userData.user),
        userError: userError?.message ?? null,
        userId: userData.user?.id ?? null
      })

      const nextDebug: AuthDebugState = {
        hasSession: Boolean(sessionData.session),
        hasUser: Boolean(resolvedUser),
        sessionError: sessionError?.message ?? null,
        userError: userError?.message ?? null,
        userId: resolvedUser?.id ?? null,
        supabaseProjectRef: resolveProjectRef(),
        hasSbCookie: document.cookie.includes("sb-")
      }

      setAuthDebug(nextDebug)

      if (sessionUser) {
        await applyAuthenticatedState(sessionUser)
        return
      }

      if (userData.user) {
        await applyAuthenticatedState(userData.user)
        return
      }

      scheduleAuthRequired(nextDebug)
    } catch {
      clearAuthFallbackTimer()
      setItems([])
      setStatus("error")
      setMessage("내 신청내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.")
    }
  }, [applyAuthenticatedState, clearAuthFallbackTimer, resolveProjectRef, scheduleAuthRequired])

  useEffect(() => {
    void loadApplications()
  }, [loadApplications])

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("MY_APPLICATIONS_CLIENT_AUTH", {
        phase: "change",
        event,
        hasSession: Boolean(session),
        userId: session?.user?.id ?? null
      })

      if (session?.user) {
        clearAuthFallbackTimer()
        setAuthDebug((current) => ({
          ...current,
          hasSession: true,
          hasUser: true,
          userId: session.user.id,
          sessionError: null,
          userError: null,
          supabaseProjectRef: current.supabaseProjectRef ?? resolveProjectRef(),
          hasSbCookie: document.cookie.includes("sb-")
        }))
        void applyAuthenticatedState(session.user)
      }
    })

    return () => {
      clearAuthFallbackTimer()
      subscription.subscription.unsubscribe()
    }
  }, [applyAuthenticatedState, clearAuthFallbackTimer, resolveProjectRef])

  const filteredItems = useMemo(() => filterItemsByStatus(items, statusFilter), [items, statusFilter])
  const authDebugLines = useMemo(
    () =>
      [
        `hasSession: ${String(authDebug.hasSession)}`,
        `hasUser: ${String(authDebug.hasUser)}`,
        `userId: ${authDebug.userId ?? "null"}`,
        `sessionError: ${authDebug.sessionError ?? "null"}`,
        `userError: ${authDebug.userError ?? "null"}`,
        `supabaseProjectRef: ${authDebug.supabaseProjectRef ?? "null"}`,
        `hasSbCookie: ${String(authDebug.hasSbCookie)}`
      ].join("\n"),
    [authDebug]
  )

  return (
    <main
      className={styles.page}
      style={{ background: "#ffffff", minHeight: "100dvh", width: "100%", overflowX: "hidden" }}
    >
      <div
        className={styles.shell}
        style={{
          boxSizing: "border-box",
          width: "100%",
          maxWidth: 430,
          margin: "0 auto",
          minHeight: "100dvh",
          background: "#ffffff",
          padding: "calc(18px + env(safe-area-inset-top)) 24px calc(96px + env(safe-area-inset-bottom))"
        }}
      >
        <header className={styles.header}>
          <h1 className={styles.title}>{pageCopy.title}</h1>
          <p className={styles.subtitle}>{pageCopy.subtitle}</p>
        </header>

        {status === "loading" ? (
          <section className={styles.card}>
            <p className={styles.subtitle}>신청 내역을 불러오는 중이에요...</p>
          </section>
        ) : null}

        {status === "auth_required" ? (
          <section className={`${styles.card} ${styles.dangerCard}`}>
            <p className={styles.dangerText}>{message}</p>
            <pre className={styles.dangerText} style={{ whiteSpace: "pre-wrap" }}>
              {authDebugLines}
            </pre>
            <Link
              href={`/auth/sign-in?returnTo=${encodeURIComponent("/my/applications")}`}
              className={styles.link}
            >
              다시 로그인하기
            </Link>
          </section>
        ) : null}

        {status === "forbidden" ? (
          <section className={`${styles.card} ${styles.dangerCard}`}>
            <p className={styles.dangerText}>{message}</p>
            <Link href="/classes" className={styles.link}>
              수업 목록으로 이동
            </Link>
          </section>
        ) : null}

        {status === "error" ? (
          <section className={`${styles.card} ${styles.dangerCard}`}>
            <p className={styles.dangerText}>{message}</p>
            <Link href="/classes" className={styles.link}>
              수업 찾으러 가기
            </Link>
          </section>
        ) : null}

        {status === "ready" && filteredItems.length === 0 ? (
          <section className={styles.emptyCard}>
            <h2 className={styles.emptyTitle}>{pageCopy.emptyTitle}</h2>
            <p className={styles.emptyDesc}>{pageCopy.emptyDesc}</p>
            <Link href="/classes" className={styles.primaryButton}>
              수업 찾으러 가기
            </Link>
          </section>
        ) : null}

        {status === "ready" && filteredItems.length > 0 ? (
          <MyApplicationList items={filteredItems} onCanceled={loadApplications} />
        ) : null}
      </div>

      <nav className={styles.bottomNav} aria-label="Bottom tabs">
        <Link href="/classes" className={styles.navItem}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>홈</span>
        </Link>
        <Link href="/favorites" className={styles.navItem}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M7 4h10a1 1 0 0 1 1 1v17l-6-3.6L6 22V5a1 1 0 0 1 1-1Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          <span>관심수업</span>
        </Link>
        <Link href="/my/applications" className={`${styles.navItem} ${styles.navItemActive}`}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M9 6h11M9 12h11M9 18h11M5 6h.01M5 12h.01M5 18h.01"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>내 신청</span>
        </Link>
      </nav>
    </main>
  )
}
