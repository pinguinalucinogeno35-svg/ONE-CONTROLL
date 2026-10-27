"use client";

import { useSyncExternalStore } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import { formatBRL } from "@/lib/money";

// Cores por tema via tokens (globals.css). Paleta validada com o validador do
// skill dataviz: claro #0066FF/#D95926 sobre #FFFFFF; escuro #3987E5/#D95926
// sobre #17191F (CVD e contraste ≥ 3:1). Cores de status não viram séries.
const SERIES = ["var(--one-chart-1)", "var(--one-chart-2)"] as const;
const AXIS = { fill: "var(--one-muted)", fontSize: 12, fontFamily: "var(--font-mono)" };
const GRID = "var(--one-chart-grid)";

// Movimento: 260 ms (token "slow") e nenhum com prefers-reduced-motion (manual, p. 25).
const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(MOTION_QUERY); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia(MOTION_QUERY).matches,
    () => true,
  );
}

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
// Sem espaço quebrável: o rótulo do eixo nunca divide em duas linhas.
const axisMoney = (cents: number) => `R$\u00a0${compact.format(cents / 100).replace(/\s/g, "\u00a0")}`;

type TooltipEntry = { name?: string; value?: number; color?: string };
function MoneyTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-sm shadow-[var(--one-shadow)]">
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
    <ul className="mb-3 flex flex-wrap gap-4 text-sm text-muted" aria-label="Legenda">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2"><span aria-hidden className="inline-block h-2 w-3 rounded-sm" style={{ background: i.color }} />{i.label}</li>
      ))}
    </ul>
  );
}

/** Tabela alternativa (acessibilidade): os mesmos dados em texto. */
function DataView({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-sm text-muted">
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
  const animate = !useReducedMotion();
  return (
    <figure>
      <Legend items={[{ label: "Entradas", color: SERIES[0] }, { label: "Saídas", color: SERIES[1] }]} />
      <div className="h-64" role="img" aria-label="Gráfico de barras de entradas e saídas confirmadas por mês">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} margin={{ left: 4, right: 4, top: 4 }}>
            <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="0" />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={axisMoney} tick={AXIS} axisLine={false} tickLine={false} width={84} />
            <Tooltip content={<MoneyTooltip />} cursor={{ fill: "var(--one-elevated)" }} />
            <Bar dataKey="entradas" name="Entradas" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={animate} animationDuration={260} />
            <Bar dataKey="saidas" name="Saídas" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={animate} animationDuration={260} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataView headers={["Mês", "Entradas", "Saídas"]} rows={data.map((d) => [d.label, formatBRL(d.entradas), formatBRL(d.saidas)])} />
    </figure>
  );
}

/** Uma série: valores por categoria (barras horizontais, ordenadas). */
export function CategoryBarChart({ data, ariaLabel }: { data: { label: string; value: number }[]; ariaLabel: string }) {
  const animate = !useReducedMotion();
  const height = Math.max(160, data.length * 34);
  return (
    <figure>
      <div style={{ height }} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tickFormatter={axisMoney} tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="label" tick={AXIS} axisLine={false} tickLine={false} width={130} />
            <Tooltip content={<MoneyTooltip />} cursor={{ fill: "var(--one-elevated)" }} />
            <Bar dataKey="value" name="Valor" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={animate} animationDuration={260} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataView headers={["Categoria", "Valor"]} rows={data.map((d) => [d.label, formatBRL(d.value)])} />
    </figure>
  );
}

/** Saldo projetado semana a semana (série única). */
export function ProjectionChart({ data }: { data: { label: string; saldo: number }[] }) {
  const animate = !useReducedMotion();
  return (
    <figure>
      <div className="h-56" role="img" aria-label="Linha do saldo projetado nas próximas semanas">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={axisMoney} tick={AXIS} axisLine={false} tickLine={false} width={84} />
            <ReferenceLine y={0} stroke="var(--one-border-strong)" strokeDasharray="4 4" />
            <Tooltip content={<MoneyTooltip />} />
            <Line type="monotone" dataKey="saldo" name="Saldo projetado" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--one-surface)", fill: SERIES[0] }} activeDot={{ r: 6, stroke: "var(--one-surface)", fill: SERIES[0] }} isAnimationActive={animate} animationDuration={260} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataView headers={["Semana", "Saldo projetado"]} rows={data.map((d) => [d.label, formatBRL(d.saldo)])} />
    </figure>
  );
}
