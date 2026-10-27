import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Primitivas acessíveis (padrões inspirados no shadcn/ui; sem dependências extras).

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
// Manual v1.0 (p. 20): um botão principal por área de decisão; secundário sem
// disputar protagonismo; destrutivo só com consequência compreensível.
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover",
  success: "bg-primary text-on-primary hover:bg-primary-hover", // confirmação = ação principal
  secondary: "bg-surface text-fg border border-border-strong hover:bg-elevated",
  ghost: "text-muted hover:text-fg hover:bg-elevated",
  danger: "bg-danger-bg text-danger border border-danger hover:brightness-95",
};
const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold transition-colors duration-[var(--one-duration-fast)] ease-one disabled:cursor-not-allowed disabled:opacity-50";

export function Button({
  className, variant = "primary", size = "md", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return (
    <button
      className={cn(
        buttonBase,
        size === "sm" ? "min-h-10 px-3 text-sm" : "min-h-11 px-5 text-[15px]",
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
      className={cn(buttonBase, "min-h-11 px-5 text-[15px]", buttonVariants[variant], className)}
      {...props}
    />
  );
}

// Campos: rótulo permanente, limite com contraste próprio (≥ 3:1), erro em texto.
const fieldBase =
  "w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3.5 py-2.5 text-base text-fg placeholder:text-muted transition-colors duration-[var(--one-duration-fast)] aria-[invalid=true]:border-danger aria-[invalid=true]:border-2";

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
      <label htmlFor={id} className="text-sm font-semibold text-fg">{label}</label>
      {React.cloneElement(children, { id, "aria-invalid": err ? true : undefined, "aria-describedby": describedBy })}
      {hint && !err && <p id={`${id}-hint`} className="text-sm text-muted">{hint}</p>}
      {err && <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger">{err}</p>}
    </div>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("font-display text-lg font-bold leading-6 tracking-[-0.01em] text-fg", className)} {...props} />;
}

type Tone = "neutral" | "info" | "success" | "warning" | "danger";
// Cor funcional = segundo sinal; o texto sempre nomeia a condição (p. 6 e 22).
const toneClass: Record<Tone, string> = {
  neutral: "bg-elevated text-muted",
  info: "bg-info-bg text-info",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
};

/** Badge com texto sempre presente (status nunca depende só de cor). */
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold leading-5", toneClass[tone], className)}>{children}</span>;
}

export function Alert({ tone = "info", title, children }: { tone?: Tone; title?: string; children?: React.ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-[var(--radius-card)] px-4 py-3 text-[15px] leading-6", toneClass[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-[var(--radius-card)] border border-border bg-surface px-6 py-10">
      <span aria-hidden className="mb-2 size-8 rounded-full bg-info-bg" />
      <p className="font-display text-xl font-bold text-fg">{title}</p>
      {description && <p className="max-w-md text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Cabeçalho editorial: rótulo em mono ("SEÇÃO / CONTEXTO"), título em Space Grotesk 700. */
export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2 text-muted">{eyebrow}</p>}
        <h1 className="font-display text-[28px] font-bold leading-8 tracking-[-0.02em] text-fg sm:text-[40px] sm:leading-[44px]">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: Tone }) {
  return (
    <Card className="flex min-w-0 flex-col gap-1.5 p-4 sm:p-5">
      <p className="eyebrow text-muted">{label}</p>
      <p className={cn("tabular whitespace-nowrap font-display text-lg font-bold leading-7 tracking-[-0.01em] sm:text-2xl sm:leading-8", tone === "danger" && "text-danger", tone === "success" && "text-success", tone === "warning" && "text-warning")}>{value}</p>
      {hint && <p className="text-sm text-muted">{hint}</p>}
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
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
      <table className="w-full text-[15px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="hidden text-left text-sm text-muted md:table-header-group">
          <tr className="border-b border-border-strong">{columns.map((c) => <th key={c.key} scope="col" className={cn("px-4 py-3 font-semibold", c.className)}>{c.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={rowKey(r)} className="block p-4 md:table-row md:p-0">
              {columns.map((c) => (
                <td key={c.key} data-label={c.header} className={cn("flex justify-between gap-4 py-1 md:table-cell md:px-4 md:py-3.5 before:text-sm before:text-muted before:content-[attr(data-label)] md:before:content-none", c.className)}>
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
    <nav aria-label="Paginação" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <span>Página {page} de {pages} · {total} registros</span>
      <div className="flex gap-2">
        {page > 1 && <LinkButton variant="secondary" href={hrefFor(page - 1)}>Anterior</LinkButton>}
        {page < pages && <LinkButton variant="secondary" href={hrefFor(page + 1)}>Próxima</LinkButton>}
      </div>
    </nav>
  );
}
