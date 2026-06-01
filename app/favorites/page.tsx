import { getAllPublicClasses } from "@/features/classes/queries/get-public-classes"

import { FavoritesClient } from "./favorites-client"

export default async function FavoritesPage() {
  const { data } = await getAllPublicClasses()
  return <FavoritesClient allClasses={data} />
}
