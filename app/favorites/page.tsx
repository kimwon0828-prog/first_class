import { getAllPublicClasses } from "@/features/classes/queries/get-public-classes"
import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { getSession } from "@/features/auth/lib/session"

import { FavoritesClient } from "./favorites-client"
import { getStudioCrossProductHrefResolver } from "@/shared/lib/cross-product-navigation-server"

export default async function FavoritesPage() {
  const { data, error } = await getAllPublicClasses()
  const session = await getSession()
  const profile = session ? await getMyProfile() : null
  const favoritesEnabled = !session || profile?.role === "parent"
  /* Studio 는 다른 origin 이다. 상대 경로로는 그 자리를 가리킬 수 없다. */
  const studioHref = await getStudioCrossProductHrefResolver()

  return (
    <FavoritesClient
      allClasses={data}
      queryError={error}
      favoritesEnabled={favoritesEnabled}
      studioHref={studioHref("/studio")}
    />
  )
}
