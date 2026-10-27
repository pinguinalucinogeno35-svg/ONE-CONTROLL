import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Primitivas acessíveis (padrões inspirados no shadcn/ui; sem dependências extras).

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "bg-elevated text-fg border border-border hover:bg-[#1e2a3d]",
  ghost: "text-muted hover:text-fg hover:bg-elevated",
  danger: "bg-danger/90 text-white hover:bg-danger",
  success: "bg-success/90 text-[#05200f] hover:bg-success",
};

export function Button({
  className, variant = "primary", size = "md", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "min-h-9 px-3 text-sm" : "min-h-11 px-4 text-sm",
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function LinkButton({ className, variant = "primary", ...props }: React.ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return (
    <Link
      className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors", buttonVariants[variant], className)}
      {...props}
    />
  );
}

const fieldBase =
  "w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-base text-fg placeholder:text-muted/70 focus:border-primary focus:outline-none aria-[invalid=true]:border-danger sm:text-sm";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(fieldBase, "min-h-11", className)} {...props} />;
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn(fieldBase, "min-h-11", className)} {...props} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-24", className)} {...props} />;
});

/** Rótulo + controle + mensagem de erro associada (aria-describedby). */
export function Field({ id, label, error, hint, children, className }: {
  id: string; label: string; error?: string | string[]; hint?: string; children: React.ReactElement<Record<string, unknown>>; className?: string;
}) {
  const err = Array.isArray(error) ? error[0] : error;
  const describedBy = [err ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-fg">{label}</label>
      {React.cloneElement(children, { id, "aria-invalid": err ? true : undefined, "aria-describedby": describedBy })}
      {hint && !err && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
      {err && <p id={`${id}-error`} role="alert" className="text-xs text-danger">{err}</p>}
    </div>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-base font-semibold text-fg", className)} {...props} />;
}

type Tone = "neutral" | "info" | "success" | "warning" | "danger";
const toneClass: Record<Tone, string> = {
  neutral: "bg-elevated text-muted border-border",
  info: "bg-primary/15 text-blue-300 border-primary/40",
  success: "bg-success/15 text-green-300 border-success/40",
  warning: "bg-warning/15 text-amber-300 border-warning/40",
  danger: "bg-danger/15 text-red-300 border-danger/40",
};

/** Badge com texto sempre presente (status nunca depende só de cor). */
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", toneClass[tone], className)}>{children}</span>;
}

export function Alert({ tone = "info", title, children }: { tone?: Tone; title?: string; children?: React.ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-sm", toneClass[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-border px-6 py-12 text-center">
      <p className="font-medium text-fg">{title}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: Tone }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cn("tabular text-xl font-semibold sm:text-2xl", tone === "danger" && "text-red-300", tone === "success" && "text-green-300", tone === "warning" && "text-amber-300")}>{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </Card>
  );
}

/**
 * Tabela responsiva: em telas pequenas cada linha vira um cartão
 * (cada célula exibe o rótulo da coluna via data-label).
 */
export function DataTable<T>({ columns, rows, rowKey, caption, empty }: {
  columns: { key: string; header: string; cell: (row: T) => React.ReactNode; className?: string }[];
  rows: T[];
  rowKey: (row: T) => string;
  caption?: string;
  empty?: React.ReactNode;
}) {
  if (rows.length === 0) return <>{empty ?? <EmptyState title="Nenhum registro encontrado" />}</>;
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border">
      <table className="w-full text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="hidden bg-elevated text-left text-xs uppercase tracking-wide text-muted md:table-header-group">
          <tr>{columns.map((c) => <th key={c.key} scope="col" className={cn("px-4 py-3 font-medium", c.className)}>{c.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={rowKey(r)} className="block bg-surface p-3 md:table-row md:p-0">
              {columns.map((c) => (
                <td key={c.key} data-label={c.header} className={cn("flex justify-between gap-4 py-1 md:table-cell md:px-4 md:py-3 before:text-xs before:text-muted before:content-[attr(data-label)] md:before:content-none", c.className)}>
                  <span className="text-right md:text-left">{c.cell(r)}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Paginação" className="mt-4 flex items-center justify-between text-sm text-muted">
      <span>Página {page} de {pages} · {total} registros</span>
      <div className="flex gap-2">
        {page > 1 && <LinkButton variant="secondary" href={hrefFor(page - 1)}>Anterior</LinkButton>}
        {page < pages && <LinkButton variant="secondary" href={hrefFor(page + 1)}>Próxima</LinkButton>}
      </div>
    </nav>
  );
}
