import { describe, expect, it } from "vitest";
import { CAPABILITIES, can, isCommercialRole, navigationFor, type Capability } from "@/lib/permissions";

describe("papel de produção", () => {
  it("não tem nenhuma capacidade comercial, financeira ou administrativa", () => {
    const allowed = (Object.keys(CAPABILITIES) as Capability[]).filter((c) => can("production", c));
    expect(allowed.sort()).toEqual(["app.home", "notifications.read", "tasks.use"]);
    expect(isCommercialRole("production")).toBe(false);
    expect(isCommercialRole("seller")).toBe(true);
  });

  it("menu enxuto: início, tarefas e notificações", () => {
    expect(navigationFor("production").map((i) => i.href)).toEqual(["/dashboard", "/tarefas", "/notificacoes"]);
  });

  it("vendedor e administrador mantêm os menus anteriores", () => {
    expect(navigationFor("seller").map((i) => i.href)).toContain("/clientes");
    expect(navigationFor("admin").map((i) => i.href)).toContain("/financeiro");
    expect(navigationFor("seller").map((i) => i.href)).not.toContain("/financeiro");
  });
});
