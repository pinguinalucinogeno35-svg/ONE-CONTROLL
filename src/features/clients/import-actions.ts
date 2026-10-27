"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/action";
import { parseImport, type ParsedImport } from "@/server/services/import-parser";
import type { ActionResult } from "@/server/errors";

export type ImportPreview = Omit<ParsedImport, "valid"> & { sample: ParsedImport["valid"]; validCount: number; committed?: { accepted: number; rejected: number; errors: { row: number; error: string }[] } };

const schema = z.object({
  file: z.instanceof(File, { message: "Selecione um arquivo" }),
  mode: z.enum(["preview", "commit"]),
  seller_id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
});

export async function importClientsAction(_prev: ActionResult<unknown> | null, fd: FormData) {
  const input = { file: fd.get("file"), mode: fd.get("mode"), seller_id: fd.get("seller_id") ?? undefined };
  return runAction({ name: "import_clients", schema, input }, async (ctx, data) => {
    let parsed: ParsedImport;
    try {
      parsed = await parseImport(data.file.name, Buffer.from(await data.file.arrayBuffer()));
    } catch (e) {
      return { error: { code: "22023", message: e instanceof Error ? e.message : "Arquivo inválido" } };
    }
    const preview: ImportPreview = { ...parsed, sample: parsed.valid.slice(0, 20), validCount: parsed.valid.length };
    delete (preview as Partial<ParsedImport>).valid;
    if (data.mode === "preview") return { data: preview };
    if (parsed.valid.length === 0) return { error: { code: "22023", message: "Nenhuma linha válida para importar" } };
    const { data: res, error } = await ctx.supabase.rpc("import_clients_batch", {
      p_rows: parsed.valid, p_source: data.file.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv",
      p_file_name: data.file.name.slice(0, 200), p_content_hash: parsed.hash,
      p_target_seller_id: ctx.profile.role === "admin" ? data.seller_id ?? ctx.userId : null,
    });
    if (error) return { error };
    const r = res as { accepted: number; rejected: number; errors: { row: number; error: string }[] };
    revalidatePath("/clientes");
    return { data: { ...preview, committed: r }, message: `${r.accepted} cliente(s) importado(s); ${r.rejected + parsed.invalid.length} linha(s) rejeitada(s).` };
  });
}
