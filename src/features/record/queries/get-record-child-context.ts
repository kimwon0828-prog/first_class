import "server-only"
import { getMyChildren } from "@/features/children/queries/get-my-children"
import { resolveSelectedChildId } from "@/features/children/lib/child-selection"

/** Link context only. Existing experience/report ownership checks remain authoritative. */
export async function getRecordChildContext(value: string | string[] | undefined) {
  if (typeof value !== "string" || !value.trim()) return null
  const children = await getMyChildren()
  return children.error ? null : resolveSelectedChildId(value, children.data)
}
