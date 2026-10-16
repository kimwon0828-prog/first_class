"use server"

import { revalidatePath } from "next/cache"

import { sendStudioNotificationSafely } from "@/features/notifications/sms/send-studio-notification"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

import { cancelParentApplication, type CancelMyApplicationActionResult } from "../lib/cancel-parent-application"
export type { CancelMyApplicationActionResult } from "../lib/cancel-parent-application"
export async function cancelMyApplicationAction(applicationId: string): Promise<CancelMyApplicationActionResult> {
  const parent = await requireParentAccess({ returnTo: "/my/applications" })
  return cancelParentApplication(applicationId, parent.id, await getSupabaseServerClient(), {
    admin: getSupabaseServiceRoleClient, notify: sendStudioNotificationSafely, revalidate: revalidatePath
  })
}
