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
  const isStudioUser = role === "teacher" || role === "academy" || role === "admin"
  const favoritesEnabled = !session || profile?.role === "parent"
  const myApplicationsHref = "/my/applications"
  const myApplicationsEntryHref = session
    ? isParent
      ? myApplicationsHref
      : isStudioUser
        ? "/studio"
        : myApplicationsHref
    : `/auth/sign-in?${new URLSearchParams({ returnTo: myApplicationsHref }).toString()}`

  return (
    <FavoritesClient
      allClasses={data}
      favoritesEnabled={favoritesEnabled}
      myApplicationsEntryHref={myApplicationsEntryHref}
    />
  )
}
