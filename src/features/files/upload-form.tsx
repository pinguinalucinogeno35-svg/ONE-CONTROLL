"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function UploadForm({ resource, resourceId }: { resource: string; resourceId: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = ref.current?.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setMsg({ tone: "err", text: "Arquivo acima de 10 MB." }); return; }
    setBusy(true); setMsg(null);
    const fd = new FormData();
    fd.set("file", file); fd.set("resource", resource); fd.set("resource_id", resourceId);
    try {
      const res = await fetch("/api/files", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setMsg({ tone: "err", text: body.error ?? "Falha no envio." });
      else { setMsg({ tone: "ok", text: "Arquivo enviado." }); if (ref.current) ref.current.value = ""; router.refresh(); }
    } catch {
      setMsg({ tone: "err", text: "Sem conexão. O arquivo não foi enviado." });
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={upload} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="sr-only" htmlFor={`file-${resourceId}`}>Arquivo</label>
      <input ref={ref} id={`file-${resourceId}`} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.csv" className="text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-elevated file:px-3 file:py-2 file:text-fg" />
      <Button type="submit" size="sm" variant="secondary" disabled={busy}>{busy ? "Enviando…" : "Enviar"}</Button>
      {msg && <span role={msg.tone === "err" ? "alert" : "status"} className={msg.tone === "err" ? "text-xs text-danger" : "text-xs text-green-300"}>{msg.text}</span>}
    </form>
  );
}
