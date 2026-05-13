import { NextResponse } from "next/server"

import { getSupabaseServerClient } from "@/integrations/supabase/server"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient()

    const { error: authError } = await supabase.auth.getSession()
    const { error: dbError } = await supabase
      .from("teacher_public_profiles")
      .select("teacher_id", { count: "exact", head: true })

    const ok = !authError && !dbError

    return NextResponse.json(
      {
        ok,
        service: "supabase",
        checks: {
          auth: authError ? "failed" : "ok",
          db_read: dbError ? "failed" : "ok"
        },
        timestamp: new Date().toISOString(),
        error: authError?.message ?? dbError?.message ?? undefined
      },
      { status: ok ? 200 : 503 }
    )
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        service: "supabase",
        checks: {
          auth: "failed",
          db_read: "failed"
        },
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "unknown_error"
      },
      { status: 503 }
    )
  }
}
