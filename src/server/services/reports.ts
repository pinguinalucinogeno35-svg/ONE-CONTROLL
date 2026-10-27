import "server-only";
import type { ActiveContext } from "@/server/auth/session";
import { formatDate, todayISO } from "@/lib/dates";
import { fromDecimalString, toDecimalString } from "@/lib/money";
import { CLIENT_STATUS, COMMISSION_STATUS, CONTRACT_STATUS, PAYABLE_STATUS, RECEIVABLE_STATUS, RECEIVABLE_TYPE, SALE_ORIGIN, PAYMENT_METHOD } from "@/lib/labels";
import type { CashFlowWeek } from "@/types/db";

export type Report = { title: string; headers: string[]; rows: (string | number)[][] };
type Def = { title: string; description: string; adminOnly: boolean; run: (ctx: ActiveContext, from: string, to: string) => Promise<Report> };

const MAX = 10_000;
const dec = (v: unknown) => toDecimalString(fromDecimalString(v as string));
const range = (from: string, to: string) => [`${from}T00:00:00-03:00`, `${to}T23:59:59-03:00`] as const;
type Joined<T> = T | null;

// Todas as consultas usam o cliente do usuário: RLS limita as linhas
// (vendedor nunca exporta dados de outra carteira, mesmo alterando parâmetros).
export const REPORTS: Record<string, Def> = {
  clientes: {
    title: "Clientes por vendedor", description: "Carteira com status e origem", adminOnly: false,
    run: async (ctx) => {
      const { data } = await ctx.supabase.from("clients").select("company_name, contact_name, email, whatsapp, status, lead_source, created_at, profiles!clients_seller_id_fkey(full_name)").order("company_name").limit(MAX);
      return { title: "Clientes por vendedor", headers: ["Vendedor", "Empresa", "Contato", "E-mail", "WhatsApp", "Status", "Origem", "Cadastro"],
        rows: (data ?? []).map((c) => [(c.profiles as unknown as Joined<{ full_name: string }>)?.full_name ?? "", c.company_name, c.contact_name, c.email ?? "", c.whatsapp ?? "", CLIENT_STATUS[c.status]?.[0] ?? c.status, c.lead_source ?? "", formatDate(c.created_at)]) };
    },
  },
  contratos: {
    title: "Contratos por período", description: "Contratos com início no período", adminOnly: false,
    run: async (ctx, from, to) => {
      const { data } = await ctx.supabase.from("contracts").select("contract_number, status, implementation_amount, monthly_amount, start_date, sale_origin, commission_rate_bps, clients(company_name), profiles!contracts_seller_id_fkey(full_name)")
        .gte("start_date", from).lte("start_date", to).order("start_date").limit(MAX);
      return { title: "Contratos por período", headers: ["Número", "Cliente", "Vendedor", "Status", "Implementação", "Mensalidade", "Início", "Origem", "Comissão (%)"],
        rows: (data ?? []).map((k) => [k.contract_number, (k.clients as unknown as Joined<{ company_name: string }>)?.company_name ?? "", (k.profiles as unknown as Joined<{ full_name: string }>)?.full_name ?? "", CONTRACT_STATUS[k.status]?.[0] ?? k.status, dec(k.implementation_amount), dec(k.monthly_amount), formatDate(k.start_date), SALE_ORIGIN[k.sale_origin] ?? "", k.commission_rate_bps != null ? (k.commission_rate_bps / 100).toFixed(2) : ""]) };
    },
  },
  "servicos-mais-vendidos": {
    title: "Serviços mais vendidos", description: "Itens em contratos aprovados no período", adminOnly: true,
    run: async (ctx, from, to) => {
      const { data } = await ctx.supabase.from("contract_services").select("quantity, services(name), contracts!inner(status, start_date)")
        .in("contracts.status", ["approved", "active", "completed"]).gte("contracts.start_date", from).lte("contracts.start_date", to).limit(MAX);
      const agg = new Map<string, { qty: number; contracts: number }>();
      for (const r of data ?? []) {
        const name = (r.services as unknown as Joined<{ name: string }>)?.name ?? "—";
        const a = agg.get(name) ?? { qty: 0, contracts: 0 };
        a.qty += Number(r.quantity); a.contracts += 1; agg.set(name, a);
      }
      return { title: "Serviços mais vendidos", headers: ["Serviço", "Contratos", "Quantidade"], rows: [...agg.entries()].sort((a, b) => b[1].contracts - a[1].contracts).map(([n, a]) => [n, a.contracts, a.qty]) };
    },
  },
  "implementacoes-contratadas": {
    title: "Implementações contratadas", description: "Contratos aprovados com implementação", adminOnly: true,
    run: async (ctx, from, to) => {
      const [f, t] = range(from, to);
      const { data } = await ctx.supabase.from("contracts").select("contract_number, implementation_amount, approved_at, clients(company_name)").gt("implementation_amount", 0).gte("approved_at", f).lte("approved_at", t).order("approved_at").limit(MAX);
      return { title: "Implementações contratadas", headers: ["Contrato", "Cliente", "Aprovado em", "Implementação"], rows: (data ?? []).map((k) => [k.contract_number, (k.clients as unknown as Joined<{ company_name: string }>)?.company_name ?? "", formatDate(k.approved_at), dec(k.implementation_amount)]) };
    },
  },
  "mensalidades-ativas": {
    title: "Mensalidades ativas", description: "Agendas de cobrança recorrente ativas", adminOnly: true,
    run: async (ctx) => {
      const { data } = await ctx.supabase.from("billing_schedules").select("amount, billing_day, frequency, next_due_date, contracts(contract_number, clients(company_name))").eq("status", "active").limit(MAX);
      return { title: "Mensalidades ativas", headers: ["Contrato", "Cliente", "Valor", "Dia", "Periodicidade", "Próximo vencimento"],
        rows: (data ?? []).map((s) => { const k = s.contracts as unknown as Joined<{ contract_number: string; clients: Joined<{ company_name: string }> }>; return [k?.contract_number ?? "", k?.clients?.company_name ?? "", dec(s.amount), s.billing_day, s.frequency, formatDate(s.next_due_date)]; }) };
    },
  },
  "receitas-recebidas": {
    title: "Receitas recebidas", description: "Recebimentos confirmados no período (inclui estornos sinalizados)", adminOnly: true,
    run: async (ctx, from, to) => {
      const [f, t] = range(from, to);
      const { data } = await ctx.supabase.from("receipts").select("amount, payment_method, received_at, reference, reversed_at, receivables(description, type, clients(company_name)), cash_accounts(name)").gte("received_at", f).lte("received_at", t).order("received_at").limit(MAX);
      return { title: "Receitas recebidas", headers: ["Data", "Cliente", "Cobrança", "Tipo", "Valor", "Forma", "Conta", "Referência", "Estornado"],
        rows: (data ?? []).map((x) => { const r = x.receivables as unknown as Joined<{ description: string; type: string; clients: Joined<{ company_name: string }> }>; return [formatDate(x.received_at), r?.clients?.company_name ?? "", r?.description ?? "", RECEIVABLE_TYPE[r?.type ?? ""] ?? "", dec(x.amount), PAYMENT_METHOD[x.payment_method] ?? "", (x.cash_accounts as unknown as Joined<{ name: string }>)?.name ?? "", x.reference ?? "", x.reversed_at ? "Sim" : "Não"]; }) };
    },
  },
  "receitas-em-atraso": {
    title: "Receitas em atraso", description: "Cobranças vencidas com saldo em aberto", adminOnly: true,
    run: async (ctx) => {
      const today = todayISO();
      const { data } = await ctx.supabase.from("receivables").select("id, description, amount, due_date, status, clients(company_name)").in("status", ["overdue", "partially_paid", "open"]).lt("due_date", today).order("due_date").limit(MAX);
      const ids = (data ?? []).map((r) => r.id);
      const { data: rc } = ids.length ? await ctx.supabase.from("receipts").select("receivable_id, amount").in("receivable_id", ids).is("reversed_at", null) : { data: [] as { receivable_id: string; amount: string }[] };
      const paid = new Map<string, number>(); for (const x of rc ?? []) paid.set(x.receivable_id, (paid.get(x.receivable_id) ?? 0) + fromDecimalString(x.amount));
      return { title: "Receitas em atraso", headers: ["Cliente", "Cobrança", "Vencimento", "Valor", "Recebido", "Saldo", "Status"],
        rows: (data ?? []).map((r) => [(r.clients as unknown as Joined<{ company_name: string }>)?.company_name ?? "", r.description, formatDate(r.due_date), dec(r.amount), toDecimalString(paid.get(r.id) ?? 0), toDecimalString(fromDecimalString(r.amount) - (paid.get(r.id) ?? 0)), RECEIVABLE_STATUS[r.status]?.[0] ?? r.status]) };
    },
  },
  "despesas-por-categoria": {
    title: "Despesas e custos por categoria", description: "Aprovados por competência (despesas e custos separados)", adminOnly: true,
    run: async (ctx, from, to) => {
      const { data } = await ctx.supabase.from("payables").select("kind, amount, status, financial_categories(name)").in("status", ["approved", "partially_paid", "paid"]).gte("competence_month", `${from.slice(0, 7)}-01`).lte("competence_month", to).limit(MAX);
      const agg = new Map<string, number>();
      for (const p of data ?? []) { const k = `${p.kind === "direct_cost" ? "Custo direto" : "Despesa"}|${(p.financial_categories as unknown as Joined<{ name: string }>)?.name ?? "—"}`; agg.set(k, (agg.get(k) ?? 0) + fromDecimalString(p.amount)); }
      return { title: "Despesas e custos por categoria", headers: ["Tipo", "Categoria", "Total"], rows: [...agg.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [...k.split("|"), toDecimalString(v)]) };
    },
  },
  "custos-por-projeto": {
    title: "Custos por projeto", description: "Custos diretos lançados por projeto", adminOnly: true,
    run: async (ctx) => {
      const { data } = await ctx.supabase.from("payables").select("description, amount, status, supplier_name, projects(name, clients(company_name))").eq("kind", "direct_cost").neq("status", "cancelled").not("project_id", "is", null).limit(MAX);
      return { title: "Custos por projeto", headers: ["Projeto", "Cliente", "Descrição", "Fornecedor", "Valor", "Status"],
        rows: (data ?? []).map((p) => { const pr = p.projects as unknown as Joined<{ name: string; clients: Joined<{ company_name: string }> }>; return [pr?.name ?? "", pr?.clients?.company_name ?? "", p.description, p.supplier_name ?? "", dec(p.amount), PAYABLE_STATUS[p.status]?.[0] ?? p.status]; }) };
    },
  },
  "rentabilidade-por-projeto": {
    title: "Rentabilidade por projeto (margem de contribuição em caixa)", description: "Recebido dos contratos do projeto − custos diretos pagos − comissões pagas. Não considera tributos, despesas gerais nem rateios.", adminOnly: true,
    run: async (ctx) => {
      const { data: projects } = await ctx.supabase.from("projects").select("id, name, clients(company_name), contracts(id)").limit(2000);
      const rows: (string | number)[][] = [];
      for (const p of projects ?? []) {
        const contractIds = ((p.contracts ?? []) as { id: string }[]).map((c) => c.id);
        const [rc, costs, comm] = await Promise.all([
          contractIds.length ? ctx.supabase.from("receipts").select("amount, receivables!inner(contract_id)").in("receivables.contract_id", contractIds).is("reversed_at", null) : Promise.resolve({ data: [] }),
          ctx.supabase.from("outgoing_payments").select("amount, payables!inner(project_id, kind)").eq("payables.project_id", p.id).eq("payables.kind", "direct_cost").is("reversed_at", null),
          contractIds.length ? ctx.supabase.from("commission_payout_items").select("allocated_amount, commission_entitlements!inner(contract_id)").in("commission_entitlements.contract_id", contractIds) : Promise.resolve({ data: [] }),
        ]);
        const sum = (arr: { amount?: string; allocated_amount?: string }[] | null) => (arr ?? []).reduce((s, x) => s + fromDecimalString(x.amount ?? x.allocated_amount ?? "0"), 0);
        const rec = sum(rc.data as { amount: string }[]); const cst = sum(costs.data as { amount: string }[]); const cms = sum(comm.data as { allocated_amount: string }[]);
        rows.push([p.name, (p.clients as unknown as Joined<{ company_name: string }>)?.company_name ?? "", toDecimalString(rec), toDecimalString(cst), toDecimalString(cms), toDecimalString(rec - cst - cms)]);
      }
      return { title: "Rentabilidade por projeto", headers: ["Projeto", "Cliente", "Recebido", "Custos diretos pagos", "Comissões pagas", "Margem de contribuição (caixa)"], rows };
    },
  },
  comissoes: {
    title: "Comissões por vendedor", description: "Comissões apuradas, aprovadas e pagas", adminOnly: false,
    run: async (ctx, from, to) => {
      const [f, t] = range(from, to);
      const { data } = await ctx.supabase.from("commission_entitlements").select("base_amount, rate_bps, commission_amount, status, sale_origin, created_at, contracts(contract_number), profiles!commission_entitlements_seller_id_fkey(full_name)").gte("created_at", f).lte("created_at", t).order("created_at").limit(MAX);
      return { title: "Comissões por vendedor", headers: ["Data", "Vendedor", "Contrato", "Origem", "Base", "Taxa (%)", "Comissão", "Status"],
        rows: (data ?? []).map((c) => [formatDate(c.created_at), (c.profiles as unknown as Joined<{ full_name: string }>)?.full_name ?? "", (c.contracts as unknown as Joined<{ contract_number: string }>)?.contract_number ?? "", SALE_ORIGIN[c.sale_origin] ?? "", dec(c.base_amount), (c.rate_bps / 100).toFixed(2), dec(c.commission_amount), COMMISSION_STATUS[c.status]?.[0] ?? c.status]) };
    },
  },
  "fluxo-de-caixa": {
    title: "Fluxo de caixa — projeção de 13 semanas", description: "Previsto, realizado e saldo projetado", adminOnly: true,
    run: async (ctx) => {
      const { data } = await ctx.supabase.rpc("cash_flow_projection", { p_weeks: 13, p_cash_account_id: null });
      return { title: "Fluxo de caixa — 13 semanas", headers: ["Início", "Fim", "Saldo inicial", "Receb. previstos", "Receb. confirmados", "A receber", "Pag. previstos", "Pag. confirmados", "A pagar", "Estimativa comercial", "Saldo projetado"],
        rows: ((data ?? []) as CashFlowWeek[]).map((w) => [formatDate(w.week_start), formatDate(w.week_end), dec(w.opening_balance), dec(w.expected_in), dec(w.confirmed_in), dec(w.pending_in), dec(w.expected_out), dec(w.confirmed_out), dec(w.pending_out), dec(w.commercial_estimate_in), dec(w.projected_closing)]) };
    },
  },
};
