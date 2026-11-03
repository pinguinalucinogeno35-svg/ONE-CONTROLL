import "server-only";
import type { ActiveContext } from "@/server/auth/session";
import type { TeamProfileValues } from "@/features/team/forms";

export async function getMyTeamProfile(ctx: ActiveContext): Promise<(TeamProfileValues & { onboarding_completed_at: string | null }) | null> {
  const { data } = await ctx.supabase.from("team_profiles")
    .select("primary_function, secondary_function, works_onsite, works_remote, works_external, availability, weekly_hours_declared, phone, tools, equipment, travel_notes, notes, onboarding_completed_at")
    .eq("user_id", ctx.userId).maybeSingle();
  return data ?? null;
}

export type Absence = { id: string; user_id: string; starts_on: string; ends_on: string; reason: string | null; cancelled_at: string | null; profiles?: { full_name: string } | null };

/** Ausências a partir de hoje (RLS: a própria pessoa; administração vê todas). */
export async function getUpcomingAbsences(ctx: ActiveContext, today: string, onlyMine: boolean): Promise<Absence[]> {
  let q = ctx.supabase.from("absences").select("id, user_id, starts_on, ends_on, reason, cancelled_at, profiles!absences_user_id_fkey(full_name)")
    .is("cancelled_at", null).gte("ends_on", today).order("starts_on").limit(100);
  if (onlyMine) q = q.eq("user_id", ctx.userId);
  const { data } = await q;
  return (data ?? []) as unknown as Absence[];
}
