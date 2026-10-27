import { getAuthContext } from "@/server/auth/session";
import { formatDateTime } from "@/lib/dates";
import { UploadForm } from "./upload-form";

type Resource = "client_id" | "project_id" | "contract_id" | "payable_id" | "receivable_id";

/** Lista anexos visíveis ao usuário (RLS) e permite enviar novos. */
export async function Attachments({ resource, resourceId, canUpload = true }: { resource: Resource; resourceId: string; canUpload?: boolean }) {
  const ctx = await getAuthContext();
  if (!ctx?.profile) return null;
  const { data } = await ctx.supabase.from("file_attachments").select("id, original_filename, size_bytes, created_at").eq(resource, resourceId).order("created_at", { ascending: false });
  return (
    <div className="flex flex-col gap-3">
      {(data ?? []).length === 0 ? <p className="text-sm text-muted">Nenhum documento anexado.</p> : (
        <ul className="divide-y divide-border text-sm">
          {data!.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-2">
              <a href={`/api/files/${f.id}`} className="truncate text-primary hover:underline">{f.original_filename}</a>
              <span className="shrink-0 text-xs text-muted">{(Number(f.size_bytes) / 1024).toFixed(0)} KB · {formatDateTime(f.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
      {canUpload && <UploadForm resource={resource} resourceId={resourceId} />}
    </div>
  );
}
