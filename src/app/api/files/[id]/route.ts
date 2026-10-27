import { NextResponse, type NextRequest } from "next/server";
import { authorizeAction } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";

/** Download: autoriza via RLS do anexo e redireciona para URL assinada de 60 s. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authorizeAction();
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Inválido" }, { status: 400 });
    const { data: file } = await ctx.supabase.from("file_attachments").select("object_path, original_filename").eq("id", id).maybeSingle();
    if (!file) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    const { data, error } = await createAdminClient().storage.from("documents").createSignedUrl(file.object_path, 60, { download: file.original_filename });
    if (error || !data) return NextResponse.json({ error: "Indisponível" }, { status: 502 });
    const res = NextResponse.redirect(data.signedUrl, 303);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Falha" }, { status: 500 });
  }
}
