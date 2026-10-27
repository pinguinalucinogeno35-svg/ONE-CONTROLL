import { NextResponse, type NextRequest } from "next/server";
import { authorizeAction } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectFile, MAX_UPLOAD_BYTES, safeFilename } from "@/lib/security/file-sniff";
import { sha256Hex } from "@/lib/security/hmac";
import { isSameOrigin } from "@/server/same-origin";
import { log } from "@/server/logger";

const RESOURCES = { client_id: "clients", project_id: "projects", contract_id: "contracts", payable_id: "payables", receivable_id: "receivables" } as const;
type ResourceKey = keyof typeof RESOURCES;

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) return NextResponse.json({ error: "Arquivo acima de 10 MB" }, { status: 413 });
  try {
    const ctx = await authorizeAction();
    const form = await request.formData();
    const file = form.get("file");
    const resource = String(form.get("resource") ?? "") as ResourceKey;
    const resourceId = String(form.get("resource_id") ?? "");
    if (!(file instanceof File) || !(resource in RESOURCES) || !/^[0-9a-f-]{36}$/i.test(resourceId)) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }
    if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Arquivo vazio ou acima de 10 MB" }, { status: 413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = detectFile(file.name, bytes);
    if (!detected) return NextResponse.json({ error: "Tipo de arquivo não permitido (PDF, imagens, DOCX, XLSX ou CSV)" }, { status: 415 });

    // Autorização: o recurso precisa ser visível ao usuário sob RLS.
    const { data: visible } = await ctx.supabase.from(RESOURCES[resource]).select("id").eq("id", resourceId).maybeSingle();
    if (!visible) return NextResponse.json({ error: "Registro não encontrado" }, { status: 404 });

    const admin = createAdminClient();
    const objectPath = `${ctx.profile.organization_id}/${RESOURCES[resource]}/${resourceId}/${crypto.randomUUID()}.${detected.ext}`;
    const { error: upErr } = await admin.storage.from("documents").upload(objectPath, bytes, { contentType: detected.mime, upsert: false });
    if (upErr) throw new Error(`upload: ${upErr.message}`);
    const { data: id, error } = await admin.rpc("register_attachment", {
      p: { object_path: objectPath, original_filename: safeFilename(file.name), mime_type: detected.mime, size_bytes: file.size, sha256: sha256Hex(Buffer.from(bytes)), uploaded_by: ctx.userId, [resource]: resourceId },
    });
    if (error) {
      await admin.storage.from("documents").remove([objectPath]);
      return NextResponse.json({ error: error.code === "42501" ? "Sem permissão sobre o registro" : "Não foi possível registrar o anexo" }, { status: 400 });
    }
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });
    log("error", "upload_failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Falha no envio" }, { status: 500 });
  }
}
