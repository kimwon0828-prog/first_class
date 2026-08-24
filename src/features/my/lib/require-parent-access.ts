"use server"

import { redirect } from "next/navigation"

import { resolveCurrentAuth } from "@/features/auth/lib/current-auth"

type RequireParentAccessOptions = {
  returnTo: string
}

type ParentAccessState =
  | {
      status: "ok"
      currentPath: string
      userId: string
      profile: {
        id: string
        role: "parent"
        name: string
        phone: string | null
      }
    }
  | {
      status: "no_user"
      currentPath: string
      userId: null
      userError: string | null
    }
  | {
      status: "profile_error"
      currentPath: string
      userId: string
      profileError: string
      profileErrorCode: string | null
    }
  | {
      status: "role_mismatch"
      currentPath: string
      userId: string
      profileRole: string | null
    }

export const getParentAccessState = async (currentPath: string): Promise<ParentAccessState> => {
  const auth = await resolveCurrentAuth(currentPath)

  if (auth.status === "no_user") {
    return {
      status: "no_user",
      currentPath,
      userId: null,
      userError: auth.userError
    }
  }

  if (auth.status === "profile_error") {
    return {
      status: "profile_error",
      currentPath,
      userId: auth.user.id,
      profileError: auth.profileError,
      profileErrorCode: auth.profileErrorCode
    }
  }

  if (auth.status !== "ok" || !auth.isParentUser || auth.profile.role !== "parent") {
    return {
      status: "role_mismatch",
      currentPath,
      userId: auth.user.id,
      profileRole:
        auth.status === "unsupported_role"
          ? auth.profileRole
          : auth.status === "ok"
            ? auth.profile.dbRole
            : null
    }
  }

  return {
    status: "ok",
    currentPath,
    userId: auth.user.id,
    profile: {
      id: auth.profile.id,
      role: "parent",
      name: auth.profile.name,
      phone: auth.profile.phone
    }
  }
}

export const requireParentAccess = async ({ returnTo }: RequireParentAccessOptions) => {
  const state = await getParentAccessState(returnTo)

  if (state.status === "no_user") {
    redirect(`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`)
  }

  if (state.status === "profile_error") {
    redirect("/classes")
  }

  if (state.status === "role_mismatch") {
    redirect("/studio")
  }

  return state.profile
}
