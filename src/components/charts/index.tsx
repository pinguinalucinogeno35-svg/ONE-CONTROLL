"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import { formatBRL } from "@/lib/money";

// Paleta validada (scripts do skill dataviz) para superfície #101723:
// série 1 azul #3987e5, série 2 laranja #d95926 — CVD ΔE 26.8, contraste ≥ 3:1.
// Cores de status (verde/vermelho) não são usadas para séries.
const SERIES = ["#3987e5", "#d95926"] as const;
const AXIS = { stroke: "#94a3b8", fontSize: 12 };
const GRID = "#263244";

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const axisMoney = (cents: number) => `R$ ${compact.format(cents / 100)}`;

type TooltipEntry = { name?: string; value?: number; color?: string };
function MoneyTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-elevated px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-fg">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-muted">
          <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="tabular text-fg">{formatBRL(Number(p.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-4 text-xs text-muted" aria-label="Legenda">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2"><span aria-hidden className="inline-block h-2 w-3 rounded-sm" style={{ background: i.color }} />{i.label}</li>
      ))}
    </ul>
  );
}

/** Tabela alternativa (acessibilidade): os mesmos dados em texto. */
function DataView({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-2 text-xs text-muted">
      <summary className="cursor-pointer select-none hover:text-fg">Ver dados em tabela</summary>
      <div className="mt-2 max-h-64 overflow-auto">
        <table className="w-full">
          <thead><tr>{headers.map((h) => <th key={h} scope="col" className="py-1 pr-3 text-left font-medium">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className="tabular py-1 pr-3">{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

export type InOutPoint = { label: string; entradas: number; saidas: number };

/** Entradas × saídas confirmadas por mês (centavos). */
export function InOutChart({ data }: { data: InOutPoint[] }) {
  return (
    <figure>
      <Legend items={[{ label: "Entradas", color: SERIES[0] }, { label: "Saídas", color: SERIES[1] }]} />
      <div className="h-64" role="img" aria-label="Gráfico de barras de entradas e saídas confirmadas por mês">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} margin={{ left: 4, right: 4, top: 4 }}>
            <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="0" />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={axisMoney} tick={AXIS} axisLine={false} tickLine={false} width={72} />
            <Tooltip content={<MoneyTooltip />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
            <Bar dataKey="entradas" name="Entradas" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="saidas" name="Saídas" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataView headers={["Mês", "Entradas", "Saídas"]} rows={data.map((d) => [d.label, formatBRL(d.entradas), formatBRL(d.saidas)])} />
    </figure>
  );
}

/** Uma série: valores por categoria (barras horizontais, ordenadas). */
export function CategoryBarChart({ data, ariaLabel }: { data: { label: string; value: number }[]; ariaLabel: string }) {
  const height = Math.max(160, data.length * 34);
  return (
    <figure>
      <div style={{ height }} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tickFormatter={axisMoney} tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="label" tick={AXIS} axisLine={false} tickLine={false} width={130} />
            <Tooltip content={<MoneyTooltip />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
            <Bar dataKey="value" name="Valor" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataView headers={["Categoria", "Valor"]} rows={data.map((d) => [d.label, formatBRL(d.value)])} />
    </figure>
  );
}

/** Saldo projetado semana a semana (série única). */
export function ProjectionChart({ data }: { data: { label: string; saldo: number }[] }) {
  return (
    <figure>
      <div className="h-56" role="img" aria-label="Linha do saldo projetado nas próximas semanas">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={axisMoney} tick={AXIS} axisLine={false} tickLine={false} width={72} />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
            <Tooltip content={<MoneyTooltip />} />
            <Line type="monotone" dataKey="saldo" name="Saldo projetado" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "#101723" }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataView headers={["Semana", "Saldo projetado"]} rows={data.map((d) => [d.label, formatBRL(d.saldo)])} />
    </figure>
  );
}
