// Tipos das linhas/retornos usados pela aplicação. Os valores numeric chegam
// como string ou number do PostgREST e são sempre convertidos via lib/money.
export type Decimal = string | number;

export type AdminSummary = {
  saldo_de_caixa: Decimal; total_contratado: Decimal; contratos_fechados: number; receita_recorrente_contratada: Decimal;
  total_recebido: Decimal; total_a_receber: Decimal; total_em_atraso: Decimal; total_a_pagar: Decimal; total_pago: Decimal;
  custos_diretos: Decimal; despesas_operacionais: Decimal; despesas_aguardando_aprovacao: number;
  comissoes_previstas: Decimal; comissoes_a_pagar: Decimal; comissoes_pagas: Decimal;
  novos_clientes: number; projetos_ativos: number; projetos_atrasados: number;
  despesas_por_categoria: { category: string; kind: string; amount: Decimal }[];
  desempenho_vendedores: { seller_id: string; name: string; contracts: number; implementation: Decimal; monthly: Decimal; new_clients: number }[];
};

export type SellerSummary = {
  total_clientes: number; novos_clientes: number; clientes_pendentes: number; contratos_fechados: number; contratos_aguardando: number;
  valor_implementacao_vendido: Decimal; valor_mensal_vendido: Decimal; comissoes_estimadas: Decimal; comissoes_adquiridas: Decimal;
  comissoes_aprovadas: Decimal; comissoes_recebidas: Decimal; comissoes_pendentes: Decimal; projetos_em_andamento: number;
  proximas_entregas: { id: string; name: string; due_date: string; client: string }[]; despesas_solicitadas: number;
};

export type CashFlowWeek = {
  week_index: number; week_start: string; week_end: string; opening_balance: Decimal; expected_in: Decimal; confirmed_in: Decimal;
  pending_in: Decimal; expected_out: Decimal; confirmed_out: Decimal; pending_out: Decimal; commercial_estimate_in: Decimal;
  projected_closing: Decimal; overdue_in: Decimal; overdue_out: Decimal;
};

export type MonthlySeries = { month: string; credits: Decimal; debits: Decimal; receipts: Decimal; direct_costs: Decimal; expenses: Decimal; commissions: Decimal };

export type CommissionEstimate =
  | { available: false; provisional: true; message: string }
  | { available: true; policy_id: string; policy_status: "draft" | "active"; base_rule: string | null; provisional: boolean; rate_bps: number; base_amount: Decimal; commission_amount: Decimal };

export type CommissionPolicy = {
  id: string; name: string; direct_rate_bps: number; referral_rate_bps: number; second_level_rate_bps: number;
  base_rule: string | null; trigger_rule: string | null; recurring_limit_months: number | null; requires_approval: boolean;
  refunds_reverse: boolean; status: "draft" | "active" | "retired"; effective_from: string; effective_until: string | null; notes: string | null;
};
