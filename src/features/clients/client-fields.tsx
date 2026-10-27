"use client";

import { TextField, TextAreaField } from "@/components/ui/server-form";

export type ClientValues = Partial<Record<"contact_name" | "company_name" | "email" | "whatsapp" | "instagram" | "website" | "tax_id" | "business_description" | "lead_source", string | null>>;

export function ClientFields({ values = {} }: { values?: ClientValues }) {
  const v = (k: keyof ClientValues) => values[k] ?? "";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField name="contact_name" label="Nome do contato" required defaultValue={v("contact_name")} autoComplete="name" />
      <TextField name="company_name" label="Empresa" required defaultValue={v("company_name")} autoComplete="organization" />
      <TextField name="email" label="E-mail" type="email" inputMode="email" defaultValue={v("email")} />
      <TextField name="whatsapp" label="WhatsApp" type="tel" inputMode="tel" placeholder="(71) 99999-0000" defaultValue={v("whatsapp")} />
      <TextField name="instagram" label="Instagram" placeholder="@empresa" defaultValue={v("instagram")} />
      <TextField name="website" label="Site" type="url" placeholder="https://" defaultValue={v("website")} />
      <TextField name="tax_id" label="CNPJ/CPF (opcional)" inputMode="numeric" defaultValue={v("tax_id")} />
      <TextField name="lead_source" label="Origem do lead" placeholder="Instagram, indicação, evento…" defaultValue={v("lead_source")} />
      <TextAreaField name="business_description" label="Descrição do negócio" className="sm:col-span-2" defaultValue={v("business_description")} />
    </div>
  );
}
