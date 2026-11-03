// Rótulos pt-BR e tons visuais para os enums do banco.
type Tone = "neutral" | "info" | "success" | "warning" | "danger";
type LabelMap = Record<string, [string, Tone]>;

export const CLIENT_STATUS: LabelMap = {
  pending_completion: ["Pendente de complementação", "warning"], lead: ["Lead", "info"], active: ["Ativo", "success"],
  inactive: ["Inativo", "neutral"], archived: ["Arquivado", "neutral"],
};
export const CONTRACT_STATUS: LabelMap = {
  draft: ["Rascunho", "neutral"], pending_approval: ["Aguardando aprovação", "warning"], approved: ["Aprovado", "info"],
  active: ["Ativo", "success"], completed: ["Concluído", "neutral"], cancelled: ["Cancelado", "danger"],
};
export const PROJECT_STATUS: LabelMap = {
  planning: ["Planejamento", "neutral"], awaiting_approval: ["Aguardando aprovação", "warning"], approved: ["Aprovado", "info"],
  in_progress: ["Em andamento", "info"], in_review: ["Em revisão", "warning"], delivered: ["Entregue", "success"],
  on_hold: ["Pausado", "neutral"], cancelled: ["Cancelado", "danger"],
};
export const TASK_STATUS: LabelMap = {
  todo: ["A fazer", "neutral"], in_progress: ["Em andamento", "info"], blocked: ["Bloqueada", "danger"], done: ["Concluída", "success"], cancelled: ["Cancelada", "neutral"],
};
export const TASK_PRIORITY: LabelMap = {
  low: ["Baixa", "neutral"], medium: ["Média", "info"], high: ["Alta", "warning"], urgent: ["Urgente", "danger"],
};
export const RECEIVABLE_STATUS: LabelMap = {
  scheduled: ["Agendada", "neutral"], open: ["Em aberto", "info"], partially_paid: ["Parcialmente paga", "warning"],
  paid: ["Paga", "success"], overdue: ["Vencida", "danger"], cancelled: ["Cancelada", "neutral"],
};
export const RECEIVABLE_TYPE: Record<string, string> = {
  implementation: "Implementação", monthly_fee: "Mensalidade", additional_service: "Serviço adicional", other: "Outro",
};
export const PAYABLE_STATUS: LabelMap = {
  requested: ["Solicitada", "warning"], pending_approval: ["Aguardando aprovação", "warning"], approved: ["Aprovada", "info"],
  rejected: ["Rejeitada", "danger"], partially_paid: ["Parcialmente paga", "warning"], paid: ["Paga", "success"], cancelled: ["Cancelada", "neutral"],
};
export const COMMISSION_STATUS: LabelMap = {
  estimated: ["Estimada", "neutral"], pending_receipt: ["Aguardando recebimento", "neutral"], earned: ["Adquirida", "info"],
  awaiting_approval: ["Aguardando aprovação", "warning"], approved: ["Aprovada", "info"], partially_paid: ["Parcialmente paga", "warning"],
  paid: ["Paga", "success"], reversed: ["Revertida", "danger"], cancelled: ["Cancelada", "neutral"],
};
export const SALE_ORIGIN: Record<string, string> = {
  direct: "Venda direta", referral: "Venda por indicação", second_level_referral: "Indicação da indicação",
};
export const PAYMENT_METHOD: Record<string, string> = {
  pix: "PIX", bank_transfer: "Transferência", boleto: "Boleto", credit_card: "Cartão de crédito", debit_card: "Cartão de débito", cash: "Dinheiro", other: "Outro",
};
export const BASE_RULE: Record<string, string> = {
  implementation_only: "Somente implementação", first_month_only: "Somente primeira mensalidade",
  implementation_plus_first_month: "Implementação + primeira mensalidade", recurring_receipts: "Mensalidades recebidas",
  all_eligible_receipts: "Todos os recebimentos elegíveis",
};
export const TRIGGER_RULE: Record<string, string> = { on_receipt: "No recebimento", on_contract_approval: "Na aprovação do contrato" };
export const POLICY_STATUS: LabelMap = { draft: ["Rascunho", "warning"], active: ["Ativa", "success"], retired: ["Encerrada", "neutral"] };
export const PROFILE_STATUS: LabelMap = {
  invited: ["Convidado", "warning"], active: ["Ativo", "success"], suspended: ["Suspenso", "danger"], inactive: ["Inativo", "neutral"],
};
export const ROLE_LABEL: Record<string, string> = { admin: "Administrador", seller: "Vendedor", production: "Produção" };

export function label(map: LabelMap, key: string | null | undefined): [string, Tone] {
  return (key && map[key]) || [key ?? "—", "neutral"];
}

// Setor de produção — função é preferência de interface, nunca permissão.
export const WORK_FUNCTION: Record<string, string> = {
  design: "Design", filmmaking: "Filmagem", photography: "Fotografia", editing: "Edição", development: "Desenvolvimento",
  management: "Gestão", commercial: "Comercial", administrative: "Administrativo", other: "Outra",
};
export const WORK_MODE: Record<string, string> = { onsite: "Presencial", remote: "Remoto", external: "Externo" };
export const WEEKDAYS: Record<number, string> = { 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 7: "Domingo" };

// Trabalhos (setor de produção).
export const WORK_CATEGORY: Record<string, string> = {
  post: "Post", carousel: "Carrossel", design: "Design", photo: "Fotografia", video_shoot: "Filmagem",
  video_edit: "Edição de vídeo", web: "Web", admin: "Administrativo", other: "Outro",
};
export const WORK_STATUS: Record<string, [string, Tone]> = {
  draft: ["A preparar", "neutral"], ready: ["Pronto", "info"], in_production: ["Em produção", "info"],
  in_review: ["Em revisão", "warning"], done: ["Concluído", "success"], cancelled: ["Cancelado", "neutral"],
};
export const WORK_LINK_KIND: Record<string, string> = {
  reference: "Referência", material: "Material", raw: "Arquivos brutos", preview: "Prévia", editable: "Editável", final: "Entrega final", other: "Outro",
};
export const KIT_ASSET_KIND: Record<string, string> = {
  logo: "Logos", font: "Fontes", photo: "Fotos", video: "Vídeos", music: "Músicas licenciadas", document: "Documentos", template: "Modelos aprovados", reference: "Referências",
};
