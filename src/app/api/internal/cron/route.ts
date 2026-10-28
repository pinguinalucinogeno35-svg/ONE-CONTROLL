import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { log } from "@/server/logger";

export const dynamic = "force-dynamic";

/** Rotina diária (Vercel Cron envia Authorization: Bearer $CRON_SECRET). */
export async function GET(request: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const [jobs, tasks] = await Promise.all([admin.rpc("run_daily_jobs"), admin.rpc("run_task_reminders")]);
  const error = jobs.error ?? tasks.error;
  if (error) {
    log("error", "daily_jobs_failed", { code: error.code, message: error.message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  log("info", "daily_jobs_done", { result: jobs.data, tasks: tasks.data });
  return NextResponse.json({ ok: true, result: jobs.data, tasks: tasks.data });
}
