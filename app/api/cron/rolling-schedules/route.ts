import { runRollingSchedules } from "@/features/studio/lib/run-rolling-schedules"
import { resolveCronAuthMode, resolveCronErrorStatus } from "@/shared/lib/cron-auth"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: Request) {
  try {
    // Fail closed even locally: a dev process may carry a production service key.
    if (!process.env.CRON_SECRET?.trim()) return Response.json({ok:false,error:"missing_cron_secret"},{status:503})
    resolveCronAuthMode(request)
    const result = await runRollingSchedules()
    return Response.json(result,{status:result.ok ? 200 : 500})
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error"
    return Response.json({ok:false,error:message},{status:resolveCronErrorStatus(message)})
  }
}
