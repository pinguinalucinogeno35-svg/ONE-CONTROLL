import { describe, expect, it } from "vitest";
import { taskGroupSchema, taskSchema } from "@/lib/validation/schemas";
import { can, navigationFor } from "@/lib/permissions";

const uuid = "4f3c1a2b-1234-4abc-8def-0123456789ab";

describe("tarefas: validação", () => {
  it("exige título, grupo e responsável; prioridade padrão média", () => {
    const r = taskSchema.parse({ title: "Editar vídeo", group_id: uuid, assigned_to: uuid, due_date: "" });
    expect(r).toMatchObject({ priority: "medium", due_date: undefined });
    expect(taskSchema.safeParse({ title: "ab", group_id: uuid, assigned_to: uuid }).success).toBe(false);
    expect(taskSchema.safeParse({ title: "Editar vídeo", group_id: uuid }).success).toBe(false);
    expect(taskSchema.safeParse({ title: "Editar vídeo", group_id: uuid, assigned_to: uuid, priority: "maxima" }).success).toBe(false);
  });
  it("descarta campos que só o servidor define (created_by, status)", () => {
    const r = taskSchema.parse({ title: "Editar vídeo", group_id: uuid, assigned_to: uuid, created_by: uuid, status: "done" } as never);
    expect(r).not.toHaveProperty("created_by");
    expect(r).not.toHaveProperty("status");
  });
  it("grupo: checkbox de liberação para vendedores", () => {
    expect(taskGroupSchema.parse({ name: "Audiovisual", sellers_can_assign: "on" }).sellers_can_assign).toBe(true);
    expect(taskGroupSchema.parse({ name: "Administração" }).sellers_can_assign).toBe(false);
  });
});

describe("tarefas: permissões de interface", () => {
  it("todos usam tarefas; só admin gerencia grupos e vê todas", () => {
    expect(can("seller", "tasks.use")).toBe(true);
    expect(can("seller", "tasks.groups")).toBe(false);
    expect(can("seller", "tasks.read_all")).toBe(false);
    expect(can("admin", "tasks.groups")).toBe(true);
    expect(navigationFor("seller").map((n) => n.href)).toContain("/tarefas");
  });
});
