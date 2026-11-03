/**
 * Trabalhos — regras de apresentação (as regras de permissão e de estado estão no banco).
 * A categoria do trabalho define as seções da ficha; a função de quem executa não restringe nada.
 */
export type WorkCategory = "post" | "carousel" | "design" | "photo" | "video_shoot" | "video_edit" | "web" | "admin" | "other";
export type WorkStatus = "draft" | "ready" | "in_production" | "in_review" | "done" | "cancelled";
export type ItemKind = "slide" | "scene" | "shot" | "requirement" | "checklist";
export type WorkRole = "manager" | "reviewer" | "assignee";

/** Seção de conteúdo principal por categoria (copy por página, roteiro, lista de fotos…). */
export const CONTENT_SECTION: Record<WorkCategory, { kind: Exclude<ItemKind, "checklist">; title: string; itemLabel: string; bodyLabel: string } | null> = {
  carousel: { kind: "slide", title: "Copy por página", itemLabel: "Página", bodyLabel: "Texto aprovado da página" },
  post: { kind: "slide", title: "Copy", itemLabel: "Peça", bodyLabel: "Texto aprovado" },
  design: { kind: "requirement", title: "Orientações", itemLabel: "Orientação", bodyLabel: "Detalhe" },
  photo: { kind: "shot", title: "Lista de fotos", itemLabel: "Foto", bodyLabel: "Enquadramento, uso ou detalhe" },
  video_shoot: { kind: "scene", title: "Roteiro por cena", itemLabel: "Cena", bodyLabel: "Fala, plano ou ação" },
  video_edit: { kind: "requirement", title: "Orientações de edição", itemLabel: "Orientação", bodyLabel: "Trecho, duração, legenda ou trilha" },
  web: { kind: "requirement", title: "Requisitos", itemLabel: "Requisito", bodyLabel: "Critério de aceite" },
  admin: null,
  other: null,
};

/** Sugestões ao criar (editáveis): conteúdo inicial e checklist de preparação. */
export function templateFor(category: WorkCategory): { kind: ItemKind; title: string; required?: boolean }[] {
  const pages = (n: number) => Array.from({ length: n }, (_, i) => ({ kind: "slide" as const, title: `Página ${i + 1}` }));
  switch (category) {
    case "carousel": return [...pages(5), { kind: "checklist", title: "Copy aprovada", required: true }, { kind: "checklist", title: "Logo e identidade disponíveis", required: true }];
    case "post": return [{ kind: "slide", title: "Peça 1" }, { kind: "checklist", title: "Copy aprovada", required: true }];
    case "photo": return [{ kind: "checklist", title: "Local e horário confirmados", required: true }, { kind: "checklist", title: "Autorização de imagem (se houver pessoas)" }];
    case "video_shoot": return [{ kind: "checklist", title: "Roteiro aprovado", required: true }, { kind: "checklist", title: "Local e contato confirmados", required: true }, { kind: "checklist", title: "Equipamento separado" }];
    case "video_edit": return [{ kind: "checklist", title: "Arquivos brutos disponíveis", required: true }, { kind: "checklist", title: "Trilha com uso permitido" }];
    case "web": return [{ kind: "checklist", title: "Ambiente/URL de teste definido", required: true }];
    default: return [];
  }
}

export type WorkState = {
  status: WorkStatus; blocked: boolean; missingRequired: number; hasAssignees: boolean;
  hasPreview: boolean; hasFinal: boolean; isAssignee: boolean; role: WorkRole | null;
};

/** Próxima ação de quem está vendo (uma ação principal por tela). */
export function nextAction(s: WorkState): { label: string; detail?: string; mine: boolean } {
  const canPrepare = s.role === "manager" || s.role === "reviewer";
  const canReview = !s.isAssignee && (s.role === "manager" || s.role === "reviewer");
  if (s.status === "cancelled") return { label: "Cancelado", mine: false };
  if (s.status === "done") return { label: "Concluído", mine: false };
  if (s.blocked) return { label: "Resolver bloqueio", detail: "O trabalho está bloqueado; veja o motivo na ficha.", mine: true };
  switch (s.status) {
    case "draft":
      if (!s.hasAssignees) return { label: "Definir responsável", mine: canPrepare };
      if (s.missingRequired > 0) return { label: "Aguardando material", detail: `${s.missingRequired} item(ns) obrigatório(s) pendente(s).`, mine: canPrepare || s.isAssignee };
      return { label: "Marcar como pronto", mine: canPrepare };
    case "ready": return { label: "Iniciar produção", mine: s.isAssignee };
    case "in_production":
      return s.hasPreview
        ? { label: "Enviar para revisão", mine: s.isAssignee }
        : { label: "Enviar prévia", detail: "Adicione o link da prévia para pedir revisão.", mine: s.isAssignee };
    case "in_review":
      if (!canReview) return { label: "Aguardando revisão", mine: false };
      return s.hasFinal ? { label: "Revisar e aprovar", mine: true } : { label: "Revisar prévia", detail: "A aprovação exige o link da entrega final.", mine: true };
  }
  return { label: "—", mine: false };
}

export function isOverdue(due: string | null, status: WorkStatus, today: string): boolean {
  return !!due && due < today && status !== "done" && status !== "cancelled";
}
