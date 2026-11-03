import { describe, expect, it } from "vitest";
import { CONTENT_SECTION, isOverdue, nextAction, templateFor, type WorkState } from "@/lib/works";

const base: WorkState = { status: "draft", blocked: false, missingRequired: 0, hasAssignees: true, hasFinal: false, isAssignee: false, role: "manager", latestVersion: null, openFeedback: 0 };
const exec = { ...base, role: "assignee" as const, isAssignee: true };

describe("próxima ação", () => {
  it("preparação: responsável, material e pronto", () => {
    expect(nextAction({ ...base, hasAssignees: false }).label).toBe("Definir responsável");
    expect(nextAction({ ...base, missingRequired: 2 })).toMatchObject({ label: "Aguardando material", mine: true });
    expect(nextAction(base)).toMatchObject({ label: "Marcar como pronto", mine: true });
  });
  it("execução: iniciar e enviar a próxima versão (com ajustes pendentes)", () => {
    expect(nextAction({ ...exec, status: "ready" })).toMatchObject({ label: "Iniciar produção", mine: true });
    expect(nextAction({ ...exec, status: "in_production" }).label).toBe("Enviar versão 1 para revisão");
    expect(nextAction({ ...exec, status: "in_production", latestVersion: { number: 2, status: "changes_requested" }, openFeedback: 3 }))
      .toMatchObject({ label: "Enviar versão 3 para revisão", detail: "3 ajuste(s) pedido(s) na versão anterior." });
    expect(nextAction({ ...exec, status: "in_review", latestVersion: { number: 1, status: "submitted" } })).toMatchObject({ label: "Aguardando revisão", mine: false });
  });
  it("revisão: decide a versão exata; quem executou nunca aprova", () => {
    expect(nextAction({ ...base, status: "in_review", latestVersion: { number: 2, status: "submitted" } })).toMatchObject({ label: "Revisar versão 2", mine: true });
    expect(nextAction({ ...base, status: "in_review", isAssignee: true, latestVersion: { number: 2, status: "submitted" } }).mine).toBe(false);
  });
  it("versão aprovada: entrega final e conclusão", () => {
    const approved = { status: "in_review" as const, latestVersion: { number: 2, status: "approved" as const } };
    expect(nextAction({ ...exec, ...approved })).toMatchObject({ label: "Enviar entrega final", mine: true });
    expect(nextAction({ ...exec, ...approved, hasFinal: true })).toMatchObject({ label: "Aguardando conclusão", mine: false });
    expect(nextAction({ ...base, ...approved })).toMatchObject({ label: "Aguardando entrega final", mine: false });
    expect(nextAction({ ...base, ...approved, hasFinal: true })).toMatchObject({ label: "Concluir trabalho", mine: true });
  });
  it("bloqueio tem prioridade e é honesto", () => {
    expect(nextAction({ ...base, status: "in_production", blocked: true }).label).toBe("Resolver bloqueio");
  });
});

describe("ficha por categoria", () => {
  it("cada categoria tem a seção certa; a função de quem executa não aparece", () => {
    expect(CONTENT_SECTION.carousel?.kind).toBe("slide");
    expect(CONTENT_SECTION.photo?.kind).toBe("shot");
    expect(CONTENT_SECTION.video_shoot?.kind).toBe("scene");
    expect(templateFor("carousel").filter((i) => i.kind === "slide")).toHaveLength(5);
    expect(templateFor("carousel").filter((i) => i.required).map((i) => i.title)).toEqual(["Copy aprovada", "Logo e identidade disponíveis"]);
  });
  it("atraso só para trabalho em aberto", () => {
    expect(isOverdue("2026-11-01", "in_production", "2026-11-03")).toBe(true);
    expect(isOverdue("2026-11-01", "done", "2026-11-03")).toBe(false);
    expect(isOverdue(null, "draft", "2026-11-03")).toBe(false);
  });
});

import { clientKitSchema, kitAssetSchema } from "@/lib/validation/schemas";

describe("kit do cliente (formulário)", () => {
  it("cores só no formato #RRGGBB e materiais só com https", () => {
    expect(clientKitSchema.safeParse({ colors: JSON.stringify([{ name: "Azul", hex: "#0066FF" }]) }).success).toBe(true);
    expect(clientKitSchema.safeParse({ colors: JSON.stringify([{ name: "Azul", hex: "azul" }]) }).success).toBe(false);
    expect(kitAssetSchema.safeParse({ kind: "logo", label: "Logo", url: "http://x.test" }).success).toBe(false);
    expect(kitAssetSchema.safeParse({ kind: "logo", label: "Logo", url: "https://x.test/l" }).success).toBe(true);
  });
});
