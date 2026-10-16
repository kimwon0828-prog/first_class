import { saveParentNotificationRead } from "@/features/notifications/lib/save-parent-notification-read"
import type { SupabaseClient } from "@supabase/supabase-js"
import { selectParentNotifications, applyNotificationReads } from "@/features/notifications/lib/parent-notifications"
import type { ApplicationStatus } from "@/shared/lib/db/adapter"
export async function readNativeNotifications(db: SupabaseClient, parentId: string) {
  const applications: {id:string;classTitle:string|null;childName:string;academyName:string|null}[]=[]
  for(let offset=0;;offset+=100) {
    const result=await db.from("my_trial_applications").select("id,class_title,child_name").eq("parent_id",parentId).order("id").range(offset,offset+99)
    if(result.error) throw new Error("notifications_unavailable")
    applications.push(...(result.data??[]).map(row=>({id:row.id,classTitle:row.class_title,childName:row.child_name,academyName:null})))
    if((result.data?.length??0)<100) break
  }
  const logs: {id:string;application_id:string;from_status:string|null;to_status:string;actor_id:string;created_at:string}[]=[], reports: {id:string;application_id:string;published_at:string}[]=[], reminders: {application_id:string;feedback_reminder_sent_at:string}[]=[]
  // Batches avoid URL-size limits. RLS remains on the user's JWT for every source.
  for(let offset=0;offset<applications.length;offset+=50) {
    const ids=applications.slice(offset,offset+50).map(row=>row.id)
    const [l,r,m]=await Promise.all([
      db.from("application_logs").select("id,application_id,from_status,to_status,actor_id,created_at").in("application_id",ids),
      db.from("experience_reports").select("id,application_id,published_at").in("application_id",ids).eq("status","published"),
      db.from("parent_report_engagement").select("application_id,feedback_reminder_sent_at").in("application_id",ids).not("feedback_reminder_sent_at","is",null)
    ])
    if(l.error||r.error||m.error) throw new Error("notifications_unavailable")
    logs.push(...l.data??[]);reports.push(...r.data??[]);reminders.push(...m.data??[])
  }
  const items=selectParentNotifications({applications,parentProfileId:parentId,
    statusEvents:logs.map(row=>({id:row.id,applicationId:row.application_id,fromStatus:row.from_status as ApplicationStatus|null,toStatus:row.to_status as ApplicationStatus,actorId:row.actor_id,createdAt:row.created_at})),
    publishedReports:reports.filter(row=>row.published_at).map(row=>({reportId:row.id,applicationId:row.application_id,publishedAt:row.published_at})),
    feedbackReminders:reminders.filter(row=>reports.some(r=>r.application_id===row.application_id)).map(row=>({applicationId:row.application_id,occurredAt:row.feedback_reminder_sent_at}))
  })
  const keys=new Set<string>()
  for(let offset=0;offset<items.length;offset+=100) {
    const reads=await db.from("parent_notification_reads").select("notification_key").eq("parent_id",parentId).in("notification_key",items.slice(offset,offset+100).map(item=>item.id))
    if(reads.error) return {items,readStateStatus:"unavailable"}
    for(const row of reads.data??[]) keys.add(row.notification_key)
  }
  return {items:applyNotificationReads(items,keys),readStateStatus:"available"}
}

export async function writeNativeNotificationRead(request: Request, db: SupabaseClient, parentId: string) {
  const reply = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } })
  if (request.method !== "POST") return reply({ error: "not_found" }, 404)
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "invalid_input" }, 400)
  const raw = await request.text()
  if (raw.length > 256) return reply({ error: "invalid_input" }, 400)
  let key: string
  try {
    const body = JSON.parse(raw)
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.notificationKey !== "string") throw Error()
    key = body.notificationKey
    if (!/^(status|report_published|feedback_reminder):[0-9a-f-]{36}$/i.test(key)) throw Error()
  } catch { return reply({ error: "invalid_input" }, 400) }
  const saved = await saveParentNotificationRead(db, parentId, key)
  return reply(saved ? { status: "success" } : { error: "read_state_unavailable" }, saved ? 200 : 503)
}
