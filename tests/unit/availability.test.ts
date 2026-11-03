import { describe, expect, it } from "vitest";
import { availabilityMinutes, formatWeeklyHours, type AvailabilityBlock } from "@/lib/availability";
import { teamProfileSchema } from "@/lib/validation/schemas";

const b = (day: number, start: string, end: string, mode: AvailabilityBlock["mode"]): AvailabilityBlock => ({ day, start, end, mode });

describe("horas disponíveis (mesma regra do banco)", () => {
  it("sobreposição presencial × remoto conta uma vez", () => {
    const blocks = [b(1, "09:00", "14:00", "onsite"), b(1, "13:00", "18:00", "remote")];
    expect(availabilityMinutes(blocks)).toBe(540);
    expect(availabilityMinutes(blocks, "remote")).toBe(300);
  });
  it("blocos encostados e contidos não duplicam; dias diferentes somam", () => {
    expect(availabilityMinutes([b(2, "08:00", "12:00", "onsite"), b(2, "12:00", "14:00", "onsite"), b(2, "09:00", "10:00", "remote")])).toBe(360);
    expect(availabilityMinutes([b(1, "09:00", "12:00", "onsite"), b(3, "09:00", "12:00", "onsite")])).toBe(360);
  });
  it("desconhecido não vira zero", () => {
    expect(formatWeeklyHours(null)).toBe("Não informado");
    expect(formatWeeklyHours(0)).toBe("0 h");
    expect(formatWeeklyHours(570)).toBe("9 h 30");
  });
});

describe("formulário do perfil de trabalho", () => {
  const base = { primary_function: "design", works_remote: "on", availability: JSON.stringify([b(1, "09:00", "12:00", "remote")]) };
  it("aceita o mínimo e converte caixas de seleção", () => {
    const r = teamProfileSchema.parse({ ...base, weekly_hours_declared: "12,5", complete: "1", accept_rules: "on" });
    expect(r).toMatchObject({ works_remote: true, works_onsite: false, weekly_hours_declared: 12.5, complete: true, accept_rules: true });
  });
  it("recusa função ausente, horário invertido e JSON inválido", () => {
    expect(teamProfileSchema.safeParse({ ...base, primary_function: "" }).success).toBe(false);
    expect(teamProfileSchema.safeParse({ ...base, availability: JSON.stringify([b(1, "14:00", "09:00", "remote")]) }).success).toBe(false);
    expect(teamProfileSchema.safeParse({ ...base, availability: "{nao-json" }).success).toBe(false);
  });
  it("função não é papel: não existe campo de permissão no formulário", () => {
    const r = teamProfileSchema.parse({ ...base, role: "admin" } as Record<string, string>);
    expect(r).not.toHaveProperty("role");
  });
});
