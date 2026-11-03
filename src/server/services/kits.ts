import "server-only";
import type { ActiveContext } from "@/server/auth/session";

export type KitColor = { name: string; hex: string };
export type Kit = {
  client_id: string; activity: string | null; positioning: string | null; audience: string | null; colors: KitColor[];
  fonts: string | null; restrictions: string | null; image_rules: string | null; approval_notes: string | null;
  operational_contact: string | null; updated_at: string;
};
export type KitAsset = { id: string; kind: string; label: string; url: string; note: string | null; created_at: string };

/** Kit e materiais (RLS: administração, vendedor do cliente ou quem tem trabalho no cliente). */
export async function getKit(ctx: ActiveContext, clientId: string): Promise<{ kit: Kit | null; assets: KitAsset[] }> {
  const [k, a] = await Promise.all([
    ctx.supabase.from("client_kits").select("client_id, activity, positioning, audience, colors, fonts, restrictions, image_rules, approval_notes, operational_contact, updated_at").eq("client_id", clientId).maybeSingle(),
    ctx.supabase.from("client_kit_assets").select("id, kind, label, url, note, created_at").eq("client_id", clientId).is("removed_at", null).order("kind").order("created_at"),
  ]);
  return { kit: (k.data as Kit | null) ?? null, assets: (a.data ?? []) as KitAsset[] };
}
