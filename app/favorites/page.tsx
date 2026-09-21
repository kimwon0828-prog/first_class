import { getAllPublicClasses } from "@/features/classes/queries/get-public-classes"
import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { getSession } from "@/features/auth/lib/session"

import { FavoritesClient } from "./favorites-client"
import { getStudioCrossProductHrefResolver } from "@/shared/lib/cross-product-navigation-server"

export default async function FavoritesPage() {
  const { data, error } = await getAllPublicClasses()
  const session = await getSession()
  const profile = session ? await getMyProfile() : null
  const role = profile?.dbRole
  const isParent = role === "parent"
  const isStudioUser = role === "academy" || role === "admin"
  const favoritesEnabled = !session || profile?.role === "parent"
  /* Studio 는 다른 origin 이다. 상대 경로로는 그 자리를 가리킬 수 없다. */
  const studioHref = await getStudioCrossProductHrefResolver()
  const scheduleHref = "/my/schedule"
  const scheduleEntryHref = session
    ? isStudioUser
      ? studioHref("/studio")
      : scheduleHref
    : `/auth/sign-in?${new URLSearchParams({ returnTo: scheduleHref }).toString()}`
  const recordHref = "/record"
  const recordEntryHref = session
    ? isStudioUser
      ? studioHref("/studio")
      : recordHref
    : `/auth/sign-in?${new URLSearchParams({ returnTo: recordHref }).toString()}`
  const myPageEntryHref = session
    ? isParent
      ? "/my"
      : isStudioUser
        ? studioHref("/studio")
        : "/my"
    : "/auth/sign-in"

  return (
    <FavoritesClient
      allClasses={data}
      queryError={error}
      favoritesEnabled={favoritesEnabled}
      scheduleEntryHref={scheduleEntryHref}
      recordEntryHref={recordEntryHref}
      studioHref={studioHref("/studio")}
      myPageEntryHref={myPageEntryHref}
    />
  )
}
