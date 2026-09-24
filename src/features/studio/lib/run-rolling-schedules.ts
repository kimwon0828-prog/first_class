import "server-only"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { formatSeoulDateKey } from "@/shared/lib/seoul-datetime"

export async function runRollingSchedules() {
  const client = getSupabaseServiceRoleClient()
  const failures: Array<{classId:string;error:string}> = []
  const today = formatSeoulDateKey(new Date())!
  const started = Date.now()
  let cursor = "", processed = 0, inserted = 0
  for (;;) {
    let query = client.from("class_operating_rules").select("class_id,classes!inner(is_active)")
      .eq("operation_type","rolling").eq("is_active",true).eq("classes.is_active",true)
      .or(`last_generated_on.is.null,last_generated_on.lt.${today}`)
      .order("class_id").limit(100)
    if (cursor) query = query.gt("class_id",cursor)
    const {data,error} = await query
    if (error) throw new Error(`rolling_rules_read_failed: ${error.message}`)
    for (const rule of data ?? []) {
      if (Date.now()-started>240000) return {ok:false,processed,inserted,failures,incomplete:true}
      const result = await client.rpc("extend_rolling_class_schedule",{p_class_id:rule.class_id})
      if (result.error) failures.push({classId:rule.class_id,error:result.error.message})
      else {processed++; inserted += Number(result.data ?? 0)}
      cursor = rule.class_id
    }
    if ((data?.length ?? 0)<100) break
  }
  return {ok:failures.length===0,processed,inserted,failures}
}
