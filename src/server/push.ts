import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { notificationHref, pushContent } from "@/lib/notification-links";
import { log } from "@/server/logger";

/**
 * Envio de notificações push (Web Push/VAPID).
 * O banco reserva as notificações pendentes de forma atômica (claim_push_batch),
 * então chamadas simultâneas (ação + cron) nunca entregam a mesma duas vezes.
 * Sem chaves VAPID configuradas nada é reservado nem "simulado": as
 * notificações continuam disponíveis na central do app.
 */
export function isPushConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT && env.SUPABASE_SECRET_KEY);
}

type ClaimedRow = {
  notification_id: string;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  type: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  recipient_role: "admin" | "seller" | null;
};

export function buildPushPayload(row: Pick<ClaimedRow, "notification_id" | "type" | "title" | "message" | "entity_type" | "entity_id" | "recipient_role">): string {
  const { title, body } = pushContent(row.type, row.title, row.message);
  const url = notificationHref(row.entity_type, row.entity_id, row.recipient_role) ?? "/notificacoes";
  return JSON.stringify({ title, body, url, tag: row.notification_id });
}

const CONCURRENCY = 10;

export async function dispatchPendingPush(limit = 100): Promise<{ sent: number; failed: number }> {
  const result = { sent: 0, failed: 0 };
  if (!isPushConfigured()) return result;
  try {
    const env = serverEnv();
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("claim_push_batch", { p_limit: limit });
    if (error) {
      log("error", "push_claim_failed", { code: error.code, message: error.message });
      return result;
    }
    const rows = (data ?? []) as ClaimedRow[];
    if (rows.length === 0) return result;
    const vapidDetails = { subject: env.VAPID_SUBJECT!, publicKey: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY! };

    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      await Promise.all(rows.slice(i, i + CONCURRENCY).map(async (row) => {
        let status: number;
        try {
          const res = await webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            buildPushPayload(row),
            { vapidDetails, TTL: 60 * 60 * 24, urgency: row.type.startsWith("task_") ? "high" : "normal", timeout: 10_000 },
          );
          status = res.statusCode;
        } catch (e) {
          status = e instanceof webpush.WebPushError ? e.statusCode : 0;
        }
        if (status >= 200 && status < 300) result.sent += 1;
        else result.failed += 1;
        const { error: reportError } = await admin.rpc("report_push_result", { p_subscription_id: row.subscription_id, p_status: status });
        if (reportError) log("warn", "push_report_failed", { code: reportError.code });
      }));
    }
    log("info", "push_dispatched", result);
  } catch (e) {
    log("error", "push_dispatch_failed", { error: e instanceof Error ? e.message : String(e) });
  }
  return result;
}
