import { describe, expect, it } from "vitest";
import { CONTENT_SECTION, isOverdue, nextAction, templateFor, type WorkState } from "@/lib/works";

const base: WorkState = { status: "draft", blocked: false, missingRequired: 0, hasAssignees: true, hasPreview: false, hasFinal: false, isAssignee: false, role: "manager" };

describe("próxima ação", () => {
  it("preparação: responsável, material e pronto", () => {
    expect(nextAction({ ...base, hasAssignees: false }).label).toBe("Definir responsável");
    expect(nextAction({ ...base, missingRequired: 2 })).toMatchObject({ label: "Aguardando material", mine: true });
    expect(nextAction(base)).toMatchObject({ label: "Marcar como pronto", mine: true });
  });
  it("execução: iniciar, prévia e revisão são de quem executa", () => {
    const exec = { ...base, role: "assignee" as const, isAssignee: true };
    expect(nextAction({ ...exec, status: "ready" })).toMatchObject({ label: "Iniciar produção", mine: true });
    expect(nextAction({ ...exec, status: "in_production" }).label).toBe("Enviar prévia");
    expect(nextAction({ ...exec, status: "in_production", hasPreview: true }).label).toBe("Enviar para revisão");
    expect(nextAction({ ...exec, status: "in_review" })).toMatchObject({ label: "Aguardando revisão", mine: false });
  });
  it("revisão: quem executou nunca aprova", () => {
    expect(nextAction({ ...base, status: "in_review", hasFinal: true })).toMatchObject({ label: "Revisar e aprovar", mine: true });
    expect(nextAction({ ...base, status: "in_review", hasFinal: true, isAssignee: true }).mine).toBe(false);
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
