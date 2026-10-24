import "server-only"

import { runOptOutSync, type OptOutSyncSummary } from "@/features/marketing-consent/lib/opt-out-sync"
import { hashRecontactPhone, sendOptOutNotice } from "@/features/marketing-consent/server/consent-notice-sender"
import { getNcloudMessageResult, listNcloudUnsubscribes } from "@/features/notifications/sms/providers/ncloud"
import { getNcloudSmsConfig } from "@/features/notifications/sms/sender"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { getLocalMutationGuard } from "@/shared/config/server-env"

const STALE_CLAIM_MS = 60 * 60 * 1000
const RESULT_BATCH_LIMIT = 500

const chunk = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size))

/**
 * 080 무료수신거부 매일 동기화 + 안내 문자 결과 확인(vercel.json 0 0 * * * = KST 09:00).
 * 규칙은 lib/opt-out-sync.ts. 여기서는 NCP · DB(service role) · 문자를 잇는다.
 *
 * 로컬 개발 서버가 운영 DB 를 보면 아무것도 하지 않는다(getLocalMutationGuard).
 * NCP 설정이 없으면 080 목록 · 결과 확인을 건너뛰고 오류 없이 끝난다. 080 번호를 아직 신청하지 않아 목록이 비어 있어도 같다.
 * 처리 결과 알림은 SMS_SEND_ENABLED 가 꺼져 있으면 dry_run 으로 남는다(sendSms).
 */
export async function runMarketingOptOutSync(now = new Date()): Promise<OptOutSyncSummary | { blocked: string }> {
  const guard = getLocalMutationGuard()
  if (!guard.allowed) return { blocked: guard.code }

  const db = getSupabaseServiceRoleClient()
  const config = getNcloudSmsConfig()

  return runOptOutSync({
    now,
    hash: hashRecontactPhone,
    releaseStaleClaims: async () => {
      const { data, error } = await db
        .from("marketing_consent_notices")
        .update({ status: "failed", error_code: "stale_claim", updated_at: now.toISOString() })
        .eq("source", "opt_out_080")
        .eq("status", "claimed")
        .lt("created_at", new Date(now.getTime() - STALE_CLAIM_MS).toISOString())
        .select("id")
      if (error) throw new Error("failed_to_release_stale_opt_out_claims")
      return (data ?? []).length
    },
    listUnsubscribes: config
      ? async (window) => (await listNcloudUnsubscribes(config, window)).map((item) => ({
          phone: item.clientTelNo,
          registerTime: item.registerTime,
          registerType: item.registerType
        }))
      : null,
    insertOptOuts: async (rows) => {
      for (const part of chunk(rows, 200)) {
        const { error } = await db
          .from("marketing_opt_out_phones")
          .upsert(part.map((row) => ({ phone_hash: row.phoneHash, opted_out_at: row.optedOutAt, source: row.source })), {
            onConflict: "phone_hash",
            ignoreDuplicates: true
          })
        if (error) throw new Error("failed_to_insert_opt_out_phones")
      }
    },
    findParents: async (hashes) => {
      const rows: Array<{ phoneHash: string; parentId: string }> = []
      for (const part of chunk(hashes, 200)) {
        const { data, error } = await db.rpc("find_recontact_parents_by_phone_hash", { p_hashes: part })
        if (error) throw new Error("failed_to_find_opt_out_parents")
        for (const row of (data ?? []) as Array<{ phone_hash: string; parent_id: string }>) {
          rows.push({ phoneHash: row.phone_hash, parentId: row.parent_id })
        }
      }
      return rows
    },
    sendNotice: async (input) => {
      try {
        return await sendOptOutNotice(input)
      } catch {
        return { status: "failed", reason: "notice_exception", claimed: false }
      }
    },
    listPendingResults: async (window) => {
      const { data, error } = await db
        .from("recontact_recipients")
        .select("id, phone_hash, provider_message_id")
        .eq("status", "sent")
        .is("result_checked_at", null)
        .not("provider_message_id", "is", null)
        .gte("created_at", window.from)
        .lte("created_at", window.to)
        .order("created_at", { ascending: true })
        .limit(RESULT_BATCH_LIMIT)
      if (error) throw new Error("failed_to_list_recontact_results")
      return ((data ?? []) as Array<{ id: string; phone_hash: string; provider_message_id: string }>).map((row) => ({
        id: row.id,
        phoneHash: row.phone_hash,
        requestId: row.provider_message_id
      }))
    },
    getMessageResult: config ? (requestId) => getNcloudMessageResult(config, requestId) : null,
    listOptedOutHashes: async (hashes) => {
      const found = new Set<string>()
      for (const part of chunk(hashes, 200)) {
        const { data, error } = await db.from("marketing_opt_out_phones").select("phone_hash").in("phone_hash", part)
        if (error) throw new Error("failed_to_list_opted_out_hashes")
        for (const row of (data ?? []) as Array<{ phone_hash: string }>) found.add(row.phone_hash)
      }
      return found
    },
    updateRecipient: async (id, patch, checkedAt) => {
      const { error } = await db
        .from("recontact_recipients")
        .update({
          status: patch.status,
          provider_result_code: patch.providerResultCode,
          result_checked_at: checkedAt,
          ...(patch.errorCode ? { error_code: patch.errorCode } : {})
        })
        .eq("id", id)
        .eq("status", "sent")
      if (error) throw new Error("failed_to_update_recontact_result")
    }
  })
}
