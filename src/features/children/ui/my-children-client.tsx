"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { User } from "@supabase/supabase-js"

import { MyChildrenManager } from "@/features/children/ui/my-children-manager"
import { createSupabaseBrowserClient } from "@/integrations/supabase/client"
import { getPublicEnv } from "@/shared/config/env"
import type { ChildProfile } from "@/shared/lib/db/adapter"
import styles from "../../../../app/my/children/page.module.css"

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

type ChildRow = {
  id: string
  parent_id: string
  name: string
  grade: string
  school_name: string | null
  notes: string | null
  current_level: string | null
  interest_subjects: string | null
  goal_note: string | null
  created_at: string
  updated_at: string
}

const CHILD_SELECT_FIELDS =
  "id, parent_id, name, grade, school_name, notes, current_level, interest_subjects, goal_note, created_at, updated_at"

const mapChildProfile = (row: ChildRow): ChildProfile => ({
  id: row.id,
  parentId: row.parent_id,
  name: row.name,
  grade: row.grade,
  schoolName: row.school_name ?? null,
  notes: row.notes ?? null,
  currentLevel: row.current_level ?? null,
  interestSubjects: row.interest_subjects ?? null,
  goalNote: row.goal_note ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

export const MyChildrenClient = () => {
  const [items, setItems] = useState<ChildProfile[]>([])
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
      setMessage("자녀 정보를 불러오기 전에 계정 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.")
      return
    }

    if (!profile || profile.role !== "parent") {
      setItems([])
      setStatus("forbidden")
      setMessage("학부모 계정만 자녀 정보를 확인할 수 있어요.")
      return
    }

    const { data, error } = await supabase
      .from("children")
      .select(CHILD_SELECT_FIELDS)
      .eq("parent_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      setItems([])
      setStatus("error")
      setMessage("자녀 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.")
      return
    }

    setItems(((data ?? []) as ChildRow[]).map(mapChildProfile))
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

  const loadChildren = useCallback(async () => {
    setStatus("loading")
    setMessage("")
    clearAuthFallbackTimer()

    try {
      const supabase = createSupabaseBrowserClient()
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      const sessionUser = sessionData.session?.user ?? null
      console.log("MY_CHILDREN_CLIENT_AUTH", {
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

      console.log("MY_CHILDREN_CLIENT_AUTH", {
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
      setMessage("자녀 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.")
    }
  }, [applyAuthenticatedState, clearAuthFallbackTimer, resolveProjectRef, scheduleAuthRequired])

  useEffect(() => {
    void loadChildren()
  }, [loadChildren])

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("MY_CHILDREN_CLIENT_AUTH", {
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
          padding: "calc(18px + env(safe-area-inset-top)) 24px calc(40px + env(safe-area-inset-bottom))"
        }}
      >
        <header className={styles.header}>
          <div className={styles.headerRow}>
            <Link href="/my" aria-label="뒤로가기" className={styles.backButton}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M15 18l-6-6 6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <div className={styles.headerSpacer} />
          </div>

          <h1 className={styles.title}>자녀 관리</h1>
          <p className={styles.subtitle}>자녀 정보를 등록해두면 첫수업 신청이 더 편해져요.</p>
        </header>

        <section className={styles.noticeCard}>
          <p className={styles.noticeText}>
            자녀 정보를 미리 등록해두면 신청서 작성 시 아이 이름과 학년을 자동으로 불러올 수 있어요.
          </p>
        </section>

        {status === "loading" ? (
          <section className={styles.card}>
            <p className={styles.noticeText}>자녀 정보를 불러오는 중이에요...</p>
          </section>
        ) : null}

        {status === "auth_required" ? (
          <section className={`${styles.card} ${styles.dangerCard}`}>
            <p className={styles.dangerText}>{message}</p>
            <pre className={styles.dangerText} style={{ whiteSpace: "pre-wrap" }}>
              {authDebugLines}
            </pre>
            <Link href="/auth/sign-in?returnTo=%2Fmy%2Fchildren" className={styles.link}>
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
            <Link href="/my" className={styles.link}>
              마이페이지로 이동
            </Link>
          </section>
        ) : null}

        {status === "ready" ? <MyChildrenManager items={items} onSaved={loadChildren} /> : null}
      </div>
    </main>
  )
}
