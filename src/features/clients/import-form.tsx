"use client";

import { useActionState, useRef } from "react";
import { importClientsAction, type ImportPreview } from "./import-actions";
import { Alert, Button, Field, Select } from "@/components/ui";

const FIELD_LABEL: Record<string, string> = { contact_name: "Nome do contato", company_name: "Empresa", email: "E-mail", whatsapp: "WhatsApp", instagram: "Instagram", tax_id: "CNPJ/CPF", business_description: "Descrição" };

export function ImportForm({ sellers }: { sellers?: { id: string; full_name: string }[] }) {
  const [state, action, pending] = useActionState(importClientsAction, null);
  const modeRef = useRef<HTMLInputElement>(null);
  const preview = state?.ok ? (state.data as ImportPreview) : null;
  return (
    <form action={action} className="flex flex-col gap-4">
      <input ref={modeRef} type="hidden" name="mode" defaultValue="preview" />
      <Field id="file" label="Arquivo CSV ou XLSX (até 900 KB, 1.000 linhas)" hint="Colunas: nome_contato, nome_empresa, email, whatsapp, instagram, cnpj">
        <input name="file" type="file" accept=".csv,.xlsx" required className="text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-elevated file:px-3 file:py-2 file:text-fg" />
      </Field>
      {sellers && (
        <Field id="seller_id" label="Carteira de destino">
          <Select name="seller_id"><option value="">Minha carteira</option>{sellers.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select>
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="secondary" disabled={pending} onClick={() => { if (modeRef.current) modeRef.current.value = "preview"; }}>Pré-visualizar</Button>
        <Button type="submit" disabled={pending || !preview || preview.validCount === 0 || !!preview.committed} onClick={() => { if (modeRef.current) modeRef.current.value = "commit"; }}>
          Importar {preview ? `${preview.validCount} linha(s) válida(s)` : ""}
        </Button>
      </div>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      {preview && (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-muted">Linhas: {preview.totalRows} · válidas: {preview.validCount} · inválidas: {preview.invalid.length} · codificação: {preview.encoding}</p>
          <div>
            <p className="mb-1 font-medium">Mapeamento de colunas</p>
            <ul className="grid gap-1 sm:grid-cols-2">
              {Object.entries(preview.mapping).map(([col, f]) => <li key={col} className="text-muted">“{col}” → <span className={f ? "text-fg" : "text-warning"}>{f ? FIELD_LABEL[f] : "ignorada"}</span></li>)}
            </ul>
          </div>
          {preview.invalid.length > 0 && (
            <details open><summary className="cursor-pointer font-medium text-warning">Linhas com erro ({preview.invalid.length})</summary>
              <ul className="mt-2 max-h-48 overflow-auto text-xs text-muted">{preview.invalid.slice(0, 100).map((e) => <li key={e.row}>Linha {e.row}: {e.errors.join("; ")}</li>)}</ul>
            </details>
          )}
          {preview.committed && preview.committed.errors.length > 0 && (
            <details open><summary className="cursor-pointer font-medium text-warning">Rejeitadas pelo banco ({preview.committed.errors.length})</summary>
              <ul className="mt-2 max-h-48 overflow-auto text-xs text-muted">{preview.committed.errors.map((e) => <li key={e.row}>Item {e.row}: {e.error}</li>)}</ul>
            </details>
          )}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs"><thead className="bg-elevated text-muted"><tr><th className="p-2 text-left">Empresa</th><th className="p-2 text-left">Contato</th><th className="p-2 text-left">E-mail</th><th className="p-2 text-left">WhatsApp</th></tr></thead>
              <tbody>{preview.sample.map((r, i) => <tr key={i} className="border-t border-border"><td className="p-2">{r.company_name}</td><td className="p-2">{r.contact_name}</td><td className="p-2">{r.email ?? "—"}</td><td className="p-2">{r.whatsapp ?? "—"}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </form>
  );
}
