"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { SelectField, ServerForm, TextAreaField, TextField } from "@/components/ui/server-form";
import { KIT_ASSET_KIND } from "@/lib/labels";
import type { Kit, KitColor } from "@/server/services/kits";
import { addKitAssetAction, saveClientKitAction } from "./actions";

function ColorsEditor({ initial }: { initial: KitColor[] }) {
  const [colors, setColors] = useState<KitColor[]>(initial);
  const update = (i: number, patch: Partial<KitColor>) => setColors((c) => c.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <fieldset className="flex flex-col gap-2 sm:col-span-2">
      <legend className="mb-1 text-[15px] font-semibold">Cores da marca</legend>
      <input type="hidden" name="colors" value={JSON.stringify(colors)} />
      {colors.map((c, i) => (
        <div key={i} className="grid grid-cols-[auto_1fr_1fr_auto] items-end gap-2">
          <input type="color" aria-label={`Cor ${i + 1}`} value={/^#[0-9A-Fa-f]{6}$/.test(c.hex) ? c.hex : "#000000"} onChange={(e) => update(i, { hex: e.target.value.toUpperCase() })}
            className="h-11 w-12 cursor-pointer rounded-[var(--radius-control)] border border-border-strong bg-surface" />
          <Field id={`kc-name-${i}`} label="Nome"><Input value={c.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Ex.: Azul principal" maxLength={40} /></Field>
          <Field id={`kc-hex-${i}`} label="Código"><Input value={c.hex} onChange={(e) => update(i, { hex: e.target.value })} placeholder="#0066FF" maxLength={7} /></Field>
          <Button type="button" variant="ghost" size="sm" onClick={() => setColors((x) => x.filter((_, j) => j !== i))} aria-label={`Remover cor ${i + 1}`}><Trash2 aria-hidden className="size-4" /></Button>
        </div>
      ))}
      <div><Button type="button" variant="secondary" size="sm" disabled={colors.length >= 12} onClick={() => setColors((x) => [...x, { name: "", hex: "#000000" }])}>
        <Plus aria-hidden className="size-4" />Adicionar cor</Button></div>
    </fieldset>
  );
}

export function KitForm({ clientId, kit }: { clientId: string; kit: Kit | null }) {
  return (
    <ServerForm action={saveClientKitAction.bind(null, clientId)} submitLabel="Salvar kit">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="activity" label="Atividade" defaultValue={kit?.activity ?? ""} placeholder="Ex.: clínica odontológica" />
        <TextField name="operational_contact" label="Contato operacional" defaultValue={kit?.operational_contact ?? ""} hint="Quem a produção procura (nome e telefone), se necessário." />
        <TextAreaField name="positioning" label="Posicionamento (resumo)" rows={3} defaultValue={kit?.positioning ?? ""} className="sm:col-span-2" />
        <TextAreaField name="audience" label="Público" rows={2} defaultValue={kit?.audience ?? ""} className="sm:col-span-2" />
        <ColorsEditor initial={kit?.colors ?? []} />
        <TextField name="fonts" label="Tipografia" defaultValue={kit?.fonts ?? ""} placeholder="Ex.: Montserrat (títulos), Inter (texto)" className="sm:col-span-2" />
        <TextAreaField name="restrictions" label="Restrições" rows={3} defaultValue={kit?.restrictions ?? ""} className="sm:col-span-2"
          hint="Palavras proibidas, exigências regulatórias, o que nunca fazer." />
        <TextAreaField name="image_rules" label="Imagem e consentimentos" rows={2} defaultValue={kit?.image_rules ?? ""} className="sm:col-span-2" />
        <TextAreaField name="approval_notes" label="Orientações de aprovação" rows={2} defaultValue={kit?.approval_notes ?? ""} className="sm:col-span-2" />
      </div>
    </ServerForm>
  );
}

export function KitAssetForm({ clientId }: { clientId: string }) {
  return (
    <ServerForm action={addKitAssetAction.bind(null, clientId)} submitLabel="Adicionar material" variant="secondary" resetOnSuccess>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr]">
        <SelectField name="kind" label="Tipo" defaultValue="logo" options={Object.entries(KIT_ASSET_KIND).map(([value, label]) => ({ value, label }))} />
        <TextField name="label" label="Nome" required placeholder="Ex.: Logo horizontal (PNG)" />
        <TextField name="url" label="Link (https://)" required inputMode="url" placeholder="https://drive.google.com/…" />
      </div>
      <TextField name="note" label="Observação (opcional)" placeholder="Ex.: usar só em fundo claro" />
    </ServerForm>
  );
}
