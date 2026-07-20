import { NextResponse } from "next/server"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { getSession } from "@/features/auth/lib/session"
import {
  syncMissingOrganizationCoordinates,
  syncOrganizationCoordinatesById
} from "@/features/organizations/lib/organization-coordinate-sync"

export const dynamic = "force-dynamic"

type RequestBody = {
  organizationId?: string
  onlyMissing?: boolean
  limit?: number
}

const isAdminProfile = (dbRole: string | null | undefined) => dbRole === "admin" || dbRole === "operator"

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
    }

    const profile = await getMyProfile()
    if (!profile || !isAdminProfile(profile.dbRole)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 })
    }

    const body = ((await request.json().catch(() => ({}))) as RequestBody) ?? {}
    const organizationId = typeof body.organizationId === "string" ? body.organizationId.trim() : ""
    const onlyMissing = body.onlyMissing !== false
    const limit = typeof body.limit === "number" ? body.limit : 20

    if (organizationId) {
      const result = await syncOrganizationCoordinatesById(organizationId)
      return NextResponse.json({
        ok: true,
        mode: "single",
        result
      })
    }

    const results = onlyMissing ? await syncMissingOrganizationCoordinates(limit) : []
    return NextResponse.json({
      ok: true,
      mode: "batch",
      onlyMissing,
      limit: Math.min(Math.max(limit, 1), 100),
      updatedCount: results.filter((item) => item.status === "updated").length,
      results
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error"
    const status = message === "missing_naver_geocoding_credentials" ? 503 : 500

    return NextResponse.json(
      {
        ok: false,
        error: message
      },
      { status }
    )
  }
}
