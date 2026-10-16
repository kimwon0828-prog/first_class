import { nativeResponses } from "@/features/native/server/responses"
import { nativePushDevice } from "@/features/native/server/push-device"
import { sendStudioNotificationSafely } from "@/features/notifications/sms/send-studio-notification"
import { revalidatePath } from "next/cache"
import { nativeDeletion } from "@/features/native/server/deletion"
import { deleteParentAccountWorkflow } from "@/features/my/lib/parent-account-deletion-workflow"
import { isParentAccountDeletionEnabled } from "@/features/my/lib/parent-account-deletion-server"
import { nativeApplication } from "@/features/native/server/application"
import { createClient } from "@supabase/supabase-js"
import { getPublicEnv } from "@/shared/config/env"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { createNativeParentReader } from "@/features/native/server/parent-reader"
import { loadBookingTimes, type BookingTime } from "@/features/native/server/booking-time"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const read = createNativeParentReader({
  pushDevice: (request, db) => nativePushDevice(request, db, process.env.PARENT_PUSH_REGISTRATION_ENABLED === "true"),
  application: nativeApplication,
  responses: (request, path, db, userId) => nativeResponses(request,path,db,userId,{admin:getSupabaseServiceRoleClient,notify:sendStudioNotificationSafely,revalidate:revalidatePath}),
  deletion: (request, db) => nativeDeletion(request, db, {
    enabled: isParentAccountDeletionEnabled(),
    run: () => deleteParentAccountWorkflow(db, getSupabaseServiceRoleClient())
  }),
  client(token) {
    const { supabaseUrl, supabasePublishableKey } = getPublicEnv()
    return createClient(supabaseUrl, supabasePublishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    })
  },
  // Called only after the caller's own application rows have been authorized.
  // Select the same public academy/class display fields used by Parent web.
  async presentation(rows) {
    if (!rows.length) return {}
    const client = getSupabaseServiceRoleClient()
    const orgIds = [...new Set(rows.map(row => row.class_organization_id).filter((id): id is string => Boolean(id)))]
    const classIds = [...new Set(rows.map(row => row.class_id).filter((id): id is string => Boolean(id)))]
    const [orgs, classes, profiles] = await Promise.all([
      orgIds.length ? client.from("organizations").select("id, name, branch_name, address, address_detail, academy_phone").in("id", orgIds) : Promise.resolve({ data: [], error: null }),
      classIds.length ? client.from("classes").select("id, cover_image_url").in("id", classIds).eq("is_active", true).is("archived_at", null) : Promise.resolve({ data: [], error: null }),
      // Logo and slug live on the public academy profile, as on the academy page (get-public-academy-page).
      orgIds.length ? client.from("academy_public_profiles").select("organization_id, slug, logo_image_path").in("organization_id", orgIds) : Promise.resolve({ data: [], error: null })
    ])
    if (orgs.error || classes.error) throw new Error("presentation_unavailable")
    const organizations = new Map((orgs.data ?? []).map(row => [row.id, row]))
    const covers = new Map((classes.data ?? []).map(row => [row.id, row.cover_image_url]))
    // A missing profile only drops the logo/slug; the existing fields are still returned.
    const publicProfiles = new Map((profiles.error ? [] : profiles.data ?? []).map(row => [row.organization_id, row]))
    const text = (value: string | null | undefined) => value?.trim() || null
    const logoUrl = (path: string | null) => path ? client.storage.from("academy-profile-assets").getPublicUrl(path).data.publicUrl || null : null
    // End time is optional display data: a failure leaves it null and keeps the rest of the response.
    const times: Record<string, BookingTime> = await loadBookingTimes(client, rows.map(row => row.id)).catch(() => ({}))
    return Object.fromEntries(rows.map(row => {
      const org = row.class_organization_id ? organizations.get(row.class_organization_id) : null
      const profile = org ? publicProfiles.get(org.id) : null
      return [row.id, {
        academy_name: org ? [org.name, org.branch_name].filter(Boolean).join(" ") : null,
        address: org ? [org.address, org.address_detail].filter(Boolean).join(" ") : null,
        cover_image_url: row.class_id ? covers.get(row.class_id) ?? null : null,
        organization_id: row.class_organization_id ?? null,
        academy_logo_url: logoUrl(text(profile?.logo_image_path)),
        // Same handle the academy page accepts: the public slug, otherwise the organization id.
        academy_handle: org ? text(profile?.slug) ?? org.id : null,
        academy_phone: org ? text(org.academy_phone) : null,
        slot_end_at: times[row.id]?.slot_end_at ?? null,
        duration_minutes: times[row.id]?.duration_minutes ?? null
      }]
    }))
  },
  storage: getSupabaseServiceRoleClient
})
// Device requests need no CORS. Only the local Expo browser preview is allowed.
function localPreview(request: Request, response: Response) {
  const origin = request.headers.get("origin")
  if (process.env.NODE_ENV === "development" && ["http://localhost:8081", "http://127.0.0.1:8081"].includes(origin ?? "")) {
    response.headers.set("Access-Control-Allow-Origin", origin!)
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type")
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    response.headers.append("Vary", "Origin")
  }
  return response
}
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return localPreview(request, await read(request, (await params).path))
}
export function OPTIONS(request: Request) { return localPreview(request, new Response(null, { status: 204 })) }

export async function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return localPreview(request, await read(request, (await params).path))
}
