import { getAllPublicClasses } from "@/features/classes/queries/get-public-classes"
import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { getSession } from "@/features/auth/lib/session"

import { FavoritesClient } from "./favorites-client"

export default async function FavoritesPage() {
  const { data } = await getAllPublicClasses()
  const session = await getSession()
  const profile = session ? await getMyProfile() : null
  const favoritesEnabled = !session || profile?.role === "parent"
  const myApplicationsHref = "/my/applications"
  const myApplicationsEntryHref = session
    ? profile?.role === "parent"
      ? myApplicationsHref
      : "/studio"
    : `/auth/sign-in?${new URLSearchParams({ returnTo: myApplicationsHref }).toString()}`

  return (
    <FavoritesClient
      allClasses={data}
      favoritesEnabled={favoritesEnabled}
      myApplicationsEntryHref={myApplicationsEntryHref}
    />
  )
}
