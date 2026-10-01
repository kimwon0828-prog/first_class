"use client"

import { useEffect, useState } from "react"
import { clearParentFavoriteData } from "@/features/favorites/lib/storage"
import { getSupabaseBrowserClient } from "@/integrations/supabase/client"

// Mounted only after the server confirms Auth deletion. The public completion
// route avoids a protected-page rerender racing cookie removal.
export function ParentDeletionBrowserCleanup() {
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    try { clearParentFavoriteData() } catch { setBlocked(true) }
    void getSupabaseBrowserClient().auth.signOut({ scope: "local" }).catch(() => {})
  }, [])
  return blocked ? <p role="status">브라우저 저장소 접근이 차단되어 관심수업을 정리하지 못했습니다. 이 브라우저의 첫수업 사이트 데이터를 삭제해 주세요.</p> : null
}
