import { getAllPublicClasses } from "@/features/classes/queries/get-public-classes"
import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { getSession } from "@/features/auth/lib/session"

import { FavoritesClient } from "./favorites-client"

export default async function FavoritesPage() {
  const { data } = await getAllPublicClasses()
  const session = await getSession()
  const profile = session ? await getMyProfile() : null
  const role = profile?.dbRole
  const isParent = role === "parent"
  const isStudioUser = role === "academy" || role === "admin"
  const favoritesEnabled = !session || profile?.role === "parent"
  const recordHref = "/record"
  const recordEntryHref = session
    ? isStudioUser
      ? "/studio"
      : recordHref
    : `/auth/sign-in?${new URLSearchParams({ returnTo: recordHref }).toString()}`
  const myPageEntryHref = session
    ? isParent
      ? "/my"
      : isStudioUser
        ? "/studio"
        : "/my"
    : "/auth/sign-in"

  return (
    <FavoritesClient
      allClasses={data}
      favoritesEnabled={favoritesEnabled}
      recordEntryHref={recordEntryHref}
      myPageEntryHref={myPageEntryHref}
    />
  )
}
