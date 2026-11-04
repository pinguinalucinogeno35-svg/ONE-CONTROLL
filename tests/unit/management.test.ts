import { describe, expect, it } from "vitest";
import { loadBreakdown, loadVerdict, riskBadges, riskDetail, waitingLabel, type PanelLoad } from "@/lib/management";

const base: PanelLoad = {
  user_id: "u", name: "Ana", role: "production", available_minutes: 1440, availability_source: "blocks", absence_days: 0,
  session_minutes: 300, sessions: 2, work_minutes: 780, committed_minutes: 1080, open_works: 4, in_review: 1, due_works: 3,
  works_without_estimate: 0, over: false,
};

describe("painel da gestão", () => {
  it("tempo de espera da aprovação em dias corridos", () => {
    const now = new Date("2026-11-04T15:00:00Z");
    expect(waitingLabel("2026-11-04T09:00:00Z", now)).toBe("hoje");
    expect(waitingLabel("2026-11-03T14:00:00Z", now)).toBe("há 1 dia");
    expect(waitingLabel("2026-10-31T15:00:00Z", now)).toBe("há 4 dias");
  });
  it("motivos de risco viram rótulos com texto (cor é só reforço)", () => {
    expect(riskBadges({ reasons: ["overdue", "blocked"], days_late: 2 })).toEqual([
      { label: "Atrasado 2 dias", tone: "danger" }, { label: "Bloqueado", tone: "danger" }]);
    expect(riskBadges({ reasons: ["overdue"], days_late: 1 })[0]!.label).toBe("Atrasado 1 dia");
    expect(riskBadges({ reasons: ["waiting_material"], days_late: null })).toEqual([{ label: "Aguardando material", tone: "warning" }]);
    expect(riskDetail({ blocked_reason: "Sem trilha", missing: ["Logo", "Fotos"] })).toBe("Bloqueio: Sem trilha · Falta: Logo, Fotos");
    expect(riskDetail({ blocked_reason: null, missing: null })).toBeNull();
  });
  it("carga: desconhecido nunca vira zero nem 'acima'", () => {
    expect(loadVerdict(base, 7)).toEqual({ label: "Dentro da disponibilidade", tone: "success" });
    expect(loadVerdict({ ...base, over: true }, 7).label).toBe("Acima da disponibilidade");
    expect(loadVerdict({ ...base, available_minutes: null, over: null }, 7)).toEqual({ label: "Disponibilidade não informada", tone: "neutral" });
    expect(loadVerdict({ ...base, absence_days: 7, available_minutes: 0, over: true }, 7)).toEqual({ label: "Ausente no período", tone: "danger" });
    expect(loadVerdict({ ...base, absence_days: 7, available_minutes: 0, committed_minutes: 0, over: false }, 7).tone).toBe("neutral");
  });
  it("composição da carga mostra o que falta estimar e a fonte da disponibilidade", () => {
    expect(loadBreakdown(base)).toBe("sessões 5 h · trabalhos 13 h");
    expect(loadBreakdown({ ...base, works_without_estimate: 2, absence_days: 1, availability_source: "declared_total" }))
      .toBe("sessões 5 h · trabalhos 13 h · 2 trabalhos sem estimativa · 1 dia de ausência · disponibilidade pelo total semanal");
  });
});
